# comfy-mcp — Repo Scan

> Escaneo: Estándar · Fecha: 2026-08-18
> Fuente: https://github.com/Comfy-Org/comfy-mcp (clon shallow en `.tmp/`)

## TL;DR
**comfy-mcp** es el servidor MCP oficial de Comfy-Org para manejar el **ComfyUI
local del usuario** desde Claude Code, Claude Desktop, Cursor o cualquier
cliente MCP. Es deliberadamente un *thin wrapper* sobre `comfy-cli`: cada una de
sus 39 tools ejecuta `comfy --json --where local <args>` como subproceso, parsea
el resultado versionado `envelope/1` y devuelve su `data`. No tiene cliente HTTP
propio — comfy-cli es el motor y dueño de todo el I/O con ComfyUI.

## Qué hace
- **Generar**: correr un workflow JSON (formato API o export de UI), o
  texto→imagen en una llamada (`generate_image`, vía template SD1.5 por defecto).
- **Monitorear jobs**: submit async + `job(action=status/wait/watch/error/cancel/queue)`,
  veredicto de fallo compacto (nodo, excepción, traceback acotado) y recolección
  de PNGs (`fetch_outputs`, con imágenes inline opcionales).
- **Introspección del install vivo**: `nodes` (8 acciones), `search_models`,
  `search_templates` — leen el `object_info` real (custom nodes incluidos), no
  un catálogo estático. Ese es el diferenciador local frente al cloud MCP.
- **Construir workflows**: `validate_workflow`, slots (`list/set/vary`), notas
  de autor, deps por pack (`workflow_deps` vía ComfyUI-Manager).
- **Gestionar ComfyUI**: launch/stop/restart en background, logs, update,
  cambio de versión (rollback incluido), instalar node packs, staging de inputs,
  descarga de modelos por URL con worker en background.
- **Modelos partner** (Flux, Ideogram, Kling…): `partner_generate` corre en
  infraestructura del partner gastando créditos Comfy; `emit_partner_workflow`
  escribe el grafo con el nodo API para ejecutarlo en el ComfyUI propio.

Alcance: *local-first, no local-only* — `COMFYUI_URL`/`COMFYUI_HOST` apuntan los
run/job tools a un ComfyUI remoto tuyo. Su contraparte es **Comfy Cloud MCP**
(HTTP remoto en `cloud.comfy.org/mcp`, GPUs de Comfy Cloud): dos servidores
distintos, sin código compartido por regla arquitectónica explícita.

## Cómo está construido
- **Lenguaje / stack:** Python ≥ 3.10; setuptools; paquete PyPI `comfy-mcp` v0.10.0.
- **Dependencias:** `mcp>=2,<3` (SDK MCP 2.x — usa `mcp.server.mcpserver.MCPServer`),
  `pydantic>=2`, `anyio>=4.9`. **`comfy-cli` NO está declarada a propósito**: se
  resuelve por PATH/`COMFY_BIN` y la compatibilidad se verifica en runtime
  (piso duro `>= 1.14.0` + aserción del schema del envelope). El quickstart
  instala ambos: `pip install comfy-mcp "comfy-cli>=1.14.0"`.
- **Arquitectura:** un hub — `src/comfy_mcp/server.py` (11.396 líneas: `_run_comfy`,
  parser del envelope, maquinaria `--json-stream`, consentimientos, y las 39
  `@mcp.tool()`) — más 10 módulos hoja que jamás importan `server` (aristas en un
  solo sentido): `argv` (guardas anti-inyección de argumentos), `clitext`
  (parsing del texto humano de verbos sin envelope), `target` (resolución de
  ComfyUI remoto), `params` (marshaling de slots), `failure_log` (log opt-in +
  scrubbers de credenciales en URLs), `errors`, `instructions` (texto del
  handshake), `tcc` (carpetas protegidas de macOS), `textutil`, `cli`.
- **Transporte:** stdio (el cliente lo lanza como subproceso). Publicado en el
  MCP Registry oficial (`server.json`, nombre `io.github.Comfy-Org/comfy-mcp`,
  con el token de ownership en el README que PyPI verifica).
- **Puntos de entrada:** console script `comfy-mcp = comfy_mcp.server:main`.
- **Build / Run / Test:** `pip install -e '.[dev]'` · `pytest -q` (unit, con
  comfy-cli mockeada) · `pytest -m e2e` / `-m cli_contract` (suites vivas,
  deseleccionadas por defecto) · `ruff check` + `ruff format` (selección de
  reglas pineada explícitamente, con ASYNC para bloqueos en el event loop).
- **Licencia:** dual — AGPL-3.0-or-later O licencia comercial de Comfy Org.

## Estructura del repo
```
src/comfy_mcp/     núcleo: server.py (hub) + 10 módulos hoja
tests/             ~30 archivos, ~25k líneas; fixtures compartidas en conftest.py
scripts/smoke.sh   smoke test manual contra un ComfyUI vivo
.github/workflows/ 8 workflows: ci (py3.10 + py3.14), cli-contract, publish,
                   secret-scanning, CLA, integridad de AGENTS.md, groom, cursor-review
server.json        listing para el MCP Registry oficial
AGENTS.md/CLAUDE.md guía para agentes con las reglas duras de arquitectura
```

## Flujo principal
1. El cliente MCP lanza `comfy-mcp` por stdio y recibe en el handshake las
   instrucciones + un snapshot de hardware de la máquina (vía `comfy env`).
2. Una tool llama `_run_comfy(*args)` → `subprocess.Popen([comfy, --json,
   --where, local, *args])` con: stdin en DEVNULL (protege el canal JSON-RPC),
   decode UTF-8 pineado (evita mojibake en Windows/cp1252), grupo de procesos
   propio (un timeout mata el árbol completo, no solo `comfy`), y cwd anclado a
   `COMFY_PROJECT` si existe.
3. Se toma el último objeto JSON del stdout, se valida que sea `envelope/1` y se
   devuelve `data`; errores llegan como `ComfyCliError` con contexto acotado.
   Verbos sin envelope (`launch`/`stop`/`model download`) usan `plain_ok` y
   sintetizan el resultado desde el texto impreso.
4. Lo largo/streaming va por `asyncio.create_subprocess_exec` (`--json-stream`
   NDJSON → notificaciones de progreso MCP; y un gemelo async plano para que la
   cancelación del cliente mate al hijo en vez de dejarlo huérfano).

## Dependencias notables
- **comfy-cli ≥ 1.14.0** (runtime, no declarada) → ComfyUI local en `127.0.0.1:8188`.
- ComfyUI-Manager para `workflow_deps`/`install_node` (degrada con `unsupported: true`).
- Cuenta Comfy (OAuth vía `comfy cloud login` o `COMFY_API_KEY`) solo para
  modelos partner; nada más toca la red del lado de este servidor.

## Observaciones
- **La seguridad es el diseño más elaborado del repo.** Gates de confirmación
  por **elicitation MCP** para todo lo que gasta dinero, destruye estado, corre
  código de terceros, mata procesos o expone la máquina (`partner_generate`,
  `run_template`/`run_workflow` con `confirm_spend`, `install_node` en cada
  llamada, `update_comfyui(target="all")`, `switch_comfyui_version`, y el par
  launch/restart cuando `extra_args` publicaría el ComfyUI sin auth a la red).
  El prompt se levanta incluso si el flag `confirm_*=True` viene puesto — el
  "always allow" del host no es autoridad para publicar la máquina. El estado de
  consentimiento durable vive en comfy-cli, nunca aquí.
- Guardas de inyección de argv por dominio, scrubbing de credenciales en URLs
  hacia el cliente y hacia el log, límites de tamaño en argv y colas de stderr.
- **Calidad inusualmente alta para su edad**: pre-1.0 pero con CI en dos
  Pythons, ~2x más líneas de test que de código, lint pineado con justificación
  escrita, CHANGELOG con política de versionado explícita, y una densidad de
  comentarios rara: casi cada decisión (deps, floors, reglas ruff, el token del
  registry) lleva su porqué y qué tests la pinean. `AGENTS.md` define guardrails
  que un PR no puede romper — repo pensado para ser mantenido *por agentes*.
- Tensión asumida: "thin wrapper" con un `server.py` de 11k líneas — el grosor
  no es lógica de producto sino ingeniería defensiva (procesos, timeouts,
  parsing, consentimientos). La regla "sin HTTP, sin derivar veredictos" se
  cumple hasta el detalle (p. ej. leer el veredicto de instalación del texto de
  cm-cli porque no hay envelope).
- Nota honesta en el docstring: la invocación exacta + envelope aún esperan un
  smoke test contra un install real (existe `scripts/smoke.sh` y marker e2e).
- Privado-destinado-a-público como higiene declarada (sin secretos, sin hosts
  internos); secret-scanning en CI.

## Por qué importa
Es la vía **oficial** para que un agente (Claude Code incluido) opere ComfyUI —
la herramienta dominante de generación de imagen/video local — sin panel ni
terminal: generar, diagnosticar fallos de grafo, instalar lo que falta y
administrar el servidor, leyendo siempre el install real del usuario. Además es
un **caso de estudio de primera** de cómo diseñar un MCP server que puede gastar
dinero y ejecutar código de terceros: elicitation por llamada, fail-closed,
consentimiento del lado del motor, y una arquitectura de wrapper delgado con
límites escritos y testeados. Relevante tanto para usarlo como para copiarle
patrones.

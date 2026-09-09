#!/usr/bin/env python3
"""Auditoria del PC anfitrion para el stack ComfyUI.

Responde UNA pregunta: **esta maquina, tal como esta hoy, puede correr lo que el
usuario quiere hacer?** Y si no puede, exactamente que falta.

El veredicto se da por CAPACIDAD ("texto -> imagen rapido"), no por archivo. Un
listado de archivos ausentes no le sirve a nadie; "no puedes editar personajes
porque falta el LoRA de 810 MB en models/loras/" si.

Cuatro capas, de abajo hacia arriba:

  0. Maquina      GPU y VRAM, RAM, disco libre, sistema operativo, Python.
  1. Herramientas comfy-cli, comfy-mcp, el `comfy` del PATH, el registro MCP.
  2. ComfyUI      workspace, version, si esta corriendo, packs instalados.
  3. Capacidades  cada flujo del manifiesto, con lo que le falta.

Contrato: stdlib pura, SOLO LECTURA, rapido. No instala, no descarga, no
enciende nada. Salida en UTF-8 forzado y marcadores ASCII, porque la consola de
Windows miente en las dos direcciones.

Codigos de salida:
    0  al menos una capacidad esta lista (o la exigida con --exigir lo esta)
    1  ninguna capacidad esta lista (o la exigida con --exigir no lo esta)
    2  no se encontro ComfyUI en esta maquina

PUNTOS CIEGOS declarados, para que nadie le acredite cobertura que no tiene:

  - Verifica que un modelo EXISTA, no que sea el correcto ni que este integro.
    Un archivo truncado o renombrado pasa la auditoria.
  - Los nodos del nucleo de ComfyUI solo se verifican de verdad si el servidor
    esta encendido (se consulta /object_info). Apagado, se cree del manifiesto,
    y se dice.
  - No mide VRAM en uso durante una generacion real: reporta la libre AHORA.
  - "Capacidad lista" significa que las piezas estan, no que la salida sea
    buena. Eso lo juzga un humano mirando o escuchando.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# La consola de Windows usa cp1252 y rompe cada tilde al imprimirla. Se fuerza
# UTF-8 en la salida; los marcadores igual son ASCII por si el terminal no
# coopera (ver memoria python-stdout-is-not-utf8-on-windows).
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# ADR-008 D2: ONE auditor, and it lives here. The app runtime must never reach
# into `.claude/**` — that directory is the portable harness, not runtime code.
# The `comfy-local` skill points at this file instead of forking it.
AQUI = Path(__file__).resolve().parent
MANIFIESTO = AQUI / "manifiesto.json"

OK = "[OK]"
FALTA = "[FALTA]"
DUDA = "[?]"
AVISO = "[!]"


# --------------------------------------------------------------------------
# Descubrimiento: nunca asumir rutas de la maquina donde nacio la skill
# --------------------------------------------------------------------------

def descubrir_workspace() -> tuple[Path | None, str]:
    """Encuentra el workspace de ComfyUI. Devuelve (ruta, como_se_encontro).

    El orden importa: lo que el usuario declaro gana sobre lo que adivinamos.
    """
    declarado = os.environ.get("COMFY_WORKSPACE")
    if declarado and (p := Path(declarado)).is_dir():
        return p, "variable COMFY_WORKSPACE"

    # comfy-cli sabe donde puso su workspace; preguntarselo es mejor que adivinar.
    comfy = shutil.which("comfy")
    if comfy:
        salida = _correr([comfy, "--skip-prompt", "--json", "env"], timeout=25)
        if salida:
            try:
                datos = json.loads(_ultimo_json(salida))
                ruta = _buscar_clave(datos, ("workspace_path", "path", "workspace"))
                if ruta and (p := Path(str(ruta))).is_dir():
                    return p, "comfy env"
            except (json.JSONDecodeError, TypeError):
                pass

    for candidato in (Path.home() / "comfy", Path.home() / "ComfyUI"):
        if (candidato / "main.py").is_file():
            return candidato, f"ruta convencional ({candidato.name})"

    return None, "no encontrado"


def _ultimo_json(texto: str) -> str:
    """comfy-cli imprime ruido antes del envelope; el JSON util es el ultimo."""
    for linea in reversed(texto.strip().splitlines()):
        linea = linea.strip()
        if linea.startswith("{"):
            return linea
    return texto


def _buscar_clave(datos, claves: tuple[str, ...]):
    """Busca la primera de `claves` en un dict anidado, sin asumir su forma."""
    if isinstance(datos, dict):
        for k in claves:
            if k in datos and isinstance(datos[k], str):
                return datos[k]
        for v in datos.values():
            if (hallado := _buscar_clave(v, claves)) is not None:
                return hallado
    elif isinstance(datos, list):
        for v in datos:
            if (hallado := _buscar_clave(v, claves)) is not None:
                return hallado
    return None


def _correr(cmd: list[str], timeout: int = 15) -> str | None:
    """Ejecuta y devuelve stdout, o None si falla. Nunca lanza."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return r.stdout if r.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


# --------------------------------------------------------------------------
# Capa 0 — la maquina
# --------------------------------------------------------------------------

def _ram_total_mb() -> int | None:
    """RAM total sin dependencias externas. Devuelve None si no se pudo."""
    if sys.platform == "win32":
        try:
            import ctypes

            class _Mem(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            m = _Mem()
            m.dwLength = ctypes.sizeof(_Mem)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                return int(m.ullTotalPhys // 1048576)
        except Exception:
            return None
        return None
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for linea in fh:
                if linea.startswith("MemTotal:"):
                    return int(linea.split()[1]) // 1024
    except OSError:
        pass
    return None


def auditar_maquina(workspace: Path | None) -> dict:
    """GPU, VRAM, RAM, disco. Lo que decide si algo es siquiera posible."""
    info: dict = {
        "so": f"{platform.system()} {platform.release()}",
        "arquitectura": platform.machine(),
        "python": platform.python_version(),
        "ram_mb": _ram_total_mb(),
        "gpu": None,
        "disco_libre_mb": None,
        "avisos": [],
    }

    # nvidia-smi y NO system_stats de ComfyUI: system_stats reporta un valor
    # desactualizado porque free_memory recien se aplica cuando el worker itera.
    smi = _correr([
        "nvidia-smi",
        "--query-gpu=name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
    ])
    if smi and smi.strip():
        gpus = []
        for linea in smi.strip().splitlines():
            partes = [p.strip() for p in linea.split(",")]
            if len(partes) >= 4:
                gpus.append({
                    "nombre": partes[0],
                    "vram_total_mb": _entero(partes[1]),
                    "vram_libre_mb": _entero(partes[2]),
                    "driver": partes[3],
                })
        info["gpu"] = gpus or None
    if info["gpu"] is None:
        info["avisos"].append(
            "Sin GPU NVIDIA detectable (nvidia-smi no respondio). ComfyUI puede "
            "correr en CPU, pero los flujos de este manifiesto son inviables ahi: "
            "minutos se vuelven horas."
        )

    destino = workspace if workspace else Path.home()
    try:
        info["disco_libre_mb"] = shutil.disk_usage(destino).free // 1048576
    except OSError:
        pass

    return info


def _entero(txt: str) -> int | None:
    try:
        return int(float(txt))
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# Capa 1 — la cadena de herramientas
# --------------------------------------------------------------------------

def auditar_herramientas() -> dict:
    """comfy-cli, comfy-mcp, el PATH, y si el MCP esta registrado en Claude."""
    info: dict = {
        "comfy_en_path": shutil.which("comfy"),
        "comfy_mcp_en_path": shutil.which("comfy-mcp"),
        "comfy_bin_env": os.environ.get("COMFY_BIN"),
        "venv_herramientas": None,
        "versiones": {},
        "mcp_registrado": None,
        "problemas": [],
    }

    ejecutable = info["comfy_en_path"] or info["comfy_bin_env"]
    if ejecutable:
        # Scripts/ o bin/ -> el venv es su padre.
        venv = Path(ejecutable).resolve().parent.parent
        py = venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
        if py.is_file():
            info["venv_herramientas"] = str(venv)
            listado = _correr([str(py), "-m", "pip", "list", "--format=json"], timeout=60)
            if listado:
                try:
                    for paq in json.loads(listado):
                        if paq["name"].lower() in {"comfy-cli", "comfy-mcp", "mcp"}:
                            info["versiones"][paq["name"].lower()] = paq["version"]
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass

    if not info["comfy_en_path"]:
        # Este es EL gotcha que mas tiempo cuesta diagnosticar: `comfy launch`
        # no usa el binario que lo invoco, re-invoca `comfy` por shell. Sin el
        # Scripts/ del venv en el PATH falla con `launch_failed`, y el mensaje
        # no dice que el problema es el PATH. COMFY_BIN no salva este caso:
        # cubre los spawns de comfy-mcp, no el re-spawn interno de comfy-cli.
        info["problemas"].append(
            "`comfy` no resuelve en el PATH. El MCP puede funcionar igual (usa "
            "COMFY_BIN), pero `launch_comfyui` va a fallar con `launch_failed` y "
            "un mensaje que NO menciona el PATH. Agregar el Scripts/ del venv al "
            "PATH de usuario."
        )

    cli = info["versiones"].get("comfy-cli")
    if cli and _menor_que(cli, "1.14.0"):
        info["problemas"].append(
            f"comfy-cli {cli} esta por debajo del piso duro de comfy-mcp (1.14.0). "
            "El servidor MCP verifica esto en runtime y se niega a operar."
        )

    # Se pregunta por el CLI de Claude en vez de leer ~/.claude.json: ese archivo
    # tiene la configuracion de TODOS los servidores MCP, credenciales incluidas,
    # y una auditoria no tiene por que abrirlo.
    claude = shutil.which("claude")
    if claude:
        salida = _correr([claude, "mcp", "get", "comfy"], timeout=45)
        if salida and "comfy" in salida:
            registro = {"presente": True, "scope": None, "comando": None}
            for linea in salida.splitlines():
                limpia = linea.strip()
                if limpia.lower().startswith("scope:"):
                    registro["scope"] = limpia.split(":", 1)[1].strip()
                elif limpia.lower().startswith("command:"):
                    registro["comando"] = limpia.split(":", 1)[1].strip()
            info["mcp_registrado"] = registro
        else:
            info["mcp_registrado"] = {"presente": False}
            info["problemas"].append(
                "El servidor MCP `comfy` no esta registrado en Claude Code. "
                "Sin el, las tools mcp__comfy__* no existen en la sesion."
            )
    else:
        info["problemas"].append(
            "No se encontro el CLI `claude`: no se pudo verificar si el MCP esta "
            "registrado. Es lo unico que esta auditoria no puede comprobar sola."
        )

    return info


def _menor_que(version: str, piso: str) -> bool:
    def partes(v: str) -> tuple:
        salida = []
        for trozo in v.split("."):
            digitos = "".join(c for c in trozo if c.isdigit())
            salida.append(int(digitos) if digitos else 0)
        return tuple(salida)

    try:
        return partes(version) < partes(piso)
    except ValueError:
        return False


# --------------------------------------------------------------------------
# Capa 2 — ComfyUI
# --------------------------------------------------------------------------

def url_base() -> str:
    return os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")


def _get_json(ruta: str, timeout: float = 3.0):
    try:
        with urllib.request.urlopen(f"{url_base()}{ruta}", timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, ValueError):
        return None


def auditar_comfyui(workspace: Path | None) -> dict:
    info: dict = {
        "workspace": str(workspace) if workspace else None,
        "version": None,
        "corriendo": False,
        "url": url_base(),
        "packs": [],
        "python_venv": None,
        "voces_registradas": [],
        "avisos": [],
    }
    if workspace is None:
        return info

    marcador = workspace / "comfyui_version.py"
    if marcador.is_file():
        for linea in marcador.read_text(encoding="utf-8", errors="replace").splitlines():
            if "__version__" in linea and "=" in linea:
                info["version"] = linea.split("=", 1)[1].strip().strip('"\' ')

    stats = _get_json("/system_stats")
    info["corriendo"] = stats is not None

    packs = workspace / "custom_nodes"
    if packs.is_dir():
        info["packs"] = sorted(
            d.name for d in packs.iterdir()
            if d.is_dir() and not d.name.startswith("__")
        )

    # El venv de ComfyUI es el Python util de la maquina: trae torch con los
    # kernels correctos para esta GPU, librosa y soundfile. Los scripts de la
    # skill voz-local se corren con este, no con el Python global.
    for rel in ("Scripts/python.exe", "bin/python"):
        if (py := workspace / ".venv" / rel).is_file():
            info["python_venv"] = str(py)
            break

    prompts = workspace / "models" / "Qwen3-TTS" / "prompts"
    if prompts.is_dir():
        info["voces_registradas"] = sorted(
            p.stem for p in prompts.glob("*.safetensors")
        )

    if not info["corriendo"]:
        info["avisos"].append(
            f"ComfyUI no responde en {info['url']}. Los nodos del nucleo no se "
            "pueden verificar de verdad; se creen del manifiesto."
        )
    return info


# --------------------------------------------------------------------------
# Capa 3 — capacidades
# --------------------------------------------------------------------------

def _nodo_existe(clase: str, cache: dict) -> bool | None:
    """True/False si el servidor respondio; None si no se pudo verificar."""
    if clase in cache:
        return cache[clase]
    datos = _get_json(f"/object_info/{clase}", timeout=5.0)
    veredicto = None if datos is None else bool(datos)
    cache[clase] = veredicto
    return veredicto


def _ruta_modelo(workspace: Path, archivo: str, spec: dict) -> Path:
    return workspace / "models" / spec["carpeta"] / archivo


def auditar_capacidades(manifiesto: dict, workspace: Path | None, comfyui: dict) -> list[dict]:
    resultados = []
    cache_nodos: dict[str, bool | None] = {}
    packs_instalados = set(comfyui.get("packs") or [])

    for cap in manifiesto["capacidades"]:
        faltantes: list[str] = []
        dudas: list[str] = []
        # Lista estructurada aparte de `faltantes`: el instalador necesita los
        # nombres de archivo, y recuperarlos parseando frases en castellano es
        # frágil por construcción.
        modelos_faltantes: list[str] = []
        mb_por_bajar = 0

        for nombre_pack in cap["packs"]:
            spec = manifiesto["packs"].get(nombre_pack, {})
            if spec.get("carpeta", nombre_pack) not in packs_instalados:
                faltantes.append(
                    f"pack de nodos `{nombre_pack}` (instalar con "
                    f"{spec.get('instalar_con', 'install_node')})"
                )

        if comfyui["corriendo"]:
            for clase in cap["nodos"]:
                if _nodo_existe(clase, cache_nodos) is False:
                    faltantes.append(
                        f"nodo `{clase}` no existe en este ComfyUI "
                        "(version del nucleo o pack ausente)"
                    )
        else:
            dudas.append("los nodos no se verificaron: ComfyUI esta apagado")

        if workspace is None:
            dudas.append("los modelos no se verificaron: no hay workspace")
        else:
            for archivo in cap["modelos"]:
                spec = manifiesto["modelos"][archivo]
                destino = _ruta_modelo(workspace, archivo, spec)
                presente = destino.is_dir() if spec.get("es_directorio") else destino.is_file()
                if presente:
                    continue
                mb = spec.get("mb", 0)
                if spec.get("auto"):
                    dudas.append(
                        f"`{archivo}` ({mb} MB) no esta en disco, pero {spec['auto']}"
                    )
                else:
                    mb_por_bajar += mb
                    modelos_faltantes.append(archivo)
                    faltantes.append(
                        f"`{archivo}` ({mb} MB) en models/{spec['carpeta']}/"
                    )

            for entrada in cap["entradas"]:
                carpeta = workspace / entrada["carpeta"]
                if not carpeta.is_dir():
                    faltantes.append(f"la carpeta {entrada['carpeta']}/ no existe")
                elif not any(carpeta.iterdir()):
                    dudas.append(
                        f"{entrada['carpeta']}/ esta vacia: hace falta {entrada['que_es']}"
                    )

        if faltantes:
            estado = "falta"
        elif dudas and not comfyui["corriendo"]:
            estado = "probable"
        else:
            estado = "lista"

        resultados.append({
            "id": cap["id"],
            "titulo": cap["titulo"],
            "workflow": cap["workflow"],
            "estado": estado,
            "faltantes": faltantes,
            "modelos_faltantes": modelos_faltantes,
            "dudas": dudas,
            "mb_por_descargar": mb_por_bajar,
            "tiempo_s": cap.get("tiempo_s", {}),
        })
    return resultados


# --------------------------------------------------------------------------
# Informe
# --------------------------------------------------------------------------

def imprimir(informe: dict) -> None:
    m, h, c = informe["maquina"], informe["herramientas"], informe["comfyui"]

    print("=" * 66)
    print("AUDITORIA DEL PC ANFITRION — stack ComfyUI")
    print("=" * 66)

    print("\n-- Maquina")
    print(f"  {m['so']} · {m['arquitectura']} · Python {m['python']}")
    if m["ram_mb"]:
        print(f"  RAM: {m['ram_mb'] / 1024:.0f} GB")
    for gpu in m["gpu"] or []:
        libre, total = gpu["vram_libre_mb"], gpu["vram_total_mb"]
        print(f"  {OK} {gpu['nombre']} — {total} MB VRAM ({libre} MB libres) · driver {gpu['driver']}")
    if not m["gpu"]:
        print(f"  {FALTA} sin GPU NVIDIA detectable")
    if m["disco_libre_mb"] is not None:
        print(f"  Disco libre donde vive ComfyUI: {m['disco_libre_mb'] / 1024:.1f} GB")
    for aviso in m["avisos"]:
        print(f"  {AVISO} {aviso}")

    print("\n-- Herramientas")
    for paquete in ("comfy-cli", "comfy-mcp"):
        version = h["versiones"].get(paquete)
        print(f"  {OK if version else DUDA} {paquete}: {version or 'version no leida'}")
    print(f"  {OK if h['comfy_en_path'] else FALTA} `comfy` en el PATH: {h['comfy_en_path'] or 'no'}")
    reg = h["mcp_registrado"]
    if reg and reg.get("presente"):
        print(f"  {OK} MCP `comfy` registrado — scope: {reg.get('scope') or 'desconocido'}")
    elif reg is not None:
        print(f"  {FALTA} MCP `comfy` NO registrado en Claude Code")
    else:
        print(f"  {DUDA} registro MCP no verificado")
    for problema in h["problemas"]:
        print(f"  {AVISO} {problema}")

    print("\n-- ComfyUI")
    if not c["workspace"]:
        print(f"  {FALTA} no se encontro ningun workspace de ComfyUI en esta maquina")
    else:
        print(f"  {OK} {c['workspace']} · version {c['version'] or 'desconocida'} ({informe['workspace_via']})")
        print(f"  {OK if c['corriendo'] else DUDA} servidor en {c['url']}: {'corriendo' if c['corriendo'] else 'apagado'}")
        if c["packs"]:
            print(f"  Packs: {', '.join(c['packs'])}")
        if c["python_venv"]:
            print(f"  Python util (torch, librosa): {c['python_venv']}")
        if c["voces_registradas"]:
            print(f"  Voces registradas: {', '.join(c['voces_registradas'])}")
    for aviso in c["avisos"]:
        print(f"  {AVISO} {aviso}")

    print("\n-- Que puede hacer esta maquina")
    for cap in informe["capacidades"]:
        marca = {"lista": OK, "probable": DUDA, "falta": FALTA}[cap["estado"]]
        caliente = cap["tiempo_s"].get("caliente")
        tiempo = f"  (~{caliente} s)" if caliente and cap["estado"] != "falta" else ""
        print(f"\n  {marca} {cap['titulo']}{tiempo}")
        print(f"      grafo: {cap['workflow']}")
        for f in cap["faltantes"]:
            print(f"      {FALTA} falta {f}")
        for d in cap["dudas"]:
            print(f"      {DUDA} {d}")
        if cap["mb_por_descargar"]:
            print(f"      -> descargar {cap['mb_por_descargar'] / 1024:.1f} GB para habilitarla")

    listas = [c for c in informe["capacidades"] if c["estado"] == "lista"]
    probables = [c for c in informe["capacidades"] if c["estado"] == "probable"]
    total = len(informe["capacidades"])
    print("\n" + "=" * 66)
    print(f"VEREDICTO: {len(listas)} de {total} capacidades listas"
          + (f", {len(probables)} probables (ComfyUI apagado)" if probables else ""))
    if informe["por_descargar_mb"]:
        print(f"Para habilitar el resto haria falta descargar "
              f"{informe['por_descargar_mb'] / 1024:.1f} GB. No se descarga nada sin permiso.")
    print("=" * 66)


# --------------------------------------------------------------------------
# La app: sus siete requisitos, en idioma humano (ADR-008)
# --------------------------------------------------------------------------

def _ollama_modelos(timeout: float = 2.0) -> list[str] | None:
    """Los modelos que ollama dice tener. `None` = ollama no responde.

    PUNTO CIEGO DECLARADO: distingue "ollama apagado" de "modelo ausente",
    que es justo la distincion que el portal necesita para no decirle al
    usuario que instale algo que ya tiene.
    """
    url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            datos = json.loads(r.read().decode("utf-8"))
    except Exception:
        return None
    return [m.get("name", "") for m in datos.get("models", [])]


def _whisper_en_cache() -> bool:
    """Busca el modelo de faster-whisper en la cache de HuggingFace.

    PUNTO CIEGO: solo mira que la carpeta exista. Un modelo a medio bajar
    pasaria. Se acepta porque este modelo se descarga solo al usarlo y no
    lo instala el portal.
    """
    base = Path(os.environ.get("HF_HOME") or (Path.home() / ".cache" / "huggingface"))
    for sitio in (base / "hub", base):
        try:
            for hijo in sitio.iterdir():
                if "faster-whisper-large-v3" in hijo.name:
                    return True
        except OSError:
            continue
    return False


def auditar_app(manifiesto: dict, workspace: Path | None, comfyui: dict,
                herramientas: dict | None = None) -> list[dict]:
    """Evalua los requisitos de la app declarados en el manifiesto.

    Tres estados, y el tercero NO es decorativo (ADR-008 D5):
      - `instalada`      lo vimos.
      - `falta`          miramos donde tocaba y no estaba.
      - `no_verificable` no pudimos mirar. Con ComfyUI apagado no se pueden
                         comprobar sus nodos, y decir "falta" ahi seria
                         mandar al usuario a reinstalar lo que ya tiene.
    """
    modelos = manifiesto.get("modelos", {})
    salida: list[dict] = []

    for req in manifiesto.get("app", {}).get("requisitos", []):
        estado, detalle, mb = "no_verificable", None, 0
        rid = req["id"]
        # Por defecto se hereda lo que declara el manifiesto; solo el motor
        # las cambia sobre la marcha, porque solo el tiene tres situaciones.
        accion = req.get("accion")
        instalable = req.get("instalable", False)

        if rid == "comfyui-corriendo":
            # TRES situaciones, no dos, y la diferencia decide que boton se
            # ofrece: corriendo / instalado pero apagado / ni siquiera esta.
            # Confundir las dos ultimas ofreceria descargar varios GB a alguien
            # que ya los tiene en disco.
            if comfyui.get("corriendo"):
                estado = "instalada"
            else:
                estado = "falta"
                detalle = f"No responde en {comfyui.get('url')}"
                instalado = bool((herramientas or {}).get("comfy_en_path")) or bool(
                    comfyui.get("workspace"))
                if instalado:
                    accion, instalable = "arrancar", True
                    detalle = ("Esta instalado pero no esta corriendo. "
                               "Se puede arrancar desde aqui.")
                else:
                    accion, instalable = "instalar-comfyui", True
                    detalle = "No esta instalado en esta maquina."

        elif req.get("tipo") == "pack":
            pack = req["pack"]
            presente = pack in (comfyui.get("packs") or [])
            if not presente:
                estado, detalle = "falta", "La carpeta del pack no esta en custom_nodes"
            elif comfyui.get("corriendo"):
                # D6: se comprueba de verdad, contra los nodos que el motor expone.
                # `_nodo_existe` devuelve None cuando NO PUDO preguntar, y eso no
                # es un "no": tratarlo como falta mandaria a reinstalar un pack
                # que esta perfectamente puesto. Los tres casos, por separado.
                visto = _nodo_existe("Qwen3VoiceClone", {})
                if visto is None:
                    detalle = ("La carpeta esta, pero el motor no contesto a la consulta "
                               "de sus nodos, asi que no se pudo confirmar")
                elif visto:
                    estado = "instalada"
                else:
                    estado = "falta"
                    detalle = ("La carpeta esta, pero el motor no expone sus nodos: casi "
                               "siempre son sus dependencias de Python sin instalar")
            else:
                detalle = ("La carpeta esta, pero con ComfyUI apagado no se puede "
                           "confirmar que sus dependencias esten instaladas")

        elif req.get("tipo") == "modelo":
            nombre = req["modelo"]
            spec = modelos.get(nombre, {})
            mb = spec.get("mb", 0)
            if nombre == "faster-whisper-large-v3":
                estado = "instalada" if _whisper_en_cache() else "falta"
                if estado == "falta":
                    detalle = "Se descarga solo la primera vez que se transcribe"
            elif workspace is None:
                detalle = "No se encontro la carpeta de ComfyUI"
            else:
                ruta = _ruta_modelo(workspace, nombre, spec)
                estado = "instalada" if ruta.exists() else "falta"
                if estado == "falta":
                    detalle = f"No esta en {ruta.parent}"

        elif req.get("tipo") == "servicio":
            if req.get("servicio") == "ollama":
                instalados = _ollama_modelos()
                pedido = req.get("modelo_servicio", "")
                mb = (manifiesto.get("servicios", {}).get("ollama", {})
                      .get("modelos", {}).get(pedido, {}).get("mb", 0))
                if instalados is None:
                    estado, detalle = "falta", "ollama no esta corriendo o no esta instalado"
                elif any(m.split(":")[0] == pedido.split(":")[0] for m in instalados):
                    estado = "instalada"
                else:
                    estado, detalle = "falta", f"ollama corre, pero no tiene {pedido}"

        elif req.get("tipo") == "entorno":
            # El entorno del proyecto: dos funciones lo necesitan y el resto no.
            # Se mira el interprete, no la carpeta: un `.venv` a medio crear
            # tiene carpeta y no tiene python.
            sub = "Scripts/python.exe" if os.name == "nt" else "bin/python"
            destino = AQUI.parent / ".venv" / sub
            estado = "instalada" if destino.exists() else "falta"
            if estado == "falta":
                detalle = "Sin esto no se puede transcribir ni unir guiones largos."
                mb = 1024

        elif rid == "una-voz":
            voces = comfyui.get("voces_registradas")
            if voces is None:
                detalle = "No se pudo leer la carpeta de voces"
            else:
                estado = "instalada" if voces else "falta"
                if estado == "falta":
                    detalle = "No hay ninguna voz registrada todavia"

        salida.append({
            "id": rid,
            "titulo": req["titulo"],
            "para_que": req["para_que"],
            "bloquea": req.get("bloquea", False),
            "instalable": instalable,
            "accion": accion,
            "tipo": req.get("tipo"),
            "estado": estado,
            "detalle": detalle,
            "mb": mb if estado == "falta" else 0,
            "sin_esto": req.get("sin_esto"),
            "guia": req.get("guia"),
            "nota": req.get("nota"),
        })

    return salida


def main() -> int:
    ap = argparse.ArgumentParser(description="Audita si este PC puede correr el stack ComfyUI.")
    ap.add_argument("--json", action="store_true", help="salida legible por maquina")
    ap.add_argument("--exigir", metavar="ID",
                    help="salir con 1 si esa capacidad no esta lista (ids en el manifiesto)")
    ap.add_argument("--manifiesto", type=Path, default=MANIFIESTO)
    ap.add_argument("--app", action="store_true",
                    help="solo los requisitos de TTS Studio, en JSON (lo que lee el portal)")
    args = ap.parse_args()

    manifiesto = json.loads(args.manifiesto.read_text(encoding="utf-8"))

    workspace, via = descubrir_workspace()
    informe = {
        "workspace_via": via,
        "maquina": auditar_maquina(workspace),
        "herramientas": auditar_herramientas(),
        "comfyui": auditar_comfyui(workspace),
    }
    if args.app:
        # El portal de la app no necesita las capacidades de imagen: pregunta
        # solo por lo suyo, y siempre en JSON (ADR-008).
        print(json.dumps({
            "workspace": str(workspace) if workspace else None,
            "comfyui_url": informe["comfyui"].get("url"),
            "comfyui_corriendo": informe["comfyui"].get("corriendo", False),
            "python_venv": informe["comfyui"].get("python_venv"),
            "disco_libre_mb": informe["maquina"].get("disco_libre_mb"),
            "requisitos": auditar_app(manifiesto, workspace, informe["comfyui"],
                                      informe["herramientas"]),
        }, indent=2, ensure_ascii=False))
        return 0

    informe["capacidades"] = auditar_capacidades(manifiesto, workspace, informe["comfyui"])
    informe["por_descargar_mb"] = sum(
        c["mb_por_descargar"] for c in informe["capacidades"]
    )

    if args.json:
        print(json.dumps(informe, indent=2, ensure_ascii=False))
    else:
        imprimir(informe)

    if args.exigir:
        buscada = next((c for c in informe["capacidades"] if c["id"] == args.exigir), None)
        if buscada is None:
            print(f"\n{FALTA} no existe la capacidad `{args.exigir}` en el manifiesto",
                  file=sys.stderr)
            return 1
        return 0 if buscada["estado"] in {"lista", "probable"} else 1

    if workspace is None:
        return 2
    return 0 if any(c["estado"] in {"lista", "probable"} for c in informe["capacidades"]) else 1


if __name__ == "__main__":
    sys.exit(main())

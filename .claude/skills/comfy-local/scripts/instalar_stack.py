#!/usr/bin/env python3
"""Instalador guiado del stack ComfyUI: CLI, servidor MCP, ComfyUI y packs.

Lee la auditoria (`auditar_host.py`), decide que falta, y emite **el plan
exacto**: un comando por pieza, en el orden en que hay que correrlos.

**Por defecto NO ejecuta nada.** Imprime y se calla. Instalar dependencias que
llaman a la red y registrar un servidor MCP son acciones que la regla del
proyecto exige confirmar; un instalador que obedece por defecto convierte esa
regla en un adorno.

Con `--ejecutar` corre solo el tramo reversible y barato:

    crear el venv de herramientas · pip install comfy-cli/comfy-mcp ·
    registrar el servidor MCP en Claude Code

Lo demas se imprime SIEMPRE y no se corre nunca desde aqui, por motivos
distintos en cada caso:

  - instalar ComfyUI      decenas de GB y elige donde vive la maquina
  - packs de nodos        es codigo de terceros; el MCP pide consentimiento
                          por llamada, y esta bien que lo pida
  - modelos               entre 0,2 y 19,5 GB por archivo
  - el PATH de usuario    escribir el entorno de otro proceso a sus espaldas
                          es de mala educacion; el comando queda impreso

Sobre las URL de los modelos: este instalador **no las inventa**. Un enlace
recordado de memoria que devuelve 404 cuesta mas que no darlo. Cada modelo
ausente sale con su carpeta destino, su tamano, y la consulta de
`mcp__comfy__search_models` que resuelve su origen contra el catalogo real.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from auditar_host import (  # noqa: E402
    AVISO,
    FALTA,
    MANIFIESTO,
    OK,
    auditar_capacidades,
    auditar_comfyui,
    auditar_herramientas,
    descubrir_workspace,
)

for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

EN_WINDOWS = sys.platform == "win32"


class Paso:
    """Una pieza del plan. `automatico` decide si --ejecutar la toca."""

    def __init__(self, titulo: str, porque: str, comandos: list[list[str]],
                 automatico: bool = False, nota: str = ""):
        self.titulo = titulo
        self.porque = porque
        self.comandos = comandos
        self.automatico = automatico
        self.nota = nota


def _bin(venv: Path, nombre: str) -> Path:
    sub = "Scripts" if EN_WINDOWS else "bin"
    suf = ".exe" if EN_WINDOWS else ""
    return venv / sub / f"{nombre}{suf}"


def _para_pegar(cmd: list[str]) -> str:
    """Renderiza un comando para que se pueda copiar y pegar sin sorpresas.

    `pip install comfy-cli>=1.14.0` sin comillas no instala nada: el shell lee
    `>` como redireccion y crea un archivo llamado `=1.14.0`. La lista que
    recibe subprocess no necesita comillas; la que lee un humano, si.
    """
    peligrosos = set(' \t"\'<>|&;$*?()[]{}`')
    partes = []
    for token in cmd:
        partes.append(f'"{token}"' if any(c in peligrosos for c in token) else token)
    return " ".join(partes)


def planificar(venv_destino: Path, workspace_destino: Path) -> list[Paso]:
    workspace, _ = descubrir_workspace()
    herramientas = auditar_herramientas()
    comfyui = auditar_comfyui(workspace)
    manifiesto = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
    capacidades = auditar_capacidades(manifiesto, workspace, comfyui)

    venv = Path(herramientas["venv_herramientas"] or venv_destino)
    py_venv = _bin(venv, "python")
    comfy_bin = _bin(venv, "comfy")
    comfy_mcp_bin = _bin(venv, "comfy-mcp")
    pasos: list[Paso] = []

    # ---- 1. venv de herramientas -----------------------------------------
    if not py_venv.is_file():
        pasos.append(Paso(
            "Crear el venv de herramientas",
            "comfy-cli y comfy-mcp viven en su propio entorno, nunca en el "
            "Python global ni dentro del venv de ComfyUI: romper ese ultimo "
            "sale caro y no es de esta skill.",
            [[sys.executable, "-m", "venv", str(venv)]],
            automatico=True,
        ))

    # ---- 2. comfy-cli + comfy-mcp ----------------------------------------
    faltan = [p for p in ("comfy-cli", "comfy-mcp")
              if p not in herramientas["versiones"]]
    if faltan:
        pasos.append(Paso(
            f"Instalar {' y '.join(faltan)}",
            "comfy-mcp es un envoltorio delgado sobre comfy-cli: cada tool suya "
            "ejecuta `comfy --json --where local`. Sin el CLI no hay servidor. "
            "El piso duro es comfy-cli 1.14.0, verificado en runtime.",
            [[str(py_venv), "-m", "pip", "install", "comfy-mcp", "comfy-cli>=1.14.0"]],
            automatico=True,
        ))

    # ---- 3. el PATH -------------------------------------------------------
    if not herramientas["comfy_en_path"]:
        carpeta = str(comfy_bin.parent)
        cmd = ([["setx", "PATH", f"%PATH%;{carpeta}"]] if EN_WINDOWS
               else [["export", f'PATH="$PATH:{carpeta}"']])
        pasos.append(Paso(
            "Agregar el venv al PATH de usuario",
            "`comfy launch` NO usa el binario que lo invoco: re-invoca `comfy` "
            "por shell. Sin esto falla con `launch_failed` y un mensaje que no "
            "menciona el PATH. COMFY_BIN no cubre este caso: cubre los spawns "
            "de comfy-mcp, no el re-spawn interno de comfy-cli.",
            cmd,
            nota="Correlo tu: el instalador no escribe el entorno de otro proceso. "
                 "En Windows hay que abrir una consola nueva para que tome efecto.",
        ))

    # ---- 4. ComfyUI -------------------------------------------------------
    if workspace is None:
        pasos.append(Paso(
            "Instalar ComfyUI",
            "Es el motor. Decenas de GB y elige donde vive: la ruta es decision "
            "del usuario, no del instalador.",
            [[str(comfy_bin), "--skip-prompt", "--workspace", str(workspace_destino),
              "install", "--nvidia"]],
            nota="Cambia --nvidia por --cpu o --amd segun la maquina. "
                 "Descarga PyTorch entero.",
        ))

    # ---- 5. registrar el MCP ---------------------------------------------
    registro = herramientas["mcp_registrado"]
    if registro is None or not registro.get("presente"):
        pasos.append(Paso(
            "Registrar el servidor MCP `comfy` en Claude Code",
            "Sin esto las tools mcp__comfy__* no existen en la sesion. Scope "
            "usuario para que sirva en cualquier proyecto, que es el punto.",
            [["claude", "mcp", "add", "comfy", "--scope", "user",
              "--env", f"COMFY_BIN={comfy_bin}", "--", str(comfy_mcp_bin)]],
            automatico=True,
            nota="Las tools aparecen en la SIGUIENTE sesion, no en esta.",
        ))

    # ---- 6. packs de nodos ------------------------------------------------
    instalados = set(comfyui.get("packs") or [])
    for nombre, spec in manifiesto["packs"].items():
        if spec.get("carpeta", nombre) in instalados:
            continue
        py_comfy = comfyui.get("python_venv") or "<python del venv de ComfyUI>"
        ruta_pack = (workspace or workspace_destino) / "custom_nodes" / spec["carpeta"]
        cmds = [[str(comfy_bin), "--skip-prompt", "node", "install", nombre]]
        if spec.get("requirements_manual"):
            cmds.append([py_comfy, "-m", "pip", "install", "-r",
                         str(ruta_pack / "requirements.txt")])
        nota = spec.get("nota", "").strip()
        if "reiniciar" not in nota.lower():
            nota = f"{nota} Reiniciar ComfyUI despues.".strip()
        pasos.append(Paso(
            f"Instalar el pack de nodos {nombre}",
            "Es codigo de terceros. Preferir `mcp__comfy__install_node`, que "
            "pide consentimiento en cada llamada; el comando de abajo es el "
            "equivalente por CLI.",
            cmds,
            nota=nota,
        ))

    # ---- 7. modelos -------------------------------------------------------
    pendientes: dict[str, dict] = {}
    if workspace is None:
        # Maquina virgen: la auditoria no puede afirmar que falte nada porque no
        # hay donde mirar. Pero es JUSTO aqui donde la lista de modelos mas se
        # necesita, asi que se planifica contra el destino: todo lo que no se
        # descargue solo hay que bajarlo.
        for cap in manifiesto["capacidades"]:
            for archivo in cap["modelos"]:
                spec = manifiesto["modelos"][archivo]
                if not spec.get("auto"):
                    pendientes[archivo] = spec
    else:
        for cap in capacidades:
            for archivo in cap["modelos_faltantes"]:
                pendientes[archivo] = manifiesto["modelos"][archivo]
    if pendientes:
        total = sum(s.get("mb", 0) for s in pendientes.values())
        lineas = [
            f'mcp__comfy__search_models(query="{a}")  ->  models/{s["carpeta"]}/'
            f'   [{s.get("mb", 0)} MB]'
            for a, s in sorted(pendientes.items())
        ]
        pasos.append(Paso(
            f"Descargar {len(pendientes)} modelos ({total / 1024:.1f} GB)",
            "Son GB y es decision del usuario. Este instalador no inventa URL: "
            "un enlace recordado de memoria que devuelve 404 cuesta mas que no "
            "darlo. La consulta resuelve el origen contra el catalogo real, y "
            "`mcp__comfy__download_model` baja en segundo plano.",
            [],
            nota="\n      ".join(lineas),
        ))

    return pasos


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Plan de instalacion del stack ComfyUI. Por defecto solo imprime.")
    ap.add_argument("--ejecutar", action="store_true",
                    help="corre el tramo reversible (venv, pip, registro MCP). "
                         "El resto se imprime igual y no se corre nunca.")
    ap.add_argument("--venv", type=Path, default=Path.home() / "comfy-mcp-venv",
                    help="donde crear el venv de herramientas si no existe")
    ap.add_argument("--workspace", type=Path, default=Path.home() / "comfy",
                    help="donde instalar ComfyUI si no existe")
    args = ap.parse_args()

    pasos = planificar(args.venv, args.workspace)

    print("=" * 66)
    print("PLAN DE INSTALACION — stack ComfyUI")
    print("=" * 66)

    if not pasos:
        print(f"\n{OK} No falta nada. El stack esta completo en esta maquina.")
        print("   Corre `auditar_host.py` para el detalle por capacidad.")
        return 0

    for i, paso in enumerate(pasos, 1):
        marca = OK if paso.automatico and args.ejecutar else FALTA
        print(f"\n{marca} {i}. {paso.titulo}")
        print(f"      por que: {paso.porque}")
        for cmd in paso.comandos:
            print(f"      $ {_para_pegar(cmd)}")
        if paso.nota:
            print(f"      {AVISO} {paso.nota}")

    if not args.ejecutar:
        automaticos = sum(1 for p in pasos if p.automatico)
        print("\n" + "=" * 66)
        print(f"No se ejecuto nada. {automaticos} de {len(pasos)} pasos son "
              "automatizables con --ejecutar;")
        print("el resto se corre a mano a proposito (ver el docstring del script).")
        print("=" * 66)
        return 0

    print("\n" + "=" * 66)
    print("EJECUTANDO el tramo automatizable")
    print("=" * 66)
    fallos = 0
    for paso in pasos:
        if not paso.automatico:
            continue
        for cmd in paso.comandos:
            print(f"\n$ {' '.join(cmd)}")
            try:
                r = subprocess.run(cmd, encoding="utf-8", errors="replace")
                if r.returncode != 0:
                    print(f"{FALTA} devolvio {r.returncode}")
                    fallos += 1
            except (OSError, subprocess.SubprocessError) as e:
                print(f"{FALTA} {e}")
                fallos += 1

    print("\n" + "=" * 66)
    if fallos:
        print(f"{FALTA} {fallos} comando(s) fallaron. Revisa arriba antes de seguir.")
    else:
        print(f"{OK} Tramo automatizable completo. Los pasos manuales siguen pendientes.")
    print("Vuelve a correr `auditar_host.py` para ver el estado real.")
    print("=" * 66)
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())

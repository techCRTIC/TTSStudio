#!/usr/bin/env python3
"""Arranca ComfyUI, y si no está instalado, lo instala.

Lo llama el portal de configuración de la app. Imprime una línea de JSON por
novedad (NDJSON), igual que `instalar_dependencia.py`, para que la pantalla
pueda contar qué está pasando mientras pasa.

    python execution/arrancar_comfy.py --arrancar
    python execution/arrancar_comfy.py --instalar

POR QUÉ ESTO EXISTE, Y QUÉ DECISIÓN CAMBIA
    `ADR-009` D1 dejó escrito que el portal **solo guía** para ComfyUI: lo
    detecta, explica el comando y verifica después. La razón era buena — la app
    no debería volverse el gestor de paquetes de un proyecto ajeno que no
    versiona.

    Lo que cambió es la evidencia. El `.exe` llegó a manos de alguien y el
    resultado fue que **la ventana no abría**, y una vez arreglado eso, que la
    app se quedaba diciendo «instala ComfyUI» sin ofrecer forma de hacerlo. Una
    pantalla que sabe exactamente qué falta y no ofrece el botón está
    escogiendo, a propósito, ser menos útil de lo que puede.

    Se sigue **sin empaquetar** ComfyUI: se instala desde su origen, en la
    máquina del usuario y bajo su orden. Esa línea —la que separa aggregar de
    redistribuir, y que `ADR-009` D7 explica— no se cruza.

LO QUE NO HACE
    No decide por el usuario. `--instalar` solo corre si alguien pulsó el botón,
    descarga varios GB, y lo dice antes de empezar.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")

# Un arranque en frío carga todos los nodos personalizados y tarda de verdad.
ESPERA_ARRANQUE_S = 150
# Instalar ComfyUI descarga su propio código y sus dependencias de Python.
ESPERA_INSTALACION_S = 3600


def use_utf8() -> None:
    """En Windows la salida de Python es cp1252 y Node la lee rota."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except AttributeError:
            pass


def decir(**campos) -> None:
    """Una línea de JSON, vaciada al momento: si se queda en el búfer, la
    pantalla no ve avanzar nada y el progreso deja de ser progreso."""
    print(json.dumps(campos, ensure_ascii=False), flush=True)


def responde(timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(f"{URL}/system_stats", timeout=timeout):
            return True
    except Exception:
        return False


def buscar_comfy() -> str | None:
    """El ejecutable de comfy-cli, o `None`.

    Mismo orden que el lanzador (`scripts/engine.mjs`): la variable de entorno
    manda, luego el PATH, y por último el venv dedicado donde comfy-cli suele
    quedarse sin llegar nunca al PATH.
    """
    if os.environ.get("COMFY_BIN"):
        return os.environ["COMFY_BIN"]
    hallado = shutil.which("comfy")
    if hallado:
        return hallado
    venv = Path.home() / "comfy-mcp-venv" / "Scripts" / (
        "comfy.exe" if os.name == "nt" else "comfy")
    return str(venv) if venv.exists() else None


def esperar_a_que_responda(segundos: int) -> bool:
    """Espera contando en voz alta. Un minuto de silencio se lee como un cuelgue."""
    inicio = time.time()
    while time.time() - inicio < segundos:
        if responde():
            return True
        pasado = int(time.time() - inicio)
        decir(tipo="progreso",
              pct=min(95, int(pasado * 100 / segundos)),
              mensaje=f"Esperando a que el motor responda… {pasado}s")
        time.sleep(3)
    return responde()


def arrancar() -> tuple[bool, str]:
    if responde():
        return True, "Ya estaba corriendo"

    binario = buscar_comfy()
    if not binario:
        return False, ("No encuentro ComfyUI en esta máquina. Usa el botón de "
                       "instalarlo, o define COMFY_BIN con la ruta si ya lo tienes.")

    decir(tipo="inicio", titulo="Arrancando ComfyUI", mb_total=0)
    decir(tipo="progreso", pct=5, mensaje="Levantando el motor…")

    # `--background` bifurca y VUELVE, así que se puede capturar su salida sin
    # bloquear nada. Capturarla es la diferencia entre decir «no respondió» y
    # decir POR QUÉ no respondió, y esa diferencia se descubrió en carne propia:
    # en esta máquina ComfyUI no arrancaba por un `ModuleNotFoundError` en su
    # propio entorno, y el motivo estaba ahí escrito todo el tiempo mientras la
    # app se limitaba a agotar el tiempo de espera.
    try:
        lanzamiento = subprocess.run(
            [binario, "launch", "--background"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        lanzamiento = None
    except Exception as e:
        return False, f"No se pudo lanzar ComfyUI: {e}"

    fallo = _motivo_del_fallo(lanzamiento) if lanzamiento else None
    if fallo:
        return False, fallo

    if esperar_a_que_responda(ESPERA_ARRANQUE_S):
        return True, "ComfyUI está corriendo"
    return False, (f"ComfyUI se lanzó pero no respondió en {ESPERA_ARRANQUE_S} segundos. "
                   "Un arranque en frío puede tardar; espera un poco y vuelve a comprobar.")


def _motivo_del_fallo(proceso) -> str | None:
    """Saca el motivo real del sobre JSON que imprime comfy-cli.

    Devuelve `None` si el lanzamiento fue bien. `comfy-cli` **sale con codigo 0
    aunque el lanzamiento falle** —lo comprobado en esta maquina— asi que el
    codigo de salida no sirve de nada: la verdad esta en `ok` dentro del sobre.

    PUNTO CIEGO DECLARADO: se depende del formato `envelope/1` de comfy-cli
    1.16. Si cambia, esto deja de encontrar el motivo y se cae al mensaje
    generico de tiempo agotado, que es como estaba antes. Degrada, no rompe.
    """
    texto = (proceso.stdout or "") + "\n" + (proceso.stderr or "")
    sobre = None
    for linea in texto.splitlines():
        linea = linea.strip()
        if linea.startswith("{") and '"envelope"' in linea:
            try:
                sobre = json.loads(linea)
            except ValueError:
                pass
    if sobre is None or sobre.get("ok") is not False:
        return None

    error = sobre.get("error") or {}
    registro = ((error.get("details") or {}).get("log") or "").strip()

    # De un traceback, la ultima linea es la que dice que pasa. Las de arriba
    # dicen por donde paso, que aqui no le sirve a nadie.
    ultima = ""
    for linea in reversed(registro.splitlines()):
        if linea.strip():
            ultima = linea.strip()
            break

    if "ModuleNotFoundError" in ultima:
        paquete = ultima.split("'")[1] if "'" in ultima else "un paquete"
        return (f"ComfyUI no arranca: a su entorno de Python le falta `{paquete}`.\n\n"
                f"Se arregla instalandolo EN EL ENTORNO DE COMFYUI:\n"
                f"    <python de ComfyUI> -m pip install {paquete}\n\n"
                f"No es un problema de esta app: ComfyUI tampoco arrancaria a mano.")

    return f"ComfyUI no arranca. Lo que dice: {ultima or error.get('message', 'sin detalle')}"


def instalar() -> tuple[bool, str]:
    """Instala comfy-cli y despues ComfyUI.

    PUNTO CIEGO DECLARADO: `comfy install` es interactivo en algunos caminos
    (pregunta por la version de CUDA). Se le pasa `--skip-prompt`, pero si una
    version futura anade otra pregunta, esto se quedaria esperando una respuesta
    que nadie va a escribir. Por eso hay un tope de tiempo.
    """
    binario = buscar_comfy()

    if not binario:
        decir(tipo="inicio", titulo="Instalando comfy-cli", mb_total=0)
        decir(tipo="progreso", pct=5, mensaje="Instalando la herramienta de línea de comandos…")
        salida = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "comfy-cli"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900,
        )
        if salida.returncode != 0:
            cola = (salida.stderr or "").strip().splitlines()
            return False, f"No se pudo instalar comfy-cli: {cola[-1] if cola else 'sin detalle'}"
        binario = buscar_comfy()
        if not binario:
            return False, ("comfy-cli se instaló pero no aparece en el PATH. "
                           "Cierra la app y vuelve a abrirla para que lo encuentre.")

    decir(tipo="progreso", pct=25,
          mensaje="Descargando ComfyUI. Son varios GB: esto tarda.")
    try:
        salida = subprocess.run(
            [binario, "--skip-prompt", "install"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=ESPERA_INSTALACION_S,
        )
    except subprocess.TimeoutExpired:
        return False, "La instalación de ComfyUI se pasó de una hora. Se puede reintentar."

    if salida.returncode != 0:
        cola = (salida.stderr or salida.stdout or "").strip().splitlines()
        return False, f"`comfy install` falló: {cola[-1] if cola else 'sin detalle'}"

    decir(tipo="progreso", pct=85, mensaje="Instalado. Arrancándolo…")
    return arrancar()


def main() -> int:
    use_utf8()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    grupo = ap.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--arrancar", action="store_true", help="lanzar un ComfyUI ya instalado")
    grupo.add_argument("--instalar", action="store_true", help="instalarlo y despues lanzarlo")
    args = ap.parse_args()

    try:
        ok, mensaje = instalar() if args.instalar else arrancar()
    except subprocess.TimeoutExpired:
        ok, mensaje = False, "Se agotó el tiempo de espera. Se puede reintentar."
    except KeyboardInterrupt:
        decir(tipo="fin", ok=False, mensaje="Cancelado")
        return 130

    # Como en el instalador: esto dice cómo fue el intento, NO que el motor esté
    # listo. Quien decide eso es la re-auditoría que la pantalla pide después
    # (ADR-008 D6).
    decir(tipo="fin", ok=ok, mensaje=mensaje)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

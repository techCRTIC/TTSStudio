#!/usr/bin/env python3
"""Crea el entorno de Python que necesitan dos funciones de la app.

Lo llama el portal de configuración. Imprime NDJSON como los demás.

    python execution/crear_entorno.py

QUÉ SE ROMPE SIN ESTO, Y QUÉ NO
    Solo **dos** cosas necesitan paquetes de terceros (medido, ADR-009 D6.3):

      · unir los tramos de un guión largo   -> numpy, soundfile
      · transcribir un audio de referencia  -> faster-whisper

    Todo lo demás —generar, la biblioteca de voces, trocear un guión, la
    revisión de texto— es biblioteca estándar y funciona sin esto. Por eso el
    entorno es una dependencia OPCIONAL del portal y no algo que bloquee la app.

POR QUÉ EXISTE ESTE SCRIPT
    `ADR-009` D6.3 decidió que «el entorno es una dependencia que el portal
    instala, como un modelo», y se quedó sin implementar. Lo que se veía en su
    lugar era este mensaje, dentro de la aplicación, a un usuario cualquiera:

        «El entorno de Python del proyecto no existe. Ejecuta `uv sync` en la raíz.»

    ¿Qué raíz? ¿Qué es `uv`? Estaba escrito para quien programa el proyecto, y
    lo leía quien solo quiere clonar una voz.

    No se asume `uv`: `python -m venv` + `pip` está en cualquier Python, y
    depender de una herramienta que quizá no esté instalada es exactamente el
    problema que este script viene a resolver.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent

# Se declaran aquí Y en pyproject.toml. Están en dos sitios a propósito: el
# empaquetado puede no llevar el pyproject, y este script tiene que funcionar
# igual. Si divergen, manda pyproject — se intenta leer primero.
PAQUETES = ["faster-whisper>=1.2.1", "soundfile>=0.14.0", "numpy>=2.0"]


def use_utf8() -> None:
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except AttributeError:
            pass


def decir(**campos) -> None:
    print(json.dumps(campos, ensure_ascii=False), flush=True)


def python_del_entorno(venv: Path) -> Path:
    return venv / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python")


def paquetes() -> list[str]:
    """Lo que hay que instalar. De `pyproject.toml` si está; si no, la lista de
    arriba. Se parsea a mano porque `tomllib` existe desde 3.11 y este script
    tiene que correr en el Python que haya."""
    py = RAIZ / "pyproject.toml"
    try:
        import tomllib
        with py.open("rb") as f:
            deps = tomllib.load(f).get("project", {}).get("dependencies")
        if deps:
            return list(deps)
    except Exception:
        pass
    return PAQUETES


def main() -> int:
    use_utf8()
    venv = RAIZ / ".venv"
    destino = python_del_entorno(venv)

    if destino.exists():
        decir(tipo="fin", ok=True, mensaje="Ya estaba puesto")
        return 0

    decir(tipo="inicio", titulo="Entorno de Python", mb_total=0)
    decir(tipo="progreso", pct=5, mensaje="Creando el entorno…")

    try:
        creado = subprocess.run(
            [sys.executable, "-m", "venv", str(venv)],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300,
        )
    except subprocess.TimeoutExpired:
        decir(tipo="fin", ok=False, mensaje="Crear el entorno tardó demasiado.")
        return 1

    if creado.returncode != 0 or not destino.exists():
        cola = (creado.stderr or "").strip().splitlines()
        decir(tipo="fin", ok=False,
              mensaje=f"No se pudo crear el entorno: {cola[-1] if cola else 'sin detalle'}")
        return 1

    decir(tipo="progreso", pct=20,
          mensaje="Descargando lo que hace falta. Es alrededor de 1 GB: tarda.")

    # El progreso se cuenta desde fuera pesando la carpeta, igual que las
    # descargas de modelos: parsear la salida de pip es fragil y cambia entre
    # versiones; pesar un directorio no cambia nunca.
    sitio = venv / ("Lib/site-packages" if os.name == "nt" else "lib")
    parar = threading.Event()

    def vigilar() -> None:
        while not parar.wait(2.0):
            mb = 0
            for raiz, _, archivos in os.walk(sitio):
                for a in archivos:
                    try:
                        mb += (Path(raiz) / a).stat().st_size
                    except OSError:
                        pass
            decir(tipo="progreso", pct=min(95, 20 + int(mb / (1024 * 1024) / 12)),
                  mensaje=f"Instalando… {mb // (1024 * 1024)} MB")

    hilo = threading.Thread(target=vigilar, daemon=True)
    hilo.start()
    try:
        instalado = subprocess.run(
            [str(destino), "-m", "pip", "install", *paquetes()],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600,
        )
    except subprocess.TimeoutExpired:
        parar.set()
        decir(tipo="fin", ok=False, mensaje="La instalación se pasó de una hora. Se puede reintentar.")
        return 1
    finally:
        parar.set()
        hilo.join(timeout=3)

    if instalado.returncode != 0:
        cola = (instalado.stderr or instalado.stdout or "").strip().splitlines()
        decir(tipo="fin", ok=False,
              mensaje=f"No se pudieron instalar los paquetes: {cola[-1] if cola else 'sin detalle'}")
        return 1

    decir(tipo="fin", ok=True,
          mensaje="Listo. Ya se puede transcribir audio y unir guiones largos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

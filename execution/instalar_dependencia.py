#!/usr/bin/env python3
"""Instala UNA dependencia de TTS Studio y va contando cómo va.

Lo llama el portal de configuración de la app (ADR-008). Imprime una línea de
JSON por novedad (NDJSON) en stdout, para que el navegador pueda pintar una
barra mientras esto trabaja:

    {"tipo": "inicio",   "titulo": "...", "mb_total": 4096}
    {"tipo": "progreso", "mb_hechos": 812, "mb_total": 4096, "pct": 19}
    {"tipo": "fin",      "ok": true, "mensaje": "..."}

Uso:
    python execution/instalar_dependencia.py --requisito voces-preestablecidas
    python execution/instalar_dependencia.py --requisito pack-qwen3-tts
    python execution/instalar_dependencia.py --requisito reescritura

QUÉ NO HACE, Y ESO ES DELIBERADO (ADR-008 D1)
    No instala comfy-cli ni ComfyUI. Esos se guían, no se instalan: hacerlo
    convertiría a la app en gestor de paquetes de un proyecto ajeno que no
    versiona.

QUÉ NO AFIRMA (ADR-008 D6)
    **No dice si algo quedó instalado.** Dice si el comando terminó bien, que
    no es lo mismo: un instalador puede salir 0 sin haber instalado nada. Quien
    decide si quedó es una re-auditoría posterior (`auditar_host.py --app`), y
    esa es la única que el portal cree.

PUNTOS CIEGOS DECLARADOS
    - El progreso de una descarga se mide **pesando la carpeta temporal** cada
      segundo, no leyendo a la librería que descarga. Es robusto (no depende
      del formato de nadie) pero es aproximado: el tamaño total sale del
      manifiesto, que está escrito a mano.
    - Si el proceso muere a media descarga, lo que queda es una carpeta
      temporal. **Nunca** se confunde con el modelo instalado, porque el
      nombre definitivo solo aparece por un renombrado atómico al final
      (ADR-008 D5). Pero la carpeta temporal sí queda ocupando disco hasta el
      siguiente intento, que la borra.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
MANIFIESTO = AQUI / "manifiesto.json"

# El sufijo que marca "esto todavía no está entero". Vive aquí y no en dos
# sitios porque el auditor mira que la carpeta NO lo tenga.
EN_CURSO = ".descargando"


def use_utf8() -> None:
    """En Windows la salida de Python es cp1252 y Node la lee rota."""
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except AttributeError:
            pass


def decir(**campos) -> None:
    """Una línea de JSON, vaciada al momento: si se queda en el búfer, el
    navegador no ve la barra moverse y el progreso deja de ser progreso."""
    print(json.dumps(campos, ensure_ascii=False), flush=True)


def pesar_mb(carpeta: Path) -> int:
    total = 0
    for raiz, _, archivos in os.walk(carpeta):
        for a in archivos:
            try:
                total += (Path(raiz) / a).stat().st_size
            except OSError:
                pass
    return total // (1024 * 1024)


def _auditar() -> dict:
    """Corre el auditor y devuelve su informe de la app."""
    salida = subprocess.run(
        [sys.executable, str(AQUI / "auditar_host.py"), "--app"],
        capture_output=True, text=True, encoding="utf-8", timeout=120,
    )
    return json.loads(salida.stdout)


def _requisito(informe: dict, rid: str) -> dict | None:
    return next((r for r in informe.get("requisitos", []) if r["id"] == rid), None)


# --------------------------------------------------------------------------
# Descargar un modelo, aterrizándolo de forma atómica
# --------------------------------------------------------------------------

def descargar_modelo(nombre: str, manifiesto: dict, informe: dict) -> tuple[bool, str]:
    spec = manifiesto["modelos"].get(nombre)
    if not spec:
        return False, f"El manifiesto no conoce «{nombre}»"

    origen = spec.get("origen")
    if not origen or origen.get("tipo") != "huggingface":
        return False, (f"El manifiesto no declara de dónde se baja «{nombre}». "
                       "No se inventa un origen.")

    workspace = informe.get("workspace")
    if not workspace:
        return False, "No se encontró la carpeta de ComfyUI"

    python_comfy = informe.get("python_venv")
    if not python_comfy or not Path(python_comfy).exists():
        # D7 aplicado también aquí: se rehúsa antes que usar el intérprete
        # equivocado, que instalaría en el sitio que no es.
        return False, ("No se encontró el Python propio de ComfyUI. Sin él no se "
                       "puede descargar en su entorno, y usar otro dejaría el "
                       "modelo donde el motor no lo busca.")

    destino = Path(workspace) / "models" / spec.get("carpeta", "Qwen3-TTS") / nombre
    temporal = destino.with_name(destino.name + EN_CURSO)
    mb_total = spec.get("mb", 0)

    if destino.exists():
        return True, "Ya estaba"

    # Un temporal de un intento anterior se borra: reanudar a ciegas es cómo
    # se acaba con un modelo mitad de una versión y mitad de otra.
    if temporal.exists():
        shutil.rmtree(temporal, ignore_errors=True)
    temporal.mkdir(parents=True, exist_ok=True)

    decir(tipo="inicio", titulo=nombre, mb_total=mb_total)

    guion = (
        "from huggingface_hub import snapshot_download\n"
        f"snapshot_download({origen['repo']!r}, local_dir={str(temporal)!r})\n"
    )
    proceso = subprocess.Popen(
        [python_comfy, "-c", guion],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )

    # El progreso se pesa desde fuera. Ver "puntos ciegos" arriba.
    parar = threading.Event()

    def vigilar() -> None:
        while not parar.wait(1.0):
            hechos = pesar_mb(temporal)
            pct = min(99, round(hechos * 100 / mb_total)) if mb_total else 0
            decir(tipo="progreso", mb_hechos=hechos, mb_total=mb_total, pct=pct)

    hilo = threading.Thread(target=vigilar, daemon=True)
    hilo.start()
    _, err = proceso.communicate()
    parar.set()
    hilo.join(timeout=2)

    if proceso.returncode != 0:
        shutil.rmtree(temporal, ignore_errors=True)
        cola = (err or "").strip().splitlines()
        motivo = cola[-1] if cola else "sin detalle"
        if "ConnectionError" in err or "Name or service not known" in err or "getaddrinfo" in err:
            return False, "No hay conexión a internet, o HuggingFace no responde."
        if "No space left" in err or "Errno 28" in err:
            return False, "El disco se quedó sin espacio a media descarga."
        if "401" in err or "403" in err:
            return False, f"HuggingFace rechazó la descarga de {origen['repo']}."
        if "404" in err or "RepositoryNotFound" in err:
            return False, f"HuggingFace dice que {origen['repo']} no existe."
        return False, f"La descarga falló: {motivo}"

    # El aterrizaje atómico (D5). Hasta esta línea, nada con el nombre bueno
    # existe, así que nada a medias puede parecer instalado.
    destino.parent.mkdir(parents=True, exist_ok=True)
    os.replace(temporal, destino)
    return True, "Descargado"


# --------------------------------------------------------------------------
# El paso que de verdad duele: las dependencias del pack (ADR-008 D7)
# --------------------------------------------------------------------------

def instalar_requirements_del_pack(informe: dict) -> tuple[bool, str]:
    python_comfy = informe.get("python_venv")
    if not python_comfy or not Path(python_comfy).exists():
        # Se rehúsa el paso en vez de caer al Python del sistema. Instalar ahí
        # ensucia la máquina y NO arregla a ComfyUI, que seguiría sin sus cosas.
        return False, ("No se encontró el Python propio de ComfyUI. Se prefiere no "
                       "hacer nada antes que instalar en el intérprete equivocado.")

    workspace = informe.get("workspace")
    req = Path(workspace) / "custom_nodes" / "ComfyUI-Qwen3-TTS" / "requirements.txt"
    if not req.exists():
        return False, f"No está el requirements.txt del pack en {req.parent}"

    decir(tipo="inicio", titulo="Dependencias del pack de nodos", mb_total=0)
    decir(tipo="progreso", pct=10, mensaje="Instalando con el Python de ComfyUI…")

    salida = subprocess.run(
        [python_comfy, "-m", "pip", "install", "-r", str(req)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800,
    )
    if salida.returncode != 0:
        cola = (salida.stderr or salida.stdout or "").strip().splitlines()
        return False, f"pip falló: {cola[-1] if cola else 'sin detalle'}"

    decir(tipo="progreso", pct=90, mensaje="Instaladas. Hay que reiniciar el motor.")
    return True, ("Dependencias instaladas. **ComfyUI tiene que reiniciarse** para "
                  "cargarlas: ciérralo y vuelve a arrancar la app.")


def instalar_modelo_ollama(pedido: str, manifiesto: dict) -> tuple[bool, str]:
    if not shutil.which("ollama"):
        return False, ("ollama no está instalado. Se descarga de https://ollama.com "
                       "— la app no lo instala por ti.")
    decir(tipo="inicio", titulo=f"Modelo de texto {pedido}", mb_total=(
        manifiesto.get("servicios", {}).get("ollama", {})
        .get("modelos", {}).get(pedido, {}).get("mb", 0)))
    salida = subprocess.run(["ollama", "pull", pedido], capture_output=True,
                            text=True, encoding="utf-8", errors="replace", timeout=3600)
    if salida.returncode != 0:
        cola = (salida.stderr or "").strip().splitlines()
        return False, f"`ollama pull` falló: {cola[-1] if cola else 'sin detalle'}"
    return True, "Descargado"


def main() -> int:
    use_utf8()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--requisito", required=True,
                    help="id del requisito, como lo llama el manifiesto")
    ap.add_argument("--manifiesto", type=Path, default=MANIFIESTO)
    args = ap.parse_args()

    manifiesto = json.loads(args.manifiesto.read_text(encoding="utf-8"))
    informe = _auditar()
    req = _requisito(informe, args.requisito)

    if req is None:
        decir(tipo="fin", ok=False, mensaje=f"No existe el requisito «{args.requisito}»")
        return 1
    if not req.get("instalable"):
        decir(tipo="fin", ok=False,
              mensaje=f"«{req['titulo']}» no se instala desde aquí. {req.get('guia') or ''}".strip())
        return 1
    if req.get("estado") == "instalada":
        decir(tipo="fin", ok=True, mensaje="Ya estaba puesto")
        return 0

    # Antes de empezar: ¿cabe? El auditor ya sabe el disco libre.
    libre = informe.get("disco_libre_mb") or 0
    if req.get("mb") and libre and req["mb"] > libre:
        decir(tipo="fin", ok=False,
              mensaje=(f"No cabe: hacen falta {req['mb'] / 1024:.1f} GB y quedan "
                       f"{libre / 1024:.1f} GB libres."))
        return 1

    try:
        if req["tipo"] == "modelo":
            ok, mensaje = descargar_modelo(req["modelo"], manifiesto, informe)
        elif req["tipo"] == "pack":
            ok, mensaje = instalar_requirements_del_pack(informe)
        elif req["tipo"] == "servicio" and req.get("servicio") == "ollama":
            ok, mensaje = instalar_modelo_ollama(req["modelo_servicio"], manifiesto)
        else:
            ok, mensaje = False, f"No sé instalar algo de tipo «{req['tipo']}»"
    except subprocess.TimeoutExpired:
        ok, mensaje = False, "Se agotó el tiempo de espera. Se puede reintentar."
    except KeyboardInterrupt:
        decir(tipo="fin", ok=False, mensaje="Cancelado")
        return 130

    decir(tipo="fin", ok=ok, mensaje=mensaje)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

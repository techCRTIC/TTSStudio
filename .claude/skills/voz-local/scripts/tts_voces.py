#!/usr/bin/env python3
"""Registro de voces disponibles. Capa 3 (determinista).

Los embeddings de voz son archivos `.safetensors` de ~20-30 KB en
`ComfyUI/models/Qwen3-TTS/prompts/`. Sueltos no dicen nada: ni de quién es la
voz, ni de qué grabación salió, ni con qué texto de referencia se construyó.

Ese contexto NO es cosmético. El `ref_text` con el que se creó una voz importa
para reproducirla o rehacerla, y la procedencia importa para saber si se puede
usar (la voz de una persona no es un asset cualquiera: se usa con su permiso y
para lo que autorizó).

Uso:
    python tts_voces.py listar
    python tts_voces.py registrar martin_vega --de "entrevista 2019" \\
        --ref-texto-archivo ref.txt --consentimiento "autorizó uso interno"
    python tts_voces.py ver martin_vega
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import date

REGISTRO = "voces.json"


def carpeta_prompts(indicada: str | None) -> str:
    """Descubre la carpeta de prompts en vez de asumirla: la skill es portable."""
    if indicada:
        return indicada
    comfy = shutil.which("comfy")
    if comfy:
        try:
            r = subprocess.run([comfy, "--skip-prompt", "--json", "env"],
                               capture_output=True, text=True, timeout=60,
                               encoding="utf-8", errors="replace")
            for l in r.stdout.splitlines():
                if l.strip().startswith("{"):
                    d = json.loads(l)
                    ws = (d.get("data") or {}).get("workspace") or {}
                    if ws.get("path"):
                        return os.path.join(ws["path"], "models", "Qwen3-TTS", "prompts")
        except Exception:
            pass
    sys.exit("No se pudo descubrir la carpeta de ComfyUI. Pasarla con --prompts.")


def cargar(carpeta: str) -> dict:
    p = os.path.join(carpeta, REGISTRO)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def guardar(carpeta: str, datos: dict) -> None:
    with open(os.path.join(carpeta, REGISTRO), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)


def archivos_voz(carpeta: str) -> list[str]:
    if not os.path.isdir(carpeta):
        return []
    return sorted(f for f in os.listdir(carpeta) if f.endswith(".safetensors"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("accion", choices=["listar", "registrar", "ver"])
    ap.add_argument("nombre", nargs="?", help="Nombre de la voz (sin extensión)")
    ap.add_argument("--prompts", help="Carpeta de prompts (se descubre sola si se omite)")
    ap.add_argument("--de", help="De qué grabación salió")
    ap.add_argument("--ref-texto-archivo", help="Archivo con el ref_text usado")
    ap.add_argument("--duracion", type=float, help="Duración de la referencia en segundos")
    ap.add_argument("--consentimiento", help="Con qué permiso se puede usar esta voz")
    ap.add_argument("--notas")
    a = ap.parse_args()

    carpeta = carpeta_prompts(a.prompts)
    datos = cargar(carpeta)
    voces = archivos_voz(carpeta)

    if a.accion == "listar":
        if not voces:
            print(f"No hay voces registradas en {carpeta}.")
            print("Crear una con workflows/tts_voice_prompt_make.json")
            return 0
        print(f"{len(voces)} voz/voces en {carpeta}\n")
        for v in voces:
            n = v[: -len(".safetensors")]
            meta = datos.get(n, {})
            kb = os.path.getsize(os.path.join(carpeta, v)) / 1024
            print(f"  {n:<24} {kb:6.1f} KB   {meta.get('de', '(sin procedencia)')}")
            if meta.get("consentimiento"):
                print(f"  {'':<24}          uso: {meta['consentimiento']}")
            if not meta:
                print(f"  {'':<24}          [!] sin metadatos — "
                      f"registrar con: tts_voces.py registrar {n} --de ...")
        return 0

    if not a.nombre:
        sys.exit("Falta el nombre de la voz.")
    archivo = a.nombre + ".safetensors"

    if a.accion == "ver":
        if archivo not in voces:
            sys.exit(f"No existe {archivo} en {carpeta}. Voces: {', '.join(voces) or 'ninguna'}")
        print(json.dumps(datos.get(a.nombre, {"aviso": "sin metadatos"}),
                         ensure_ascii=False, indent=1))
        return 0

    # registrar
    if archivo not in voces:
        sys.exit(f"No existe {archivo} en {carpeta}. Crear la voz primero con "
                 "workflows/tts_voice_prompt_make.json")
    entrada = datos.get(a.nombre, {})
    entrada["archivo"] = archivo
    entrada["registrada"] = entrada.get("registrada") or date.today().isoformat()
    entrada["actualizada"] = date.today().isoformat()
    if a.de:
        entrada["de"] = a.de
    if a.duracion:
        entrada["duracion_referencia_s"] = a.duracion
    if a.consentimiento:
        entrada["consentimiento"] = a.consentimiento
    if a.notas:
        entrada["notas"] = a.notas
    if a.ref_texto_archivo:
        entrada["ref_text"] = open(a.ref_texto_archivo, encoding="utf-8").read().strip()
    datos[a.nombre] = entrada
    guardar(carpeta, datos)
    print(f"Registrada '{a.nombre}':")
    print(json.dumps(entrada, ensure_ascii=False, indent=1))
    if not entrada.get("consentimiento"):
        print("\n[!] Sin campo de consentimiento. La voz de una persona no es un "
              "asset cualquiera: dejar por escrito para qué se autorizó.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

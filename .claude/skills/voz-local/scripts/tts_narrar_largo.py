#!/usr/bin/env python3
"""Narra un guion largo: trocea, genera, verifica y une. Capa 3 (determinista).

El modelo tiene dos techos duros: ~8192 tokens de audio (~3 min) y 2048
caracteres de entrada por pasada. Cualquier locución real —un video, un
podcast, un audiolibro— los supera. Este script hace el ciclo completo:

  1. TROCEA por frases completas, nunca a mitad de oración. Cortar en medio de
     una frase destruye la entonación de las dos mitades.
  2. GENERA cada trozo con la misma voz y la misma semilla base.
  3. VERIFICA cada trozo contra el bug de loop infinito del modelo (audio mucho
     más largo de lo que el texto justifica) y REGENERA con otra semilla si
     falla. Sin esto, un trozo malo arruina la locución entera y hay que
     rehacerla completa.
  4. UNE con pausas: corta entre frases, larga entre párrafos. Los silencios
     son lo que hace que un montaje de trozos suene como una sola lectura.

Uso:
    python tts_narrar_largo.py guion.txt --ref-audio voz.wav --ref-text-archivo voz.txt
    python tts_narrar_largo.py guion.txt --voz mi_voz.safetensors
    python tts_narrar_largo.py guion.txt --voz v.safetensors --salida narracion.wav

Requiere `comfy` en el PATH y ComfyUI corriendo.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

SR = 24000
# Bien por debajo del techo de 2048: los textos largos aumentan el riesgo del
# bug de loop, y trozos chicos permiten reintentar barato.
MAX_CARACTERES = 600
PAUSA_FRASE = 0.28
PAUSA_PARRAFO = 0.65
# Mismos umbrales que tts_qa_audio.py: fuera de esto, algo se rompió.
CPS_MIN, CPS_MAX = 8.0, 22.0
SEMILLAS_REINTENTO = [42, 7, 123, 2024, 31337]


def trocear(texto: str, maximo: int = MAX_CARACTERES) -> list[dict]:
    """Divide en trozos que respetan frases y recuerdan dónde iba un párrafo."""
    trozos: list[dict] = []
    parrafos = [p.strip() for p in re.split(r"\n\s*\n", texto) if p.strip()]
    for i, parrafo in enumerate(parrafos):
        parrafo = re.sub(r"\s+", " ", parrafo)
        # Corta después de . ! ? … conservando el signo y las comillas de cierre.
        frases = re.findall(r"[^.!?…]+[.!?…]+[\"'»）]*\s*|[^.!?…]+$", parrafo)
        frases = [f.strip() for f in frases if f.strip()]
        actual = ""
        for f in frases:
            if len(f) > maximo:
                # Una sola frase gigantesca: se parte por comas, último recurso.
                if actual:
                    trozos.append({"texto": actual, "fin_parrafo": False})
                    actual = ""
                partes, buf = re.split(r"(?<=,)\s+", f), ""
                for p in partes:
                    if len(buf) + len(p) + 1 > maximo and buf:
                        trozos.append({"texto": buf.strip(), "fin_parrafo": False})
                        buf = p
                    else:
                        buf = f"{buf} {p}".strip()
                actual = buf
            elif len(actual) + len(f) + 1 > maximo and actual:
                trozos.append({"texto": actual, "fin_parrafo": False})
                actual = f
            else:
                actual = f"{actual} {f}".strip()
        if actual:
            trozos.append({"texto": actual, "fin_parrafo": True})
        if trozos and i == len(parrafos) - 1:
            trozos[-1]["fin_parrafo"] = False   # el último no lleva pausa extra
    return trozos


def grafo(texto: str, seed: int, prefijo: str, voz: str | None,
          ref_audio: str | None, ref_text: str | None) -> dict:
    g = {
        "1": {"class_type": "Qwen3Loader", "inputs": {
            "repo_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "source": "HuggingFace",
            "precision": "bf16", "attention": "sdpa", "local_model_path": ""}},
    }
    clon = {"model": ["1", 0], "text": texto, "seed": seed,
            "language": "Spanish", "max_new_tokens": 4096}
    if voz:
        g["2"] = {"class_type": "Qwen3LoadPrompt", "inputs": {"prompt_file": voz}}
        clon["prompt"] = ["2", 0]
    else:
        g["2"] = {"class_type": "LoadAudio", "inputs": {"audio": ref_audio}}
        clon["ref_audio"] = ["2", 0]
        clon["ref_text"] = ref_text
        clon["ref_audio_max_seconds"] = 30.0
    g["3"] = {"class_type": "Qwen3VoiceClone", "inputs": clon}
    g["4"] = {"class_type": "SaveAudio",
              "inputs": {"audio": ["3", 0], "filename_prefix": prefijo}}
    return g


def generar(comfy: str, g: dict, tmp: str) -> str | None:
    ruta = os.path.join(tmp, "wf.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(g, f, ensure_ascii=False)
    r = subprocess.run(
        [comfy, "--skip-prompt", "--json", "--where", "local", "run",
         "--workflow", ruta, "--wait", "--timeout", "300"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    linea = [l for l in r.stdout.splitlines() if l.strip().startswith("{")]
    if not linea:
        return None
    env = json.loads(linea[-1])
    if not env.get("ok") or not env["data"].get("outputs"):
        return None
    return env["data"]["outputs"][0]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("guion", help="Archivo de texto UTF-8 con el guion")
    ap.add_argument("--voz", help="Nombre del .safetensors de una voz registrada")
    ap.add_argument("--ref-audio", help="WAV de referencia (debe estar en ComfyUI/input/)")
    ap.add_argument("--ref-text-archivo", help="Archivo con la transcripción de la referencia")
    ap.add_argument("--salida", default="narracion.wav")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--max-caracteres", type=int, default=MAX_CARACTERES)
    ap.add_argument("--solo-trocear", action="store_true",
                    help="Muestra los trozos y no genera nada")
    a = ap.parse_args()

    if not a.voz and not a.ref_audio:
        sys.exit("Indicar --voz (voz registrada) o --ref-audio + --ref-text-archivo.")

    texto = open(a.guion, encoding="utf-8").read()
    trozos = trocear(texto, a.max_caracteres)
    total = sum(len(t["texto"]) for t in trozos)
    print(f"{len(trozos)} trozos, {total} caracteres "
          f"(~{total / 15 / 60:.1f} min estimados)\n")
    for i, t in enumerate(trozos, 1):
        marca = " ¶" if t["fin_parrafo"] else "  "
        print(f"  {i:3d}.{marca} [{len(t['texto']):4d}] {t['texto'][:66]}")
    if a.solo_trocear:
        return 0

    try:
        import numpy as np
        import soundfile as sf
        import librosa
    except ImportError as e:
        sys.exit(f"Falta {e.name}. Correr con el Python del venv de ComfyUI.")

    comfy = shutil.which("comfy")
    if not comfy:
        sys.exit("`comfy` no está en el PATH.")

    ref_text = None
    if a.ref_text_archivo:
        ref_text = open(a.ref_text_archivo, encoding="utf-8").read().strip()

    piezas, fallidos = [], []
    tmp = tempfile.mkdtemp(prefix="narrar_")
    print()
    for i, t in enumerate(trozos, 1):
        objetivo = len(t["texto"])
        audio = None
        for intento, seed in enumerate([a.seed] + [s for s in SEMILLAS_REINTENTO
                                                   if s != a.seed]):
            salida = generar(comfy, grafo(t["texto"], seed, f"narr_{i:03d}",
                                          a.voz, a.ref_audio, ref_text), tmp)
            if not salida:
                continue
            y, _ = librosa.load(salida, sr=SR, mono=True)
            cps = objetivo / (len(y) / SR) if len(y) else 0
            if CPS_MIN <= cps <= CPS_MAX:
                print(f"  {i:3d}/{len(trozos)}  ok  {len(y)/SR:5.2f}s  "
                      f"{cps:4.1f} c/s" + (f"  (semilla {seed})" if intento else ""))
                audio = y
                break
            print(f"  {i:3d}/{len(trozos)}  RECHAZADO {cps:4.1f} c/s "
                  f"(semilla {seed}) — reintentando")
        if audio is None:
            print(f"  {i:3d}/{len(trozos)}  FALLÓ tras todos los reintentos")
            fallidos.append(i)
            continue
        piezas.append(audio)
        if i < len(trozos):
            pausa = PAUSA_PARRAFO if t["fin_parrafo"] else PAUSA_FRASE
            piezas.append(np.zeros(int(pausa * SR), dtype=np.float32))

    shutil.rmtree(tmp, ignore_errors=True)
    if not piezas:
        sys.exit("No se generó ningún trozo.")

    final = np.concatenate(piezas)
    sf.write(a.salida, final, SR)
    print(f"\n{a.salida}  ·  {len(final)/SR/60:.2f} min  ·  "
          f"{len(trozos)-len(fallidos)}/{len(trozos)} trozos")
    if fallidos:
        print(f"ATENCIÓN: fallaron los trozos {fallidos} y NO están en el "
              f"audio final. Revisar esos textos antes de usar la locución.")
        return 1
    print("Antes de dar por buena la locución, escucharla: este script verifica "
          "duración y cortes, no si las palabras están bien dichas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

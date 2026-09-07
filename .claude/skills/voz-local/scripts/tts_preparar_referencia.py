#!/usr/bin/env python3
"""Prepara un audio de referencia para clonar una voz. Capa 3 (determinista).

Toma una grabación cualquiera y produce el par (WAV recortado, texto exacto)
que necesita la clonación, con la correspondencia texto<->audio garantizada
POR CONSTRUCCIÓN.

Por qué importa tanto el recorte: el par (`ref_audio`, `ref_text`) es un prompt
de aprendizaje en contexto — el modelo alinea uno contra otro. Si el texto
declara palabras que el audio NO contiene, ese sobrante **se filtra en la
generación**: aparecen frases que nadie pidió, normalmente al principio.

Pasó de verdad (2026-08-19): se extrajo el texto con el filtro
`segmento["start"] < 17.0`, que dejó entrar un segmento que empieza en 16.28
pero **termina en 19.32** — 2.3 s de palabras inexistentes en un audio de 15 s.
La generación empezó diciendo algo que no estaba en el prompt.

Por eso este script NO recorta el texto para que calce con un corte arbitrario
del audio: recorta el AUDIO en límites de frase completos y usa exactamente
esas frases como texto.

Uso:
    python tts_preparar_referencia.py grabacion.m4a --salida-dir ./ref
    python tts_preparar_referencia.py grabacion.wav --desde 5 --hasta 60
    python tts_preparar_referencia.py grabacion.wav --modelo medium

Requiere: openai-whisper, librosa, y ffmpeg (ruta con --ffmpeg si no está en
el PATH). Correr con el Python que tenga esas dependencias — típicamente el
venv de ComfyUI.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

# Rango ideal de referencia: el pack documenta 10-15 s como óptimo y avisa que
# más de 30 s dispara un bug de loop infinito en la generación.
DUR_MIN, DUR_MAX = 10.0, 15.0


def buscar_ffmpeg(indicado: str | None) -> str:
    if indicado:
        return indicado
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    # Rutas donde suele estar en Windows sin quedar en el PATH.
    candidatos = [
        r"C:\Program Files\Shutter Encoder\Library\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
    ]
    for c in candidatos:
        if os.path.exists(c):
            return c
    sys.exit("No se encontró ffmpeg. Pasarlo con --ffmpeg <ruta>.")


def elegir_ventana(segmentos: list[dict]) -> list[dict]:
    """Primera ventana de segmentos CONSECUTIVOS y COMPLETOS en el rango ideal.

    Consecutivos para que el audio sea continuo (no un collage) y completos
    para que no quede media palabra fuera en ninguna punta. Entre las
    candidatas se prefiere la que tenga el menor hueco de silencio interno.
    """
    mejor = None
    for i in range(len(segmentos)):
        for j in range(i + 1, min(i + 8, len(segmentos)) + 1):
            bloque = segmentos[i:j]
            dur = bloque[-1]["end"] - bloque[0]["start"]
            if dur > DUR_MAX:
                break
            if dur >= DUR_MIN:
                hueco = max((b["start"] - a["end"])
                            for a, b in zip(bloque, bloque[1:])) if len(bloque) > 1 else 0.0
                cand = (round(hueco, 2), -dur, i)
                if mejor is None or cand < mejor[0]:
                    mejor = (cand, bloque)
                break
    if mejor is None:
        sys.exit(f"No se encontró ninguna ventana de {DUR_MIN}-{DUR_MAX}s con "
                 "frases completas. ¿El audio es muy corto o muy fragmentado?")
    return mejor[1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("audio", help="Grabación de origen (cualquier formato)")
    ap.add_argument("--salida-dir", default=".", help="Dónde dejar el par")
    ap.add_argument("--nombre", default="ref", help="Nombre base de la salida")
    ap.add_argument("--modelo", default="large-v3",
                    help="Modelo Whisper. NO usar 'small': sus errores de "
                         "transcripción envenenan la referencia.")
    ap.add_argument("--desde", type=float, default=0.0,
                    help="Acotar la búsqueda a partir de este segundo")
    ap.add_argument("--hasta", type=float, default=None,
                    help="Acotar la búsqueda hasta este segundo")
    ap.add_argument("--ffmpeg", default=None)
    a = ap.parse_args()

    try:
        import librosa
        import whisper
    except ImportError as e:
        sys.exit(f"Falta una dependencia ({e.name}). Correr este script con el "
                 "Python que tenga whisper y librosa (normalmente el venv de "
                 "ComfyUI), o instalarlas con pip.")

    ffmpeg = buscar_ffmpeg(a.ffmpeg)
    os.makedirs(a.salida_dir, exist_ok=True)
    base = os.path.join(a.salida_dir, a.nombre)

    # Normalizar a 24 kHz mono: es la tasa que espera el modelo.
    wav_norm = base + "_fuente24k.wav"
    print(f"[1/4] Normalizando a 24 kHz mono ...", flush=True)
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", a.audio,
                    "-ac", "1", "-ar", "24000", wav_norm], check=True)

    # Se carga con librosa en vez de dejar que whisper llame a su ffmpeg
    # interno, que falla cuando ffmpeg no está en el PATH.
    print(f"[2/4] Transcribiendo con Whisper {a.modelo} ...", flush=True)
    audio16, _ = librosa.load(wav_norm, sr=16000, mono=True)
    modelo = whisper.load_model(a.modelo)
    res = modelo.transcribe(audio16, language="es", condition_on_previous_text=False,
                            verbose=False)

    segs = [{"start": s["start"], "end": s["end"], "text": s["text"].strip()}
            for s in res["segments"] if s["text"].strip()]
    segs = [s for s in segs if s["start"] >= a.desde
            and (a.hasta is None or s["end"] <= a.hasta)]
    if not segs:
        sys.exit("La transcripción quedó vacía en el rango pedido.")

    print(f"[3/4] Eligiendo ventana alineada a frases completas ...", flush=True)
    bloque = elegir_ventana(segs)
    ini, fin = bloque[0]["start"], bloque[-1]["end"]
    texto = " ".join(s["text"] for s in bloque)

    print(f"      [{ini:.2f} - {fin:.2f}] = {fin - ini:.2f}s, "
          f"{len(bloque)} frase(s) completa(s)")
    for s in bloque:
        print(f"        [{s['start']:7.2f} - {s['end']:7.2f}] {s['text'][:60]}")

    print(f"[4/4] Recortando ...", flush=True)
    wav_ref = base + ".wav"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", wav_norm,
                    "-ss", f"{ini:.3f}", "-to", f"{fin:.3f}",
                    "-ac", "1", "-ar", "24000", wav_ref], check=True)
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(texto)
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump({"audio": os.path.abspath(wav_ref), "ref_text": texto,
                   "inicio_s": round(ini, 3), "fin_s": round(fin, 3),
                   "duracion_s": round(fin - ini, 3), "modelo_whisper": a.modelo},
                  f, ensure_ascii=False, indent=1)
    os.remove(wav_norm)

    print(f"\nWAV      -> {wav_ref}")
    print(f"ref_text -> {base}.txt")
    print(f"\n{texto}")
    print("\nCopiar el WAV a ComfyUI/input/ para poder usarlo: los campos de "
          "audio son combos validados contra esa carpeta, no aceptan rutas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

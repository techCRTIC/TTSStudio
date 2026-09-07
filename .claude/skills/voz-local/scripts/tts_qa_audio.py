#!/usr/bin/env python3
"""Revisa un audio TTS recién generado, sin escucharlo. Capa 3 (determinista).

Existe por una limitación estructural: Claude no puede oír. En la investigación
`comfy-mcp` (2026-08-19) se construyó un aparato de medición elaborado
—similitud de hablante, duración, RMS— que era incapaz de detectar el defecto
más obvio (el modelo decía "ano" en vez de "año"). Lo pilló el usuario en
segundos, escuchando.

Este script NO reemplaza el oído humano y no juzga calidad. Lo que hace es
atrapar los modos de falla que SÍ son medibles, para que no lleguen al usuario:

  - LOOP INFINITO / divagación: bug conocido del modelo, se manifiesta como un
    audio mucho más largo de lo que el texto justifica. En el barrido de
    semillas la semilla 1234 salió 33% más larga que sus hermanas con texto
    idéntico — ese es el síntoma temprano.
  - TRUNCADO: se cortó antes de terminar la frase (audio demasiado corto, o
    termina sin silencio final).
  - SILENCIO / colapso: salida vacía o casi.
  - RECORTE (clipping): saturación digital.
  - COLA O CABEZA MUDA: segundos de silencio que sobran.

Con varios archivos a la vez detecta además OUTLIERS RELATIVOS (mediana ±25%),
que es la forma más fiable de pillar el bug de loop dentro de una tanda.

Uso:
    python tts_qa_audio.py salida.flac --texto "el texto que debía decir"
    python tts_qa_audio.py carpeta/*.flac            # modo comparativo
    python tts_qa_audio.py salida.flac --json
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import librosa
import numpy as np

SR = 24000
# Rango normal de densidad de habla, medido sobre las generaciones validadas de
# la investigación. Fuera de esto algo pasó: o divagó o se truncó.
CHARS_POR_SEG_MIN = 8.0
CHARS_POR_SEG_MAX = 22.0
UMBRAL_SILENCIO = 0.005      # RMS por debajo de esto = silencio
MAX_SILENCIO_BORDE = 1.5     # segundos de silencio tolerables en los extremos


def _tramo_silencio(audio: np.ndarray, desde_el_final: bool = False) -> float:
    """Segundos de silencio al inicio (o al final) del audio."""
    ventana = int(0.05 * SR)
    trozos = [audio[i:i + ventana] for i in range(0, len(audio), ventana)]
    if desde_el_final:
        trozos = trozos[::-1]
    mudos = 0
    for t in trozos:
        if float(np.sqrt((t ** 2).mean())) < UMBRAL_SILENCIO:
            mudos += 1
        else:
            break
    return mudos * ventana / SR


def analizar(ruta: str, texto: str | None = None) -> dict:
    audio, _ = librosa.load(ruta, sr=SR, mono=True)
    dur = len(audio) / SR
    rms = float(np.sqrt((audio ** 2).mean())) if len(audio) else 0.0
    pico = float(np.abs(audio).max()) if len(audio) else 0.0

    r = {
        "archivo": os.path.basename(ruta),
        "duracion_s": round(dur, 2),
        "rms": round(rms, 4),
        "pico": round(pico, 3),
        "silencio_inicio_s": round(_tramo_silencio(audio), 2),
        "silencio_final_s": round(_tramo_silencio(audio, True), 2),
        "problemas": [],
    }

    def flag(nivel, codigo, mensaje, accion):
        r["problemas"].append({"nivel": nivel, "codigo": codigo,
                               "mensaje": mensaje, "accion": accion})

    if dur < 0.5:
        flag("BLOQUEANTE", "audio_vacio", f"Solo {dur:.2f}s de audio.",
             "La generación colapsó. Revisar el grafo y el log de ComfyUI.")
    if rms < UMBRAL_SILENCIO:
        flag("BLOQUEANTE", "silencio_total", "El audio está en silencio.",
             "Revisar que el modelo y la referencia cargaran bien.")
    if pico >= 0.999:
        flag("AVISO", "clipping", "El audio satura (pico en el máximo).",
             "Bajar el nivel en post con ffmpeg si se va a mezclar.")

    if texto:
        n = len(texto)
        cps = n / dur if dur else 0
        r["caracteres_texto"] = n
        r["caracteres_por_segundo"] = round(cps, 1)
        if cps < CHARS_POR_SEG_MIN:
            flag("BLOQUEANTE", "posible_loop",
                 f"{cps:.1f} caracteres/segundo — demasiado lento para el texto.",
                 ("Síntoma del bug de loop infinito del modelo. Cambiar la "
                  "semilla, bajar `max_new_tokens`, o acortar la referencia."))
        elif cps > CHARS_POR_SEG_MAX:
            flag("BLOQUEANTE", "posible_truncado",
                 f"{cps:.1f} caracteres/segundo — demasiado rápido.",
                 ("Probablemente se truncó y no dijo todo el texto. Subir "
                  "`max_new_tokens` o trocear el texto."))

    if r["silencio_inicio_s"] > MAX_SILENCIO_BORDE:
        flag("AVISO", "silencio_inicial",
             f"{r['silencio_inicio_s']}s de silencio al empezar.",
             "Recortar con ffmpeg si el audio se va a usar tal cual.")
    if r["silencio_final_s"] > MAX_SILENCIO_BORDE:
        flag("AVISO", "silencio_final",
             f"{r['silencio_final_s']}s de silencio al terminar.",
             "Recortar con ffmpeg.")

    r["bloqueantes"] = sum(1 for p in r["problemas"] if p["nivel"] == "BLOQUEANTE")
    return r


def detectar_outliers(resultados: list[dict]) -> None:
    """Con varios audios del MISMO texto, el desvío contra la mediana es la
    señal más fiable del bug de loop — más que cualquier umbral absoluto."""
    if len(resultados) < 3:
        return
    durs = np.array([r["duracion_s"] for r in resultados])
    med = float(np.median(durs))
    for r in resultados:
        desvio = r["duracion_s"] / med - 1
        r["desvio_vs_mediana"] = f"{100 * desvio:+.0f}%"
        if abs(desvio) > 0.25:
            r["problemas"].append({
                "nivel": "AVISO", "codigo": "outlier_de_duracion",
                "mensaje": (f"{100 * desvio:+.0f}% respecto a la mediana del "
                            f"grupo ({med:.2f}s)."),
                "accion": ("Sospechar de esta generación: es el síntoma del bug "
                           "de loop. Descartarla o regenerar con otra semilla."),
            })
            r["bloqueantes"] = sum(1 for p in r["problemas"]
                                   if p["nivel"] == "BLOQUEANTE")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("audios", nargs="+", help="Archivos de audio (admite comodines)")
    ap.add_argument("--texto", help="El texto que debía decir (habilita el "
                                    "chequeo de loop/truncado)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    rutas: list[str] = []
    for patron in a.audios:
        rutas.extend(sorted(glob.glob(patron)) or [patron])
    rutas = [r for r in rutas if os.path.exists(r)]
    if not rutas:
        print("No se encontró ningún archivo.", file=sys.stderr)
        return 1

    resultados = [analizar(r, a.texto) for r in rutas]
    detectar_outliers(resultados)

    if a.json:
        print(json.dumps(resultados, ensure_ascii=False, indent=1))
        return 1 if any(r["bloqueantes"] for r in resultados) else 0

    print(f"{'archivo':<38} {'dur':>7} {'RMS':>7} {'c/s':>6}  estado")
    print("-" * 78)
    for r in resultados:
        cps = r.get("caracteres_por_segundo", "")
        estado = "OK" if not r["problemas"] else (
            f"{r['bloqueantes']} bloq" if r["bloqueantes"]
            else f"{len(r['problemas'])} aviso")
        print(f"{r['archivo']:<38} {r['duracion_s']:6.2f}s {r['rms']:7.4f} "
              f"{str(cps):>6}  {estado}")

    for r in resultados:
        if not r["problemas"]:
            continue
        print(f"\n{r['archivo']}:")
        for p in r["problemas"]:
            print(f"  {'[X]' if p['nivel'] == 'BLOQUEANTE' else '[!]'} "
                  f"{p['codigo']}: {p['mensaje']}")
            print(f"      -> {p['accion']}")

    print("\nRecordatorio: esto NO juzga calidad ni detecta palabras mal dichas.")
    print("Antes de generar una tanda, que un humano escuche UNA muestra.")
    return 1 if any(r["bloqueantes"] for r in resultados) else 0


if __name__ == "__main__":
    sys.exit(main())

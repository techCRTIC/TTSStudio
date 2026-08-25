#!/usr/bin/env python3
"""Verifica y une los tramos de un guion largo trozado. Capa 3 (determinista).

POR QUÉ EXISTE
    Un guion largo se trocea en varios tramos (`tts_trocear_guion.py`, frontend
    de esta misma fase) porque el modelo tiene un techo de caracteres por
    pasada (ver `tts_revisar_texto.py`, `MAX_CARACTERES`). Cada tramo se genera
    por separado y luego hay que:

    1. COMPROBAR que el tramo no cayó en el bug de loop conocido del modelo:
       a veces el audio sale mucho más largo de lo que el texto justifica
       (se repite en vez de parar), y con menos frecuencia sale sospechosamente
       corto (se corta antes de terminar). Ninguno de los dos falla el grafo
       de ComfyUI ni lanza una excepción — el archivo se genera igual, y solo
       se nota escuchándolo. Igual que en `tts_revisar_texto.py`: la señal es
       silenciosa, así que hay que convertirla en un chequeo que no se pueda
       saltar por descuido.
    2. UNIR los tramos verificados en una sola pieza, con una pausa que marque
       dónde estaba la frontera (frase o párrafo) para que la locución no
       suene pegada.

REGLA DE RUTAS — enmienda aprobada a ADR-004
    Este script es un TRANSFORMADOR PURO de las rutas absolutas que recibe.
    Nunca construye, adivina ni deriva su propia ubicación de salida, y nunca
    escribe donde el llamador no le pasó explícitamente una ruta absoluta.
    Decidir qué directorios son legales es trabajo de exactamente un módulo en
    este proyecto — `web/src/lib/comfy-files.ts` (TypeScript, solo servidor) —
    y este script no reimplementa ni sortea esa lógica. Lo único que hace aquí
    es rechazar, con salida no cero, cualquier ruta que ni siquiera llegue a
    ser una ruta absoluta bien formada (ver `_validar_ruta_absoluta`).

USO
    Verificar un tramo contra el bug de loop:
        python tts_unir_tramos.py --verificar \
            --audio "C:\\ruta\\absoluta\\tramo_01.flac" --caracteres 340

    Unir una lista ORDENADA de tramos ya verificados:
        python tts_unir_tramos.py --unir \
            --segmentos "[{\"path\": \"C:\\...\\01.flac\", \"frontera\": \"sentence\"}, ...]" \
            --salida "C:\\ruta\\absoluta\\guion_completo.flac"

    `frontera` usa el mismo vocabulario que saca `tts_trocear_guion.py`:
    "sentence" o "paragraph". Describe la frontera que sigue A ESE tramo, así
    que la del último tramo de la lista no se usa (no hay pausa después de él).

SALIDA
    Un objeto JSON por invocación, en stdout. Código 0 en éxito; no cero con
    un mensaje claro en stderr ante cualquier fallo (ruta inválida, archivo
    inexistente, frecuencias de muestreo distintas entre tramos, etc.).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from _console import use_utf8

# ---------------------------------------------------------------------------
# Verificación contra el bug de loop
# ---------------------------------------------------------------------------

# Por debajo de esta cantidad de caracteres, la banda de caracteres-por-segundo
# no es fiable: los tramos muy cortos, las cifras sueltas y las siglas caen
# fuera de la banda medida por su propia naturaleza (una sigla se locuta
# despacio, un número corto puede leerse en una fracción de segundo), no por
# ningún bug. Cada falso positivo aquí le cuesta al llamador una regeneración
# completa y cara del tramo.
#
# ⚠️ SIN CALIBRAR. Este valor es una estimación de partida, NO una medición,
# y está deliberadamente marcado como tal en vez de presentarse como asentado.
# Este mismo proyecto ya publicó una vez un supuesto de 12 Hz que la medición
# real corrigió a 12,56 Hz (ver ADR-006, `TOKENS_PER_SECOND`); este número
# necesita la misma sesión de medición antes de tratarse como definitivo.
MIN_CHARS_PARA_VEREDICTO = 20

# Bug de loop conocido del modelo (investigación comfy-mcp): el audio sale
# mucho más largo de lo que el texto justifica porque se repite en vez de
# parar. Por debajo de este umbral de caracteres/segundo, se marca 'loop'.
UMBRAL_LOOP_CHARS_POR_SEGUNDO = 8.0

# Por encima de este umbral, el audio es sospechosamente CORTO para el texto
# que debía decir — probablemente se cortó antes de terminar. Se marca 'cut'.
UMBRAL_CUT_CHARS_POR_SEGUNDO = 22.0


class RutaInvalidaError(Exception):
    """Una ruta no llegó siquiera a ser una ruta absoluta bien formada."""


class FrecuenciasDistintasError(Exception):
    """Dos tramos a unir no comparten frecuencia de muestreo."""


def _validar_ruta_absoluta(ruta: str, etiqueta: str) -> Path:
    """Rechaza cualquier cosa que no sea una ruta absoluta bien formada.

    Esto NO es la lista blanca de directorios legales — esa lógica vive en
    `web/src/lib/comfy-files.ts` y solo ahí. Esto es la comprobación mínima
    que le corresponde a un transformador puro: negarse a tocar el disco con
    una ruta relativa, con un byte nulo, o con un segmento '..' de recorrido
    de directorios, ANTES de que soundfile llegue a intentarlo.
    """
    if not ruta or "\0" in ruta:
        raise RutaInvalidaError(f"{etiqueta}: ruta vacía o con byte nulo: {ruta!r}")
    p = Path(ruta)
    if not p.is_absolute():
        raise RutaInvalidaError(
            f"{etiqueta}: se esperaba una ruta absoluta y llegó una relativa: {ruta!r}"
        )
    if ".." in p.parts:
        raise RutaInvalidaError(
            f"{etiqueta}: la ruta contiene un segmento '..' de recorrido: {ruta!r}"
        )
    return p


def verificar(ruta_audio: str, caracteres: int) -> dict:
    """Clasifica un tramo de audio frente al bug de loop / corte del modelo.

    Lee solo la CABECERA del archivo (`sf.info`, sin decodificar el audio
    completo) para obtener el número de muestras y la frecuencia, y calcula
    caracteres por segundo contra el texto que produjo ese audio.
    """
    if caracteres < 0:
        raise ValueError(f"caracteres no puede ser negativo: {caracteres}")

    ruta = _validar_ruta_absoluta(ruta_audio, "audio")
    if not ruta.is_file():
        raise FileNotFoundError(f"No existe el archivo de audio: {ruta}")

    info = sf.info(str(ruta))
    if info.samplerate <= 0:
        raise ValueError(f"Frecuencia de muestreo inválida en {ruta}: {info.samplerate}")

    segundos = info.frames / info.samplerate
    chars_por_segundo = (caracteres / segundos) if segundos > 0 else 0.0

    if caracteres < MIN_CHARS_PARA_VEREDICTO:
        veredicto = "sin_veredicto"
    elif chars_por_segundo < UMBRAL_LOOP_CHARS_POR_SEGUNDO:
        veredicto = "loop"
    elif chars_por_segundo > UMBRAL_CUT_CHARS_POR_SEGUNDO:
        veredicto = "cut"
    else:
        veredicto = "ok"

    return {
        "chars": caracteres,
        "seconds": round(segundos, 6),
        "chars_per_second": round(chars_por_segundo, 6),
        "verdict": veredicto,
    }


# ---------------------------------------------------------------------------
# Unión de tramos
# ---------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Nivelado entre tramos (2026-08-24)
#
# POR QUÉ: el motor no tiene objetivo de sonoridad. Cada tramo se genera por
# separado y sale con el nivel que le toque, así que una pieza unida de varios
# tramos sube y baja de volumen de tramo en tramo. Reportado escuchando una
# corrida de 28 tramos: "muy consistente el tono, no así el volumen".
#
# CÓMO: se mide el RMS de cada tramo SOLO sobre sus muestras activas (las que
# pasan un umbral relativo a su propio pico), porque un tramo con mucho
# silencio tiene un RMS global bajo que no describe lo fuerte que se le oye.
# Todos se llevan a la MEDIANA de esos RMS —mediana y no media, para que un
# tramo defectuoso no arrastre a los demás— y la ganancia se limita a ±6 dB
# para que un tramo roto no se amplifique hasta el ruido.
#
# NO ES un normalizador de sonoridad perceptual (eso sería LUFS/ITU-R BS.1770
# y necesitaría otra dependencia). El RMS activo es una aproximación que
# resuelve el caso real —tramos de la misma voz diciendo prosa— y no pretende
# más.
UMBRAL_ACTIVIDAD = 0.05   # fracción del pico del tramo: por debajo es silencio
# ±12 dB. Empezó en 2.0 (±6 dB) y el primer test lo encontró corto: un tramo a
# la quinta parte del nivel de sus vecinos se quedaba a medio corregir, que es
# justo el caso que hay que resolver. Por encima de ±12 dB entre tramos de la
# MISMA voz diciendo prosa, lo que hay no es un tramo bajo sino un tramo roto,
# y amplificarlo solo sube su ruido.
# ⚠️ NO ESTÁ MEDIDO cuánto varía de verdad el nivel entre tramos de este motor.
# Es un tope defendible, no un número observado — igual que MAX_CHARS en
# tts_trocear_guion.py y MIN_CHARS_PARA_VEREDICTO más arriba.
GANANCIA_MAXIMA = 4.0
TECHO_DE_PICO = 0.99      # tras nivelar, nada puede pasar de aquí


def _rms_activo(audio: np.ndarray) -> float:
    """RMS de las muestras que llevan señal. 0.0 si el tramo es todo silencio."""
    pico = float(np.max(np.abs(audio))) if audio.size else 0.0
    if pico <= 0.0:
        return 0.0
    activas = audio[np.abs(audio) > pico * UMBRAL_ACTIVIDAD]
    if activas.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(activas))))


def nivelar(trozos: list[np.ndarray]) -> tuple[list[np.ndarray], list[float]]:
    """Lleva cada tramo a la sonoridad mediana del conjunto.

    Devuelve `(trozos_nivelados, ganancias)`. Las ganancias se devuelven para
    que quien llame pueda registrarlas: una ganancia pegada al tope es la
    señal de que un tramo salió realmente mal, no solo bajo.

    Con un solo tramo no hay nada que nivelar y se devuelve tal cual: no hay
    referencia contra la que comparar, e inventarse una sería cambiar el
    volumen de una toma normal sin que nadie lo haya pedido.
    """
    if len(trozos) < 2:
        return trozos, [1.0] * len(trozos)

    niveles = [_rms_activo(t) for t in trozos]
    con_senal = [n for n in niveles if n > 0.0]
    if not con_senal:
        return trozos, [1.0] * len(trozos)

    objetivo = float(np.median(con_senal))
    nivelados: list[np.ndarray] = []
    ganancias: list[float] = []
    for trozo, nivel in zip(trozos, niveles):
        if nivel <= 0.0:
            ganancia = 1.0
        else:
            ganancia = min(max(objetivo / nivel, 1.0 / GANANCIA_MAXIMA), GANANCIA_MAXIMA)
        ganancias.append(ganancia)
        nivelados.append(trozo if ganancia == 1.0 else trozo * ganancia)

    # Techo de pico sobre el conjunto: si nivelar sacó algo por encima del
    # techo, baja TODO por igual. Bajar solo el tramo que se pasó volvería a
    # desnivelar justo lo que se acaba de nivelar.
    pico = max((float(np.max(np.abs(t))) for t in nivelados if t.size), default=0.0)
    if pico > TECHO_DE_PICO:
        recorte = TECHO_DE_PICO / pico
        nivelados = [t * recorte for t in nivelados]
        ganancias = [g * recorte for g in ganancias]

    return nivelados, ganancias


# Mismo vocabulario de frontera que saca `tts_trocear_guion.py`. La pausa se
# inserta DESPUÉS del tramo que tiene esa frontera, antes del siguiente.
SILENCIO_TRAS_FRONTERA = {
    "sentence": 0.28,
    "paragraph": 0.65,
}


def unir(segmentos: list[dict], ruta_salida: str, nivelar_volumen: bool = True) -> dict:
    """Concatena una lista ORDENADA de tramos en un solo archivo de audio.

    Cada elemento de `segmentos` es un dict con `path` (ruta absoluta del
    tramo) y `frontera` ("sentence" o "paragraph"): la frontera que sigue A
    ESE tramo. La frontera del último tramo no se usa, porque no hay pausa
    después de él.

    La frecuencia de muestreo del PRIMER tramo manda: se usa para las pausas
    de silencio y para el archivo de salida. Si cualquier tramo posterior
    trae una frecuencia distinta, se aborta — nunca se asume 24000 Hz ni
    ningún otro valor fijo, porque eso sería una creencia sobre lo que escribe
    el nodo SaveAudio de ComfyUI, no una medición, y equivocarse produce una
    voz acelerada o ralentizada sin que ningún test lo detecte.
    """
    if not segmentos:
        raise ValueError("La lista de tramos está vacía; no hay nada que unir.")

    ruta_salida_validada = _validar_ruta_absoluta(ruta_salida, "salida")

    rutas: list[Path] = []
    fronteras: list[str] = []
    for i, seg in enumerate(segmentos):
        ruta_str = seg.get("path")
        frontera = seg.get("frontera")
        if not ruta_str:
            raise ValueError(f"Tramo {i}: falta 'path'.")
        if frontera not in SILENCIO_TRAS_FRONTERA:
            raise ValueError(
                f"Tramo {i}: frontera {frontera!r} desconocida. "
                f"Debe ser una de {sorted(SILENCIO_TRAS_FRONTERA)}."
            )
        ruta = _validar_ruta_absoluta(ruta_str, f"tramo {i}")
        if not ruta.is_file():
            raise FileNotFoundError(f"Tramo {i}: no existe el archivo: {ruta}")
        rutas.append(ruta)
        fronteras.append(frontera)

    # Se leen TODOS los tramos antes de intercalar las pausas, porque nivelar
    # necesita ver el conjunto: el objetivo es la mediana de todos, y eso no
    # se puede calcular tramo a tramo sobre la marcha.
    audios: list[np.ndarray] = []
    frecuencia: int | None = None
    canales = 1
    for i, ruta in enumerate(rutas):
        datos, frecuencia_i = sf.read(str(ruta), dtype="float32", always_2d=True)
        if frecuencia is None:
            frecuencia = frecuencia_i
            canales = datos.shape[1]
        elif frecuencia_i != frecuencia:
            raise FrecuenciasDistintasError(
                f"El tramo {i} ({ruta}) tiene frecuencia de muestreo "
                f"{frecuencia_i} Hz, distinta de los {frecuencia} Hz del primer "
                f"tramo ({rutas[0]}). No se puede unir sin acelerar o "
                "ralentizar el audio."
            )
        audios.append(datos)

    if nivelar_volumen:
        audios, ganancias = nivelar(audios)
    else:
        ganancias = [1.0] * len(audios)

    trozos: list[np.ndarray] = [audios[0]]
    for i in range(1, len(audios)):
        # La pausa se inserta según la frontera del tramo ANTERIOR (i - 1),
        # que es la frontera que separa ese tramo del actual.
        pausa_segundos = SILENCIO_TRAS_FRONTERA[fronteras[i - 1]]
        n_muestras_pausa = round(pausa_segundos * frecuencia)
        trozos.append(np.zeros((n_muestras_pausa, canales), dtype="float32"))
        trozos.append(audios[i])

    audio_unido = np.concatenate(trozos, axis=0)
    sf.write(str(ruta_salida_validada), audio_unido, frecuencia)

    duracion = audio_unido.shape[0] / frecuencia
    return {
        "output": str(ruta_salida_validada),
        "seconds": round(duracion, 6),
        "samplerate": frecuencia,
        "segments_joined": len(rutas),
        "leveled": bool(nivelar_volumen),
        # Una ganancia pegada al tope (ver GANANCIA_MAXIMA) señala un tramo que
        # salió realmente mal, no solo bajo. Se devuelve para que se pueda ver.
        "gains": [round(g, 4) for g in ganancias],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    use_utf8()

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument(
        "--verificar", action="store_true",
        help="Clasifica un tramo contra el bug de loop/corte del modelo.",
    )
    modo.add_argument(
        "--unir", action="store_true",
        help="Concatena una lista ordenada de tramos en un solo archivo.",
    )
    ap.add_argument("--audio", help="[--verificar] Ruta absoluta del tramo de audio.")
    ap.add_argument(
        "--caracteres", type=int,
        help="[--verificar] Caracteres del texto que produjo ese audio.",
    )
    ap.add_argument(
        "--segmentos",
        help='[--unir] JSON: lista de {"path": "...", "frontera": "sentence"|"paragraph"}.',
    )
    ap.add_argument("--salida", help="[--unir] Ruta absoluta del archivo unido de salida.")
    ap.add_argument(
        "--sin-nivelar", action="store_true",
        help="[--unir] No igualar el volumen entre tramos. Por defecto SI se "
             "iguala: el motor no tiene objetivo de sonoridad y cada tramo sale "
             "con el nivel que le toca. Esta bandera existe para poder comparar "
             "una pieza nivelada contra la cruda.",
    )
    a = ap.parse_args()

    try:
        if a.verificar:
            if not a.audio or a.caracteres is None:
                raise ValueError("--verificar requiere --audio y --caracteres.")
            resultado = verificar(a.audio, a.caracteres)
        else:
            if not a.segmentos or not a.salida:
                raise ValueError("--unir requiere --segmentos y --salida.")
            try:
                segmentos = json.loads(a.segmentos)
            except json.JSONDecodeError as cause:
                raise ValueError(f"--segmentos no es JSON válido: {cause}") from cause
            if not isinstance(segmentos, list):
                raise ValueError("--segmentos debe ser una lista JSON de objetos.")
            resultado = unir(segmentos, a.salida, nivelar_volumen=not a.sin_nivelar)
    except (
        RutaInvalidaError,
        FrecuenciasDistintasError,
        ValueError,
        FileNotFoundError,
        OSError,
        RuntimeError,  # incluye soundfile.LibsndfileError
    ) as cause:
        print(f"ERROR: {cause}", file=sys.stderr)
        return 1

    print(json.dumps(resultado, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

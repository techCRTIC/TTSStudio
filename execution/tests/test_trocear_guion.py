"""Tests para tts_trocear_guion.py: el troceo determinista de guiones largos.

Cubre el contrato que consume el frontend (secuenciador de tramos, fuera de
este alcance): tope duro de MAX_CHARS, nunca cortar a mitad de frase, marcar
correctamente frontera de frase vs. frontera de párrafo, terminar siempre
(incluso sin puntuación ni comas) y reconstruir el original salvo espacios.
"""
from __future__ import annotations

import re

import tts_trocear_guion as tg

# Cierre de oración reconocido por el propio módulo bajo prueba (incluye las
# comillas/paréntesis de cierre que puedan seguir al signo de puntuación).
_CIERRA_ORACION = re.compile(r"""[.!?…]['"”’)»）]*$""")


def _normalizar_espacios(texto: str) -> str:
    """Colapsa cualquier corrida de espacio en blanco a uno solo y recorta bordes.

    Usado para comparar "reproduce el original salvo espacios de borde": el
    troceo normaliza saltos de línea y espacios repetidos dentro de cada
    párrafo (igual que el original portado), así que la comparación debe
    ignorar esas diferencias de formato, no el contenido.
    """
    return re.sub(r"\s+", " ", texto).strip()


def _reconstruir(segmentos: list[dict]) -> str:
    return " ".join(s["text"] for s in segmentos)


# --------------------------------------------------------------------------
# Guion de varios párrafos, uno de ellos lo bastante largo para partirse en
# más de un tramo dentro del mismo párrafo.
# --------------------------------------------------------------------------

def _parrafo_largo(n_frases: int) -> str:
    frases = [
        f"Esta es la frase numero {i} de un parrafo bastante largo que "
        "iremos acumulando hasta forzar el corte en varios tramos."
        for i in range(n_frases)
    ]
    return " ".join(frases)


def test_guion_multiparrafo_respeta_tope_y_cierra_oracion():
    parrafo1 = _parrafo_largo(12)  # deliberadamente > 600 caracteres
    parrafo2 = "Este es el segundo parrafo, con su propia frase que cierra con punto."
    parrafo3 = (
        "Tercer parrafo. Tiene dos frases cortas. Y ahora una tercera un "
        "poco mas extensa para variar el ritmo de cierre."
    )
    guion = f"{parrafo1}\n\n{parrafo2}\n\n{parrafo3}"
    assert len(parrafo1) > tg.MAX_CHARS  # confirma que el test ejercita el corte

    salida = tg.segmentar(guion)
    segmentos = salida["segments"]

    assert len(segmentos) > 3, "el parrafo largo debe partirse en mas de un tramo"

    # Ningun tramo pasa el tope.
    for s in segmentos:
        assert s["chars"] <= tg.MAX_CHARS
        assert s["chars"] == len(s["text"])

    # Todo tramo cierra oracion (no hay frases gigantes ni comas en este texto).
    for s in segmentos:
        assert _CIERRA_ORACION.search(s["text"]), s["text"]

    # index es 0..N-1 en orden.
    assert [s["index"] for s in segmentos] == list(range(len(segmentos)))

    # total_chars es la suma real.
    assert salida["total_chars"] == sum(s["chars"] for s in segmentos)

    # Round-trip: concatenar (con un espacio) reproduce el original salvo
    # diferencias de espacio en blanco (saltos de linea entre parrafos
    # colapsados a un espacio, corridas de espacios normalizadas).
    assert _normalizar_espacios(_reconstruir(segmentos)) == _normalizar_espacios(guion)


def test_fronteras_de_parrafo_caen_donde_deben():
    parrafo1 = _parrafo_largo(12)
    parrafo2 = "Este es el segundo parrafo, con su propia frase que cierra con punto."
    parrafo3 = (
        "Tercer parrafo. Tiene dos frases cortas. Y ahora una tercera un "
        "poco mas extensa para variar el ritmo de cierre."
    )
    guion = f"{parrafo1}\n\n{parrafo2}\n\n{parrafo3}"

    segmentos = tg.segmentar(guion)["segments"]

    # El parrafo largo se trocea en varios segmentos: todos menos el ULTIMO
    # de ese parrafo terminan a mitad de parrafo (boundary "sentence"); el
    # ultimo tramo que pertenece a ese parrafo cierra el parrafo.
    # Encontramos ese corte por reconstruccion progresiva: el primer indice
    # cuyo texto acumulado ya no es un prefijo (normalizado) del parrafo largo
    # es el primero del segundo parrafo.
    acumulado = ""
    fin_parrafo1 = None
    for s in segmentos:
        candidato = _normalizar_espacios(f"{acumulado} {s['text']}")
        if not _normalizar_espacios(parrafo1).startswith(candidato):
            fin_parrafo1 = s["index"] - 1
            break
        acumulado = candidato

    assert fin_parrafo1 is not None and fin_parrafo1 >= 0

    # Todos los tramos del primer parrafo antes del ultimo son "sentence".
    for s in segmentos[:fin_parrafo1]:
        assert s["boundary"] == "sentence"
    # El ultimo tramo del primer parrafo cierra parrafo.
    assert segmentos[fin_parrafo1]["boundary"] == "paragraph"

    # El segundo parrafo es corto: entra entero en un solo tramo -> paragraph.
    seg_parrafo2 = segmentos[fin_parrafo1 + 1]
    assert seg_parrafo2["boundary"] == "paragraph"
    assert "segundo parrafo" in seg_parrafo2["text"]

    # El ultimo tramo del documento tambien cierra parrafo (verdad
    # estructural real, ver PROCEDENCIA en el modulo bajo prueba: a
    # diferencia del original portado, aqui NO se apaga la marca del ultimo
    # tramo).
    assert segmentos[-1]["boundary"] == "paragraph"


# --------------------------------------------------------------------------
# Frase unica gigantesca sin puntuacion de cierre ni comas: debe terminar
# igual, sin loop infinito, respetando el tope duro.
# --------------------------------------------------------------------------

def test_frase_gigante_sin_puntuacion_termina_y_respeta_tope():
    # 1500 caracteres de una sola "palabra-frase" sin punto, sin coma, sin
    # espacio siquiera: el peor caso para el fallback por comas.
    texto = "a" * 1500

    salida = tg.segmentar(texto)
    segmentos = salida["segments"]

    assert len(segmentos) > 1
    for s in segmentos:
        assert s["chars"] <= tg.MAX_CHARS
        assert s["chars"] > 0

    # Se reconstruye exactamente (sin espacios que colapsar: es una sola
    # corrida de caracteres, no hay palabras).
    assert "".join(s["text"] for s in segmentos) == texto
    assert salida["total_chars"] == len(texto)


def test_frase_gigante_con_comas_pero_sin_punto_final():
    # Una frase que nunca cierra con . ! ? … pero sí tiene comas: debe
    # aprovechar el fallback por comas antes de recurrir al corte duro.
    partes = [f"elemento numero {i}" for i in range(60)]
    texto = ", ".join(partes)
    assert len(texto) > tg.MAX_CHARS

    salida = tg.segmentar(texto)
    segmentos = salida["segments"]

    assert len(segmentos) > 1
    for s in segmentos:
        assert s["chars"] <= tg.MAX_CHARS

    assert _normalizar_espacios(_reconstruir(segmentos)) == _normalizar_espacios(texto)


# --------------------------------------------------------------------------
# Caso limite: texto de exactamente MAX_CHARS caracteres.
# --------------------------------------------------------------------------

def test_texto_de_exactamente_max_chars_no_se_parte():
    relleno = "x" * (tg.MAX_CHARS - 1)  # -1 por el punto final
    texto = relleno + "."
    assert len(texto) == tg.MAX_CHARS

    salida = tg.segmentar(texto)
    segmentos = salida["segments"]

    assert len(segmentos) == 1
    assert segmentos[0]["chars"] == tg.MAX_CHARS
    assert segmentos[0]["text"] == texto
    assert segmentos[0]["boundary"] == "paragraph"  # unico parrafo, unico tramo
    assert salida["total_chars"] == tg.MAX_CHARS


def test_texto_de_max_chars_mas_uno_se_parte_en_dos():
    # Un caracter por encima del tope, con dos frases para que exista una
    # frontera valida donde cortar.
    relleno1 = "x" * (tg.MAX_CHARS - 1)
    texto = f"{relleno1}. y."
    assert len(texto) == tg.MAX_CHARS + 3

    salida = tg.segmentar(texto)
    segmentos = salida["segments"]

    assert len(segmentos) == 2
    for s in segmentos:
        assert s["chars"] <= tg.MAX_CHARS


# --------------------------------------------------------------------------
# Caso trivial: texto vacio.
# --------------------------------------------------------------------------

def test_texto_vacio_produce_cero_tramos():
    salida = tg.segmentar("")
    assert salida == {"segments": [], "total_chars": 0}

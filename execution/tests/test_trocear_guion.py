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

# NOTA: los tamanos de abajo se DERIVAN de tg.MAX_CHARS, nunca se escriben a
# mano. El umbral paso de 600 a 1600 el 2026-08-24 y tres de estos fixtures
# se quedaron por debajo del nuevo tope: dejaron de ser textos largos y sus
# tests se pusieron en rojo, que es exactamente lo que debia pasar. Lo que se
# arregla aqui no es el fallo sino su causa: un tamano escrito a mano deja de
# describir lo que el test dice ejercitar en cuanto el numero cambia.
# Derivados, siguen al umbral solos.
def _parrafo_largo(n_frases: int) -> str:
    frases = [
        f"Esta es la frase numero {i} de un parrafo bastante largo que "
        "iremos acumulando hasta forzar el corte en varios tramos."
        for i in range(n_frases)
    ]
    return " ".join(frases)


def test_guion_multiparrafo_respeta_tope_y_cierra_oracion():
    # Cada frase ronda los 115 caracteres; se piden las suficientes para pasar
    # el tope con holgura, sea cual sea el tope.
    parrafo1 = _parrafo_largo(tg.MAX_CHARS // 115 + 4)
    parrafo2 = "Este es el segundo parrafo, con su propia frase que cierra con punto."
    parrafo3 = (
        "Tercer parrafo. Tiene dos frases cortas. Y ahora una tercera un "
        "poco mas extensa para variar el ritmo de cierre."
    )
    guion = f"{parrafo1}\n\n{parrafo2}\n\n{parrafo3}"
    assert len(parrafo1) > tg.MAX_CHARS  # confirma que el test ejercita el corte

    salida = tg.segmentar(guion)
    segmentos = salida["segments"]

    # Se parte, porque parrafo1 solo ya pasa el tope. La cota era ">3" cuando
    # cada parrafo cerraba tramo por construccion; desde que un tramo puede
    # ABSORBER parrafos enteros (ver el docstring de tg.trocear) ese numero
    # describia el defecto, no el contrato. Lo que sigue siendo cierto es que
    # un texto por encima del tope no cabe en un tramo.
    assert len(segmentos) > 1, "un guion por encima del tope debe partirse"

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
    # parrafo1 pasa el tope EL SOLO, que es la unica forma de garantizar un
    # corte a mitad de parrafo ahora que los tramos absorben parrafos cortos.
    parrafo1 = _parrafo_largo(tg.MAX_CHARS // 115 + 4)
    parrafo2 = "Este es el segundo parrafo, con su propia frase que cierra con punto."
    guion = f"{parrafo1}\n\n{parrafo2}"
    assert len(parrafo1) > tg.MAX_CHARS

    segmentos = tg.segmentar(guion)["segments"]
    assert len(segmentos) > 1

    # El primer tramo se corta a mitad del parrafo largo: no hay frontera de
    # parrafo donde termina, asi que la pausa que le sigue es la corta.
    assert segmentos[0]["boundary"] == "sentence"
    assert _normalizar_espacios(parrafo1).startswith(_normalizar_espacios(segmentos[0]["text"]))

    # El ultimo tramo del documento cierra parrafo (verdad estructural real,
    # ver PROCEDENCIA en el modulo bajo prueba: a diferencia del original
    # portado, aqui NO se apaga la marca del ultimo tramo).
    assert segmentos[-1]["boundary"] == "paragraph"

    # La frontera es una propiedad del FINAL del tramo, no de su contenido: un
    # tramo que absorbio el corte entre parrafo1 y parrafo2 y termina donde
    # terminaba parrafo2 se marca "paragraph" aunque contenga dos parrafos.
    ultimo = segmentos[-1]["text"]
    assert ultimo.endswith(parrafo2) or parrafo2 in ultimo


# --------------------------------------------------------------------------
# REGRESION (2026-08-24): el formato en parrafos no debe cambiar el troceo.
#
# Hasta esta fecha el bucle exterior recorria parrafos y cerraba un tramo al
# final de CADA uno, asi que MAX_CHARS no actuaba entre parrafos. Medido con
# el texto real de un usuario: un guion que cabia en dos pasadas salio en
# VEINTIOCHO tramos, uno por parrafo. El disparador habitual es el boton de
# reescritura de la app, que reformatea el guion en parrafos cortos.
#
# El invariante que lo cierra: el MISMO contenido troceado igual, venga en un
# parrafo o en veinte.
# --------------------------------------------------------------------------

def test_el_formato_en_parrafos_no_cambia_el_numero_de_tramos():
    frases = [
        f"Esta es la frase numero {i} y tiene una longitud corriente."
        for i in range(12)
    ]
    un_parrafo = " ".join(frases)
    muchos_parrafos = "\n\n".join(frases)

    assert len(un_parrafo) < tg.MAX_CHARS, "el fixture debe caber entero en un tramo"

    tramos_juntos = tg.segmentar(un_parrafo)["segments"]
    tramos_sueltos = tg.segmentar(muchos_parrafos)["segments"]

    assert len(tramos_juntos) == 1, "un texto bajo el tope es UN tramo"
    assert len(tramos_sueltos) == len(tramos_juntos), (
        f"el mismo texto en parrafos cortos salio en {len(tramos_sueltos)} tramos "
        f"en vez de {len(tramos_juntos)}: los parrafos vuelven a cerrar tramo"
    )
    assert _normalizar_espacios(_reconstruir(tramos_sueltos)) == _normalizar_espacios(
        _reconstruir(tramos_juntos)
    )


def test_parrafos_cortos_se_acumulan_hasta_el_tope():
    # Muchos parrafos diminutos: antes daban un tramo cada uno. Ahora se
    # empaquetan, y el numero de tramos lo decide el tope, no el formato.
    parrafo = "Una frase corta que ocupa poco."
    n = (tg.MAX_CHARS // len(parrafo)) + 10
    guion = "\n\n".join(parrafo for _ in range(n))

    segmentos = tg.segmentar(guion)["segments"]

    assert len(segmentos) < n, "los parrafos cortos deben empaquetarse"
    for s in segmentos:
        assert s["chars"] <= tg.MAX_CHARS
    # Todos menos el ultimo van bien llenos: si alguno quedara medio vacio
    # seria que algo sigue cerrando tramo antes de tiempo.
    for s in segmentos[:-1]:
        assert s["chars"] > tg.MAX_CHARS // 2, f"tramo a medio llenar: {s['chars']}"

# --------------------------------------------------------------------------
# Frase unica gigantesca sin puntuacion de cierre ni comas: debe terminar
# igual, sin loop infinito, respetando el tope duro.
# --------------------------------------------------------------------------

def test_frase_gigante_sin_puntuacion_termina_y_respeta_tope():
    # 1500 caracteres de una sola "palabra-frase" sin punto, sin coma, sin
    # espacio siquiera: el peor caso para el fallback por comas.
    texto = "a" * (tg.MAX_CHARS * 2 + 100)

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
    # ~20 caracteres por elemento; se piden los suficientes para pasar el tope.
    partes = [f"elemento numero {i}" for i in range(tg.MAX_CHARS // 20 + 20)]
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

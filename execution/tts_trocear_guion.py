#!/usr/bin/env python3
"""Trocea un guion largo en tramos que un TTS puede generar de una pasada. Capa 3.

El modelo tiene un techo de entrada muy por debajo de lo que mide cualquier
locución real (video, podcast, audiolibro), y además un bug conocido de loop
infinito que empeora con textos largos: trozos grandes son más caros de
regenerar cuando fallan. Este script hace SOLO el troceo — no genera audio,
no verifica el bug de loop, no une nada. Esa separación es deliberada: el
secuenciador que llama a la generación tramo a tramo, decide la pausa entre
tramos y reintenta los que fallan vive en el cliente (frontend), no aquí. Este
script es un transformador puro: texto adentro, tramos afuera.

Reglas de corte:
  1. NUNCA a mitad de frase. Un tramo solo termina tras un cierre de oración
     (. ! ? …), más las comillas o paréntesis de cierre que le sigan.
  2. Cada tramo recuerda si SU frontera cae al final de un párrafo del
     original (párrafos separados por línea en blanco) o solo al final de una
     frase dentro del mismo párrafo. Esa marca es la que el cliente usa para
     elegir la pausa larga (fin de párrafo) o la corta (fin de frase) al unir
     el audio de tramos consecutivos.
  3. Una frase única que por sí sola supera el tope se parte por comas, último
     recurso. Si ni siquiera hay comas, el script SIGUE partiendo por el tope
     duro de caracteres — nunca entra en loop, nunca deja un tramo sin cortar.

Uso:
    python tts_trocear_guion.py "el guion completo"
    python tts_trocear_guion.py --archivo guion.txt

Imprime EXACTAMENTE un objeto JSON por stdout:
    {"segments": [{"index": 0, "text": "...", "boundary": "sentence"|"paragraph",
                   "chars": 123}, ...],
     "total_chars": N}

Concatenar los `text` de todos los tramos (unidos con un solo espacio)
reproduce el original salvo espacios de más — el troceo normaliza saltos de
línea y espacios repetidos dentro de cada párrafo, igual que el original
portado (ver PROCEDENCIA).

Código de salida: 0 en éxito. No hay condición de error propia del troceo en
sí — un texto vacío produce `{"segments": [], "total_chars": 0}`.

PROCEDENCIA — no editar a ciegas
    La función `trocear()` de este script es un port de `trocear()` en
    `tts_narrar_largo.py`, skill `voz-local` (investigación `comfy-mcp`,
    2026-08-18/19), donde vive el original completo (que además genera,
    verifica el bug de loop y une audio — todo fuera de este alcance). El
    algoritmo de corte —split por párrafo, regex de cierre de frase, fallback
    por comas, tope duro de caracteres— se trae TAL CUAL, sin rediseñarlo.

    Tres diferencias conscientes y documentadas frente al original, ninguna
    toca la forma general del algoritmo de corte:
    1. El original apaga la marca de "fin de párrafo" del ÚLTIMO tramo del
       documento completo, porque esa marca solo la usaba para decidir si
       agregar silencio extra tras la última pieza de audio generada. Aquí no
       se genera audio: la marca describe una verdad estructural del texto
       (¿el tramo termina un párrafo o no?), así que se reporta sin apagar,
       para todos los tramos por igual.
    2. El conjunto de cierres reconocidos tras el signo de puntuación se
       amplió de solo `["'»）]` a incluir el paréntesis normal `)` y las
       comillas tipográficas `"'"` / `'"'`, porque el contrato de este script
       pide explícitamente reconocer "paréntesis de cierre" en general, no
       solo el de ancho completo del original.
    3. El fallback por comas del original puede, en el caso límite de una
       parte entre comas que POR SÍ SOLA ya supera el tope, terminar
       agregando un tramo más largo que `MAX_CHARS` (nunca entra en loop,
       pero tampoco respeta el tope duro). Ese caso es justo el que este
       contrato pide cubrir explícitamente ("si tampoco hay comas, el script
       debe terminar igualmente y respetar el tope duro"), así que se agregó
       un corte duro por caracteres para esa parte específica — el resto del
       fallback por comas es el mismo.
    Si cambian las reglas de troceo, cambian en los dos sitios o el proyecto
    y la skill se separan.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from _console import use_utf8

# Techo de caracteres por tramo. Bien por debajo del techo de entrada del
# modelo: los textos largos aumentan el riesgo del bug de loop infinito, y
# tramos chicos permiten reintentar barato si uno sale mal.
#
# NOMBRE LOAD-BEARING: web/src/lib/tts.ts declara SEGMENT_MAX_CHARS con el
# MISMO valor para que el cliente decida "esto es largo" contando caracteres
# sin invocar este script en el caso corto. Un verificador aparte
# (execution/check_*.py) lee este nombre por regex — no renombrar ni calcular
# dinámicamente.
# POR QUÉ 1600, Y POR QUÉ NO ES UNA MEDICIÓN (revisado el 2026-08-24)
# Este número era 600, heredado tal cual del script de la skill `voz-local`,
# donde el comentario decía «bien por debajo del techo de 2048». Probando
# contra el motor real se vio el coste: un texto de ~1700 caracteres —que CABE
# entero en una pasada— salía partido en tres, con dos costuras que no hacían
# falta.
#
# El razonamiento original era que un tramo con bucle saliera barato de
# rehacer. En esta app ese argumento pesa mucho menos: el bucle se detecta y se
# regenera SOLO, tramo a tramo (ver tts_unir_tramos.py --verificar). Y al otro
# lado hay riesgo de producto: cada corte es una costura, y el criterio de
# salida de la fase es que las costuras sean inaudibles. Con tramos más
# grandes, además, los cortes caen más veces en final de párrafo, que es donde
# una pausa larga suena natural de todos modos.
#
# 1600 deja un 22% de holgura bajo el techo de entrada de 2048.
#
# ⚠️ ES UNA APUESTA INFORMADA, NO UN NÚMERO MEDIDO. Nadie ha medido a partir de
# qué longitud aparece de verdad el bug de bucle; 600 y 2048 son los extremos
# conocidos y lo de en medio está sin explorar. Se dice aquí en lugar de dejar
# que el número parezca asentado, igual que MIN_CHARS_PARA_VEREDICTO en
# tts_unir_tramos.py.
MAX_CHARS = 1600

# Cierra una frase: el signo de puntuación de fin de oración, seguido
# opcionalmente de comillas o paréntesis de cierre y del espacio que separa
# de la frase siguiente. El resto del párrafo (sin cierre) se toma entero
# como última "frase" para no perder texto sin puntuación final.
_CIERRE_FRASE = re.compile(
    r"""[^.!?…]+[.!?…]+['"”’)»）]*\s*|[^.!?…]+$"""
)


def _unidades(texto: str) -> list[tuple[str, bool]]:
    """Aplana el texto a `(frase, cierra_parrafo)`, en orden de lectura.

    Separar esto de `trocear` es lo que permite que un tramo CRUCE una frontera
    de párrafo: mientras los párrafos eran el bucle exterior, cada uno cerraba
    su tramo por construcción y no había forma de juntar dos.
    """
    unidades: list[tuple[str, bool]] = []
    for parrafo in (p.strip() for p in re.split(r"\n\s*\n", texto)):
        if not parrafo:
            continue
        parrafo = re.sub(r"\s+", " ", parrafo)
        frases = [f.strip() for f in _CIERRE_FRASE.findall(parrafo) if f.strip()]
        for i, frase in enumerate(frases):
            unidades.append((frase, i == len(frases) - 1))
    return unidades


def trocear(texto: str, maximo: int = MAX_CHARS) -> list[dict]:
    """Divide en tramos que respetan frases y recuerdan dónde iba un párrafo.

    Devuelve una lista de dicts `{"texto": str, "fin_parrafo": bool}`, en el
    mismo vocabulario que el original portado. `main()` los traduce al
    contrato JSON de salida (`index`/`text`/`boundary`/`chars`).

    UN TRAMO PUEDE CONTENER VARIOS PÁRRAFOS (corregido el 2026-08-24)
        Hasta esta fecha el bucle exterior recorría párrafos y cerraba un tramo
        al final de CADA uno, así que `maximo` solo actuaba DENTRO de un
        párrafo y no actuaba en absoluto entre ellos. Consecuencia medida con
        el texto real de un usuario: un guion que cabía en dos pasadas salió
        partido en VEINTIOCHO, uno por párrafo, de ~100 caracteres cada uno.

        Eso no era un coste cosmético. Cada corte es una costura donde el
        timbre puede saltar; y tramos de ~100 caracteres caen justo en el
        rango donde el veredicto por duración de tts_unir_tramos.py es poco
        fiable (ver MIN_CHARS_PARA_VEREDICTO), así que además disparaba
        reintentos con OTRA semilla — que es precisamente lo que rompe la
        coherencia de la voz entre tramos.

        El disparador habitual es el botón de reescritura de la app, que
        reformatea el guion en párrafos cortos: una función de la app activaba
        el defecto de otra.

    QUÉ PASA CON LA PAUSA DE UN PÁRRAFO ABSORBIDO
        Se pierde como silencio insertado: el unificador solo pone pausa ENTRE
        tramos, así que dos párrafos dentro del mismo tramo los lee el modelo
        de corrido y la pausa la pone su propia prosodia. Decisión del usuario
        (2026-08-24), con el argumento de que una pausa generada respira mejor
        que un silencio pegado. La frontera que SÍ se registra es la del final
        del tramo, y sigue siendo "paragraph" cuando el tramo termina donde
        terminaba un párrafo.
    """
    tramos: list[dict] = []
    actual = ""
    # Si la última frase que entró en `actual` cerraba párrafo. Es lo que
    # decide la frontera del tramo cuando se cierre, sea cual sea el motivo.
    cierra_parrafo = False

    def volcar() -> None:
        nonlocal actual, cierra_parrafo
        if actual:
            tramos.append({"texto": actual.strip(), "fin_parrafo": cierra_parrafo})
            actual = ""
            cierra_parrafo = False

    for frase, fin_parrafo in _unidades(texto):
        if len(frase) > maximo:
            # Una sola frase gigantesca: se parte por comas, último recurso.
            volcar()
            partes, buf = re.split(r"(?<=,)\s+", frase), ""
            for parte in partes:
                if len(parte) > maximo:
                    # Ni siquiera hay comas que ayuden (o un tramo entre comas
                    # sigue pasándose): corte duro por caracteres. Nunca se
                    # deja de avanzar, así que nunca hay loop.
                    if buf:
                        tramos.append({"texto": buf.strip(), "fin_parrafo": False})
                        buf = ""
                    for i in range(0, len(parte), maximo):
                        trozo_duro = parte[i:i + maximo]
                        if len(trozo_duro) == maximo:
                            tramos.append({"texto": trozo_duro.strip(), "fin_parrafo": False})
                        else:
                            buf = trozo_duro
                    continue
                if len(buf) + len(parte) + 1 > maximo and buf:
                    tramos.append({"texto": buf.strip(), "fin_parrafo": False})
                    buf = parte
                else:
                    buf = f"{buf} {parte}".strip()
            # Lo que sobró de la frase gigante queda como acumulado, y hereda
            # su condición de fin de párrafo por si el tramo cierra aquí.
            actual = buf
            cierra_parrafo = fin_parrafo
        elif len(actual) + len(frase) + 1 > maximo and actual:
            volcar()
            actual = frase
            cierra_parrafo = fin_parrafo
        else:
            actual = f"{actual} {frase}".strip()
            cierra_parrafo = fin_parrafo

    volcar()
    return tramos


def _a_segmentos(tramos: list[dict]) -> list[dict]:
    """Traduce el vocabulario interno portado al contrato JSON de salida."""
    segmentos = []
    for i, t in enumerate(tramos):
        texto = t["texto"]
        segmentos.append({
            "index": i,
            "text": texto,
            "boundary": "paragraph" if t["fin_parrafo"] else "sentence",
            "chars": len(texto),
        })
    return segmentos


def segmentar(texto: str, maximo: int = MAX_CHARS) -> dict:
    """Contrato público de salida: trocea y devuelve el objeto JSON completo.

    `main()` solo lo serializa; los tests lo llaman directamente para no
    depender de subprocesos ni de detalles internos como `_a_segmentos`.
    """
    segmentos = _a_segmentos(trocear(texto, maximo))
    return {"segments": segmentos, "total_chars": sum(s["chars"] for s in segmentos)}


def main() -> int:
    use_utf8()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("texto", nargs="?", help="El guion a trocear")
    ap.add_argument("--archivo", help="Leer el guion de un archivo UTF-8")
    a = ap.parse_args()

    if a.archivo:
        with open(a.archivo, encoding="utf-8") as f:
            texto = f.read()
    elif a.texto:
        texto = a.texto
    else:
        texto = sys.stdin.read()

    salida = segmentar(texto)
    print(json.dumps(salida, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

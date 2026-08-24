#!/usr/bin/env python3
"""Convierte números, montos, fechas y horas a su forma HABLADA. Capa 3.

Los modelos de voz verbalizan mal los dígitos, y un modelo de voz clonada casi
nunca vio números en su referencia. En las pruebas de la investigación
`comfy-mcp` la frase con fechas y montos fue, con diferencia, la más débil de
todas — y el dataset de entrenamiento tenía 11 clips con números sobre 129.

Escribir "treinta y uno" en vez de "31" le saca al modelo la tarea de decidir
cómo se lee, que es donde falla.

Siglas: NO se adivinan. Se expanden solo las que estén en el diccionario
(`--siglas archivo.json`) y el resto se REPORTA para que decida un humano —
"CRTIC" puede ser "cé-erre-te-i-cé" o "crítica", y equivocarse suena peor que
preguntar.

Uso:
    python tts_normalizar_texto.py "El informe cierra el 31/12 a las 9:30."
    python tts_normalizar_texto.py --archivo guion.txt --salida guion_hablado.txt
    python tts_normalizar_texto.py --archivo g.txt --siglas mis_siglas.json

PROCEDENCIA — no editar a ciegas
    Copiado de la skill `voz-local` (investigación `comfy-mcp`, 2026-08-18/19),
    donde vive el original. Lo que codifica está MEDIDO al oído humano, no
    supuesto, y por eso se trae tal cual en vez de reescribirlo. Si cambian las
    reglas, cambian en los dos sitios o el proyecto y la skill se separan.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete",
            "ocho", "nueve", "diez", "once", "doce", "trece", "catorce",
            "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
            "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
            "veinticinco", "veintiséis", "veintisiete", "veintiocho",
            "veintinueve"]
DECENAS = {30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta",
           70: "setenta", 80: "ochenta", 90: "noventa"}
CENTENAS = {100: "cien", 200: "doscientos", 300: "trescientos",
            400: "cuatrocientos", 500: "quinientos", 600: "seiscientos",
            700: "setecientos", 800: "ochocientos", 900: "novecientos"}
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def en_palabras(n: int) -> str:
    """Cardinal en español. Cubre hasta miles de millones, que es de sobra."""
    if n < 0:
        return "menos " + en_palabras(-n)
    if n < 30:
        return UNIDADES[n]
    if n < 100:
        d, u = divmod(n, 10)
        base = DECENAS[d * 10]
        return base if u == 0 else f"{base} y {UNIDADES[u]}"
    if n < 1000:
        c, r = divmod(n, 100)
        if n == 100:
            return "cien"
        base = "ciento" if c == 1 else CENTENAS[c * 100]
        return base if r == 0 else f"{base} {en_palabras(r)}"
    if n < 1_000_000:
        m, r = divmod(n, 1000)
        base = "mil" if m == 1 else f"{en_palabras(m)} mil"
        return base if r == 0 else f"{base} {en_palabras(r)}"
    if n < 1_000_000_000:
        m, r = divmod(n, 1_000_000)
        base = "un millón" if m == 1 else f"{en_palabras(m)} millones"
        return base if r == 0 else f"{base} {en_palabras(r)}"
    m, r = divmod(n, 1_000_000_000)
    base = "mil millones" if m == 1 else f"{en_palabras(m)} mil millones"
    return base if r == 0 else f"{base} {en_palabras(r)}"


def _hora(h: int, m: int) -> str:
    """Solo la hora, SIN artículo: el artículo lo pone quien llama, para no
    duplicarlo cuando el texto ya trae 'a las'."""
    hh = en_palabras(h)
    if m == 0:
        return f"{hh} en punto"
    if m == 15:
        return f"{hh} y cuarto"
    if m == 30:
        return f"{hh} y media"
    if m == 45:
        sig = 1 if h == 12 else h + 1
        return f"{en_palabras(sig)} menos cuarto"
    return f"{hh} {en_palabras(m)}"


# Palabras tras las cuales "uno" NO se apocopa: son preposiciones o nexos, no
# sustantivos. "el treinta y uno DE diciembre" vs "treinta y un AÑOS".
NO_APOCOPAR_ANTES_DE = {
    "de", "del", "y", "o", "u", "a", "al", "en", "con", "por", "para", "que",
    "como", "desde", "hasta", "sin", "sobre", "entre",
}
# Terminaciones típicamente femeninas. La concordancia importa: "un persona"
# suena mal de inmediato, y es el tipo de error que arruina una locución.
FEM_SUFIJOS = ("ción", "ciones", "sión", "siones", "dad", "dades", "tad",
               "tades", "tud", "tudes", "umbre", "umbres")
# Sustantivos en -a que son masculinos (mayormente helenismos).
MASC_EN_A = {
    "día", "días", "mapa", "mapas", "problema", "problemas", "sistema",
    "sistemas", "tema", "temas", "idioma", "idiomas", "programa", "programas",
    "clima", "climas", "poema", "poemas", "planeta", "planetas", "sofá",
    "sofás", "drama", "dramas", "esquema", "esquemas",
}


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


# Las excepciones se comparan SIN tildes: si el texto de entrada viene
# ASCII-ficado ("dias" por "días"), igual tiene que reconocerlas. Sin esto
# salía "veintiuna dias".
MASC_EN_A_NORM = {_sin_tildes(w) for w in MASC_EN_A}


def _es_femenino(palabra: str) -> bool:
    p = palabra.lower()
    if _sin_tildes(p) in MASC_EN_A_NORM:
        return False
    if p.endswith(FEM_SUFIJOS) or _sin_tildes(p).endswith(
            tuple(_sin_tildes(s) for s in FEM_SUFIJOS)):
        return True
    return p.endswith("a") or p.endswith("as")


def _apocopar(texto: str) -> str:
    """Concuerda 'uno' con el sustantivo que le sigue.

    Ante masculino se apocopa ('veintiún años', 'un peso'); ante femenino toma
    forma femenina ('veintiuna sillas', 'una persona'); ante preposición o nexo
    se deja como está ('el treinta y uno de diciembre').
    """
    def r(m):
        num, sig = m.group(1), m.group(2)
        if sig.lower() in NO_APOCOPAR_ANTES_DE:
            return m.group(0)
        fem = _es_femenino(sig)
        formas = {"uno": ("un", "una"), "veintiuno": ("veintiún", "veintiuna")}
        return f"{formas[num.lower()][1 if fem else 0]} {sig}"
    return re.sub(r"\b(veintiuno|uno)\s+(\w+)", r, texto)


def normalizar(texto: str, siglas: dict[str, str] | None = None) -> tuple[str, list[str]]:
    siglas = siglas or {}
    avisos: list[str] = []
    t = texto

    # --- fechas dd/mm/aaaa y dd/mm ---
    def _fecha(m):
        d, mes = int(m.group(1)), int(m.group(2))
        if not (1 <= mes <= 12 and 1 <= d <= 31):
            return m.group(0)
        out = f"{en_palabras(d)} de {MESES[mes - 1]}"
        if m.group(3):
            out += f" de {en_palabras(int(m.group(3)))}"
        return out
    t = re.sub(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", _fecha, t)

    # --- horas hh:mm ---
    # Se absorbe el artículo previo ("a las 9:30") para no duplicarlo, y si no
    # venía, se agrega el que corresponde.
    def _h(m):
        art_previo, h, mi = m.group(1), int(m.group(2)), int(m.group(3))
        # La hora es femenina: "la una", no "el uno" ni "las uno".
        cuerpo = _hora(h, mi).replace("uno", "una", 1) if h == 1 else _hora(h, mi)
        art = "la" if h == 1 else "las"
        if art_previo:
            # Respetar el "a" si venía, pero corregir el número del artículo.
            prefijo = "a " if art_previo.strip().startswith("a") else ""
            return f"{prefijo}{art} {cuerpo}"
        return f"{art} {cuerpo}"
    t = re.sub(r"\b((?:a\s+)?las?\s+)?(\d{1,2}):(\d{2})\b", _h, t)

    # --- porcentajes ---
    t = re.sub(r"\b(\d+(?:[.,]\d+)?)\s*%",
               lambda m: _decimal(m.group(1)) + " por ciento", t)

    # --- montos con signo peso/dólar ---
    # El patrón NO puede terminar en separador: `12.800.000,` se comía la coma
    # de la frase y fusionaba dos oraciones.
    def _monto(m):
        moneda = "dólares" if m.group(1) == "US$" else "pesos"
        return f"{_decimal(m.group(2))} {moneda}"
    t = re.sub(r"(US\$|\$)\s?(\d(?:[\d.]*\d)?(?:,\d+)?)", _monto, t)

    # --- números sueltos (miles con punto, decimales con coma) ---
    t = re.sub(r"\b\d(?:[\d.]*\d)?(?:,\d+)?\b", lambda m: _decimal(m.group(0)), t)

    t = _apocopar(t)

    # --- siglas ---
    for s in sorted(set(re.findall(r"\b[A-ZÁÉÍÓÚÑ]{2,}\b", t)), key=len, reverse=True):
        if s in siglas:
            t = re.sub(rf"\b{re.escape(s)}\b", siglas[s], t)
        else:
            avisos.append(
                f"Sigla '{s}' sin expandir. Decidir cómo se pronuncia y pasarla "
                f"en --siglas (ej: {{\"{s}\": \"{'-'.join(s.lower())}\"}}).")

    return re.sub(r"\s{2,}", " ", t).strip(), avisos


def _decimal(s: str) -> str:
    """Convierte un número que puede traer separador de miles y/o decimales."""
    s = s.strip()
    # Heurística: si hay coma, es el decimal (convención es-CL/es-ES).
    if "," in s:
        entero, _, dec = s.partition(",")
        entero = entero.replace(".", "")
        if not entero.isdigit() or not dec.isdigit():
            return s
        return f"{en_palabras(int(entero))} coma {' '.join(en_palabras(int(d)) for d in dec)}"
    limpio = s.replace(".", "")
    if not limpio.isdigit():
        return s
    # Un año suelto (1990, 2026) se dice como número entero igual: "mil
    # novecientos noventa", que es lo correcto en español.
    return en_palabras(int(limpio))


from _console import use_utf8


def main() -> int:
    use_utf8()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("texto", nargs="?")
    ap.add_argument("--archivo")
    ap.add_argument("--salida", help="Escribir el resultado a un archivo")
    ap.add_argument("--siglas", help="JSON {\"SIGLA\": \"como se pronuncia\"}")
    ap.add_argument("--json", action="store_true",
                    help="Salida JSON: el texto normalizado y sus avisos juntos")
    a = ap.parse_args()

    if a.archivo:
        texto = open(a.archivo, encoding="utf-8").read()
    elif a.texto:
        texto = a.texto
    else:
        texto = sys.stdin.read()

    siglas = json.load(open(a.siglas, encoding="utf-8")) if a.siglas else {}
    salida, avisos = normalizar(texto, siglas)

    if a.json:
        # One payload, because the caller is a program: the warnings are part of
        # the answer (unexpanded acronyms are for a human to decide), and making
        # it scrape stderr to find them invites dropping them.
        print(json.dumps({"texto": salida, "avisos": avisos}, ensure_ascii=False))
        return 0

    if a.salida:
        with open(a.salida, "w", encoding="utf-8") as f:
            f.write(salida)
        print(f"Escrito en {a.salida}")
    else:
        print(salida)

    if avisos:
        print("\nAvisos:", file=sys.stderr)
        for w in avisos:
            print(f"  [!] {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

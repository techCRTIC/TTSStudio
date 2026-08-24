#!/usr/bin/env python3
"""Revisa un texto ANTES de mandarlo a un TTS. Capa 3 (determinista).

Existe porque las dos palancas más grandes de calidad en TTS no están en el
modelo sino en el texto, y ambas fallan **en silencio**: el modelo no se queja,
el grafo valida, el audio se genera — y suena mal. Este script las convierte en
un chequeo que no se puede saltar por descuido.

Los dos hallazgos que codifica (investigación `comfy-mcp`, 2026-08-19):

1. ORTOGRAFÍA. Un texto español sin tildes hace que el modelo acentúe mal
   ("ficcion" -> FIC-cion en vez de fic-CIÓN) y el acento mal puesto es una de
   las señales más fuertes de que una voz suena EXTRANJERA. Medido: corregir la
   ortografía cambió la locución entre +15% y +29%. Se detectó porque el
   usuario escuchó "hace un ano" en vez de "hace un año".

2. PUNTUACIÓN. Reescribir con elipsis, frases cortas y preguntas mueve el ritmo
   3,5x más que el parámetro `instruct` de un modelo fine-tuneado (+54% vs
   +15%), y es gratis.

Uso:
    python tts_revisar_texto.py "el texto"
    python tts_revisar_texto.py --archivo guion.txt
    python tts_revisar_texto.py --archivo guion.txt --json

Código de salida: 0 sin problemas, 1 si hay algo BLOQUEANTE, 0 con avisos.

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

# Techos del modelo (Qwen3-TTS): 2048 caracteres de entrada por pasada y
# ~8192 tokens de audio (~3 min). Ver memoria `operar-qwen3-tts-gotchas`.
MAX_CARACTERES = 2048
CARACTERES_COMODOS = 1200

# Palabras muy frecuentes en español que casi siempre llevan tilde. Si aparecen
# sin ella, el texto está ASCII-ficado (no es que el autor escriba mal).
PALABRAS_CON_TILDE = {
    "mas": "más", "que": None, "esta": None, "estan": "están", "ano": "año",
    "anos": "años", "aqui": "aquí", "alli": "allí", "asi": "así",
    "tambien": "también", "despues": "después", "ademas": "además",
    "dia": "día", "dias": "días", "pais": "país", "segun": "según",
    "informacion": "información", "cancion": "canción", "razon": "razón",
    "corazon": "corazón", "television": "televisión", "musica": "música",
    "publico": "público", "numero": "número", "ultimo": "último",
    "proximo": "próximo", "rapido": "rápido", "facil": "fácil",
    "dificil": "difícil", "tipico": "típico", "practica": "práctica",
    "tecnica": "técnica", "electronico": "electrónico", "telefono": "teléfono",
    "camara": "cámara", "pagina": "páginas", "paginas": "páginas",
    "version": "versión", "opcion": "opción", "atencion": "atención",
    "situacion": "situación", "explicacion": "explicación", "sesion": "sesión",
    "ficcion": "ficción", "accion": "acción", "produccion": "producción",
    "nino": "niño", "nina": "niña", "ninos": "niños", "pequeno": "pequeño",
    "pequena": "pequeña", "manana": "mañana", "senor": "señor",
    "senora": "señora", "espanol": "español", "sueno": "sueño",
    "companero": "compañero", "ensenar": "enseñar", "otono": "otoño",
}


def _sin_diacriticos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def revisar(texto: str) -> dict:
    problemas: list[dict] = []
    palabras = re.findall(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+", texto)
    n_pal = len(palabras)
    n_car = len(texto)

    tiene_diacriticos = bool(re.search(r"[áéíóúÁÉÍÓÚñÑüÜ]", texto))
    sospechosas = sorted({
        p.lower() for p in palabras
        if p.lower() in PALABRAS_CON_TILDE and PALABRAS_CON_TILDE[p.lower()]
    })

    # --- 1. ASCII-ficación: el error que costó ~25 audios ---
    if n_pal >= 8 and not tiene_diacriticos:
        problemas.append({
            "nivel": "BLOQUEANTE",
            "codigo": "sin_diacriticos",
            "mensaje": (f"{n_pal} palabras y CERO tildes o eñes. El texto está "
                        "ASCII-ficado: el modelo va a acentuar mal y la voz "
                        "sonará extranjera."),
            "accion": "Reescribir el texto en español real, con tildes y ñ.",
            "ejemplos": sospechosas[:8] or None,
        })
    elif sospechosas:
        problemas.append({
            "nivel": "AVISO",
            "codigo": "tildes_faltantes",
            "mensaje": "Hay palabras que suelen llevar tilde escritas sin ella.",
            "accion": "Revisar: " + ", ".join(
                f"{p} -> {PALABRAS_CON_TILDE[p]}" for p in sospechosas[:10]),
        })

    # "ano" merece su propia alerta: no es una tilde faltante, es otra palabra.
    if re.search(r"\banos?\b", texto, re.IGNORECASE):
        problemas.append({
            "nivel": "BLOQUEANTE",
            "codigo": "ano_sin_enie",
            "mensaje": "Aparece 'ano'/'anos'. Casi seguro debía ser 'año'/'años'.",
            "accion": "Corregir la ñ antes de generar.",
        })

    # --- 2. Signos de apertura ---
    if texto.count("?") > texto.count("¿"):
        problemas.append({
            "nivel": "AVISO", "codigo": "falta_apertura_interrogacion",
            "mensaje": "Hay '?' de cierre sin su '¿' de apertura.",
            "accion": ("Agregar '¿'. Marca la entonación desde el INICIO de la "
                       "frase, no solo al final — el modelo la usa."),
        })
    if texto.count("!") > texto.count("¡"):
        problemas.append({
            "nivel": "AVISO", "codigo": "falta_apertura_exclamacion",
            "mensaje": "Hay '!' de cierre sin su '¡' de apertura.",
            "accion": "Agregar '¡' por la misma razón.",
        })

    # --- 3. Techos del modelo ---
    if n_car > MAX_CARACTERES:
        problemas.append({
            "nivel": "BLOQUEANTE", "codigo": "texto_muy_largo",
            "mensaje": f"{n_car} caracteres; el tope por pasada es {MAX_CARACTERES}.",
            "accion": "Trocear por frases y concatenar los audios resultantes.",
        })
    elif n_car > CARACTERES_COMODOS:
        problemas.append({
            "nivel": "AVISO", "codigo": "texto_largo",
            "mensaje": f"{n_car} caracteres. Cerca del tope ({MAX_CARACTERES}).",
            "accion": ("Subir `max_new_tokens` (hasta 8192) o trocear. Textos "
                       "largos aumentan el riesgo del bug de loop infinito."),
        })

    # --- 4. Números en dígitos ---
    if re.search(r"\d", texto):
        problemas.append({
            "nivel": "AVISO", "codigo": "numeros_en_digitos",
            "mensaje": "Hay números escritos con dígitos.",
            "accion": ("Escribirlos en palabras ('treinta y uno', no '31'). Los "
                       "modelos de voz verbalizan mal los dígitos, y un dataset "
                       "de voz clonada rara vez tiene ejemplos numéricos."),
        })

    # --- 5. Prosodia: densidad de puntuación (la palanca principal) ---
    frases = [f for f in re.split(r"[.!?…]+", texto) if f.strip()]
    pal_por_frase = (n_pal / len(frases)) if frases else n_pal
    tiene_elipsis = "..." in texto or "…" in texto
    if n_pal >= 25 and pal_por_frase > 22 and not tiene_elipsis:
        problemas.append({
            "nivel": "AVISO", "codigo": "prosodia_plana",
            "mensaje": (f"Frases largas ({pal_por_frase:.0f} palabras de "
                        "promedio) y sin puntos suspensivos."),
            "accion": ("Cortar en frases más breves y marcar las pausas con "
                       "'...'. La puntuación mueve el ritmo 3,5x más que el "
                       "parámetro `instruct` de un fine-tune, y es gratis."),
        })

    return {
        "caracteres": n_car,
        "palabras": n_pal,
        "frases": len(frases),
        "palabras_por_frase": round(pal_por_frase, 1),
        "tiene_diacriticos": tiene_diacriticos,
        "problemas": problemas,
        "bloqueantes": sum(1 for p in problemas if p["nivel"] == "BLOQUEANTE"),
    }


from _console import use_utf8


def main() -> int:
    use_utf8()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("texto", nargs="?", help="El texto a revisar")
    ap.add_argument("--archivo", help="Leer el texto de un archivo UTF-8")
    ap.add_argument("--json", action="store_true", help="Salida JSON")
    a = ap.parse_args()

    if a.archivo:
        with open(a.archivo, encoding="utf-8") as f:
            texto = f.read()
    elif a.texto:
        texto = a.texto
    else:
        texto = sys.stdin.read()

    r = revisar(texto)

    if a.json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return 1 if r["bloqueantes"] else 0

    print(f"{r['palabras']} palabras · {r['caracteres']} caracteres · "
          f"{r['frases']} frases ({r['palabras_por_frase']} pal/frase)")
    if not r["problemas"]:
        print("\nSin problemas. El texto está listo para generar.")
        return 0
    print()
    for p in r["problemas"]:
        marca = "[X]" if p["nivel"] == "BLOQUEANTE" else "[!]"
        print(f"{marca} {p['codigo']}: {p['mensaje']}")
        print(f"    -> {p['accion']}")
        if p.get("ejemplos"):
            print(f"    ej: {', '.join(p['ejemplos'])}")
    if r["bloqueantes"]:
        print(f"\n{r['bloqueantes']} problema(s) BLOQUEANTE(S). "
              "Corregir antes de generar.")
        return 1
    print("\nSolo avisos. Se puede generar, pero conviene revisarlos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

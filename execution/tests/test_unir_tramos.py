"""Tests de `tts_unir_tramos.py`: verificación del bug de loop y unión de tramos.

Genera sus propios archivos de audio sintético con `soundfile` en `tmp_path`
(silencio de duración conocida) en vez de depender de fixtures grabados, para
que la duración de cada caso quede expresada en el propio test y no en un
archivo binario que nadie puede leer a simple vista.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

import tts_unir_tramos as m


def _audio(ruta: Path, duracion_s: float, samplerate: int = 1000, canales: int = 1) -> None:
    """Escribe `duracion_s` segundos de silencio en `ruta` a `samplerate` Hz.

    El contenido es irrelevante para estos tests: `verificar` solo lee la
    cabecera (número de muestras y frecuencia) y `unir` solo comprueba que las
    muestras se concatenan en la cantidad correcta.
    """
    n_muestras = round(duracion_s * samplerate)
    datos = np.zeros((n_muestras, canales), dtype="float32")
    sf.write(str(ruta), datos, samplerate)


# ---------------------------------------------------------------------------
# --verificar
# ---------------------------------------------------------------------------


def test_verificar_caso_claramente_ok(tmp_path: Path) -> None:
    audio = tmp_path / "tramo_ok.wav"
    _audio(audio, duracion_s=10.0, samplerate=1000)  # 10000 muestras

    r = m.verificar(str(audio), caracteres=150)  # 150 / 10 = 15 c/s

    assert r["verdict"] == "ok"
    assert r["chars"] == 150
    assert r["seconds"] == pytest.approx(10.0)
    assert r["chars_per_second"] == pytest.approx(15.0)


def test_verificar_borde_8_cps_es_ok_no_loop(tmp_path: Path) -> None:
    """8.0 c/s exactos caen DENTRO de la banda 'ok' (solo por debajo es loop)."""
    audio = tmp_path / "tramo_borde_loop.wav"
    _audio(audio, duracion_s=20.0, samplerate=1000)  # 20000 muestras

    r = m.verificar(str(audio), caracteres=160)  # 160 / 20 = 8.0 c/s exactos

    assert r["chars_per_second"] == pytest.approx(8.0)
    assert r["verdict"] == "ok"


def test_verificar_justo_debajo_del_umbral_loop(tmp_path: Path) -> None:
    audio = tmp_path / "tramo_loop.wav"
    _audio(audio, duracion_s=20.0, samplerate=1000)

    r = m.verificar(str(audio), caracteres=159)  # 159 / 20 = 7.95 c/s

    assert r["chars_per_second"] < 8.0
    assert r["verdict"] == "loop"


def test_verificar_borde_22_cps_es_ok_no_cut(tmp_path: Path) -> None:
    """22.0 c/s exactos caen DENTRO de la banda 'ok' (solo por encima es cut)."""
    audio = tmp_path / "tramo_borde_cut.wav"
    _audio(audio, duracion_s=10.0, samplerate=1000)  # 10000 muestras

    r = m.verificar(str(audio), caracteres=220)  # 220 / 10 = 22.0 c/s exactos

    assert r["chars_per_second"] == pytest.approx(22.0)
    assert r["verdict"] == "ok"


def test_verificar_justo_encima_del_umbral_cut(tmp_path: Path) -> None:
    audio = tmp_path / "tramo_cut.wav"
    _audio(audio, duracion_s=10.0, samplerate=1000)

    r = m.verificar(str(audio), caracteres=221)  # 221 / 10 = 22.1 c/s

    assert r["chars_per_second"] > 22.0
    assert r["verdict"] == "cut"


def test_verificar_bajo_la_puerta_minima_da_sin_veredicto(tmp_path: Path) -> None:
    """Un tramo muy corto (cifra, sigla) no debe recibir 'loop' aunque su
    caracteres/segundo caiga en esa banda: por debajo de la puerta mínima de
    longitud, el veredicto es explícitamente 'sin_veredicto', nunca 'ok'."""
    audio = tmp_path / "tramo_corto.wav"
    _audio(audio, duracion_s=1.0, samplerate=1000)  # 1000 muestras

    caracteres = 5
    assert caracteres < m.MIN_CHARS_PARA_VEREDICTO  # la premisa del test

    r = m.verificar(str(audio), caracteres=caracteres)

    assert r["verdict"] == "sin_veredicto"


def test_verificar_ruta_relativa_es_rechazada(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    audio = tmp_path / "tramo.wav"
    _audio(audio, duracion_s=1.0, samplerate=1000)
    monkeypatch.chdir(tmp_path)

    with pytest.raises(m.RutaInvalidaError):
        m.verificar("tramo.wav", caracteres=100)


def test_verificar_archivo_inexistente(tmp_path: Path) -> None:
    ausente = tmp_path / "no_existe.wav"

    with pytest.raises(FileNotFoundError):
        m.verificar(str(ausente), caracteres=100)


# ---------------------------------------------------------------------------
# --unir
# ---------------------------------------------------------------------------


def test_unir_dos_pausas_duracion_total(tmp_path: Path) -> None:
    samplerate = 8000
    duracion_tramo = 0.5  # 4000 muestras cada uno
    tramo1 = tmp_path / "01.wav"
    tramo2 = tmp_path / "02.wav"
    tramo3 = tmp_path / "03.wav"
    for ruta in (tramo1, tramo2, tramo3):
        _audio(ruta, duracion_s=duracion_tramo, samplerate=samplerate)

    salida = tmp_path / "unido.wav"
    segmentos = [
        {"path": str(tramo1), "frontera": "sentence"},   # pausa de 0.28s tras este
        {"path": str(tramo2), "frontera": "paragraph"},  # pausa de 0.65s tras este
        {"path": str(tramo3), "frontera": "sentence"},   # última: no se usa
    ]

    r = m.unir(segmentos, str(salida))

    assert r["output"] == str(salida)
    assert r["samplerate"] == samplerate
    assert r["segments_joined"] == 3
    assert salida.is_file()

    esperado = 3 * duracion_tramo + 0.28 + 0.65
    # Tolerancia de una muestra por junta: dos juntas aquí.
    tolerancia = 2 / samplerate
    assert r["seconds"] == pytest.approx(esperado, abs=tolerancia)

    info_salida = sf.info(str(salida))
    duracion_real = info_salida.frames / info_salida.samplerate
    assert duracion_real == pytest.approx(esperado, abs=tolerancia)


def test_unir_aborta_si_las_frecuencias_difieren(tmp_path: Path) -> None:
    tramo0 = tmp_path / "00.wav"
    tramo1 = tmp_path / "01.wav"
    _audio(tramo0, duracion_s=0.2, samplerate=8000)
    _audio(tramo1, duracion_s=0.2, samplerate=16000)

    salida = tmp_path / "unido.wav"
    segmentos = [
        {"path": str(tramo0), "frontera": "sentence"},
        {"path": str(tramo1), "frontera": "sentence"},
    ]

    with pytest.raises(m.FrecuenciasDistintasError) as exc_info:
        m.unir(segmentos, str(salida))

    mensaje = str(exc_info.value)
    assert "1" in mensaje  # nombra el índice del tramo que difiere
    assert "8000" in mensaje
    assert "16000" in mensaje
    assert not salida.exists()  # no debe quedar una salida a medias


def test_unir_rechaza_ruta_de_salida_relativa(tmp_path: Path) -> None:
    tramo0 = tmp_path / "00.wav"
    _audio(tramo0, duracion_s=0.2, samplerate=8000)

    segmentos = [{"path": str(tramo0), "frontera": "sentence"}]

    with pytest.raises(m.RutaInvalidaError):
        m.unir(segmentos, "salida_relativa.wav")


def test_unir_rechaza_ruta_de_tramo_relativa(tmp_path: Path) -> None:
    tramo0 = tmp_path / "00.wav"
    _audio(tramo0, duracion_s=0.2, samplerate=8000)

    salida = tmp_path / "unido.wav"
    segmentos = [{"path": "tramo_relativo.wav", "frontera": "sentence"}]

    with pytest.raises(m.RutaInvalidaError):
        m.unir(segmentos, str(salida))


def test_unir_lista_vacia(tmp_path: Path) -> None:
    salida = tmp_path / "unido.wav"

    with pytest.raises(ValueError):
        m.unir([], str(salida))


def test_unir_frontera_desconocida(tmp_path: Path) -> None:
    tramo0 = tmp_path / "00.wav"
    _audio(tramo0, duracion_s=0.2, samplerate=8000)

    salida = tmp_path / "unido.wav"
    segmentos = [{"path": str(tramo0), "frontera": "capitulo"}]

    with pytest.raises(ValueError):
        m.unir(segmentos, str(salida))

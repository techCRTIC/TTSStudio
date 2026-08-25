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


# ---------------------------------------------------------------------------
# Nivelado de volumen entre tramos (2026-08-24)
#
# Reportado escuchando una corrida real de 28 tramos: "muy consistente el tono,
# no asi el volumen". El motor no tiene objetivo de sonoridad, asi que cada
# tramo sale con el nivel que le toca y la pieza unida sube y baja.
# ---------------------------------------------------------------------------


def _tono(duracion_s: float, amplitud: float, samplerate: int = 8000) -> np.ndarray:
    """Un tono de amplitud conocida. A diferencia de `_audio`, esto TIENE senal:
    el nivelado mide RMS y el silencio no se puede nivelar contra nada."""
    n = round(duracion_s * samplerate)
    t = np.arange(n, dtype="float32") / samplerate
    onda = np.sin(2 * np.pi * 220.0 * t) * amplitud
    return onda.reshape(-1, 1).astype("float32")


def test_nivelar_iguala_tramos_de_volumen_distinto() -> None:
    # 2x de diferencia: dentro del tope de ganancia, asi que la correccion
    # puede completarse. El caso que SE PASA del tope tiene su propio test.
    flojo = _tono(0.5, amplitud=0.25)
    fuerte = _tono(0.5, amplitud=0.50)
    otro_fuerte = _tono(0.5, amplitud=0.50)

    nivelados, ganancias = m.nivelar([flojo, fuerte, otro_fuerte])

    rms = [m._rms_activo(t) for t in nivelados]
    # Todos quedan a la mediana: los dos fuertes no se mueven, el flojo sube.
    assert rms[0] == pytest.approx(rms[1], rel=0.02)
    assert rms[1] == pytest.approx(rms[2], rel=0.02)
    assert ganancias[0] > 1.0, "el tramo flojo tiene que subir"
    assert ganancias[1] == pytest.approx(1.0, rel=0.02)


def test_nivelar_no_amplifica_mas_alla_del_tope() -> None:
    # Un tramo practicamente mudo no debe amplificarse hasta el ruido.
    casi_mudo = _tono(0.5, amplitud=0.001)
    normales = [_tono(0.5, amplitud=0.5) for _ in range(3)]

    _, ganancias = m.nivelar([casi_mudo, *normales])

    assert ganancias[0] <= m.GANANCIA_MAXIMA + 1e-6, ganancias[0]


def test_nivelar_respeta_el_techo_de_pico() -> None:
    # Dos tramos ya altos: subir el mas bajo hacia la mediana no puede sacar
    # nada por encima del techo.
    altos = [_tono(0.5, amplitud=0.95), _tono(0.5, amplitud=0.95), _tono(0.5, amplitud=0.60)]

    nivelados, _ = m.nivelar(altos)

    pico = max(float(np.max(np.abs(t))) for t in nivelados)
    assert pico <= m.TECHO_DE_PICO + 1e-6, pico


def test_nivelar_un_solo_tramo_no_lo_toca() -> None:
    # No hay referencia contra la que comparar: cambiar el volumen de una toma
    # normal sin que nadie lo pida seria peor que no hacer nada.
    solo = _tono(0.5, amplitud=0.2)

    nivelados, ganancias = m.nivelar([solo])

    assert ganancias == [1.0]
    assert np.array_equal(nivelados[0], solo)


def test_nivelar_todo_silencio_no_divide_por_cero() -> None:
    mudos = [np.zeros((100, 1), dtype="float32") for _ in range(3)]

    nivelados, ganancias = m.nivelar(mudos)

    assert ganancias == [1.0, 1.0, 1.0]
    assert all(float(np.max(np.abs(t))) == 0.0 for t in nivelados)


def test_unir_nivela_por_defecto_y_lo_declara(tmp_path: Path) -> None:
    samplerate = 8000
    rutas = []
    for i, amplitud in enumerate((0.1, 0.5, 0.5)):
        ruta = tmp_path / f"{i:02d}.wav"
        sf.write(str(ruta), _tono(0.4, amplitud, samplerate), samplerate)
        rutas.append(ruta)

    salida = tmp_path / "unido.wav"
    segmentos = [{"path": str(r), "frontera": "sentence"} for r in rutas]

    r = m.unir(segmentos, str(salida))

    assert r["leveled"] is True
    assert len(r["gains"]) == 3
    assert r["gains"][0] > 1.0, "el tramo flojo tiene que haber subido"

    crudo = tmp_path / "crudo.wav"
    r2 = m.unir(segmentos, str(crudo), nivelar_volumen=False)
    assert r2["leveled"] is False
    assert r2["gains"] == [1.0, 1.0, 1.0]

    # La duracion no cambia por nivelar: solo cambia la amplitud.
    assert r["seconds"] == pytest.approx(r2["seconds"], abs=1 / samplerate)

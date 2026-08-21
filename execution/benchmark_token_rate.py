#!/usr/bin/env python
"""
Measure how many audio tokens Qwen3-TTS spends per second of speech.

WHY
    The interface exposes `max_new_tokens` as the length ceiling, and "4096"
    is not a unit any person thinks in. To offer it as time instead — "up to
    about five minutes" — the conversion has to be a MEASUREMENT, not an
    inference. The model is named Qwen3-TTS-12Hz, which suggests 12 tokens per
    second, but a name is a hint and this project does not ship hints as facts.

HOW
    A ceiling is not a consumption figure: asking for 4096 does not mean 4096
    were used. So the ceiling is turned into the thing being measured — give
    the model far more text than a low ceiling can hold, and it will generate
    until the ceiling stops it. The audio that comes back is exactly
    `max_new_tokens` worth of speech, and its duration divided by the ceiling
    is the rate.

    Several ceilings are run so the answer can be checked for consistency
    rather than trusted from one sample.

    ⚠️ A CEILING ONLY MEASURES ANYTHING WHILE IT IS THE BINDING CONSTRAINT.
    The first run of this benchmark reported 12.60, 12.55 and then 13.50 for
    ceilings of 128, 256 and 512 — and the third was not noise. At 512 the
    model had finished the text before reaching the ceiling, so that sample
    measured the length of the paragraph, not the rate. A control run with the
    maximum ceiling returned exactly the same duration, which proved it.

    So the control run happens FIRST now, and any sample whose audio comes back
    at (near) the unconstrained length is discarded and reported as discarded.
    Averaging it in was a silent cap: a wrong number arriving with the
    confidence of a measurement.

USAGE
    .venv/Scripts/python.exe execution/benchmark_token_rate.py [options]

    --voice NAME      prompt file to use (default: the first one available)
    --ceilings A,B,C  token ceilings to try (default: 128,256,512)
    --url URL         ComfyUI base (default: http://127.0.0.1:8188)

    Prints a table to stderr and one JSON object to stdout.

REQUIREMENTS
    ComfyUI must be running with a voice already registered. Each run occupies
    the GPU for a few seconds; this is not free and is not meant to be run
    routinely — it answers a question once and the answer gets written down.

EXIT CODES
    0 ok · 1 bad usage · 2 engine unreachable or no voice · 3 a generation
    failed · 4 the results disagree with each other
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from _console import use_utf8

# Long enough that even the largest ceiling below runs out before the text does.
LONG_TEXT = (
    "Hoy quiero contar algo sencillo, sin apuro. Trabajé varios años en esto y "
    "todavía me sorprende: cada proyecto trae su propio ritmo, sus urgencias, su "
    "manera de fallar. Empiezo temprano, ordeno lo que puedo, y dejo espacio para "
    "lo que no anticipé. Lo demás llega después. Cuando algo sale bien, casi "
    "siempre es porque alguien se tomó el trabajo de escuchar primero. El proceso "
    "tiene tres etapas, y conviene respetarlas en orden. Primero se reúne el "
    "material, después se revisa la calidad, y al final se compara con el original. "
    "Nada de esto es complicado, pero todo se resiente si uno se salta un paso. "
    "Con el tiempo aprendí que la prisa cuesta más de lo que ahorra, y que casi "
    "cualquier error se arregla si se detecta temprano."
)

SEED = 42  # fixed: this is a measurement, and it must repeat

# Qwen3VoiceClone's declared maximum. Used for the control run, where the point
# is precisely that the ceiling constrains nothing.
MAX_CEILING = 8192


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def get_json(url: str, timeout: int = 30):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read())


def post_json(url: str, payload: dict, timeout: int = 30):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def first_voice(base: str) -> str | None:
    info = get_json(f"{base}/object_info/Qwen3LoadPrompt")
    combo = info.get("Qwen3LoadPrompt", {}).get("input", {}).get("required", {}).get(
        "prompt_file", [None]
    )[0]
    if not isinstance(combo, list) or not combo:
        return None
    return combo[0]


def build_graph(voice: str, ceiling: int) -> dict:
    return {
        "1": {
            "class_type": "Qwen3Loader",
            "inputs": {
                "repo_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
                "source": "HuggingFace",
                "precision": "bf16",
                "attention": "sdpa",
            },
        },
        "2": {"class_type": "Qwen3LoadPrompt", "inputs": {"prompt_file": voice}},
        "3": {
            "class_type": "Qwen3VoiceClone",
            "inputs": {
                "model": ["1", 0],
                "prompt": ["2", 0],
                "text": LONG_TEXT,
                "seed": SEED,
                "language": "Spanish",
                "max_new_tokens": ceiling,
            },
        },
        "4": {
            "class_type": "SaveAudio",
            "inputs": {"audio": ["3", 0], "filename_prefix": "benchmark_tokens"},
        },
    }


def wait_for(base: str, prompt_id: str, timeout: int = 900) -> dict:
    """Poll history until the job leaves the queue. Returns its outputs."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        history = get_json(f"{base}/history/{prompt_id}")
        entry = history.get(prompt_id)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI falló: {json.dumps(status)[:300]}")
            if entry.get("outputs"):
                return entry["outputs"]
        time.sleep(1.5)
    raise TimeoutError("La generación no terminó dentro del plazo.")


def audio_seconds(base: str, audio: dict) -> float:
    """Download the generated file and read its real duration."""
    query = urllib.parse.urlencode(
        {
            "filename": audio["filename"],
            "subfolder": audio.get("subfolder", ""),
            "type": audio.get("type", "output"),
        }
    )
    with urllib.request.urlopen(f"{base}/view?{query}", timeout=120) as response:
        data = response.read()

    import io

    import av  # ships with faster-whisper

    with av.open(io.BytesIO(data)) as container:
        stream = container.streams.audio[0]
        if stream.duration is not None and stream.time_base is not None:
            return float(stream.duration * stream.time_base)
        # Some encoders omit the duration; count the samples instead.
        samples = sum(frame.samples for frame in container.decode(audio=0))
        return samples / stream.codec_context.sample_rate


def main(argv: list[str] | None = None) -> int:
    # Windows defaults stdout to the console code page, which turns every
    # accented character into a byte Node cannot read back. See _console.
    use_utf8()

    parser = argparse.ArgumentParser(description="Measure the engine's tokens per second.")
    parser.add_argument("--voice", default="")
    parser.add_argument("--ceilings", default="128,256,512")
    parser.add_argument("--url", default="http://127.0.0.1:8188")
    args = parser.parse_args(argv)

    base = args.url.rstrip("/")

    try:
        voice = args.voice or first_voice(base)
    except (urllib.error.URLError, OSError) as cause:
        log(f"ERROR: no se pudo hablar con ComfyUI en {base}: {cause}")
        return 2

    if not voice:
        log("ERROR: no hay ninguna voz registrada con la que medir.")
        return 2

    try:
        ceilings = [int(c) for c in args.ceilings.split(",") if c.strip()]
    except ValueError:
        log("ERROR: --ceilings debe ser una lista de enteros separados por comas.")
        return 1

    log(f"Voz: {voice}")

    def generate(ceiling: int) -> float:
        """Run one generation and return the duration of what came back."""
        prompt_id = post_json(f"{base}/prompt", {"prompt": build_graph(voice, ceiling)})[
            "prompt_id"
        ]
        outputs = wait_for(base, prompt_id)
        audio = next((node["audio"][0] for node in outputs.values() if node.get("audio")), None)
        if audio is None:
            raise RuntimeError("la generación no devolvió audio")
        return audio_seconds(base, audio)

    # The control: how long the text is when nothing constrains it. Any sample
    # that lands here was not limited by its ceiling and measures nothing.
    try:
        log("Midiendo primero cuánto dura el texto sin límite…")
        unconstrained = generate(MAX_CEILING)
    except Exception as cause:  # noqa: BLE001
        log(f"ERROR: falló la generación de control: {cause}")
        return 3
    log(f"El texto completo dura {unconstrained:.2f}s.\n")

    log(f"{'techo':>8}  {'segundos':>9}  {'tokens/s':>9}  estado")

    measurements = []
    discarded = []
    for ceiling in ceilings:
        try:
            seconds = generate(ceiling)
        except Exception as cause:  # noqa: BLE001 — any engine failure is one outcome
            log(f"ERROR: falló la generación con techo {ceiling}: {cause}")
            return 3

        rate = ceiling / seconds
        # Within 2% of the unconstrained length means the text ran out first.
        binding = seconds < unconstrained * 0.98
        row = {"ceiling": ceiling, "seconds": round(seconds, 3), "rate": round(rate, 3)}

        if binding:
            measurements.append(row)
            log(f"{ceiling:>8}  {seconds:>9.2f}  {rate:>9.2f}  vale")
        else:
            discarded.append(row)
            log(f"{ceiling:>8}  {seconds:>9.2f}  {rate:>9.2f}  DESCARTADO: el texto se acabó antes")

    if not measurements:
        log(
            "\nERROR: ningún techo llegó a limitar. Todos dejaron que el texto "
            "terminara, así que ninguno midió la tasa. Usa techos más bajos."
        )
        json.dump(
            {"discarded": discarded, "unconstrained_seconds": round(unconstrained, 3),
             "consistent": False},
            sys.stdout,
            ensure_ascii=False,
        )
        sys.stdout.write("\n")
        return 4

    rates = [m["rate"] for m in measurements]
    spread = (max(rates) - min(rates)) / min(rates) if len(rates) > 1 else 0.0

    # A real constant rate should agree closely across ceilings. If it does not,
    # the number is not a constant and must not be shipped as one.
    if spread > 0.10:
        log(
            f"ERROR: las medidas no concuerdan entre sí (dispersión {spread:.1%}). "
            "La tasa no es constante y no se puede publicar como si lo fuera."
        )
        json.dump({"measurements": measurements, "consistent": False}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 4

    average = sum(rates) / len(rates)
    json.dump(
        {
            "voice": voice,
            "measurements": measurements,
            "discarded": discarded,
            "unconstrained_seconds": round(unconstrained, 3),
            "tokens_per_second": round(average, 3),
            "seconds_per_token": round(1 / average, 5),
            "spread": round(spread, 4),
            "consistent": True,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    log(
        f"\nTasa medida: {average:.2f} tokens por segundo de audio "
        f"({len(measurements)} medidas válidas, dispersión {spread:.1%})."
    )
    if discarded:
        log(f"Se descartaron {len(discarded)}: su techo no llegó a limitar nada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

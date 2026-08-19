# Backlog — Comfy MCP

> Ideas diferidas, follow-ups y nice-to-haves de ESTA investigación.
> Formato: `## B-NNN — título` + línea **Status:** `idea` / `en curso` / `✅ hecho`.
> No es la tarea activa (→ puntero raíz), ni cronología (→ session-log), ni
> estado actual (→ project-overview).

## B-001 — Adoptar Comfy como motor de imagen local del estudio
**Status:** idea
El usuario quiere "seguir con comfy para todo" (2026-08-18). Implicaría:
declararlo en `technical-preferences.md` como el motor de generación local
por defecto (vs. Higgsfield/APIs pagadas), definir cuándo se usa cuál, y
posiblemente una skill o directiva de "generación de assets vía comfy" que
encapsule el flujo prompt→grafo→validate→run→output. El stack ya está
instalado globalmente (ver memoria hub `comfy-stack-instalado-y-el-path-del-venv`).

## B-002 — Registrar comfy-mcp en otros clientes MCP
**Status:** idea
Hoy está solo en Claude Code (scope user). Si se adopta como motor estándar,
evaluar registrarlo también en Claude Desktop (y Cursor si aplica). Es una
línea de config por cliente.

## B-003 — Fine-tune real de Qwen3-TTS con el audio completo de Andrés
**Status:** idea
Hoy solo se probó clonación **zero-shot** (3-15s de referencia, puro
conditioning, sin ajustar pesos). El siguiente escalón real es un **fine-tune**
con el audio "full" (37 min) como material crudo — proyecto en sí mismo, no un
experimento de 5 minutos.
- **Viabilidad confirmada**: 1.7B pide ≥16 GB VRAM (esta máquina tiene 24 GB,
  sobra). Dataset recomendado por Qwen: 10-30 min limpios, mínimo ~5 min —
  el "full" cae justo en ese rango o por encima.
- **El audio NO se alimenta entero**: el training es JSONL con pares
  `audio`/`text`/`ref_audio` por línea (clips cortos alineados a su
  transcripción, mismo `ref_audio` compartido en todas las líneas). El
  "audio largo" es insumo crudo para trocear, no una sola pasada.
- **Pipeline ya construido y reusable**: el mismo par
  `tts/transcribe_min1.py` (Whisper con timestamps) +
  `tts/benchmark_segmentos.py` (extracción de clips con ffmpeg) que se hizo
  hoy para el benchmark de 1 minuto **es el preprocesamiento correcto** —
  solo hay que correrlo sobre los 37 minutos completos en vez de 1, y armar
  el JSONL en el formato que pide `prepare_data.py` del repo
  `QwenLM/Qwen3-TTS` (carpeta `finetuning/`).
- **Sin documentar oficialmente** (verificar antes de asumir): épocas,
  batch size y learning rate — los ejemplos del repo varían mucho
  (lr 2e-6 a 2e-5, batch 2 a 32) sin justificación clara; tampoco hay
  estimación de tiempo de entrenamiento en GPU consumer.
- Fuente: https://github.com/QwenLM/Qwen3-TTS/tree/main/finetuning

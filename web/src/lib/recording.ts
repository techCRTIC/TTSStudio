"use client";

/**
 * Recording a reference clip in the browser, and handing it over as a WAV.
 *
 * WHY WAV, AND WHY WE ENCODE IT OURSELVES
 *   MediaRecorder does not produce a wav. It produces whatever container the
 *   browser feels like — Chrome gives `audio/webm;codecs=opus`, Safari gives
 *   mp4 — so what reaches the engine would depend on which browser recorded it.
 *   ComfyUI would in fact list a .webm (its filter is mimetype-based and
 *   video/webm passes), but "it would probably work" is not a foundation for
 *   the one file a voice is cloned from.
 *
 *   So the blob is decoded and re-encoded as PCM here. Every consumer already
 *   understands wav, and the recording path becomes identical to the
 *   pick-a-file path from the upload onward.
 *
 * NOT RESAMPLED
 *   The AudioContext's own rate is kept (48 kHz on most machines). Downsampling
 *   to 16 kHz would be enough for the transcript — Whisper works there — but the
 *   same file is also what the voice embedding is computed from, and throwing
 *   away half the spectrum of the one reference clip to save a megabyte is a bad
 *   trade. Mono, because a reference is one person talking.
 */

/** What a reader is asked to say. */
export type Script = {
  id: string;
  /** How this one is meant to sound — the tone carries into the clone. */
  tone: string;
  text: string;
};

/**
 * Scripts to read aloud.
 *
 * Each runs about half a minute at an unhurried pace, which is exactly the
 * window the engine uses. They are written to exercise Spanish broadly — the
 * rolled r, the ñ, the j, the ll, question intonation, an aside between dashes,
 * a list, and a deliberate mix of short and long sentences — because
 * punctuation is the one lever that measurably changes delivery.
 *
 * Three tones rather than one on purpose: how the reference is read carries
 * into how the clone sounds. Someone recording a calm narrator voice and
 * someone recording an energetic one should not be reading the same paragraph.
 */
export const SCRIPTS: Script[] = [
  {
    id: "narrador",
    tone: "Calmado, de narración",
    text:
      "Hoy quiero contar algo sencillo, sin apuro. Trabajé varios años en esto y " +
      "todavía me sorprende: cada proyecto trae su propio ritmo, sus urgencias, su " +
      "manera de fallar. ¿Qué aprendí? Que la calma se construye. Empiezo temprano, " +
      "ordeno lo que puedo, y dejo espacio para lo que no anticipé. Lo demás —la " +
      "técnica, las herramientas, el ruido— llega después. Cuando algo sale bien, " +
      "casi siempre es porque alguien se tomó el trabajo de escuchar primero.",
  },
  {
    id: "conversacional",
    tone: "Cercano, como hablando con alguien",
    text:
      "Mira, te lo explico rápido y me dices si tiene sentido. La idea original era " +
      "otra, bastante más grande, pero se cayó sola en la primera semana. ¿Sabes qué " +
      "pasó? Que nadie la necesitaba. Entonces la achicamos: un problema, una " +
      "pantalla, cero adornos. Y ahí sí empezó a funcionar. Llevo unos meses usándola " +
      "todos los días y ya no me imagino volviendo atrás. Si quieres la vemos juntos " +
      "mañana, con calma, y me cuentas qué le falta.",
  },
  {
    id: "informativo",
    tone: "Neutro, de locución o tutorial",
    text:
      "El proceso tiene tres etapas, y conviene respetarlas en orden. Primero se reúne " +
      "el material: grabaciones, referencias y cualquier archivo que sirva de guía. " +
      "Segundo, se revisa la calidad —ruido de fondo, volumen irregular, cortes bruscos— " +
      "y se descarta toda señal que no llegue al mínimo. Tercero, se genera el resultado " +
      "y se compara con el original. ¿Cuánto demora? Depende del equipo, pero rara vez " +
      "pasa de unos minutos. Al terminar, guarda una copia antes de seguir.",
  },
];

/** Where the recorded clip lands. `blob` is a real audio/wav. */
export type Recording = {
  blob: Blob;
  seconds: number;
  /** For the review player. Revoke it when done. */
  url: string;
};

/**
 * The bound the engine uses. Recording longer is allowed — it does no harm and
 * a reader who overruns is not doing anything wrong — but the UI says what is
 * actually used, rather than cutting somebody off mid-sentence.
 */
export const USED_SECONDS = 30;

/** Recording past this is pointless, so it stops on its own. */
export const HARD_LIMIT_SECONDS = 180;

export class MicrophoneError extends Error {
  /** True when the user (or the OS) refused, which no retry will fix. */
  readonly denied: boolean;

  // Written out rather than as a TypeScript parameter property: the test runner
  // strips types instead of compiling them, and a parameter property is code,
  // not a type — it would leave the field undefined at runtime.
  constructor(message: string, denied: boolean) {
    super(message);
    this.denied = denied;
  }
}

/** Ask for the microphone, turning the platform's errors into ours. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError(
      "Este navegador no permite grabar desde la app. Sube un archivo de audio.",
      true,
    );
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        // A reference clip wants the voice as it is. Aggressive cleanup is
        // meant for calls, and it can smear exactly the timbre being cloned.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (cause) {
    const name = (cause as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicrophoneError(
        "El navegador no dio permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y prueba otra vez.",
        true,
      );
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new MicrophoneError("No encontré ningún micrófono conectado.", true);
    }
    if (name === "NotReadableError") {
      throw new MicrophoneError(
        "Otro programa está usando el micrófono. Ciérralo y prueba otra vez.",
        false,
      );
    }
    throw new MicrophoneError("No se pudo abrir el micrófono.", false);
  }
}

/** Stop every track, which is what actually turns the recording light off. */
export function closeMicrophone(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Decode whatever the browser recorded and re-encode it as 16-bit PCM wav.
 *
 * Mono: channels are averaged rather than one being dropped, so a stream that
 * happened to arrive in stereo does not lose half its energy.
 */
export async function blobToWav(blob: Blob): Promise<Recording> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const wav = encodeWav(mixToMono(decoded), decoded.sampleRate);
    return {
      blob: wav,
      seconds: decoded.duration,
      url: URL.createObjectURL(wav),
    };
  } finally {
    // An AudioContext left open holds the audio hardware awake.
    await context.close().catch(() => {});
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    mono[i] = sum / channels.length;
  }
  return mono;
}

/** A canonical 44-byte RIFF header followed by little-endian 16-bit samples. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    // Clamp before scaling: a sample above 1.0 would wrap around and land as
    // the opposite extreme, which is heard as a click rather than as clipping.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([bytes], { type: "audio/wav" });
}

/** Name the file after the moment, so two recordings never collide. */
export function recordingFile(recording: Recording, stamp = new Date()): File {
  const pad = (n: number) => String(n).padStart(2, "0");
  const name =
    `grabacion-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}` +
    `-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.wav`;
  return new File([recording.blob], name, { type: "audio/wav" });
}

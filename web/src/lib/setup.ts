/**
 * El portal de configuración: qué le falta a esta máquina para usar la app.
 *
 * La verdad la calcula `execution/auditar_host.py --app`, que es el ÚNICO
 * auditor del proyecto (ADR-008 D2). Este módulo solo lo invoca y comprueba
 * que lo que vuelve tiene la forma prometida.
 *
 * ESTE MÓDULO NO TOCA EL SISTEMA, Y NO PUEDE. El navegador lo importa —
 * `SetupGate` decide con él si el portal se abre— así que una sola línea que
 * traiga `child_process` rompe la compilación entera. Quien corre el auditor es
 * la ruta del servidor. Lo aprendimos con la compilación en rojo, no de
 * memoria.
 *
 * POR QUÉ SE VALIDA A MANO Y NO CON UNA LIBRERÍA: el proyecto no usa Zod en
 * ninguna parte, y la forma que cruza esta frontera es fija y pequeña. Añadir
 * una dependencia para un solo sitio iba en contra del encargo explícito de
 * que el portal fuera lo más simple posible. Lo que NO se negocia es que nada
 * entre como `any`: todo llega como `unknown` y se estrecha.
 */

/**
 * Tres estados, y el tercero no es decorativo (ADR-008 D5).
 *
 * `no_verificable` existe porque con el motor apagado no se pueden comprobar
 * sus nodos, y decir «falta» ahí mandaría al usuario a reinstalar algo que ya
 * tiene. Se intentó recortar a dos estados y se deshizo por esta razón.
 */
export type EstadoRequisito = "instalada" | "falta" | "no_verificable";

export type Requisito = {
  id: string;
  titulo: string;
  /** Para qué sirve, dicho al usuario, no al programador. */
  para_que: string;
  /** Si falta, ¿la app sirve de algo? */
  bloquea: boolean;
  /** ¿Puede el portal resolverlo, o solo explicarlo? */
  instalable: boolean;
  tipo: string | null;
  estado: EstadoRequisito;
  /** Por qué se dice lo que se dice. `null` cuando no hace falta explicar. */
  detalle: string | null;
  /** Cuánto habría que descargar. 0 si no falta nada. */
  mb: number;
  /** Qué se pierde si no está. Solo tiene sentido en lo que no bloquea. */
  sin_esto: string | null;
  /** Qué hacer a mano, para lo que el portal no instala. */
  guia: string | null;
  nota: string | null;
};

export type InformeSetup = {
  workspace: string | null;
  comfyui_url: string | null;
  comfyui_corriendo: boolean;
  disco_libre_mb: number | null;
  requisitos: Requisito[];
};

const ESTADOS: readonly EstadoRequisito[] = ["instalada", "falta", "no_verificable"];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Un estado desconocido se lee como `no_verificable`, nunca como `instalada`.
 *
 * La dirección del fallo importa: leer mal y decir «está» produce una app que
 * promete lo que no puede cumplir; decir «no se pudo comprobar» solo produce
 * una frase honesta.
 */
function estado(v: unknown): EstadoRequisito {
  return ESTADOS.includes(v as EstadoRequisito) ? (v as EstadoRequisito) : "no_verificable";
}

function aRequisito(v: unknown): Requisito | null {
  if (!esObjeto(v) || typeof v.id !== "string" || v.id.length === 0) return null;
  return {
    id: v.id,
    titulo: texto(v.titulo) || v.id,
    para_que: texto(v.para_que),
    bloquea: v.bloquea === true,
    instalable: v.instalable === true,
    tipo: textoOpcional(v.tipo),
    estado: estado(v.estado),
    detalle: textoOpcional(v.detalle),
    mb: numero(v.mb),
    sin_esto: textoOpcional(v.sin_esto),
    guia: textoOpcional(v.guia),
    nota: textoOpcional(v.nota),
  };
}

export function aInforme(v: unknown): InformeSetup {
  if (!esObjeto(v)) {
    return {
      workspace: null,
      comfyui_url: null,
      comfyui_corriendo: false,
      disco_libre_mb: null,
      requisitos: [],
    };
  }
  const crudos = Array.isArray(v.requisitos) ? v.requisitos : [];
  return {
    workspace: textoOpcional(v.workspace),
    comfyui_url: textoOpcional(v.comfyui_url),
    comfyui_corriendo: v.comfyui_corriendo === true,
    disco_libre_mb: typeof v.disco_libre_mb === "number" ? v.disco_libre_mb : null,
    requisitos: crudos.map(aRequisito).filter((r): r is Requisito => r !== null),
  };
}

/** Lo que impide usar la app, que es distinto de lo que falta. */
export function bloqueantes(informe: InformeSetup): Requisito[] {
  return informe.requisitos.filter((r) => r.bloquea && r.estado === "falta");
}

/**
 * ¿Hay que abrir el portal solo, sin que nadie lo pida?
 *
 * Solo por lo que BLOQUEA, y solo cuando de verdad falta. `no_verificable` no
 * abre nada: interrumpir a alguien porque no pudimos comprobar algo es cobrarle
 * a él nuestra ignorancia (ADR-008 D8).
 */
export function debeAbrirse(informe: InformeSetup): boolean {
  return bloqueantes(informe).length > 0;
}

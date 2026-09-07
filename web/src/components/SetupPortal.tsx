"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EstadoRequisito, InformeSetup, Requisito } from "@/lib/setup";

/**
 * Lo que le falta a esta máquina, y el camino para resolverlo.
 *
 * POR QUÉ INTERRUMPE
 *   El suelo de calidad prohíbe un modal para una tarea que no necesita ni
 *   interrupción ni foco protegido. Esta la necesita: sin las dependencias que
 *   bloquean, la pantalla de generación es un formulario que no puede generar
 *   nada. Enseñarla sería prometer lo que la app no puede cumplir, que es lo
 *   que el segundo principio del producto prohíbe. Solo se abre sola por lo que
 *   BLOQUEA; lo opcional se mira cuando uno quiere.
 *
 * POR QUÉ AQUÍ SÍ HAY UN PORCENTAJE
 *   El producto prohíbe el porcentaje inventado, y con razón: el motor de voz
 *   no sabe por dónde va. Una descarga sí — son bytes en disco contra un total
 *   conocido. El número es medido, no estimado, y por eso se pinta.
 *
 * LO QUE ESTA PANTALLA NO SE CREE
 *   Que el instalador diga que fue bien no significa que algo quedó instalado
 *   (ADR-008 D6). Al terminar, esto vuelve a auditar y pinta lo que la
 *   auditoría ve, no lo que el instalador dijo.
 */

type Progreso = {
  pct: number;
  mbHechos: number;
  mbTotal: number;
  mensaje: string | null;
};

type Resultado = { ok: boolean; mensaje: string };

const TITULO_ID = "portal-setup-titulo";

/** Un mapa sin una clave. Sin descartar a una variable que nadie lee. */
function sinLaClave<T>(mapa: Record<string, T>, clave: string): Record<string, T> {
  return Object.fromEntries(Object.entries(mapa).filter(([k]) => k !== clave));
}

/* -------------------------------------------------------------------------
   Iconos. Dibujados, no glifos: un emoji no es un sistema de iconos.
   Un solo grosor de trazo para los tres.
   ---------------------------------------------------------------------- */

function Icono({ estado }: { estado: EstadoRequisito }) {
  const comun = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (estado === "instalada") {
    return (
      <svg {...comun}>
        <path d="M3.5 8.5 6.5 11.5 12.5 5" />
      </svg>
    );
  }
  if (estado === "falta") {
    return (
      <svg {...comun}>
        <circle cx="8" cy="8" r="5.25" />
        <path d="M8 5.5v3.25" />
        <path d="M8 10.75h.01" />
      </svg>
    );
  }
  // no_verificable: una raya, no una alarma. No sabemos, que no es lo mismo
  // que "está mal" — y pintarlo como error mandaría a reinstalar lo que ya está.
  return (
    <svg {...comun}>
      <circle cx="8" cy="8" r="5.25" strokeDasharray="2.2 2.2" />
      <path d="M5.75 8h4.5" />
    </svg>
  );
}

/* ---------------------------------------------------------------------- */

function Barra({ progreso }: { progreso: Progreso }) {
  const conTotal = progreso.mbTotal > 0;
  return (
    <div className="mt-3">
      <div
        className="h-1 w-full overflow-hidden rounded-sm bg-surface-raised"
        role="progressbar"
        aria-valuenow={conTotal ? progreso.pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de la instalación"
      >
        <div
          className="h-full rounded-sm bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${Math.max(2, progreso.pct)}%` }}
        />
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-ink-muted">
        {conTotal
          ? `${progreso.mbHechos} de ${progreso.mbTotal} MB · ${progreso.pct}%`
          : (progreso.mensaje ?? "Trabajando…")}
      </p>
    </div>
  );
}

function Fila({
  req,
  progreso,
  resultado,
  ocupado,
  onInstalar,
}: {
  req: Requisito;
  progreso: Progreso | null;
  resultado: Resultado | null;
  ocupado: boolean;
  onInstalar: (id: string) => void;
}) {
  const falta = req.estado === "falta";
  // El color de aviso se reserva para lo que impide usar la app. Todo lo demás
  // —incluido lo que falta pero es opcional— se dice en calma.
  const tono = falta && req.bloquea ? "text-accent-text" : "text-ink-muted";

  return (
    <li className="border-t border-hairline/60 py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${tono}`}>
          <Icono estado={req.estado} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-[15px] leading-snug text-ink">{req.titulo}</h3>
            {falta && req.mb > 0 && (
              <span className="font-mono text-[11px] text-ink-muted">
                {(req.mb / 1024).toFixed(1)} GB
              </span>
            )}
          </div>

          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-muted">
            {req.para_que}
          </p>

          {req.estado === "no_verificable" && req.detalle && (
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              {req.detalle}
            </p>
          )}

          {falta && !req.bloquea && req.sin_esto && (
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              {req.sin_esto}
            </p>
          )}

          {falta && !req.instalable && req.guia && (
            <p className="mt-2 max-w-prose rounded-md bg-surface-raised px-3 py-2 text-[13px] leading-relaxed text-ink">
              {req.guia}
            </p>
          )}

          {progreso && <Barra progreso={progreso} />}

          {resultado && !progreso && (
            <p
              className={`mt-2 max-w-prose text-[13px] leading-relaxed ${
                resultado.ok ? "text-ink" : "text-accent-text"
              }`}
            >
              {resultado.mensaje}
            </p>
          )}
        </div>

        {falta && req.instalable && !progreso && (
          <button
            type="button"
            onClick={() => onInstalar(req.id)}
            disabled={ocupado}
            className="shrink-0 rounded-md border border-accent/45 bg-accent-soft px-3 py-1.5 text-[13px] text-accent-text transition-colors duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-accent/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Instalar
          </button>
        )}
      </div>
    </li>
  );
}

function Grupo({
  titulo,
  nota,
  requisitos,
  progresos,
  resultados,
  ocupado,
  onInstalar,
}: {
  titulo: string;
  nota: string;
  requisitos: Requisito[];
  progresos: Record<string, Progreso>;
  resultados: Record<string, Resultado>;
  ocupado: boolean;
  onInstalar: (id: string) => void;
}) {
  if (requisitos.length === 0) return null;
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="text-[13px] text-ink">{titulo}</h2>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-muted">{nota}</p>
      <ul className="mt-3">
        {requisitos.map((r) => (
          <Fila
            key={r.id}
            req={r}
            progreso={progresos[r.id] ?? null}
            resultado={resultados[r.id] ?? null}
            ocupado={ocupado}
            onInstalar={onInstalar}
          />
        ))}
      </ul>
    </section>
  );
}

export default function SetupPortal({
  informe,
  disponible,
  motivo,
  bloqueante,
  onCerrar,
  onReauditar,
}: {
  informe: InformeSetup;
  disponible: boolean;
  motivo: string | null;
  /** Si bloquea, no se puede cerrar: detrás no hay nada que funcione. */
  bloqueante: boolean;
  onCerrar: () => void;
  onReauditar: () => Promise<void>;
}) {
  const [progresos, setProgresos] = useState<Record<string, Progreso>>({});
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [comprobando, setComprobando] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const ocupado = Object.keys(progresos).length > 0 || comprobando;

  useEffect(() => {
    panel.current?.focus();
  }, []);

  useEffect(() => {
    if (bloqueante) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [bloqueante, ocupado, onCerrar]);

  const reauditar = useCallback(async () => {
    setComprobando(true);
    try {
      await onReauditar();
    } finally {
      setComprobando(false);
    }
  }, [onReauditar]);

  const instalar = useCallback(
    async (id: string) => {
      setResultados((r) => sinLaClave(r, id));
      setProgresos((p) => ({ ...p, [id]: { pct: 0, mbHechos: 0, mbTotal: 0, mensaje: null } }));

      try {
        const respuesta = await fetch("/api/setup/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });

        if (!respuesta.ok || !respuesta.body) {
          throw new Error("El instalador no arrancó");
        }

        // NDJSON: se lee por líneas, y la última línea parcial se guarda para
        // el siguiente trozo. Sin esto, un mensaje partido en dos paquetes se
        // pierde y la barra se queda quieta sin motivo.
        const lector = respuesta.body.getReader();
        const decoder = new TextDecoder();
        let resto = "";
        let ultimo: Resultado | null = null;

        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          resto += decoder.decode(value, { stream: true });
          const lineas = resto.split("\n");
          resto = lineas.pop() ?? "";

          for (const linea of lineas) {
            if (!linea.trim()) continue;
            let novedad: Record<string, unknown>;
            try {
              novedad = JSON.parse(linea) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (novedad.tipo === "inicio" || novedad.tipo === "progreso") {
              setProgresos((p) => ({
                ...p,
                [id]: {
                  pct: typeof novedad.pct === "number" ? novedad.pct : (p[id]?.pct ?? 0),
                  mbHechos:
                    typeof novedad.mb_hechos === "number"
                      ? novedad.mb_hechos
                      : (p[id]?.mbHechos ?? 0),
                  mbTotal:
                    typeof novedad.mb_total === "number"
                      ? novedad.mb_total
                      : (p[id]?.mbTotal ?? 0),
                  mensaje:
                    typeof novedad.mensaje === "string" ? novedad.mensaje : (p[id]?.mensaje ?? null),
                },
              }));
            } else if (novedad.tipo === "fin") {
              ultimo = {
                ok: novedad.ok === true,
                mensaje:
                  typeof novedad.mensaje === "string" ? novedad.mensaje : "Terminó sin decir cómo",
              };
            }
          }
        }

        setResultados((r) => ({
          ...r,
          [id]: ultimo ?? { ok: false, mensaje: "El instalador terminó sin dar un veredicto" },
        }));
      } catch (e) {
        setResultados((r) => ({
          ...r,
          [id]: {
            ok: false,
            mensaje:
              e instanceof Error && e.message
                ? `${e.message}. Se puede reintentar.`
                : "Se cortó la instalación. Se puede reintentar.",
          },
        }));
      } finally {
        setProgresos((p) => sinLaClave(p, id));
        // D6: la única fuente de verdad es mirar otra vez, no lo que dijo el
        // instalador. Aunque haya fallado — puede haber dejado algo hecho.
        await reauditar();
      }
    },
    [reauditar],
  );

  const bloquean = informe.requisitos.filter((r) => r.bloquea);
  const opcionales = informe.requisitos.filter((r) => !r.bloquea);
  const faltanBloqueantes = bloquean.filter((r) => r.estado === "falta").length;

  const titular = !disponible
    ? "No se pudo comprobar qué hay instalado"
    : faltanBloqueantes === 0
      ? "Todo lo imprescindible está puesto"
      : faltanBloqueantes === 1
        ? "Falta una cosa para poder generar voz"
        : `Faltan ${faltanBloqueantes} cosas para poder generar voz`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/80 px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITULO_ID}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="w-full max-w-[38rem] rounded-xl border border-hairline/70 bg-surface p-7 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.7)] outline-none"
      >
        <h1 id={TITULO_ID} className="text-[19px] leading-snug text-ink">
          {titular}
        </h1>

        {!disponible ? (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-muted">
            La comprobación necesita Python, y no se pudo ejecutar
            {motivo ? `: ${motivo}` : ""}. La app sigue funcionando; lo que no se
            puede es decirte qué falta.
          </p>
        ) : (
          <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-muted">
            Esto corre entero en tu máquina, así que hace falta tener el motor y
            sus modelos aquí. Lo que se pueda instalar desde aquí, se instala.
          </p>
        )}

        {/* Lo que pasa mientras se instala también se dice a quien no ve la
            barra: es un producto de audio, pero la regla vale en las dos
            direcciones. */}
        <p className="sr-only" aria-live="polite">
          {Object.entries(progresos)
            .map(([id, p]) => `${id}: ${p.pct}%`)
            .join(", ")}
        </p>

        <Grupo
          titulo="Imprescindible"
          nota="Sin esto la app no puede generar voz."
          requisitos={bloquean}
          progresos={progresos}
          resultados={resultados}
          ocupado={ocupado}
          onInstalar={instalar}
        />

        <Grupo
          titulo="Opcional"
          nota="La app funciona sin esto; cada cosa añade una capacidad."
          requisitos={opcionales}
          progresos={progresos}
          resultados={resultados}
          ocupado={ocupado}
          onInstalar={instalar}
        />

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-hairline/60 pt-5">
          <button
            type="button"
            onClick={reauditar}
            disabled={ocupado}
            className="text-[13px] text-ink-muted transition-colors duration-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {comprobando ? "Comprobando…" : "Volver a comprobar"}
          </button>

          {!bloqueante && (
            <button
              type="button"
              onClick={onCerrar}
              disabled={ocupado}
              className="ml-auto rounded-md border border-hairline bg-surface-raised px-4 py-2 text-[13px] text-ink transition-colors duration-200 hover:border-hairline/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuar a la app
            </button>
          )}
        </div>

        {bloqueante && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
            Esta pantalla no se puede cerrar todavía: sin lo de arriba, detrás no
            hay nada que funcione.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import SetupPortal from "@/components/SetupPortal";
import { aInforme, bloqueantes, debeAbrirse, type InformeSetup } from "@/lib/setup";

/**
 * El control de configuración, y el panel que abre.
 *
 * Son la misma pieza porque comparten un estado que no le importa a nadie más:
 * qué le falta a esta máquina. Vive en la cabecera, al lado del aviso de salud
 * del motor, porque las dos cosas contestan a la misma pregunta — «¿está la
 * máquina en condiciones?» — y separarlas obligaría al usuario a mirar en dos
 * sitios para responderla.
 *
 * SE ABRE DE DOS MANERAS, Y NO SON IGUALES (ADR-008 D8):
 *   - **Sola**, al arrancar, solo si falta algo que IMPIDE generar. Ahí no se
 *     puede cerrar: detrás no hay nada que funcione, y enseñarlo sería prometer
 *     lo que la app no puede cumplir.
 *   - **A mano**, desde el botón, cuando uno quiere. Ahí siempre se puede
 *     cerrar, aunque falte algo: lo abrió el usuario y es suyo.
 *
 * NO BLOQUEA EL ARRANQUE. La app se dibuja mientras esto pregunta. Si la
 * auditoría tarda o falla, lo que pasa es nada, que es lo correcto: una
 * comprobación de entorno no puede ser el motivo de que no se vea la app.
 */

type Consulta = {
  informe: InformeSetup;
  disponible: boolean;
  motivo: string | null;
};

/** Cómo se abrió importa: decide si se puede cerrar. */
type Apertura = null | "sola" | "a-mano";

const VACIO: InformeSetup = {
  workspace: null,
  comfyui_url: null,
  comfyui_corriendo: false,
  disco_libre_mb: null,
  requisitos: [],
};

function IconoAjustes() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.4v1.7M8 12.9v1.7M14.6 8h-1.7M3.1 8H1.4M12.67 3.33l-1.2 1.2M4.53 11.47l-1.2 1.2M12.67 12.67l-1.2-1.2M4.53 4.53l-1.2-1.2" />
    </svg>
  );
}

export default function SetupGate() {
  const [informe, setInforme] = useState<InformeSetup>(VACIO);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [apertura, setApertura] = useState<Apertura>(null);
  /** Una vez cerrado a mano, no se vuelve a abrir solo en esta sesión. */
  const [descartado, setDescartado] = useState(false);

  /**
   * Pide el informe. NO toca estado: solo devuelve lo que llegó.
   *
   * Separado a propósito de quien lo aplica. Un efecto que llama a algo que
   * escribe estado por dentro es un efecto que dispara renders en cascada; con
   * la frontera partida, el `setState` vive donde debe — en el callback que
   * corre cuando la respuesta llega.
   */
  const pedir = useCallback(async (): Promise<Consulta | null> => {
    try {
      const r = await fetch("/api/setup/audit", { cache: "no-store" });
      const cuerpo = (await r.json()) as Record<string, unknown>;
      return {
        informe: aInforme(cuerpo.informe),
        disponible: cuerpo.disponible === true,
        motivo: typeof cuerpo.motivo === "string" ? cuerpo.motivo : null,
      };
    } catch {
      // Silencio deliberado: si ni siquiera se pudo preguntar, la app abre
      // normal. Interrumpir a alguien para decirle que no sabemos nada sería
      // cobrarle nuestra ignorancia.
      return null;
    }
  }, []);

  const aplicar = useCallback((c: Consulta | null, abrirSiHaceFalta: boolean) => {
    if (c === null) return;
    setInforme(c.informe);
    setDisponible(c.disponible);
    setMotivo(c.motivo);
    if (abrirSiHaceFalta && debeAbrirse(c.informe)) setApertura("sola");
  }, []);

  useEffect(() => {
    let vivo = true;
    void pedir().then((c) => {
      if (vivo) aplicar(c, true);
    });
    return () => {
      vivo = false;
    };
  }, [pedir, aplicar]);

  const reauditar = useCallback(async () => {
    aplicar(await pedir(), false);
  }, [pedir, aplicar]);

  /** Al abrirlo a mano se vuelve a mirar: el informe puede ser de hace rato. */
  const abrirAMano = useCallback(() => {
    setApertura("a-mano");
    void reauditar();
  }, [reauditar]);

  const faltanBloqueantes = bloqueantes(informe).length;
  const faltaAlgo = informe.requisitos.some((r) => r.estado === "falta");

  return (
    <>
      <button
        type="button"
        onClick={abrirAMano}
        aria-label={
          faltanBloqueantes > 0
            ? "Configuración — falta algo imprescindible"
            : faltaAlgo
              ? "Configuración — hay algo opcional sin instalar"
              : "Configuración"
        }
        title="Qué necesita esta máquina"
        className="relative rounded-full border border-hairline p-2 text-ink-muted transition-colors duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:border-hairline/80 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <IconoAjustes />
        {/* Un punto, no un número ni una alarma. Dice «hay algo que mirar», y
            solo se pone en color de aviso cuando lo que falta impide generar;
            lo opcional se señala en calma. */}
        {faltaAlgo && (
          <span
            aria-hidden="true"
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
              faltanBloqueantes > 0 ? "bg-accent" : "bg-ink-muted"
            }`}
          />
        )}
      </button>

      {apertura !== null && (
        <SetupPortal
          informe={informe}
          disponible={disponible}
          motivo={motivo}
          // Solo la apertura automática se queda enganchada. Si lo abriste tú,
          // puedes cerrarlo aunque falte algo.
          bloqueante={apertura === "sola" && !descartado && faltanBloqueantes > 0}
          onCerrar={() => {
            if (apertura === "sola") setDescartado(true);
            setApertura(null);
          }}
          onReauditar={reauditar}
        />
      )}
    </>
  );
}

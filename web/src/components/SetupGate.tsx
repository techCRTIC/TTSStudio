"use client";

import { useCallback, useEffect, useState } from "react";

import SetupPortal from "@/components/SetupPortal";
import { aInforme, bloqueantes, debeAbrirse, type InformeSetup } from "@/lib/setup";

/**
 * Quien decide si el portal se abre solo (ADR-008 D8).
 *
 * Vive en el layout, no en `page.tsx`, para no meter 988 líneas de la pantalla
 * de generación en una decisión que no es suya. Monta, pregunta una vez, y en
 * el caso normal — todo instalado — no pinta nada y desaparece.
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

const VACIO: InformeSetup = {
  workspace: null,
  comfyui_url: null,
  comfyui_corriendo: false,
  disco_libre_mb: null,
  requisitos: [],
};

export default function SetupGate() {
  const [informe, setInforme] = useState<InformeSetup>(VACIO);
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
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
    if (abrirSiHaceFalta && debeAbrirse(c.informe)) setAbierto(true);
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

  if (!abierto) return null;

  const bloqueante = !descartado && bloqueantes(informe).length > 0;

  return (
    <SetupPortal
      informe={informe}
      disponible={disponible}
      motivo={motivo}
      bloqueante={bloqueante}
      onCerrar={() => {
        setDescartado(true);
        setAbierto(false);
      }}
      onReauditar={reauditar}
    />
  );
}

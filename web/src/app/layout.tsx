import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TTS Studio",
  description: "Genera voz clonada desde texto, en tu propia máquina.",
};

/**
 * The direction contract, emitted as a real HTML comment.
 *
 * A JSX comment would NOT survive the build — React never renders them — and a
 * contract the build erases is a contract nobody can audit. So it ships through
 * dangerouslySetInnerHTML, as the first child of <body>, and `npm run build`
 * followed by a grep for the seed key is what proves it is still there.
 */
const DIRECTION_CONTRACT = `<!--
  THESIS: One focal stage carrying the take you are judging, with the script and
  past takes in a drawer that stays shut. It refuses the dashboard-of-panels
  every generation tool ships, because the job is not monitoring — it is hearing
  one thing and deciding about it.

  OWN-WORLD: A dark spinoff of CRTIC clean. Graphite grounds #151517 to #232327
  where surfaces step UP toward the light; elevation is a lighter surface plus a
  1px rim, never a shadow. Geist Sans and Mono, one incandescent orange #FA4515,
  an audio field of sine-sum curves on a hairline grid behind everything.

  STORY: He writes a line, picks a voice, hears it, and decides whether to keep
  it or say it again differently.

  FIRST VIEWPORT: The stage centered on the field — text above, its waveform
  below, one orange action at the lower right. The drawer tab waits at the right
  edge. Nothing else competes.

  FORM: Stage + tray, candidate 5 of the ordered list, seed 5006a149.

  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}

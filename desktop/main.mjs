/**
 * TTS Studio as a desktop app (ADR-009).
 *
 * WHAT THIS PROCESS OWNS
 *   1. Deciding the port — once, and then keeping it forever (D4).
 *   2. Starting the Next server as a child, and making sure it dies (D5).
 *   3. Telling the app where the project lives, instead of letting it guess (D6).
 *   4. The engine: bringing ComfyUI up and watching it, via the shared module
 *      that `npm start` also uses (D3). Not a copy — the same file.
 *
 * WHAT IT DOES NOT OWN
 *   Installing ComfyUI, Python or the models. The `.exe` carries only the app
 *   (D2); the setup portal inside it does the rest on first run (ADR-008).
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electron from "electron";

import { crearMotor, matarArbol, responds, waitFor } from "../scripts/engine.mjs";

const { app, BrowserWindow, dialog, shell } = electron;

const EMPAQUETADO = app.isPackaged;

/**
 * Where the app's own files live.
 *
 * Packaged, this is explicit and never inferred: walking up from an install
 * directory looking for a marker is a guess that will be wrong on someone's
 * machine (ADR-009 D6.1).
 */
const RAIZ = EMPAQUETADO
  ? path.join(process.resourcesPath, "app")
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SERVIDOR = path.join(RAIZ, "server", "server.js");

/**
 * El icono de la ventana.
 *
 * No vive con el resto de recursos: `RAIZ` apunta a lo que se instala aparte
 * (el servidor, execution/), mientras que el icono viaja EMPAQUETADO con el
 * proceso principal, porque la ventana lo necesita antes de que nada de lo
 * otro importe.
 */
const RAIZ_ICONO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "recursos",
);

let ventana = null;
let hijo = null;
let latido = null;

/* ─────────────────────────── el puerto, una sola vez ───────────────────── */

/**
 * The port is chosen once and then kept — and this is not tidiness (ADR-009 D4).
 *
 * The take history and the favourites live in `localStorage`
 * (`web/src/lib/history.ts`, `favorites.ts`), and Chromium partitions storage
 * BY ORIGIN — scheme, host AND port. Picking whatever port happened to be free
 * at launch would give the app a different origin each time, and the user would
 * find their history silently empty with nothing to blame.
 */
function archivoPuerto() {
  return path.join(app.getPath("userData"), "puerto.json");
}

function puertoLibre(puerto) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(puerto, "127.0.0.1");
  });
}

async function decidirPuerto() {
  const archivo = archivoPuerto();

  if (existsSync(archivo)) {
    try {
      const guardado = JSON.parse(readFileSync(archivo, "utf8"))?.puerto;
      if (Number.isInteger(guardado) && guardado > 0) return guardado;
    } catch {
      /* archivo ilegible: se elige de nuevo */
    }
  }

  // 3000 primero, para que quien venga de `npm start` conserve su historial.
  for (const candidato of [3000, 3001, 3002, 3003, 4310, 4311, 4312]) {
    if (await puertoLibre(candidato)) {
      try {
        writeFileSync(archivo, JSON.stringify({ puerto: candidato }, null, 2), "utf8");
      } catch {
        // Si no se puede guardar, la app funciona hoy y mañana estrena
        // historial. Es un fallo que hay que ver, no uno que se traga.
        console.error("No pude recordar el puerto; el historial no sobrevivirá al reinicio.");
      }
      return candidato;
    }
  }
  return 3000;
}

/* ───────────────────────────── el servidor Next ─────────────────────────── */

/**
 * Next runs as a CHILD of Electron, not inside it.
 *
 * `ELECTRON_RUN_AS_NODE` turns this same binary into a plain Node, so nothing
 * extra ships to run it. The alternative — running the server on Electron's own
 * main thread — makes every slow request freeze the window.
 */
function arrancarServidor(puerto) {
  hijo = spawn(process.execPath, [SERVIDOR], {
    cwd: path.dirname(SERVIDOR),
    windowsHide: true,
    stdio: EMPAQUETADO ? "ignore" : "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(puerto),
      HOSTNAME: "127.0.0.1",
      // D6.1: la app no adivina dónde está; se le dice.
      TTS_PROJECT_ROOT: RAIZ,
    },
  });

  hijo.on("exit", () => {
    hijo = null;
  });
}

/**
 * Three independent ways to kill the server, because on Windows a child does
 * NOT die with its parent (ADR-009 D5). An orphan here is not cosmetic: it
 * keeps the port, and the next launch finds its own history behind a stranger.
 */
function matarServidor() {
  if (hijo?.pid) matarArbol(hijo.pid);
  hijo = null;
  if (latido) {
    clearInterval(latido);
    latido = null;
  }
}

app.on("window-all-closed", () => {
  matarServidor();
  app.quit();
});
app.on("before-quit", matarServidor);
process.on("exit", matarServidor);

/* ────────────────────────────────── ventana ─────────────────────────────── */

function crearVentana(url) {
  ventana = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    // El mismo gris de la app: sin esto, el arranque enseña un rectángulo
    // blanco antes de pintar, que en una interfaz oscura se ve como un fogonazo.
    backgroundColor: "#151517",
    // El icono de la VENTANA y de la barra de tareas mientras corre. El que
    // pone electron-builder es el del ejecutable; este es el de la ventana, y
    // sin él Windows enseña el de Electron por defecto.
    icon: path.join(RAIZ_ICONO, "icon.ico"),
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  ventana.once("ready-to-show", () => ventana?.show());
  ventana.on("closed", () => {
    ventana = null;
  });

  // Un enlace externo abre el navegador, no se traga la ventana de la app.
  ventana.webContents.setWindowOpenHandler(({ url: destino }) => {
    void shell.openExternal(destino);
    return { action: "deny" };
  });

  void ventana.loadURL(url);
}

/* ─────────────────────────────────── arranque ───────────────────────────── */

app.whenReady().then(async () => {
  const puerto = await decidirPuerto();
  const appUrl = `http://127.0.0.1:${puerto}`;

  if (!existsSync(SERVIDOR)) {
    dialog.showErrorBox(
      "Falta el servidor de la app",
      `No encuentro ${SERVIDOR}.\n\nLa instalación parece incompleta: vuelve a instalar TTS Studio.`,
    );
    app.quit();
    return;
  }

  const motor = crearMotor({ appUrl, port: puerto });

  arrancarServidor(puerto);

  const listo = await waitFor(() => responds(`${appUrl}/api/voices`, 1500), {
    budgetMs: 60_000,
    everyMs: 400,
  });

  if (!listo) {
    dialog.showErrorBox(
      "La app no arrancó",
      `El servidor no respondió en ${appUrl} después de un minuto.\n\n` +
        "Cierra TTS Studio y vuelve a abrirlo. Si sigue igual, puede que otro " +
        "programa esté usando ese puerto.",
    );
    matarServidor();
    app.quit();
    return;
  }

  crearVentana(appUrl);

  // El motor se levanta y se vigila DESPUÉS de que la ventana esté en pie: un
  // arranque en frío de ComfyUI tarda hasta dos minutos, y hacerlo antes
  // dejaría al usuario mirando una pantalla vacía sin saber por qué.
  void motor.ensureComfy();
  latido = motor.watchComfy();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && hijo !== null) {
    void decidirPuerto().then((p) => crearVentana(`http://127.0.0.1:${p}`));
  }
});

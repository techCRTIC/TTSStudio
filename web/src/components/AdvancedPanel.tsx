"use client";

import { useId, useState } from "react";
import {
  LANGUAGES,
  TOKEN_PRESETS,
  TOKENS_DEFAULT,
  type Language,
} from "@/lib/tts";
import { Select } from "./Select";
import { excerptOf, forgetSeed, saveSeed, useSavedSeeds, type SavedSeed } from "@/lib/favorites";

/**
 * The engine's real knobs, folded away until asked for.
 *
 * Three controls, because the node exposes three (nodes.py:702-719). Anything
 * else on this panel would be a promise the engine cannot keep.
 *
 * Folded by default: the loop is write → generate → listen, and a settings rack
 * sitting open above it taxes every ordinary generation for the sake of the
 * rare one.
 */

export type AdvancedState = {
  /** null = a fresh seed per generation. A number = pinned. */
  seed: number | null;
  language: Language;
  maxNewTokens: number;
};

export const ADVANCED_DEFAULTS: AdvancedState = {
  seed: null,
  language: "Spanish",
  maxNewTokens: TOKENS_DEFAULT,
};

/** True when anything differs from the defaults — what earns the dot. */
export function isModified(state: AdvancedState): boolean {
  return (
    state.seed !== null ||
    state.language !== ADVANCED_DEFAULTS.language ||
    state.maxNewTokens !== ADVANCED_DEFAULTS.maxNewTokens
  );
}

function DiceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.5" cy="5.5" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 7V4.5a3.5 3.5 0 0 1 7 0V7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        // An open padlock swings its shackle aside; a closed one sits down on
        // the body. One path, two states, no icon swap.
        style={{
          transformOrigin: "11.5px 7px",
          transform: pinned ? "translateX(0)" : "translateX(-2.5px) translateY(-1px)",
          transition: "transform var(--dur-lift) var(--ease-ui)",
        }}
      />
      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.9l1.85 3.75 4.14.6-3 2.92.71 4.12L8 11.35l-3.7 1.94.7-4.12-2.99-2.92 4.14-.6L8 1.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform var(--dur-lift) var(--ease-ui)",
      }}
    >
      <path
        d="M2 3.75 5 6.75l3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AdvancedPanel({
  state,
  onChange,
  lastSeed,
  lastText,
  lastVoiceLabel,
}: {
  state: AdvancedState;
  onChange: (next: AdvancedState) => void;
  /** The seed of the take on screen — what "save this one" refers to. */
  lastSeed: number | null;
  lastText: string;
  lastVoiceLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // Which chip is being named right now. A saved seed is created immediately
  // and named in place — never through window.prompt, which is the browser's
  // own modal and the exact kind of borrowed chrome the voice picker was
  // rebuilt to avoid.
  const [naming, setNaming] = useState<number | null>(null);
  const saved = useSavedSeeds();
  const panelId = useId();
  const seedFieldId = useId();
  const langId = useId();
  const tokensId = useId();

  const pinned = state.seed !== null;
  const savedLast = lastSeed !== null && saved.some((s) => s.seed === lastSeed);

  const pin = (seed: number) => onChange({ ...state, seed });
  const unpin = () => onChange({ ...state, seed: null });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted transition-colors duration-200 hover:text-ink"
      >
        Avanzado
        {isModified(state) && (
          // A quiet mark that something is off-default — otherwise a pinned
          // seed is invisible once this is folded, and every take afterwards
          // is a surprise.
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent"
            aria-label="con ajustes cambiados"
          />
        )}
        <ChevronIcon open={open} />
      </button>

      <div
        id={panelId}
        className="grid"
        inert={!open}
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transitionProperty: "grid-template-rows, opacity",
          transitionDuration: "var(--dur-glide)",
          transitionTimingFunction: "var(--ease-wave)",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="mt-5 grid gap-6 border-t border-hairline pt-5 sm:grid-cols-2">
            {/* --- Seed ------------------------------------------------- */}
            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor={seedFieldId} className="eyebrow">
                  Semilla
                </label>
                <p className="text-[12px] text-ink-muted">
                  {pinned ? "Fija: cada intento sonará igual" : "Nueva en cada intento"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="field flex-1 px-3 py-2" style={{ minWidth: "12rem" }}>
                  <input
                    id={seedFieldId}
                    type="text"
                    inputMode="numeric"
                    value={state.seed ?? ""}
                    placeholder="al azar"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      onChange({ ...state, seed: raw === "" ? null : Number(raw) });
                    }}
                    className="w-full bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-muted"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => (pinned ? unpin() : lastSeed !== null && pin(lastSeed))}
                  disabled={!pinned && lastSeed === null}
                  aria-pressed={pinned}
                  title={
                    pinned
                      ? "Soltar la semilla y volver al azar"
                      : "Fijar la semilla de la última toma"
                  }
                  className={`grid h-10 w-10 place-items-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${
                    pinned
                      ? "border-accent text-accent-text"
                      : "border-hairline text-ink-muted hover:text-ink"
                  }`}
                >
                  <PinIcon pinned={pinned} />
                </button>

                <button
                  type="button"
                  onClick={() => onChange({ ...state, seed: null })}
                  title="Volver al azar en cada intento"
                  className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text"
                >
                  <DiceIcon />
                </button>

                {lastSeed !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      if (savedLast) {
                        forgetSeed(lastSeed);
                        setNaming(null);
                        return;
                      }
                      // Saved first, named second: the click already said
                      // "keep this", so nothing is lost if the naming is
                      // abandoned.
                      saveSeed({
                        seed: lastSeed,
                        label: lastVoiceLabel || String(lastSeed),
                        voiceLabel: lastVoiceLabel,
                        excerpt: excerptOf(lastText),
                      });
                      setNaming(lastSeed);
                    }}
                    aria-pressed={savedLast}
                    title={
                      savedLast
                        ? "Quitar de guardadas"
                        : "Guardar la semilla de la última toma"
                    }
                    className={`grid h-10 w-10 place-items-center rounded-full border transition-colors duration-200 ${
                      savedLast
                        ? "border-accent text-accent-text"
                        : "border-hairline text-ink-muted hover:text-ink"
                    }`}
                  >
                    <StarIcon filled={savedLast} />
                  </button>
                )}
              </div>

              <SavedSeedList
                saved={saved}
                activeSeed={state.seed}
                naming={naming}
                onUse={(seed) => pin(seed)}
                onForget={(seed) => {
                  forgetSeed(seed);
                  setNaming((n) => (n === seed ? null : n));
                }}
                onRename={(seed) => setNaming(seed)}
                onNamed={() => setNaming(null)}
              />
            </div>

            {/* --- Language --------------------------------------------- */}
            <div>
              <span id={langId} className="eyebrow mb-2 block">
                Idioma
              </span>
              {/* The project's own listbox, not a native <select>: this surface
                  replaced that control everywhere precisely so the operating
                  system's popup never lands on top of it. */}
              <Select
                options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
                value={state.language}
                onChange={(l) => onChange({ ...state, language: l as Language })}
                label="Idioma"
                labelledBy={langId}
                variant="field"
                placement="down"
              />
            </div>

            {/* --- Length ceiling --------------------------------------- */}
            <div>
              <span id={tokensId} className="eyebrow mb-2 block">
                Duración máxima
              </span>
              {/* Offered in minutes and seconds, not tokens. The engine counts
                  in tokens and nobody thinks in them; the conversion is a
                  measurement (see TOKENS_PER_SECOND), not a guess. */}
              <Select
                options={TOKEN_PRESETS.map((preset) => ({
                  value: String(preset.tokens),
                  label: preset.label,
                }))}
                value={String(nearestPreset(state.maxNewTokens))}
                onChange={(tokens) => onChange({ ...state, maxNewTokens: Number(tokens) })}
                label="Duración máxima"
                labelledBy={tokensId}
                variant="field"
                placement="down"
              />
              <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                Dónde se detiene el motor, no cuánto va a durar: un texto corto
                da audio corto igualmente. Súbelo solo si un texto largo sale
                cortado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The preset closest to a stored value.
 *
 * The state still carries raw tokens, because that is what the engine takes and
 * what the server validates. This maps whatever is in there onto something the
 * list can actually show — so a value arriving from anywhere else (a default
 * that moved, a future saved setting) selects the nearest offered option
 * instead of leaving the control blank.
 */
function nearestPreset(tokens: number): number {
  return TOKEN_PRESETS.reduce((best, preset) =>
    Math.abs(preset.tokens - tokens) < Math.abs(best.tokens - tokens) ? preset : best,
  ).tokens;
}

const LANGUAGE_LABELS: Record<Language, string> = {
  Auto: "Detectar solo",
  Spanish: "Español",
  English: "Inglés",
  Portuguese: "Portugués",
  Italian: "Italiano",
  French: "Francés",
  German: "Alemán",
  Russian: "Ruso",
  Chinese: "Chino",
  Japanese: "Japonés",
  Korean: "Coreano",
};

function SavedSeedList({
  saved,
  activeSeed,
  naming,
  onUse,
  onForget,
  onRename,
  onNamed,
}: {
  saved: SavedSeed[];
  activeSeed: number | null;
  naming: number | null;
  onUse: (seed: number) => void;
  onForget: (seed: number) => void;
  onRename: (seed: number) => void;
  onNamed: () => void;
}) {
  if (saved.length === 0) {
    return (
      <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
        Cuando una toma suene como querías, guarda su semilla con la estrella y
        podrás volver a ella desde aquí.
      </p>
    );
  }

  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {saved.map((s) => (
        <li key={s.seed}>
          <SeedChip
            // Remounting on the mode flip is what makes SeedChip's initial
            // state correct without an effect syncing prop into state.
            key={naming === s.seed ? "naming" : "idle"}
            entry={s}
            active={s.seed === activeSeed}
            naming={naming === s.seed}
            onUse={() => onUse(s.seed)}
            onForget={() => onForget(s.seed)}
            onRename={() => onRename(s.seed)}
            onNamed={onNamed}
          />
        </li>
      ))}
    </ul>
  );
}

function SeedChip({
  entry,
  active,
  naming,
  onUse,
  onForget,
  onRename,
  onNamed,
}: {
  entry: SavedSeed;
  active: boolean;
  naming: boolean;
  onUse: () => void;
  onForget: () => void;
  onRename: () => void;
  onNamed: () => void;
}) {
  // No effect syncs this from the prop: the caller remounts the chip when the
  // naming mode flips (see the `key` in SavedSeedList), so the initial state IS
  // the current label. Syncing props into state through an effect is the
  // cascade the React Compiler rules exist to prevent.
  const [draft, setDraft] = useState(entry.label);

  const commitName = () => {
    saveSeed({
      seed: entry.seed,
      label: draft.trim() || String(entry.seed),
      voiceLabel: entry.voiceLabel,
      excerpt: entry.excerpt,
    });
    onNamed();
  };

  if (naming) {
    return (
      <span className="field flex items-center rounded-full py-1 pl-3 pr-3">
        <input
          value={draft}
          autoFocus
          // The default name is a suggestion, so typing over it should not mean
          // clearing it first.
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.code === "Enter") commitName();
            if (e.code === "Escape") onNamed();
          }}
          aria-label="Nombre de la semilla"
          className="w-[11rem] bg-transparent text-sm text-ink outline-none"
        />
      </span>
    );
  }

  return (
    <span
      className={`group flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm transition-colors duration-200 ${
        active ? "border-accent text-accent-text" : "border-hairline text-ink-muted hover:text-ink"
      }`}
    >
      <button
        type="button"
        onClick={onUse}
        onDoubleClick={onRename}
        title={`${entry.seed} · ${entry.voiceLabel}${entry.excerpt ? ` · "${entry.excerpt}"` : ""}`}
        className="max-w-[14rem] truncate"
      >
        {entry.label}
      </button>
      <button
        type="button"
        onClick={onRename}
        aria-label={`Renombrar la semilla ${entry.label}`}
        className="grid h-6 w-6 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity duration-200 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M8.2 1.6 10.4 3.8 4.2 10H2v-2.2l6.2-6.2Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onForget}
        aria-label={`Olvidar la semilla ${entry.label}`}
        className="grid h-6 w-6 place-items-center rounded-full text-ink-muted opacity-0 transition-opacity duration-200 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

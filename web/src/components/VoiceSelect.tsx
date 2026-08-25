"use client";

import { Select } from "./Select";

/**
 * The voice picker.
 *
 * The listbox it used to own now lives in ./Select, because a second dropdown
 * (the language one in the advanced panel) needed the same thing and the
 * choice was one accessible listbox or two. This is that listbox with the
 * voice-shaped API kept intact, so nothing that uses it had to change.
 *
 * It opens UPWARDS: it sits near the bottom of the stage, and a panel dropping
 * below it would open off-screen.
 */

export type Voice = { id: string; label: string; kind?: "cloned" | "preset" };

export function VoiceSelect({
  voices,
  value,
  onChange,
  disabled,
}: {
  voices: Voice[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      options={voices.map((voice) => ({
        value: voice.id,
        label: voice.label,
        // The model's own speakers read in the accent and sit under their own
        // heading. The tint is the fast signal; the heading is the one that
        // survives colour blindness and a screen reader. It is printed once
        // rather than on every row because the panel is only as wide as its
        // trigger, and a badge beside each name did not fit.
        ...(voice.kind === "preset"
          ? { tone: "accent" as const, group: "Del modelo" }
          : { group: "Tus voces" }),
      }))}
      value={value}
      onChange={onChange}
      label="Voces"
      emptyLabel="Sin voces"
      disabled={disabled}
      placement="up"
      variant="pill"
    />
  );
}

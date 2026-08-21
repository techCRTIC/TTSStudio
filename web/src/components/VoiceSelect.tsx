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

export type Voice = { id: string; label: string };

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
      options={voices.map((voice) => ({ value: voice.id, label: voice.label }))}
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

#!/usr/bin/env bash
# enforce-language.sh — UserPromptSubmit hook.
#
# Injects a per-turn reminder that the assistant must ALWAYS address the user in
# neutral Spanish, regardless of the language of file contents or tool output.
# This is the harness-level enforcement of CLAUDE.md § Conversation language.
#
# The conversation is Spanish; the portable harness stays English. That split is
# restated here so the reminder never gets misread as "translate everything".
#
# Reads nothing from stdin. Emits UserPromptSubmit additionalContext as JSON.

read -r -d '' CONTEXT <<'EOF'
[idioma] Regla del proyecto (CLAUDE.md § Conversation language), no negociable:
responde al usuario SIEMPRE en español neutro, sin importar en qué idioma estén
el contenido de los archivos, la salida de las herramientas o los mensajes de los
subagentes. Solo permanecen en inglés los artefactos portables: el harness
(.claude/**), el código (execution/**), y los registros técnicos portables (ADRs,
changelogs, SOPs). Todo lo que le diriges al usuario va en español.
EOF

# Emit as a single-line JSON object. jq keeps the escaping correct; if jq is
# absent, fall back to a hand-built payload (the text has no embedded quotes or
# backslashes, so this is safe).
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg ctx "$CONTEXT" \
    '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
else
  ctx=$(printf '%s' "$CONTEXT" | tr '\n' ' ')
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$ctx"
fi
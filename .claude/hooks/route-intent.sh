#!/bin/bash
# UserPromptSubmit hook — Personal AI Dev Studio
# Detects add/edit and design intent in the user's prompt and reminds the
# orchestrator of its standing authorizations (CLAUDE.md § Pipeline
# auto-invocation and § Global skills).
#
# Reads the hook payload JSON on stdin and matches ONLY the user's prompt.
#
# This used to grep the raw payload, on the assumption that the keywords could
# not appear in the other fields. They can: `cwd` and `transcript_path` carry
# the project's own directory name, so a project living in a folder called
# `landing`, `design-system`, or `frontend` would fire the design router on
# EVERY prompt of every session — permanent, invisible prompt bloat. Match the
# prompt, nothing else.

payload=$(cat)

LIB="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/lib/payload.sh"
if [ -f "$LIB" ]; then
    . "$LIB"
else
    payload_field() {
        printf '%s' "$1" \
            | grep -oE "\"${2##*.}\"[[:space:]]*:[[:space:]]*\"(\\\\.|[^\"\\\\])*\"" \
            | head -1 | sed "s/^\"[^\"]*\"[[:space:]]*:[[:space:]]*\"//; s/\"\$//; s/\\\\\"/\"/g"
    }
fi

prompt=$(payload_field "$payload" prompt)

# No prompt extracted -> route nothing. Falling back to the whole payload would
# reintroduce exactly the false-positive class this fix removes.
[ -z "$prompt" ] && exit 0

# Case-insensitive, accent-aware intent keywords (Spanish + English).
if echo "$prompt" | grep -iqE "agreg|a[nñ]ad|implementa|nueva feature|nuevo feature|crea(r)? (un|una|el|la)|edita|modifica|construye|add |implement|build (a|the)|create (a|the)|new feature"; then
  echo "[router] This request looks like an add/edit task. You hold standing authorization (CLAUDE.md) to auto-invoke the pipeline based on task size:"
  echo "  - Non-trivial new feature -> AUTO-INVOKE /team-new-feature (announce it in one line; the user can say 'direct' to skip the pipeline)"
  echo "  - Bug fix -> Bug Fix pattern (qa-tester -> lead -> specialist -> qa-tester)"
  echo "  - Trivial/cosmetic edit -> do it directly, no pipeline."
fi

# Design / frontend intent -> mandatory design skill suite.
# Short tokens (ui, ux, css) need word boundaries — bare "ui" matches inside
# ordinary Spanish words like "quiero" (false positive found 2026-06-10).
if echo "$prompt" | grep -iqE "dise[nñ]|design|\bui\b|\bux\b|ui/ux|frontend|front-end|landing|estilo|style|\bcss\b|tailwind|componente|component|p[aá]gina|website|interfaz|layout|\banima|brand|logo|mockup"; then
  echo "[router] Design/frontend intent detected. HARD RULE (CLAUDE.md + global-skills-map.md):"
  echo "  Engage the mandatory design suite: impeccable, ui-ux-pro-max, emil-design-eng, design-taste-frontend (+ derivatives as applicable)."
  echo "  Subagents do not carry the Skill tool: invoke the skills in the main loop and inject the distilled guidance into their prompts."
fi

exit 0

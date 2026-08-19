#!/bin/sh
# ensure-graphify.sh — idempotent bootstrap for the graphify CLI.
#
# Part of the Overhaul Kit. Any skill that wants graphify runs this AFTER
# getting the user's explicit yes: the script installs software and touches
# the network (uv installer, PyPI), which per the harness's data-protection
# rules always requires fresh consent. The script itself never asks — asking
# is the skill's job; doing is this script's job.
#
# What it does, in order, skipping anything already true:
#   1. graphify already answers            -> done (exit 0)
#   2. uv missing                          -> install uv (official installer)
#   3. graphifyy tool env missing          -> uv tool install graphifyy
#   4. uv's .exe shims blocked (Windows    -> write .cmd + sh wrappers that
#      App Control blocks unsigned            call the tool venv's python.exe
#      trampolines; seen 2026-08-03)          directly; park blocked exes as .bak
#   5. verify graphify --version           -> report, exit 0/1
#
# Idempotent: safe to run repeatedly. POSIX sh; works in Git Bash on Windows
# and on Linux/macOS. No project files are touched — only user-level tooling
# (~/.local/bin and uv's tool dir).

set -u

BIN_DIR="$HOME/.local/bin"
say() { printf '%s\n' "ensure-graphify: $*"; }
have() { command -v "$1" >/dev/null 2>&1; }

is_windows=0
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) is_windows=1 ;;
esac

works() { "$@" --version >/dev/null 2>&1; }

# ---- 1. Already working? -----------------------------------------------------
if works graphify || works "$BIN_DIR/graphify"; then
  say "OK — graphify already available: $( { graphify --version 2>/dev/null || "$BIN_DIR/graphify" --version; } )"
  exit 0
fi

# ---- 2. Ensure uv ------------------------------------------------------------
UV=""
for cand in uv "$BIN_DIR/uv" "$BIN_DIR/uv.exe"; do
  if works "$cand" 2>/dev/null; then UV="$cand"; break; fi
done
if [ -z "$UV" ]; then
  say "uv not found — installing (network: astral.sh)..."
  if [ "$is_windows" = 1 ]; then
    powershell.exe -ExecutionPolicy ByPass -NoProfile -c \
      "irm https://astral.sh/uv/install.ps1 | iex" >/dev/null 2>&1
  else
    curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1
  fi
  for cand in "$BIN_DIR/uv" "$BIN_DIR/uv.exe" uv; do
    if works "$cand" 2>/dev/null; then UV="$cand"; break; fi
  done
  [ -z "$UV" ] && { say "FAIL — could not install uv"; exit 1; }
fi
say "uv: $("$UV" --version)"

# ---- 3. Ensure the graphifyy tool env ---------------------------------------
if ! "$UV" tool list 2>/dev/null | grep -q '^graphifyy'; then
  say "installing graphifyy (network: PyPI)..."
  "$UV" tool install graphifyy >/dev/null 2>&1 || { say "FAIL — uv tool install graphifyy"; exit 1; }
fi

# ---- 4. Shims blocked? Wire wrappers around the tool venv's python ----------
if works "$BIN_DIR/graphify" || works graphify; then
  say "OK — $( { graphify --version 2>/dev/null || "$BIN_DIR/graphify" --version; } )"
  exit 0
fi

TOOLS="$("$UV" tool dir | tr -d '\r')"
if [ "$is_windows" = 1 ]; then
  TOOLS_UNIX="$(cygpath -u "$TOOLS" 2>/dev/null || printf '%s' "$TOOLS")"
  PY="$TOOLS_UNIX/graphifyy/Scripts/python.exe"
else
  PY="$TOOLS/graphifyy/bin/python"
fi
"$PY" -m graphify --version >/dev/null 2>&1 || { say "FAIL — tool env python cannot run graphify ($PY)"; exit 1; }

say "uv shims not runnable (App Control blocks unsigned trampolines) — writing wrappers"
mkdir -p "$BIN_DIR"

# park blocked shims so PATHEXT resolution can't pick them over the wrappers
for exe in graphify graphify-mcp; do
  [ -f "$BIN_DIR/$exe.exe" ] && mv -f "$BIN_DIR/$exe.exe" "$BIN_DIR/$exe.exe.appcontrol-blocked.bak"
done

# sh wrappers (Git Bash / POSIX). printf args are not format strings -> no \t traps.
printf '%s\n' '#!/bin/sh' "exec \"$PY\" -m graphify \"\$@\"" > "$BIN_DIR/graphify"
printf '%s\n' '#!/bin/sh' "exec \"$PY\" -m graphify.serve \"\$@\"" > "$BIN_DIR/graphify-mcp"
chmod +x "$BIN_DIR/graphify" "$BIN_DIR/graphify-mcp"

# .cmd wrappers (PowerShell / cmd), Windows only
if [ "$is_windows" = 1 ]; then
  WPY="$(cygpath -w "$PY" 2>/dev/null || printf '%s' "$PY")"
  printf '%s\r\n' '@echo off' "\"$WPY\" -m graphify %*" > "$BIN_DIR/graphify.cmd"
  printf '%s\r\n' '@echo off' "\"$WPY\" -m graphify.serve %*" > "$BIN_DIR/graphify-mcp.cmd"
fi

# ---- 5. Verify ---------------------------------------------------------------
if works "$BIN_DIR/graphify"; then
  say "OK — $("$BIN_DIR/graphify" --version) (via wrappers in $BIN_DIR)"
  case ":$PATH:" in
    *":$BIN_DIR:"*) : ;;
    *) say "NOTE — add $BIN_DIR to PATH for this shell: export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
  exit 0
fi
say "FAIL — wrappers written but graphify still not runnable"
exit 1

#!/bin/bash
# Claude Code PreToolUse hook (Bash matcher) — Personal AI Dev Studio
# Validates Bash commands before execution.
#
# Outcomes:
#   - exit 0, no output          = allow
#   - exit 2 + stderr            = hard block
#   - exit 0 + JSON on stdout    = soft warning (permissionDecision: "ask" surfaces
#     a confirmation prompt to the user — stderr with exit 0 is invisible in
#     PreToolUse hooks, so warnings MUST go through this JSON channel)

INPUT=$(cat 2>/dev/null)

# Shared payload extraction (.claude/hooks/lib/payload.sh). Guard the source:
# a hook that dies on a missing lib would block every Bash call in a partially
# copied harness.
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

COMMAND=$(payload_field "$INPUT" tool_input.command)

if [ -z "$COMMAND" ]; then
    exit 0
fi

if printf '%s\n' "$COMMAND" | grep -qE 'rm\s+-rf?\s+(/|~|\$HOME)' ; then
    echo "BLOCKED: rm -rf on root or home directory is forbidden." >&2
    exit 2
fi

# --- Rule: no READING secrets through Bash (Data Protection § 1) ---
#
# The Bash deny rules in settings.json are prefix-oriented, so entries like
# Bash(cat *.env*) do not reliably cover `head -c 200 .env`, `sed -n 1p .env`,
# `base64 .env`, or `python -c "print(open('.env').read())"`. Reads are blocked
# HERE, where the check can be semantic rather than a pattern match. The Read
# tool stays covered by the Read(**/.env*) rules in settings.json.
#
# WHY THIS IS A PARSER AND NOT A PAIR OF REGEXES:
# The first version asked "does a secret path appear AND does a reader verb
# appear?". Co-occurrence is not disclosure. It blocked `grep -rn "token.json"
# docs/` (the secret path is the search PATTERN, no secret is read) and even
# `ls -a | head -30 && ls -la .env*` — a `head` in one segment poisoning an `ls`
# in another. During its own security review it fired 4 times on the reviewer,
# including on `ls -la .env`, the example its error message advertises as legal.
#
# The obvious fix — reuse the quoted-literal sanitizer from enforce-venv.sh —
# is WRONG here, and the asymmetry is the interesting part: that sanitizer
# deletes quoted spans as data, which would let `cat ".env"` through, and that
# IS a real read. One hook's sanitizer is the other hook's hole.
#
# So: tokenize instead. Split the command into segments (; && || | newline
# () {}), find each segment's COMMAND WORD, and ask whether a secret path sits
# in an argument position that the command word would actually READ:
#   - file readers (cat, base64, cp, source, …) read every operand
#   - pattern readers (grep, sed, awk, jq, …) read every operand EXCEPT the
#     first, which is the pattern/script — unless -e/-f already supplied it
#   - interpreters (python, node, …) read anything, including heredoc bodies
#   - `git show|diff|cat-file|…` reads its revision operands
# A secret path anywhere else is data: naming it is not reading it.
#
# KNOWN BYPASSES — deliberate, so nobody reads this file as airtight:
#   - Obfuscation defeats it BY CONSTRUCTION: `cat .en?`, `V=.en; cat "${V}v"`,
#     `cat $(printf ".en%s" v)`, `cat $(echo LmVudg== | base64 -d)`. A command
#     string is Turing-complete; no rule over it survives an adversary who is
#     trying. The threat model here is the CARELESS agent, not the hostile one,
#     and pretending otherwise would only buy false confidence. Do not reopen
#     this without a new argument — it has been closed on exactly these grounds.
#   - \uXXXX escapes are not decoded by the grep fallback in lib/payload.sh.
#     Real payloads from the harness do not use them.
# This hook is defense in depth. settings.json's Read()/Bash() deny rules and
# the user's own permission prompt are the other layers.

# Strip the non-secret example variants first so `.env.example` never trips
# this. Applied to ANY path, not just .env.*, because the secret list below now
# covers secrets.yaml, service-account.json and friends, and every one of those
# has a committed .example twin that must stay readable.
EXAMPLE_VARIANTS='example|sample|template|dist'
SANITIZED=$(printf '%s\n' "$COMMAND" | sed -E "s/[^[:space:]]*\.($EXAMPLE_VARIANTS)([^[:alnum:]]|\$)/\2/g")

# NOTE: the '.' must NOT be excluded after '\.env' — doing so let
# `tail -n 5 .env.production` through, since the char right after ".env" was a
# dot. Suffixed env files (.env.production, .env.local) are the common case.
# Safe because the sanitizer above has already removed the example variants,
# so nothing benign with a dotted suffix reaches this regex.
#
# The list past the first line came from a later credential audit. None of
# those were covered HERE or by the Read() deny rules in settings.json, so they
# were the only holes in the set with no second layer at all — .npmrc carries
# _authToken and .git-credentials is plaintext passwords.
SECRET_PATH_RE='\.env([^[:alnum:]]|$)|credentials\.json|token\.json|\.pem([^[:alnum:]]|$)|\.key([^[:alnum:]]|$)|\.p12([^[:alnum:]]|$)|\.pfx([^[:alnum:]]|$)|id_rsa|id_ed25519|id_ecdsa'
SECRET_PATH_RE="$SECRET_PATH_RE"'|\.aws/credentials|\.git-credentials|\.npmrc([^[:alnum:]]|$)|\.netrc([^[:alnum:]]|$)|_netrc([^[:alnum:]]|$)|\.pgpass([^[:alnum:]]|$)|\.htpasswd|\.docker/config\.json'
SECRET_PATH_RE="$SECRET_PATH_RE"'|\.jks([^[:alnum:]]|$)|\.keystore([^[:alnum:]]|$)|\.p8([^[:alnum:]]|$)|\.kdbx([^[:alnum:]]|$)|\.ovpn([^[:alnum:]]|$)|service-account[^[:space:]]*\.json|secrets?\.(ya?ml|json|toml)'

# Cheap gate: no secret-looking path anywhere means nothing below can fire.
if printf '%s' "$SANITIZED" | grep -qE "$SECRET_PATH_RE" ; then

    # awk needs the backslashes doubled to survive -v assignment.
    AWK_SECRET_RE=$(printf '%s' "$SECRET_PATH_RE" | sed 's/\\/\\\\/g')

    printf '%s\n' "$SANITIZED" | awk -v SECRET="$AWK_SECRET_RE" '
    BEGIN {
        RS = "\001"   # one record = the whole command, newlines included

        # Read every operand.
        split("cat tac nl head tail less more bat od xxd hexdump strings base64 \
               cut sort uniq tr rev fold fmt expand unexpand column pr paste join comm \
               dd split csplit shuf tsort \
               cp mv install ln scp rsync sftp tee \
               zip unzip tar gzip gunzip zcat bzip2 bzcat xz unxz zstd 7z \
               gpg openssl md5sum sha1sum sha256sum sha512sum cksum b2sum \
               vi vim view nano emacs ed pico \
               source . dotenv printenv env", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") FILEREAD[A[i]] = 1

        # First operand is the pattern/script; the rest are files.
        split("grep egrep fgrep rg ag ack sed awk gawk mawk nawk jq yq", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") PATTERNREAD[A[i]] = 1

        # Read anything, including heredoc bodies and script arguments.
        split("python python2 python3 py node deno bun ruby perl php Rscript", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") INTERP[A[i]] = 1

        # Send anywhere off-box.
        split("curl wget nc ncat socat ssh", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") NETWORK[A[i]] = 1

        # git subcommands that print file contents from the object store.
        split("show diff cat-file log grep blame stash", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") GITREAD[A[i]] = 1

        split("sudo doas command builtin exec nohup time nice ionice xargs then else do", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") PREFIX[A[i]] = 1

        split("if elif fi while until done for in case esac function return ! [ [[ ]] ]", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") KEYWORD[A[i]] = 1

        # Flags that swallow the following token.
        split("-e -f -m -A -B -C -d -v -F --regexp --file --include --exclude \
               --exclude-dir --arg --argjson --slurpfile --rawfile", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") TAKESARG[A[i]] = 1

        # ...and of those, the ones that supply the PATTERN itself, which means
        # the first bare operand is already a file.
        split("-e -f --regexp --file", A, /[ \t\n]+/)
        for (i in A) if (A[i] != "") GIVESPATTERN[A[i]] = 1
    }

    # Strip the directory and any .exe so /usr/bin/cat.exe classifies as cat.
    function base(t,   n) {
        if (t == "." || t == "..") return t
        n = t
        sub(/\.[Ee][Xx][Ee]$/, "", n)
        sub(/.*[\/\\]/, "", n)
        return (n == "") ? t : n
    }

    function analyze(seg,   n, T, i, j, c, t, opidx, skipnext, patflag, isfile, rest) {
        n = split(seg, T, /[ \t]+/)

        # A command word can also appear after find -exec / -execdir and after
        # sh -c: those positions genuinely start a new command.
        for (j = 1; j <= n; j++) {
            if (T[j] == "-exec" || T[j] == "-execdir") {
                rest = ""
                for (i = j + 1; i <= n; i++) rest = rest " " T[i]
                if (analyze(rest)) return 1
            }
        }

        # Input redirection reads the file whatever the command word is:
        # `while read l; do :; done < .env`, `$(< .env)`, `tr -d x < .env`.
        for (j = 1; j <= n; j++) {
            if (T[j] ~ /^<+/) {
                t = T[j]; sub(/^<+/, "", t)
                if (t ~ SECRET) return 1
                if (t == "" && j < n && T[j + 1] ~ SECRET) return 1
            }
        }

        # Walk past env assignments, shell keywords and command prefixes.
        i = 1
        while (i <= n) {
            t = T[i]
            if (t == "" || t ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || (t in PREFIX) || (t in KEYWORD)) { i++; continue }
            break
        }
        if (i > n) return 0

        c = base(T[i])

        if (c ~ /^(sh|bash|zsh|dash|ksh)$/) {
            for (j = i + 1; j <= n; j++) {
                if (T[j] == "-c") {
                    rest = ""
                    for (t = j + 1; t <= n; t++) rest = rest " " T[t]
                    return analyze(rest)
                }
            }
            # A shell fed by a heredoc runs that body as CODE, so unlike `cat`
            # it does not get the body stripped out from under it.
            if (HAS_HEREDOC) return (WHOLE ~ SECRET)
        }

        # An interpreter with a secret path in reach reads it — as -c payload,
        # as a script argument, or from a heredoc body further down the record.
        if (c in INTERP) return (WHOLE ~ SECRET)

        if ((c in FILEREAD) || (c in NETWORK)) {
            for (j = i + 1; j <= n; j++) if (T[j] ~ SECRET) return 1
            return 0
        }

        if (c == "git") {
            for (j = i + 1; j <= n; j++) {
                if (T[j] ~ /^-/) continue
                if (base(T[j]) in GITREAD) {
                    for (t = j + 1; t <= n; t++) if (T[t] ~ SECRET) return 1
                }
                break
            }
            return 0
        }

        if (c in PATTERNREAD) {
            opidx = 0; skipnext = 0; patflag = 0
            for (j = i + 1; j <= n; j++) {
                t = T[j]
                if (t == "") continue
                if (skipnext) { skipnext = 0; continue }
                if (t ~ /^-./) {
                    if (t in TAKESARG) skipnext = 1
                    if (t in GIVESPATTERN) patflag = 1
                    continue
                }
                opidx++
                # Without -e/-f the first bare operand is the pattern, i.e. DATA.
                # This single line is the whole co-occurrence bug.
                isfile = patflag ? (opidx >= 1) : (opidx >= 2)
                if (isfile && t ~ SECRET) return 1
            }
        }

        return 0
    }

    # A heredoc BODY is data, not commands: `cat >> notes.md <<EOF ... EOF`
    # writes text that merely mentions things. Without this, every line of the
    # body got analysed as if it were a command, and documenting the hook
    # blocked the commit that documented it — the same trap enforce-venv.sh
    # fell into earlier, reproduced here while writing this fix up.
    #
    # Interpreters are the exception and need no special case: their branch
    # tests WHOLE, the UNSTRIPPED record, so `python3 <<PY ... open(".env") PY`
    # still blocks. Bodies are stripped only for segmentation.
    function strip_heredocs(rec,   n, L, i, out, d, line, t, tok) {
        n = split(rec, L, "\n")
        out = ""; d = ""
        for (i = 1; i <= n; i++) {
            line = L[i]
            if (d != "") {
                t = line
                gsub(/^[ \t]+|[ \t]+$/, "", t)
                if (t == d) d = ""
                continue
            }
            if (match(line, /<<-?[ \t]*["\047]?[A-Za-z_][A-Za-z0-9_]*["\047]?/)) {
                tok = substr(line, RSTART, RLENGTH)
                sub(/^<<-?[ \t]*/, "", tok)
                gsub(/["\047]/, "", tok)
                d = tok
                line = substr(line, 1, RSTART - 1)
            }
            out = out line "\n"
        }
        return out
    }

    # Segment the command, quote-aware, dropping the quote characters as it goes.
    # Order matters: splitting on ; | & ( ) { } BEFORE honouring quotes would cut
    # `grep -E "(a|b)" .env` into pieces and lose the .env operand — a real read
    # slipping through. Inside quotes those characters are ordinary text.
    function segment(s,   out, i, ch, q, L) {
        out = ""; q = ""; L = length(s)
        for (i = 1; i <= L; i++) {
            ch = substr(s, i, 1)
            if (q != "") {
                if (ch == q) q = ""       # closing quote: drop it
                else out = out ch
                continue
            }
            if (ch == "\"" || ch == "\047") { q = ch; continue }
            if (ch == ";" || ch == "|" || ch == "&" || ch == "(" || ch == ")" \
             || ch == "{" || ch == "}" || ch == "`" || ch == "\n") { out = out "\002"; continue }
            out = out ch
        }
        return out
    }

    {
        WHOLE = $0
        HAS_HEREDOC = ($0 ~ /<<-?[ \t]*["\047]?[A-Za-z_]/)
        n = split(segment(strip_heredocs($0)), SEG, /\002/)
        for (s = 1; s <= n; s++) {
            if (analyze(SEG[s])) { exit 2 }
        }
        exit 0
    }
    '

    if [ $? -eq 2 ]; then
        cat >&2 <<'EOF'
BLOCKED: this command would disclose the contents of a secret file
(.env / credentials.json / token.json / *.pem / *.key / id_rsa*).

Secrets never leave their home (CLAUDE.md § Data Protection 1). Reference them
by variable name only — never read, print, copy, upload, or archive the file.

If you need to know WHICH keys exist (not their values):
  grep -oE '^[A-Z_][A-Z0-9_]*=' .env    <- still blocked; ask the user instead.

If you genuinely need the value, the user provides it — you do not read it.

NAMING a secret path is fine — only READING it is blocked. These all work:
  ls -la .env                      echo ".env" >> .gitignore
  grep -rn "token.json" docs/      git commit -m "docs: never read .env"
EOF
        exit 2
    fi
fi

# --- Rule: no WRITING into a real env file ---
# `[^\s]` was a bug: inside a bracket expression POSIX ERE reads \s as the two
# literal characters, so `[^\s]*` meant "anything but a backslash or an s" and
# any path containing an s — src/.env, apps/site/.env — slipped through.
if printf '%s\n' "$COMMAND" | grep -qE '>[[:space:]]*[^[:space:]]*\.env' ; then
    if ! echo "$COMMAND" | grep -qE "\.env\.($EXAMPLE_VARIANTS)\b" ; then
        echo "BLOCKED: writing to .env files is forbidden." >&2
        exit 2
    fi
fi

if printf '%s\n' "$COMMAND" | grep -qE 'git\s+push\s+(--force|-f).*\b(main|master)\b' ; then
    echo "BLOCKED: force-push to main/master is forbidden." >&2
    exit 2
fi

if printf '%s\n' "$COMMAND" | grep -qE '^git\s+commit' ; then
    if ! echo "$COMMAND" | grep -qE '#[0-9]+|[A-Z]+-[0-9]+|design/|docs/|directives/' ; then
        cat <<'EOF'
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": "Commit message does not reference an issue (#N), ADR, or design doc. Studio convention asks for one — proceed anyway?"}}
EOF
        exit 0
    fi
fi

exit 0

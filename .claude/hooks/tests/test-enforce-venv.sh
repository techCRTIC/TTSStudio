#!/bin/bash
# Test harness for .claude/hooks/enforce-venv.sh
# Usage: bash test-enforce-venv.sh /path/to/enforce-venv.sh
HOOK="$1"
. "$(dirname "$0")/lib.sh"

echo "=== MUST BLOCK (real global installs) ==="
run block 'pip install requests'                                  'bare pip install'
run block 'pip3 install requests'                                 'pip3 install'
run block 'pip.exe install requests'                              'pip.exe install'
run block 'sudo pip install requests'                             'sudo prefix'
run block 'python -m pip install requests'                        'python -m pip install'
run block 'cd foo && pip install requests'                        'after && separator'
run block 'uv pip install --system requests'                      'uv --system bypass'
run block 'uv pip install requests --system'                      'uv --system flag last'
run block 'bash -c "pip install requests"'                        'bash -c payload (quotes are code)'

echo
echo "=== MUST ALLOW (venv-targeted / non-install) ==="
run allow '.venv/Scripts/python.exe -m pip install requests'      'venv interpreter (win)'
run allow '.venv/bin/pip install requests'                        'venv pip (posix)'
run allow 'uv add requests'                                       'uv add'
run allow 'uv pip install requests'                               'uv pip install (targets .venv)'
run allow 'uvx ruff check .'                                      'uvx one-off'
run allow 'pipx install black'                                    'pipx'
run allow 'source .venv/bin/activate && pip install requests'     'activate then pip'
run allow 'python script.py'                                      'plain script run'
run allow 'ls -la'                                                'unrelated command'

echo
echo "=== REGRESSION: false positives that used to block ==="
run allow "$(printf 'git commit -F - <<%sEOF%s\nfeat: mention uv pip install --system in docs\nEOF' "'" "'")" \
                                                                  'heredoc body (quoted delim)'
run allow "$(printf 'git commit -F - <<EOF\npip install requests is now blocked\nEOF')" \
                                                                  'heredoc body (bare delim)'
run allow "$(printf 'cat <<-EOF > notes.md\n  pip install requests\n  EOF')" \
                                                                  'indented heredoc <<-'
run allow 'git commit -m "docs: forbid pip install into global python"' 'commit -m message'
run allow 'echo "uv pip install --system is forbidden"'           'echo of the pattern'
run allow "grep -rn 'pip install' docs/"                          'grep for the pattern'
run allow '# pip install requests'                                'full-line comment'
run allow 'ls -la  # pip install requests'                        'trailing comment'

result

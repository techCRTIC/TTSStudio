---
name: node-refuses-cmd-without-shell
description: On Windows, Node will not spawn a .cmd (npm, npx, yarn) unless shell:true — and shell:true then prints DEP0190 on every run. Call the tool's JS entrypoint instead.
metadata:
  type: gotcha
---

Since the CVE-2024-27980 mitigation, `child_process.spawn` **refuses to launch a
`.bat` or `.cmd` file without `shell: true`**. On Windows `npm` IS `npm.cmd`, so
`spawn("npm", [...])` fails outright.

The obvious fix — `shell: true` — works, and then Node prints `DEP0190` on every
run, because with a shell the arguments are concatenated rather than escaped.

**Why:** this cost a working launcher in session 1. "Removing a deprecation
warning" by naming `npm.cmd` directly broke `npm start` completely, and the
failure was silent because `spawnSync`'s `res.error` was not being read — only
`res.status`.

**How to apply:** skip npm and call the tool's own JS entrypoint through node:

    spawn(process.execPath, [path.join(dir, "node_modules/next/dist/bin/next"), "build"])

No `.cmd`, no shell, no warning. And always report `res.error` alongside
`res.status` — a spawn that never launched looks identical to one that failed,
unless you print the reason.

Related: [[agent-background-server-dies-with-turn]]

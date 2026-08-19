---
name: agent-background-server-dies-with-turn
description: A dev server started as an agent background task does not outlive the turn — never tell the user "it is running"; they start it themselves.
metadata:
  type: constraint
---

A long-running process launched as a background task from an agent session is
reaped when the turn ends. It is fine for verifying something mid-turn; it is not
a way to leave the app running for the user.

**Why:** in session 1 this produced a false statement to the user — "está
corriendo ahora mismo" — that was true when written and false a minute later.
Worse, an *orphaned* server from an earlier run kept answering on the port while
serving a **stale build**, which turned into a false diagnosis: a route looked
broken when the problem was that the old bundle was still being served.

**How to apply:**
- Start a server to check something, then say what you checked — never that it
  is still up.
- The user runs the app themselves; that is what a one-command launcher is for.
- On `EADDRINUSE`, suspect an orphan before suspecting the code, and confirm
  which build is answering before diagnosing anything.
- A launcher that clears the port should verify the occupant is its OWN app
  before killing it — never kill an unidentified process on a user's machine.

Related: [[node-refuses-cmd-without-shell]]

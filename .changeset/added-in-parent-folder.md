---
"@tenphi/harnesspm": minor
---

A sync in a folder above git repositories, such as `/home/user` in a Claude Code cloud session with several repositories, now applies your added harnesses in each repository right below it, so their project entries work there too. The `SessionStart` hook runs it at the start of such a session. Each repository gets only the per-machine outputs of your added harnesses; its own files, committed or per machine, stay as its install wrote them. A session that starts above the repositories reads the entries' rules and skills; their hooks and permissions still need a session that starts in the repository. Without added harnesses, and with `CI=true`, nothing changes.

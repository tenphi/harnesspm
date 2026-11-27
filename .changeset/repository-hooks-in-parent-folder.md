---
"@tenphi/harnesspm": minor
---

`sync`, `add` and `update` in a folder above several repositories, such as `/home/user` in a Claude Code cloud session, now also copy each repository's own hooks into that folder's settings, such as a session-start script or a lint on each edit, once a person has run harnesspm in that folder, so they run in a session that starts there: each in its repository, and only for its files. The session hook that `add` installs now runs `update --hook`, which never opts a folder in, and the next sync replaces the older hook.

---
"@harnesspm/cli": patch
---

In a Claude Code cloud session, the step that turns on a package's tools now says why it differs: the session gives the person no terminal, so the environment's setup script grants it before each new session. `init`'s report there asks the person to commit the trust change and to add the project's install to the setup script, without the unrelated `add <source>`.

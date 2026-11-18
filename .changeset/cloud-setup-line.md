---
"@tenphi/harnesspm": patch
---

In a Claude Code cloud session, `sync`, `status` and `doctor` now print the exact line for the environment's setup script when they hold entries back, such as `cd /home/user/app && npm ci`, and the cloud docs give a setup script that works.

---
"@tenphi/harnesspm": minor
---

The `SessionStart` hook that `add` installs now runs `update`, so each session starts with the newest commits of your added harnesses, also in a cloud session that starts from a days-old snapshot. In the hook, git never prompts, a fetch stops after 30 seconds, and a fetch that fails only warns: the session starts with what is on the machine. Working copies with uncommitted or unpushed work are left as they are. Your next `sync` turns the old hook, which ran `sync`, into the new one. `update` now prints what changed, such as `updated a1b2c3d → e4f5a6b`, instead of "up to date". New commits apply their hooks and permissions too: for a harness whose pushes you do not control, use an npm source with a fixed version, or `--no-hook`.

---
"@tenphi/harnesspm": minor
---

`why <ID>` finds a unit of a project entry from any folder, such as another repository or a folder above the clones, where an agent may meet the IDs that a repository's `CLAUDE.local.md` lists. It searches the entries of the harnesses you added with user scope, and its owner line names the remotes the entry is for.

`check` validates a harness's project entries too: the rules and skills in each entry folder, and the `name` in the entry's `plugin.json`, which `sync` refuses when it differs from the harness's. It checks each folder once, also when several remotes map to it, and prints each entry's always-on size next to the harness's.

When `run` refuses a script because the installed version differs from the lock, the message now names both remedies: reinstall the project's dependencies when the install is out of date, as in a cached cloud environment, or run `npx -y @tenphi/harnesspm sync` when the lock is. It named only `sync` before, which on an old install writes the old versions into the lock.

harnesspm is no longer labeled experimental: the README, the docs site and the spec drop the "experimental" note.

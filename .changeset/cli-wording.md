---
'@tenphi/harnesspm': patch
---

Clearer CLI messages. A pending tool's reason now says that a person turns it on, so agents do not take it as their next step. `init` ends with the files to commit. `new` lists every file it wrote, `plugin.json` included, and a next step that works where it wrote. `harnesspm <command> --help` shows that command's usage and options.

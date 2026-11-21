---
"@tenphi/harnesspm": patch
---

`harnesspm check` no longer checks links in code samples (fenced code blocks and code spans), so a sample link no longer fails the check. A link in an indented code block still counts: put a sample link in a fence.

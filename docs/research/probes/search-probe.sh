#!/bin/bash
# harnesspm search probe: which places an agent's search finds a dependency's docs in (spec 4.3, note 8).
# Usage: bash docs/research/probes/search-probe.sh [folder]. It builds a git repository in the folder
# (default: a new temporary one), prints what plain `rg` finds, and prints a prompt that asks an agent
# to search with its own tool. Needs git and rg.
set -eu
D="${1:-$(mktemp -d)}"
S='a sentence only the probe page holds'
mkdir -p "$D" && cd "$D" && git init -q
printf 'node_modules\n' > .gitignore
page() { mkdir -p "$(dirname "$1")" && printf '# %s\n\n%s.\n' "$2" "$S" > "$1"; }
# 1. An installed package's docs, which git ignores.
page node_modules/@acme/ui/docs/installed.md installed
# 2. harnesspm's stable path: a link in a hidden folder that git ignores.
mkdir -p node_modules/.harnesspm/pkgs/@acme && ln -s ../../../@acme/ui node_modules/.harnesspm/pkgs/@acme/ui
# 3. A committed link into node_modules, a setup some projects used before harnesspm.
mkdir -p docs && ln -s ../node_modules/@acme/ui/docs docs/ui && git add docs/ui && git commit -qm 'link'
# 4. A committed page in a hidden folder, which plain rg skips.
page .hidden/committed.md committed && git add .hidden && git commit -qm 'hidden'
# 5. A docs copy at the project root, and the .rgignore that lets search into it. Both are excluded, as harnesspm
# writes them, and a file next to the copies stays out of search.
page .harnesspm/docs/acme-ui/copy.md copy
page .harnesspm/other.md other
printf '/node_modules/.harnesspm/\n/.harnesspm/\n/.rgignore\n' >> .git/info/exclude
rgignore='!/.harnesspm/\n/.harnesspm/*\n!/.harnesspm/docs/\n'

echo "== rg without .rgignore (expected: nothing; an agent's search tool may find .hidden/committed.md)"
rg -l "$S" . || true
printf "$rgignore" > .rgignore
echo "== rg with .rgignore (expected: only the copy)"
rg -l "$S" . || true
echo "== git status (expected: only .gitignore)"
git status --porcelain --untracked-files=all
echo
echo "Prompt for an agent, with the .rgignore in place, then again after \`rm $D/.rgignore\`:"
echo "  Use your search tool, not the shell, to list every file under $D that contains \"$S\"."

# Codex Cloud live probe

Answers one question without the setup flow: **does the Codex Cloud agent read project files from the task's VM?** The agent runs outside the VM, and `codex exec-server` runs its commands inside it ([agent-capabilities.md](../agent-capabilities.md#cloud)).

The agent writes git-excluded test files in its own task, then reports what it sees in that turn and the next. A probe word or skill that appears proves the files were read from the VM. If nothing appears, the files may still be read only when a task starts: then run [codex-cloud-probe.sh](codex-cloud-probe.sh) from the environment's setup chat.

## Message 1

````text
This is a configuration test for the harnesspm specification, set up by the owner of this environment. Do not commit or open a pull request. Create only the files that the command in step 1 creates: they are git-excluded test files.

1. Run this command exactly and paste its full output:

```bash
bash <<'PROBE'
set -u
W=/workspace
skill() { mkdir -p "$1/$2" 2>/dev/null && printf -- '---\nname: %s\ndescription: harnesspm probe skill. Use only when asked for the %s word.\n---\n\nThe %s word is %s.\n' "$2" "$2" "$2" "$3" >"$1/$2/SKILL.md" 2>/dev/null && echo "wrote $1/$2" || echo "FAILED $1/$2"; }
instr() { if [ -s "$1/config.toml" ]; then echo "kept $1/config.toml"; else mkdir -p "$1" 2>/dev/null && printf 'developer_instructions = "Probe word (%s .codex/config.toml): jade-otter"\n' "$2" >"$1/config.toml" 2>/dev/null && echo "wrote $1/config.toml" || echo "FAILED $1/config.toml"; fi; }
for g in "$W"/*/.git; do
  r="${g%/.git}"; n="$(basename "$r")"; git -C "$r" rev-parse --git-dir >/dev/null 2>&1 || continue
  ex="$(git -C "$r" rev-parse --git-path info/exclude)"; case "$ex" in /*) ;; *) ex="$r/$ex" ;; esac
  s="$(readlink -f "$r/.agents/skills" 2>/dev/null || echo "$r/.agents/skills")"; rr="$(readlink -f "$r")"
  skill "$s" "probe-$n-skill" plum-badger; echo "${s#"$rr"}/probe-$n-skill/" >>"$ex"
  if [ -z "$(git -C "$r" ls-files .codex | head -1)" ]; then instr "$r/.codex" "$n"; echo /.codex/ >>"$ex"; fi
  echo "git status $n: $(git -C "$r" status --short | head -3 | tr '\n' ' ')"
done
skill "$W/.agents/skills" probe-root-skill olive-heron
instr "$W/.codex" "workspace root"
mkdir -p "$HOME/.codex" && echo 'Probe word (user ~/.codex/AGENTS.md in the VM): amber-falcon' >>"$HOME/.codex/AGENTS.md" && echo "wrote $HOME/.codex/AGENTS.md"
skill "$HOME/.agents/skills" probe-user-skill teal-sparrow
PROBE
```

2. If you have a tool that lists skills, call it now and paste its full result.
3. List every line that starts with "Probe word" in your instructions or context, exactly as written, and every skill whose name starts with "probe". Say "none" if there are none. Do not search files for them.

Then stop. I will send one more message.
````

## Message 2

```text
1. List every line that starts with "Probe word" in your instructions or context now, exactly as written, and every skill whose name starts with "probe". Say "none" if there are none. Do not search files for them.
2. If you have a tool that lists skills, call it again and paste its full result.
3. Use each probe skill that is available and report its word.
```

## Message 3, in a new task from the same environment

Use only if message 2 shows nothing. Files written in a task stay in that task, so a new task shows whether only the setup can add them.

```text
List every line that starts with "Probe word" in your instructions or context, and every skill whose name starts with "probe", or say "none". Then run `ls -A /workspace/.agents/skills /workspace/.codex 2>&1`.
```

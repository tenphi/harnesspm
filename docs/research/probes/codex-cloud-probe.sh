#!/bin/bash
# harnesspm Codex cloud probe (v3) for a PERSONAL Codex cloud environment.
# Use: append it to the environment's setup script, or paste it as the whole setup script.
# If the setup script uses `set -e`, write this file out and run it with `bash file || true`,
# so a failed probe step never fails the setup.
#
# It answers open questions of the harnesspm spec (docs/research/agent-capabilities.md, Codex rows):
#   C0 who runs setup and commands; does codex run in the container   C5 project .codex/ layer and hooks
#   C1 env vars in model commands, hooks, MCP servers                  C6 .rules files (forbidden)
#   C2 ~/.codex/AGENTS.md                                               C7 MCP servers, user and project
#   C3 ~/.agents/skills, committed and git-excluded repo skills        C8 project custom agents
#   C4 developer_instructions in project .codex/config.toml            C9 managed hooks (requirements.toml)
# v2: the setup user and the agent user can differ, so the probe lives in a shared folder and the
#     user-level files go into every home directory.
# v3: setup may run outside any checkout (for example in /workspace), so the project files go into
#     every git checkout under PROBE_SEARCH_ROOT. Commands use an absolute node path. A symlinked
#     .agents/skills is excluded by its real path. A managed hook goes into /etc/codex/requirements.toml.
# It writes only to the shared folder, probe files in ~/.codex and ~/.agents of each home,
# git-excluded files in each checkout and, when absent, /etc/codex/requirements.toml.
# It logs only CODEX* / AI_AGENT values, secrets redacted. Remove it after the test.
#
# Overrides (for a dry run): PROBE_SHARED, PROBE_HOMES, PROBE_REPOS, PROBE_SEARCH_ROOT,
# PROBE_REQUIREMENTS (path, or 0 to skip the managed hook).
set -u
S="${PROBE_SHARED:-/opt/harnesspm-probe}"
mkdir -p "$S/log" 2>/dev/null || { S=/tmp/harnesspm-probe; mkdir -p "$S/log"; }
chmod 755 "$S"; chmod 1777 "$S/log"
NODE="$(command -v node || echo node)"

# ---------- helper: filtered environment ----------
cat >"$S/envkeys.sh" <<'EOF'
#!/bin/bash
vals="$(env | grep -E '^(CODEX[A-Z0-9_]*|AI_AGENT|CLAUDECODE|CI)=' \
  | sed -E 's/^([A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)=.*/\1=<redacted>/' | sort | tr '\n' ' ')"
names="$(env | cut -d= -f1 | grep -E 'AGENT|SANDBOX|CODEX' | sort | tr '\n' ' ')"
echo "user=$(id -un) home=$HOME values: ${vals:-none} | names: ${names:-none}"
EOF

# ---------- helper: process chain of the caller (does codex run in this container?) ----------
cat >"$S/pchain.sh" <<'EOF'
#!/bin/bash
pid="${1:-$PPID}"; out=""
for _ in 1 2 3 4 5 6 7 8; do
  [ -r "/proc/$pid/cmdline" ] || break
  cmd="$(tr '\0\n' '  ' <"/proc/$pid/cmdline" | cut -c1-120)"
  out="$out <- [$pid] ${cmd:-?}"
  pid="$(awk '/^PPid:/ {print $2}' "/proc/$pid/status" 2>/dev/null)"
  [ -n "$pid" ] && [ "$pid" != 0 ] || break
done
echo "chain:$out"
EOF

# ---------- hook: log each call; SessionStart also prints a marker ----------
cat >"$S/hook.sh" <<EOF
#!/bin/bash
S="$S"; label="\$1"
input="\$(head -c 4000 2>/dev/null)"
event="\$(printf '%s' "\$input" | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(\`\${j.hook_event_name||"?"} tool=\${j.tool_name||""}\`)}catch{process.stdout.write("no-json")}})' 2>/dev/null)"
echo "\$(date -u +%FT%T.%3NZ) label=\$label event=[\$event] pwd=\$PWD env: \$(bash "\$S/envkeys.sh") \$(bash "\$S/pchain.sh" \$PPID)" >>"\$S/log/hooks.log"
case "\$label" in *SessionStart) echo "Probe word (\$label hook stdout): ruby-lynx" ;; esac
exit 0
EOF

# ---------- MCP server: minimal stdio JSON-RPC, one tool ----------
cat >"$S/mcp.mjs" <<EOF
#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { userInfo } from 'node:os';
const label = process.argv[2] || 'unknown';
const log = '$S/log/mcp.log';
const env = Object.keys(process.env).filter((k) => /^CODEX|^AI_AGENT\$/.test(k)).map((k) => (/KEY|TOKEN|SECRET|PASSWORD|AUTH/.test(k) ? \`\${k}=<redacted>\` : \`\${k}=\${process.env[k]}\`)).join(' ');
appendFileSync(log, \`\${new Date().toISOString()} start \${label} user=\${userInfo().username} ppid=\${process.ppid} \${env}\n\`);
const send = (m) => process.stdout.write(\`\${JSON.stringify(m)}\n\`);
const handle = (msg) => {
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: \`harnesspm-probe-\${label}\`, version: '0.0.3' } } });
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'probe_ping', description: \`harnesspm probe (\${label}): returns a marker word\`, inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call') { appendFileSync(log, \`\${new Date().toISOString()} call \${label}\n\`); send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: \`PROBE-MCP-OK \${label} violet-crane\` }] } }); }
  else if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
};
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; for (let i; (i = buf.indexOf('\n')) >= 0; ) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { handle(JSON.parse(line)); } catch {} } } });
EOF

# ---------- report: what the task prints ----------
cat >"$S/report.sh" <<EOF
#!/bin/bash
S="$S"
section() { printf '\n== %s ==\n' "\$1"; }
section "setup.log (C0)"; cat "\$S/log/setup.log" 2>/dev/null || echo missing
section "command env (C0, C1)"; bash "\$S/envkeys.sh"; echo "pwd=\$PWD"; bash "\$S/pchain.sh" \$\$
section "codex and MCP processes in this container (C0)"
for p in /proc/[0-9]*; do c="\$(tr '\0\n' '  ' <"\$p/cmdline" 2>/dev/null | cut -c1-160)"; case "\$c" in *codex*|*mcp*) echo "[\${p#/proc/}] \$(stat -c %U "\$p" 2>/dev/null) \$c" ;; esac; done | grep -v report.sh | head -20
section "hooks.log (C1, C5, C9)"; cat "\$S/log/hooks.log" 2>/dev/null || echo "missing (no hook ran)"
section "mcp.log (C1, C7)"; cat "\$S/log/mcp.log" 2>/dev/null || echo "missing (no MCP server started)"
section "probe files per checkout (must not show in git status)"
while read -r repo; do
  [ -n "\$repo" ] || continue
  echo "--- \$repo"; ls -A "\$repo/.codex" 2>&1 | tr '\n' ' '; echo; git -C "\$repo" status --short 2>&1 | head -10
done <"\$S/repos.txt"
section "this user's codex home: \${CODEX_HOME:-\$HOME/.codex}"; ls -la "\${CODEX_HOME:-\$HOME/.codex}" 2>&1; grep -nE '^\[|harnesspm' "\${CODEX_HOME:-\$HOME/.codex}/config.toml" 2>&1
section "/etc/codex"; ls -la /etc/codex 2>&1
EOF
chmod 755 "$S"/*.sh "$S/mcp.mjs"

hookjson() { # $1 = label prefix
  cat <<JSON
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash $S/hook.sh $1-SessionStart", "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "bash $S/hook.sh $1-UserPromptSubmit", "timeout": 30 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "bash $S/hook.sh $1-PostToolUse", "timeout": 30 }] }]
  }
}
JSON
}

# ---------- C0: who runs setup, which homes and checkouts exist ----------
if [ -n "${PROBE_REPOS:-}" ]; then
  printf '%s\n' $PROBE_REPOS >"$S/repos.txt"
else
  {
    git rev-parse --show-toplevel 2>/dev/null
    find ${PROBE_SEARCH_ROOT:-/workspace} -maxdepth 2 -name .git -not -path '*/node_modules/*' 2>/dev/null | sed 's#/\.git$##'
  } | sort -u >"$S/repos.txt"
fi
{
  echo "setup ran at $(date -u +%FT%T.%3NZ) shared=$S pwd=$PWD node=$NODE"
  echo "setup env: $(bash "$S/envkeys.sh") $(bash "$S/pchain.sh" $$)"
  echo "home dirs: $(ls -d /root /home/* 2>/dev/null | tr '\n' ' ') | agent user: $(getent passwd agent 2>/dev/null | cut -d: -f1,3,6 || echo none)"
  echo "checkouts: $(tr '\n' ' ' <"$S/repos.txt")"
  echo "codex cli: $(command -v codex || echo none) $(codex --version 2>/dev/null || true)"
} >>"$S/log/setup.log" 2>&1

# ---------- user level, for every home directory ----------
install_home() { # $1 = home dir, $2 = codex dir
  local h="$1" c="$2" owner repo
  owner="$(stat -c %U "$h" 2>/dev/null || echo root)"
  mkdir -p "$c/rules" "$h/.agents/skills/probe-user-skill" || return 0
  grep -qF amber-falcon "$c/AGENTS.md" 2>/dev/null || printf '\n%s\n' "Probe word (user ~/.codex/AGENTS.md): amber-falcon" >>"$c/AGENTS.md"
  cat >"$h/.agents/skills/probe-user-skill/SKILL.md" <<'EOF'
---
name: probe-user-skill
description: harnesspm probe skill from ~/.agents/skills. Use only when asked for the user probe skill word.
---

The user probe skill word is teal-sparrow.
EOF
  if [ -e "$c/hooks.json" ] && ! grep -qF harnesspm "$c/hooks.json"; then
    echo "existing $c/hooks.json kept" >>"$S/log/setup.log"
  else
    hookjson User >"$c/hooks.json"
  fi
  echo 'prefix_rule(pattern = ["echo", "forbidden-probe-user"], decision = "forbidden", justification = "harnesspm probe: user rule")' >"$c/rules/probe.rules"
  if ! grep -qF "harnesspm-probe-user" "$c/config.toml" 2>/dev/null; then
    {
      echo ""
      echo "# harnesspm probe"
      printf '[mcp_servers.harnesspm-probe-user]\ncommand = "%s"\nargs = ["%s/mcp.mjs", "user"]\n' "$NODE" "$S"
      while read -r repo; do
        [ -n "$repo" ] || continue
        if grep -qF "[projects.\"$repo\"]" "$c/config.toml" 2>/dev/null; then
          echo "existing projects entry for $repo kept in $c/config.toml" >>"$S/log/setup.log"
        else
          printf '\n[projects."%s"]\ntrust_level = "trusted"\n' "$repo"
        fi
      done <"$S/repos.txt"
    } >>"$c/config.toml"
  fi
  [ "$(id -u)" = 0 ] && [ "$owner" != root ] && chown -R "$owner": "$c" "$h/.agents" 2>/dev/null
  echo "installed user files: home=$h codex=$c owner=$owner" >>"$S/log/setup.log"
}
seen=""
for h in ${PROBE_HOMES:-"$HOME" /root /home/*}; do
  [ -d "$h" ] || continue
  case " $seen " in *" $h "*) continue ;; esac
  seen="$seen $h"
  install_home "$h" "$h/.codex"
done
if [ -n "${CODEX_HOME:-}" ] && [ "$CODEX_HOME" != "$HOME/.codex" ]; then install_home "$HOME" "$CODEX_HOME"; fi

# ---------- project level, for every checkout (git-excluded) ----------
install_repo() { # $1 = checkout
  local repo="$1" name ex skills rel rrepo owner
  name="$(basename "$repo")"
  ex="$(git -C "$repo" rev-parse --git-path info/exclude)"; case "$ex" in /*) ;; *) ex="$repo/$ex" ;; esac
  mkdir -p "$(dirname "$ex")"
  exclude() { grep -qxF "$1" "$ex" 2>/dev/null || echo "$1" >>"$ex"; }
  if [ -z "$(git -C "$repo" ls-files .codex | head -1)" ]; then
    mkdir -p "$repo/.codex/rules" "$repo/.codex/agents"
    printf 'developer_instructions = "Probe word (project .codex/config.toml developer_instructions, %s): jade-otter"\n\n[mcp_servers.harnesspm-probe-project]\ncommand = "%s"\nargs = ["%s/mcp.mjs", "project-%s"]\n' "$name" "$NODE" "$S" "$name" >"$repo/.codex/config.toml"
    hookjson "Project-$name" >"$repo/.codex/hooks.json"
    echo 'prefix_rule(pattern = ["echo", "forbidden-probe-project"], decision = "forbidden", justification = "harnesspm probe: project rule")' >"$repo/.codex/rules/probe.rules"
    printf 'name = "probe_agent"\ndescription = "harnesspm probe agent. Use only when asked for the probe agent."\ndeveloper_instructions = """\nReply with exactly: PROBE-AGENT-OK violet-crane %s\n"""\n' "$name" >"$repo/.codex/agents/probe_agent.toml"
    exclude /.codex/
    echo "wrote project .codex/ in $repo" >>"$S/log/setup.log"
  else
    echo "project .codex/ is tracked in $repo; skipped" >>"$S/log/setup.log"
  fi
  skills="$(readlink -f "$repo/.agents/skills" 2>/dev/null || echo "$repo/.agents/skills")"
  mkdir -p "$skills/probe-repo-skill"
  cat >"$skills/probe-repo-skill/SKILL.md" <<EOF
---
name: probe-repo-skill
description: harnesspm probe skill from the repository's .agents/skills. Use only when asked for the repo probe skill word.
---

The repo probe skill word is plum-badger ($name).
EOF
  rrepo="$(readlink -f "$repo")"
  case "$skills" in
    "$rrepo"/*) rel="${skills#"$rrepo"}"; exclude "$rel/probe-repo-skill/" ;;
    *) echo "skills folder of $repo is outside it: $skills" >>"$S/log/setup.log" ;;
  esac
  echo "wrote probe-repo-skill in $skills" >>"$S/log/setup.log"
  owner="$(stat -c %U "$repo" 2>/dev/null || echo root)"
  [ "$(id -u)" = 0 ] && [ "$owner" != root ] && chown -R "$owner": "$repo/.codex" "$skills/probe-repo-skill" 2>/dev/null
  return 0
}
while read -r repo; do
  [ -n "$repo" ] && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 && install_repo "$repo"
done <"$S/repos.txt"
[ -s "$S/repos.txt" ] || echo "no git checkout found" >>"$S/log/setup.log"

# ---------- C9: managed hooks (trusted by policy, no /hooks review) ----------
REQ="${PROBE_REQUIREMENTS:-/etc/codex/requirements.toml}"
if [ "$REQ" = 0 ]; then
  echo "managed hook skipped" >>"$S/log/setup.log"
elif [ -e "$REQ" ] && ! grep -qF harnesspm "$REQ"; then
  echo "existing $REQ kept; managed hook skipped" >>"$S/log/setup.log"
elif mkdir -p "$(dirname "$REQ")" 2>/dev/null; then
  cat >"$REQ" <<EOF
# harnesspm probe: remove after the test
[hooks]
managed_dir = "$S"

[[hooks.SessionStart]]
[[hooks.SessionStart.hooks]]
type = "command"
command = "bash $S/hook.sh Managed-SessionStart"
timeout = 30

[[hooks.PostToolUse]]
[[hooks.PostToolUse.hooks]]
type = "command"
command = "bash $S/hook.sh Managed-PostToolUse"
timeout = 30
EOF
  echo "wrote managed hooks to $REQ" >>"$S/log/setup.log"
else
  echo "cannot write $REQ; managed hook skipped" >>"$S/log/setup.log"
fi

echo "harnesspm Codex probe v3 installed; shared folder: $S"
exit 0

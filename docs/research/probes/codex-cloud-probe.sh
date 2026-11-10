#!/bin/bash
# harnesspm Codex cloud probe: setup script for a PERSONAL Codex cloud environment.
# Paste into Codex -> Settings -> Environments -> (your environment) -> Setup script.
# Codex runs setup scripts in the repository root, after the clone.
#
# It answers open questions of the harnesspm spec (docs/research/agent-capabilities.md, Codex rows):
#   C1 env vars in model commands, hooks, MCP servers   C5 project .codex/ layer and hooks in the cloud
#   C2 ~/.codex/AGENTS.md                                C6 .rules files (forbidden)
#   C3 ~/.agents/skills and git-excluded .agents/skills  C7 MCP servers from user and project config
#   C4 developer_instructions in project .codex/config   C8 project custom agents (.codex/agents)
# It writes only under ~/.harnesspm-probe, ~/.codex, ~/.agents and git-excluded files in the clone.
# It logs only CODEX* / AI_AGENT values, with anything named like a secret redacted.
# Remove it from the environment after the test.
set -u
P="$HOME/.harnesspm-probe"
REPO="${PROBE_REPO:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
mkdir -p "$P/log" "$HOME/.codex/rules" "$HOME/.agents/skills"

# ---------- helper: filtered environment ----------
cat >"$P/envkeys.sh" <<'EOF'
#!/bin/bash
vals="$(env | grep -E '^(CODEX[A-Z0-9_]*|AI_AGENT|CLAUDECODE|CI)=' \
  | sed -E 's/^([A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*)=.*/\1=<redacted>/' | sort | tr '\n' ' ')"
names="$(env | cut -d= -f1 | grep -E 'AGENT|SANDBOX|CODEX' | sort | tr '\n' ' ')"
echo "values: ${vals:-none} | names: ${names:-none}"
EOF

# ---------- hook: log each call; SessionStart also prints a marker ----------
cat >"$P/hook.sh" <<'EOF'
#!/bin/bash
P="$HOME/.harnesspm-probe"; label="$1"
input="$(head -c 4000 2>/dev/null)"
event="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(`${j.hook_event_name||"?"} tool=${j.tool_name||""}`)}catch{process.stdout.write("no-json")}})' 2>/dev/null)"
echo "$(date -u +%FT%T.%3NZ) label=$label event=[$event] pwd=$PWD env: $(bash "$P/envkeys.sh")" >>"$P/log/hooks.log"
case "$label" in *SessionStart) echo "Probe word ($label hook stdout): ruby-lynx" ;; esac
exit 0
EOF

# ---------- MCP server: minimal stdio JSON-RPC, one tool ----------
cat >"$P/mcp.mjs" <<'EOF'
#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const label = process.argv[2] || 'unknown';
const log = `${process.env.HOME}/.harnesspm-probe/log/mcp.log`;
const env = Object.keys(process.env).filter((k) => /^CODEX|^AI_AGENT$/.test(k)).map((k) => (/KEY|TOKEN|SECRET|PASSWORD|AUTH/.test(k) ? `${k}=<redacted>` : `${k}=${process.env[k]}`)).join(' ');
appendFileSync(log, `${new Date().toISOString()} start ${label} ${env}\n`);
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const handle = (msg) => {
  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: `harnesspm-probe-${label}`, version: '0.0.1' } } });
  else if (msg.method === 'tools/list') send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'probe_ping', description: `harnesspm probe (${label}): returns a marker word`, inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call') { appendFileSync(log, `${new Date().toISOString()} call ${label}\n`); send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `PROBE-MCP-OK ${label} violet-crane` }] } }); }
  else if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
};
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; for (let i; (i = buf.indexOf('\n')) >= 0; ) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { handle(JSON.parse(line)); } catch {} } } });
EOF

# ---------- report: what the task prints ----------
cat >"$P/report.sh" <<'EOF'
#!/bin/bash
P="$HOME/.harnesspm-probe"; repo="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
section() { printf '\n== %s ==\n' "$1"; }
section "setup.log"; cat "$P/log/setup.log" 2>/dev/null || echo missing
section "command env (C1)"; bash "$P/envkeys.sh"
section "hooks.log (C1, C5)"; cat "$P/log/hooks.log" 2>/dev/null || echo "missing (no hook ran)"
section "mcp.log (C1, C7)"; cat "$P/log/mcp.log" 2>/dev/null || echo "missing (no MCP server started)"
section "probe files in $repo"; ls -la "$repo/.codex" "$repo/.codex/rules" "$repo/.codex/agents" "$repo/.agents/skills" 2>&1
echo "--- git status --short (must show nothing from the probe)"; git -C "$repo" status --short 2>&1
section "~/.codex"; ls -la "$HOME/.codex" 2>&1; echo "--- config.toml table headers"; grep -nE '^\[' "$HOME/.codex/config.toml" 2>&1
EOF
chmod +x "$P"/*.sh "$P/mcp.mjs"

hookjson() { # $1 = label prefix
  cat <<JSON
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash $P/hook.sh $1-SessionStart", "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "bash $P/hook.sh $1-UserPromptSubmit", "timeout": 30 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "bash $P/hook.sh $1-PostToolUse", "timeout": 30 }] }]
  }
}
JSON
}

# ---------- setup facts ----------
{
  echo "setup ran at $(date -u +%FT%T.%3NZ) as $(id -un) home=$HOME pwd=$PWD repo=$REPO"
  echo "setup env: $(bash "$P/envkeys.sh")"
  echo "codex cli: $(command -v codex || echo none) $(codex --version 2>/dev/null || true)"
  echo "existing ~/.codex: $(ls -A "$HOME/.codex" 2>/dev/null | tr '\n' ' ')"
  echo "existing config.toml tables: $(grep -E '^\[' "$HOME/.codex/config.toml" 2>/dev/null | tr '\n' ' ')"
} >>"$P/log/setup.log" 2>&1

# ---------- user level ----------
grep -qF amber-falcon "$HOME/.codex/AGENTS.md" 2>/dev/null || printf '\n%s\n' "Probe word (user ~/.codex/AGENTS.md): amber-falcon" >>"$HOME/.codex/AGENTS.md"
mkdir -p "$HOME/.agents/skills/probe-user-skill"
cat >"$HOME/.agents/skills/probe-user-skill/SKILL.md" <<'EOF'
---
name: probe-user-skill
description: harnesspm probe skill from ~/.agents/skills. Use only when asked for the user probe skill word.
---

The user probe skill word is teal-sparrow.
EOF
hookjson User >"$HOME/.codex/hooks.json"
echo 'prefix_rule(pattern = ["echo", "forbidden-probe-user"], decision = "forbidden", justification = "harnesspm probe: user rule")' >"$HOME/.codex/rules/probe.rules"
if ! grep -qF "harnesspm-probe-user" "$HOME/.codex/config.toml" 2>/dev/null; then
  {
    echo ""
    echo "# harnesspm probe"
    grep -qE '^\[features\]' "$HOME/.codex/config.toml" 2>/dev/null || printf '[features]\nhooks = true\n\n'
    printf '[mcp_servers.harnesspm-probe-user]\ncommand = "node"\nargs = ["%s/mcp.mjs", "user"]\n\n' "$P"
    printf '[projects."%s"]\ntrust_level = "trusted"\n' "$REPO"
  } >>"$HOME/.codex/config.toml"
fi

# ---------- project level (git-excluded) ----------
if git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  if [ -z "$(git -C "$REPO" ls-files .codex | head -1)" ]; then
    mkdir -p "$REPO/.codex/rules" "$REPO/.codex/agents"
    printf 'developer_instructions = "Probe word (project .codex/config.toml developer_instructions): jade-otter"\n\n[mcp_servers.harnesspm-probe-project]\ncommand = "node"\nargs = ["%s/mcp.mjs", "project"]\n' "$P" >"$REPO/.codex/config.toml"
    hookjson Project >"$REPO/.codex/hooks.json"
    echo 'prefix_rule(pattern = ["echo", "forbidden-probe-project"], decision = "forbidden", justification = "harnesspm probe: project rule")' >"$REPO/.codex/rules/probe.rules"
    printf 'name = "probe_agent"\ndescription = "harnesspm probe agent. Use only when asked for the probe agent."\ndeveloper_instructions = """\nReply with exactly: PROBE-AGENT-OK violet-crane\n"""\n' >"$REPO/.codex/agents/probe_agent.toml"
    echo "wrote project .codex/" >>"$P/log/setup.log"
  else
    echo "project .codex/ is tracked; skipped" >>"$P/log/setup.log"
  fi
  mkdir -p "$REPO/.agents/skills/probe-repo-skill"
  cat >"$REPO/.agents/skills/probe-repo-skill/SKILL.md" <<'EOF'
---
name: probe-repo-skill
description: harnesspm probe skill from the repository's .agents/skills. Use only when asked for the repo probe skill word.
---

The repo probe skill word is plum-badger.
EOF
  ex="$(git -C "$REPO" rev-parse --git-path info/exclude)"; case "$ex" in /*) ;; *) ex="$REPO/$ex" ;; esac
  mkdir -p "$(dirname "$ex")"
  for f in /.codex/ /.agents/skills/probe-repo-skill/; do grep -qxF "$f" "$ex" 2>/dev/null || echo "$f" >>"$ex"; done
else
  echo "no git checkout at $REPO" >>"$P/log/setup.log"
fi

echo "harnesspm Codex probe installed; log: $P/log/setup.log"
exit 0

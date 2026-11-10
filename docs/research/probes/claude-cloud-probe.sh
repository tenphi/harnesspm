#!/bin/bash
# harnesspm cloud probe: setup script for a PERSONAL Claude Code cloud environment.
# Paste into claude.ai/code -> environment menu -> Edit (your own environment) -> Setup script.
#
# It answers open questions of the harnesspm spec (docs/spec/09-cloud.md, 13-open-questions.md §13.8):
#   Q1 hooks in ~/.claude/settings.json fire            Q4 setup script runs before/after the clone
#   Q2 a clone-local .claude/settings.local.json works  Q5 env vars in setup, hooks and MCP servers
#   Q3 CLAUDE.local.md and SessionStart output reach    Q6 a user-scope MCP server works
#      the agent
# It writes only under ~/.harnesspm-probe and ~/.claude, plus git-excluded files in a clone.
# It logs only these variables: CLAUDECODE, AI_AGENT, CLAUDE_PROJECT_DIR, CLAUDE_CODE_REMOTE,
# CLAUDE_CODE_ENTRYPOINT, CI, CODEX*. Remove it from the environment after the test.
set -u
P="$HOME/.harnesspm-probe"
ROOTS="${PROBE_SEARCH_ROOT:-/workspace /home}"   # where checkouts may be; a test switch for dry runs
mkdir -p "$P/log" "$HOME/.claude"

# ---------- helper: log a filtered environment ----------
cat >"$P/envkeys.sh" <<'EOF'
#!/bin/bash
env | grep -E '^(CLAUDECODE|AI_AGENT|CLAUDE_PROJECT_DIR|CLAUDE_CODE_REMOTE|CLAUDE_CODE_ENTRYPOINT|CI|CODEX[A-Z_]*)=' | sort | tr '\n' ' '
EOF

# ---------- helper: write clone-local files the way `harnesspm sync` would ----------
cat >"$P/write-local.sh" <<'EOF'
#!/bin/bash
# usage: write-local.sh <repo dir> <label> <word>
dir="$1"; label="$2"; word="$3"; P="$HOME/.harnesspm-probe"
git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repo: $dir"; exit 0; }
line="Probe word ($label, CLAUDE.local.md): $word"
grep -qxF "$line" "$dir/CLAUDE.local.md" 2>/dev/null || printf '%s\n' "$line" >>"$dir/CLAUDE.local.md"
mkdir -p "$dir/.claude"
node - "$dir/.claude/settings.local.json" "bash $P/hook.sh Local-$label" <<'NODE'
const fs = require('node:fs');
const [file, command] = process.argv.slice(2);
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
s.env = { ...(s.env || {}), PROBE_LOCAL_SETTINGS_ENV: '1' };
s.hooks ??= {}; s.hooks.PostToolUse ??= [];
if (!JSON.stringify(s.hooks.PostToolUse).includes(command))
  s.hooks.PostToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command }] });
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
NODE
ex="$(git -C "$dir" rev-parse --git-path info/exclude)"; case "$ex" in /*) ;; *) ex="$dir/$ex" ;; esac
mkdir -p "$(dirname "$ex")"
for f in /CLAUDE.local.md /.claude/settings.local.json; do grep -qxF "$f" "$ex" 2>/dev/null || echo "$f" >>"$ex"; done
echo "wrote $label files into $dir"
EOF

# ---------- hook: log every call; SessionStart also writes clone-local files and prints context ----------
cat >"$P/hook.sh" <<'EOF'
#!/bin/bash
# usage: hook.sh <label>
P="$HOME/.harnesspm-probe"; label="$1"
input="$(head -c 4000 2>/dev/null)"
event="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(`${j.hook_event_name||"?"} source=${j.source||""} tool=${j.tool_name||""}`)}catch{process.stdout.write("no-json")}})' 2>/dev/null)"
echo "$(date -u +%FT%T.%3NZ) label=$label event=[$event] pwd=$PWD env: $(bash "$P/envkeys.sh")" >>"$P/log/hooks.log"
if [ "$label" = "UserSessionStart" ]; then
  bash "$P/write-local.sh" "${CLAUDE_PROJECT_DIR:-$PWD}" "SessionStart" "ruby-lynx" >>"$P/log/hooks.log" 2>&1
  echo "Probe word (SessionStart hook stdout): cobalt-heron"
fi
exit 0
EOF

# ---------- MCP server: minimal stdio JSON-RPC, one tool ----------
cat >"$P/mcp.mjs" <<'EOF'
#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const log = `${process.env.HOME}/.harnesspm-probe/log/mcp.log`;
const keys = ['CLAUDECODE', 'AI_AGENT', 'CLAUDE_PROJECT_DIR'].map((k) => `${k}=${process.env[k] ?? ''}`).join(' ');
appendFileSync(log, `${new Date().toISOString()} start ${keys}\n`);
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const handle = (msg) => {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'harnesspm-probe', version: '0.0.1' } } });
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'probe_ping', description: 'harnesspm probe: returns a marker word', inputSchema: { type: 'object', properties: {} } }] } });
  } else if (msg.method === 'tools/call') {
    appendFileSync(log, `${new Date().toISOString()} call ${msg.params?.name}\n`);
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'PROBE-MCP-OK violet-crane' }] } });
  } else if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
  }
};
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) { try { handle(JSON.parse(line)); } catch {} }
  }
});
EOF

# ---------- report: what the test session prints ----------
cat >"$P/report.sh" <<'EOF'
#!/bin/bash
P="$HOME/.harnesspm-probe"; repo="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
section() { printf '\n== %s ==\n' "$1"; }
if [ "${1:-}" != "hooks" ]; then
  section "setup.log (Q4, Q5)"; cat "$P/log/setup.log" 2>/dev/null || echo "missing"
  section "bash tool env (Q5)"; bash "$P/envkeys.sh"; echo
  section "settings env (Q1 control, Q2)"
  echo "PROBE_USER_SETTINGS_ENV=${PROBE_USER_SETTINGS_ENV:-unset} PROBE_LOCAL_SETTINGS_ENV=${PROBE_LOCAL_SETTINGS_ENV:-unset}"
  section "clone files (Q2, Q3) in $repo"
  for f in CLAUDE.local.md .claude/settings.local.json; do echo "--- $f"; cat "$repo/$f" 2>/dev/null || echo "missing"; done
  echo "--- git status --short (must show nothing from the probe)"; git -C "$repo" status --short 2>&1
  section "mcp.log (Q6)"; cat "$P/log/mcp.log" 2>/dev/null || echo "missing"
fi
section "hooks.log (Q1, Q2, Q5)"; cat "$P/log/hooks.log" 2>/dev/null || echo "missing"
EOF
chmod +x "$P"/*.sh "$P/mcp.mjs"

# ---------- Q4, Q5: when the setup script runs, and with which environment ----------
{
  echo "setup ran at $(date -u +%FT%T.%3NZ) as $(id -un) home=$HOME pwd=$PWD"
  echo "setup env: $(bash "$P/envkeys.sh")"
  echo "claude cli: $(command -v claude || echo none)"
  echo "git checkouts visible now: $(find $ROOTS -maxdepth 3 -type d -name .git -not -path "$HOME/.*" 2>/dev/null | head -20 | tr '\n' ' ')"
} >>"$P/log/setup.log" 2>&1

# Q3 control: personal instructions in ~/.claude/CLAUDE.md (already known to load)
grep -qF "amber-falcon" "$HOME/.claude/CLAUDE.md" 2>/dev/null || printf '\n%s\n' "Probe word (user ~/.claude/CLAUDE.md): amber-falcon" >>"$HOME/.claude/CLAUDE.md"

# Q2, Q4: if a checkout already exists, write clone-local files now as well
for g in $(find $ROOTS -maxdepth 3 -type d -name .git -not -path "$HOME/.*" 2>/dev/null | head -5); do
  bash "$P/write-local.sh" "$(dirname "$g")" "setup" "jade-otter" >>"$P/log/setup.log" 2>&1
done

# Q1: user-level hooks and env in ~/.claude/settings.json (merged, nothing else changed)
node - "$HOME/.claude/settings.json" "$P" <<'NODE' >>"$P/log/setup.log" 2>&1 || echo "settings merge failed" >>"$P/log/setup.log"
const fs = require('node:fs');
const [file, P] = process.argv.slice(2);
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
s.env = { ...(s.env || {}), PROBE_USER_SETTINGS_ENV: '1' };
s.hooks ??= {};
const add = (event, label, matcher) => {
  const command = `bash ${P}/hook.sh ${label}`;
  s.hooks[event] ??= [];
  if (!JSON.stringify(s.hooks[event]).includes(command))
    s.hooks[event].push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command }] });
};
add('SessionStart', 'UserSessionStart');
add('UserPromptSubmit', 'UserPromptSubmit');
add('PostToolUse', 'UserPostToolUse', 'Bash');
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
console.log('user settings merged:', file);
NODE

# Q6: a user-scope MCP server
SERVER="{\"type\":\"stdio\",\"command\":\"node\",\"args\":[\"$P/mcp.mjs\"]}"
if [ -z "${PROBE_DRY_RUN:-}" ] && command -v claude >/dev/null 2>&1; then
  timeout 60 claude mcp add-json harnesspm-probe "$SERVER" --scope user >>"$P/log/setup.log" 2>&1 \
    && echo "mcp: added with claude CLI" >>"$P/log/setup.log" \
    || echo "mcp: claude CLI failed" >>"$P/log/setup.log"
else
  echo "mcp: no claude CLI during setup, skipped" >>"$P/log/setup.log"
fi

echo "harnesspm probe installed; log: $P/log/setup.log"
exit 0

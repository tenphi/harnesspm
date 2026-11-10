This is a configuration test for the harnesspm specification, set up by the owner of this environment. Do not commit, open a pull request, or edit or create files.

0. Run `id; echo "HOME=$HOME CODEX_HOME=${CODEX_HOME:-unset}"; pwd; ls -la /opt/harnesspm-probe /tmp/harnesspm-probe 2>&1 | head -20` and paste the output.
1. Before you run any other command: list every line that starts with "Probe word" that you can see in your instructions or context, exactly as written. Also list the names of all skills you can see whose names start with "probe". If you see none, say "none". Do not search files for them.
2. If you have MCP tools from servers named `harnesspm-probe-user` or `harnesspm-probe-project`, call each server's `probe_ping` and quote the output exactly. Otherwise say which ones are missing, and list the MCP servers you have.
3. Run these as two separate commands and report for each whether it ran or was blocked, with any message you got: `echo forbidden-probe-user` and `echo forbidden-probe-project`.
4. If the skill `probe-user-skill` is available, use it and report its word. Do the same for `probe-repo-skill`.
5. If a custom agent named `probe_agent` is available, ask it to reply and quote its reply exactly. Otherwise say it is not available.
6. Run `bash /opt/harnesspm-probe/report.sh 2>/dev/null || bash /tmp/harnesspm-probe/report.sh` and paste its full output in a code block.

Report only what you saw. Do not try to fix anything.

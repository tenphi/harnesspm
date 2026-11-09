# Prior art

Tools and conventions for sharing agent harness, checked in November 2026. The question for each: does it move harness **from installed npm packages**, **through dependency chains**, with **per-unit overrides**, **rules as well as skills**, for **Claude Code and Codex**?

## Summary

| Tool | npm, installed version | Transitive | Per-unit override | Rules and docs | Claude Code | Codex | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [aicm](https://github.com/ranyitz/aicm) | ✅ presets are npm packages | ✅ nested presets | ❌ last one wins | ✅ | ✅ | ✅ | **Deprecated** |
| [rulesync](https://github.com/dyoshikawa/rulesync) | ⚠️ experimental npm source; fetches exact versions from the registry | ❓ | ⚠️ by name | ⚠️ rules and skills from sources | ✅ | ✅ | Very active |
| [Microsoft APM](https://github.com/microsoft/apm) | ❌ git only | ✅ | ⚠️ | ✅ | ✅ | ✅ | Active, Python |
| [TanStack Intent](https://tanstack.com/intent/latest/docs) | ✅ | ⚠️ scans installed packages | ⚠️ allowlist | ❌ skills plus a pointer block | ✅ | ✅ | Alpha |
| [Vercel `skills`](https://www.npmjs.com/package/skills) sync | ✅ | ⚠️ manual chains | ⚠️ include/exclude | ❌ skills only | ✅ | ✅ | Sync is experimental |
| [pnpm](https://pnpm.io/agent-skills) 12.11+ | ✅ | ❌ direct dependencies | ⚠️ approve per skill | ❌ skills only | ✅ | ✅ | Built in |
| [nodus](https://docs.rs/crate/nodus/0.2.1/source/README.md) | ❌ git and local | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | Early |
| [AGENTS.lock](https://github.com/luml-ai/AGENTS.lock), [dotagents](https://github.com/getsentry/dotagents) | ❌ git | ❌ | ❌ | ⚠️ | ✅ | ✅ | Early |
| Claude Code plugins | ✅ npm source in a marketplace | plugin dependencies | whole plugin only | ❌ no always-on rules | ✅ | ❌ | Stable |

## Notes

- **aicm** had the closest model: npm presets, nested presets, managed blocks in `AGENTS.md` and `CLAUDE.md`. Its README says it is no longer maintained.
- **rulesync** converts one source folder into files for dozens of agents. It is a format converter, not a bridge between packages: it does not read what is installed in `node_modules` and does not resolve dependency chains.
- **APM** resolves a full dependency tree for several agents, but only from git, so its versions can drift from the npm versions a project installed.
- **Next.js 16.3** ships its docs inside the package and writes a managed block into `AGENTS.md` that points at them. It retired its "knowledge" skills in favor of that block. ([blog](https://nextjs.org/blog/next-16-3-ai-improvements))
- **Vercel's agent evaluation** found that a short docs index in `AGENTS.md` beat skills that agents had to choose to load. ([blog](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals))
- **Earlier `package.json` field proposals** for agent assets were closed. Tack therefore uses a folder, not a field.

## Conclusion

No tool combines npm as the source, transitive layering, per-unit overrides, rules as well as skills, and executable units with trust. Tack builds that part and reuses standards for everything else ([10-standards.md](../spec/10-standards.md)).

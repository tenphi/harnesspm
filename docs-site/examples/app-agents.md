- Every package of this harness: `npx -y @tenphi/harnesspm help`. A package's rules and tools in full: `npx -y @tenphi/harnesspm help <package>`.
- Run a tool: `npx -y @tenphi/harnesspm run <tool> [args]`. Its options: `npx -y @tenphi/harnesspm help <tool>`.
- From outside this folder, add `-C <path to this folder>` before `help` or `run`.

## @acme/colors (via @acme/ui)

- Always-on rule: Acme Colors — Where colors come from, Contrast. Read it with `help @acme/colors` (acme-colors:rules/usage)
- Docs: node_modules/.harnesspm/docs/acme-colors/llms.txt (acme-colors:docs)
- Tool: `acme-colors:contrast` — Measure the WCAG contrast of a text color on a background (acme-colors:scripts/contrast)

## @acme/styles (via @acme/ui)

- Always-on rule: Acme Styles — Tokens, States. Read it with `help @acme/styles` (acme-styles:rules/usage)
- When editing `**/*.tsx`, read node_modules/.harnesspm/pkgs/@acme/styles/harness/dev.harnesspm/rules/components.md — How to style a component (acme-styles:rules/components)
- Docs: node_modules/.harnesspm/docs/acme-styles/llms.txt (acme-styles:docs)
- Tool: `acme-styles:check` — Check the styles in a file (acme-styles:scripts/check)
- Edit files with your file tools, not shell commands such as `sed`, so the hook that checks each edit runs (acme-styles:hooks/check-edit)

## @acme/ui

- Always-on rule: Acme UI — Components, Colors. Read it with `help @acme/ui` (acme-ui:rules/usage)
- Docs: node_modules/.harnesspm/docs/acme-ui/llms.txt (acme-ui:docs)
- Tool: `acme-ui:tokens` — Find a color token by a part of its name, with its light and dark values (acme-ui:scripts/tokens)
…

## @acme/colors 2.1.0 (via @acme/ui)

### Acme Colors (acme-colors:rules/usage)

#### Where colors come from

- In an app on Acme UI, colors are Acme UI tokens: follow the Acme UI rule.
- Do not define a theme of your own. Acme UI ships one.
…
- Docs: node_modules/.harnesspm/docs/acme-colors/llms.txt (acme-colors:docs)
- Script: `npx harnesspm run acme-colors:contrast` — Measure the WCAG contrast of a text color on a background (acme-colors:scripts/contrast)
…
## @acme/ui 4.2.0

### Acme UI (acme-ui:rules/usage)
…
- Colors are Acme UI tokens, written `#name`, such as `#surface` or `#danger-text`. Never paste raw `#rrggbb`, `rgb()` or `hsl()` values.
- To find a token, run `acme-ui:tokens <part of its name>`. Put a text token on the surface it was made for.
…

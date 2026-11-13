## @tenphi/glaze 3.1.0 (via @cube-dev/ui-kit)

### Glaze colors (glaze:rules/colors)

#### Where colors come from

- In an app on UI Kit, colors are UI Kit palette tokens: follow the UI Kit rule.
…
- Docs: node_modules/.harnesspm/docs/glaze/llms.txt (glaze:docs)
- Script: `npx harnesspm run glaze:contrast` — Measure the WCAG and APCA contrast of a text color on a background (glaze:scripts/contrast)
…
## @cube-dev/ui-kit 0.212.0

### UI Kit (uikit:rules/usage)
…
- Colors are UI Kit palette tokens, written `#name`, such as `#surface`, `#surface-text` or `#danger-accent-text`. Never paste raw `#rrggbb`, `rgb()` or `hsl()` values.
- To find a token, run `uikit:tokens <part of its name>`. It shows the token's values in light, dark and high contrast, its contrast against the base it was made for, and what an alias such as `#dark` resolves to. Put a text token on its base. The Usage guide lists the legacy aliases that new code avoids.
…

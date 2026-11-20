/**
 * Writes the example project that the site's examples come from: an app on
 * `@acme/ui`, a design system that passes on the harness of `@acme/colors`
 * and `@acme/styles`. The packages are made up, so the examples name no real
 * library, and the output is still real: run harnesspm in the app.
 *
 *   node docs-site/examples/acme.mjs <new folder>
 *   cd <new folder>/app
 *   export HOME=<new folder>/home          # keeps your own ~/.claude and ~/.codex untouched
 *   node <this repository>/src/cli.ts init
 *
 * Run the commands in your own terminal: when an agent's model runs them,
 * new hooks and allow rules stay pending, and the output says so.
 *
 * `--upgrade` writes `@acme/ui` 4.3.0 with a changed `tokens` script, for the
 * upgrade example: run it on the same folder after the first `sync`.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const upgrade = args.includes('--upgrade');
const target = args.find((arg) => !arg.startsWith('--'));
if (target === undefined) {
  console.error('Usage: node docs-site/examples/acme.mjs <new folder> [--upgrade]');
  process.exit(1);
}

const root = path.resolve(target);
const app = path.join(root, 'app');
const repository = fileURLToPath(new URL('../..', import.meta.url));
const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function write(base, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(base, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

/** An installed package: package.json, harness/plugin.json and its other files. */
function install(name, version, plugin, extension, files) {
  write(path.join(app, 'node_modules', name), {
    'package.json': json({ name, version, repository: `https://github.com/acme/${name.split('/')[1]}` }),
    'harness/plugin.json': json({ $schema: SCHEMA, name: plugin, extensions: { 'dev.harnesspm': extension } }),
    ...files,
  });
}

const skill = (name, description, body) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
const page = (title, description, body) => `---\ndescription: ${description}\n---\n\n# ${title}\n\n${body}\n`;

const ui = {
  extension: {
    extends: ['@acme/colors', '@acme/styles'],
    patch: { 'acme-colors:rules/usage': './dev.harnesspm/patches/acme-colors-usage.patch.md' },
    docs: '../docs',
    scripts: {
      tokens: { file: './dev.harnesspm/scripts/tokens.mjs', description: 'Find a color token by a part of its name, with its light and dark values', usage: '<part of a token name>', allow: true },
    },
  },
  files: {
    'harness/dev.harnesspm/rules/usage.md': [
      '# Acme UI',
      '',
      '## Components',
      '',
      '- Use an Acme UI component before you write your own. The docs index lists every component.',
      '',
      '## Colors',
      '',
      '- Colors are Acme UI tokens, written `#name`, such as `#surface` or `#danger-text`. Never paste raw `#rrggbb`, `rgb()` or `hsl()` values.',
      '- To find a token, run `acme-ui:tokens <part of its name>`. Put a text token on the surface it was made for.',
      '',
    ].join('\n'),
    'harness/dev.harnesspm/patches/acme-colors-usage.patch.md': [
      '## Where colors come from',
      '',
      '- In an app on Acme UI, colors are Acme UI tokens: follow the Acme UI rule.',
      '- Do not define a theme of your own. Acme UI ships one.',
      '',
    ].join('\n'),
    'harness/dev.harnesspm/scripts/tokens.mjs': [
      "const tokens = { '#surface': ['#ffffff', '#16181d'], '#surface-text': ['#1f2329', '#e6e8eb'], '#danger-text': ['#b3261e', '#ff8a80'] };",
      "const part = process.argv[2] ?? '';",
      'for (const [name, [light, dark]] of Object.entries(tokens)) {',
      '  if (name.includes(part)) console.log(`${name}  light ${light}  dark ${dark}`);',
      '}',
      '',
    ].join('\n'),
    'harness/skills/acme-ui-review/SKILL.md': skill(
      'acme-ui-review',
      "Reviews a UI change against Acme UI's rules. Use when asked to review a component, a page or a UI pull request.",
      '1. Read the changed files.\n2. Check each against the Acme UI rule and the component docs.\n3. Report every problem with its file and line.',
    ),
    'docs/button.md': page('Button', 'The Button component, its types, sizes and states', 'A button starts an action.'),
    'docs/tokens.md': page('Tokens', 'Every color token and the surface it belongs to', 'A text token belongs to one surface.'),
  },
};

function installPackages() {
  install('@acme/colors', '2.1.0', 'acme-colors', {
    docs: '../docs',
    scripts: {
      contrast: { file: './dev.harnesspm/scripts/contrast.mjs', description: 'Measure the WCAG contrast of a text color on a background', usage: '<text color> <background color>, each as #rrggbb', allow: true },
    },
  }, {
    'harness/dev.harnesspm/rules/usage.md': [
      '# Acme Colors',
      '',
      '## Where colors come from',
      '',
      '- Define every color once, in the theme file. Components use its tokens.',
      '- Never write dark or high-contrast values by hand. They are derived from the light theme.',
      '',
      '## Contrast',
      '',
      '- Body text needs a contrast ratio of at least 4.5 against its background.',
      '',
    ].join('\n'),
    'harness/dev.harnesspm/scripts/contrast.mjs': [
      'const luminance = (hex) => {',
      '  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));',
      '  return 0.2126 * r + 0.7152 * g + 0.0722 * b;',
      '};',
      'const [text, background] = process.argv.slice(2).map(luminance);',
      'console.log(((Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05)).toFixed(2));',
      '',
    ].join('\n'),
    'harness/skills/acme-colors-theme/SKILL.md': skill(
      'acme-colors-theme',
      'Creates or changes a color theme. Use when asked for a theme, a palette or brand colors.',
      '1. Ask for the brand color.\n2. Write the light theme.\n3. Check every text pair with the `acme-colors:contrast` script.',
    ),
    'docs/themes.md': page('Themes', 'How to define a theme and its tokens', 'A theme is one file.'),
    'docs/contrast.md': page('Contrast', 'The contrast floors and how to measure a pair', 'Body text needs 4.5.'),
  });

  install('@acme/styles', '3.4.1', 'acme-styles', {
    docs: '../docs',
    scripts: {
      check: { file: './dev.harnesspm/scripts/check.mjs', description: 'Check the styles in a file', allow: true },
    },
  }, {
    'harness/dev.harnesspm/rules/usage.md': [
      '# Acme Styles',
      '',
      '## Tokens',
      '',
      '- Never put dynamic values into styles. Use tokens.',
      '',
      '## States',
      '',
      '- Put every state of an element in one style map, default first.',
      '',
    ].join('\n'),
    'harness/dev.harnesspm/rules/components.md': '---\ndescription: How to style a component\npaths: ["**/*.tsx"]\n---\n\n# Styling a component\n\n- One style map per element.\n',
    'harness/dev.harnesspm/scripts/check.mjs': "// A real package lints the file here.\nconsole.log('styles: ok');\n",
    'harness/dev.harnesspm/hooks.json': json({ hooks: { PostToolUse: [{ id: 'check-edit', matcher: { claude: 'Edit|Write' }, run: 'check', timeout: 30 }] } }),
    'docs/styles.md': page('Styles', 'Style maps, tokens and states', 'A style map holds every state.'),
  });

  install('@acme/ui', '4.2.0', 'acme-ui', ui.extension, ui.files);
}

if (upgrade) {
  // The new version changes the script, so the lock shows a new hash.
  install('@acme/ui', '4.3.0', 'acme-ui', ui.extension, {
    ...ui.files,
    'harness/dev.harnesspm/scripts/tokens.mjs': ui.files['harness/dev.harnesspm/scripts/tokens.mjs'].replace("?? ''", "?? '#'"),
  });
  console.log(`Wrote @acme/ui 4.3.0 into ${app}. Run \`sync\` there.`);
} else {
  if (fs.existsSync(root) && fs.readdirSync(root).length > 0) {
    console.error(`${root} is not empty. Name a new folder.`);
    process.exit(1);
  }
  const own = JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8'));
  write(app, {
    'package.json': json({ name: 'app', version: '1.0.0', private: true, dependencies: { '@acme/ui': '^4.2.0' }, devDependencies: { [own.name]: `^${own.version}` } }),
    '.gitignore': 'node_modules\n',
    // An install writes a lockfile, and `init` names it with the files to commit.
    'package-lock.json': json({ name: 'app', version: '1.0.0', lockfileVersion: 3, requires: true, packages: {} }),
  });
  installPackages();
  // harnesspm itself, as an install puts it: the files the npm package ships.
  const self = path.join(app, 'node_modules', own.name);
  write(self, { 'package.json': json({ name: own.name, version: own.version, repository: own.repository }) });
  for (const entry of ['harness', 'docs/spec', 'schema']) fs.cpSync(path.join(repository, entry), path.join(self, entry), { recursive: true });
  fs.mkdirSync(path.join(root, 'home'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: app });
  console.log(`Wrote the example app into ${app}.`);
}

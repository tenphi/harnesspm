# 7. Personal harness

Every developer can add their own rules, skills, sub-agents, scripts, hooks, MCP servers and permissions on top of the team's harness. A personal harness is an ordinary harness package (see [02-package-format.md](02-package-format.md)) that belongs to one person.

## 7.1 Two personal layers

| Layer | Applies to | Configured in | Outputs |
| --- | --- | --- | --- |
| 🌍 1. Global personal | Every project on this machine, including projects without Tack | `~/.tack/config.json` | User-level agent folders, see [04-outputs.md](04-outputs.md#45-global-personal-outputs-layer-1) |
| 🙋 4. Local personal | One project | `tack.local.json`, `harness.local/`, or a `projects` entry in a personal harness | Git-excluded project files, see [04-outputs.md](04-outputs.md#44-local-personal-outputs-layer-4) |

The local personal layer is the highest layer, so a developer has the last word on their own machine. `tack status` shows every personal change to team units, so it stays visible.

## 7.2 Sources

| Source | Example | Editable? | Where it lives |
| --- | --- | --- | --- |
| Folder in the project | `./harness.local` | yes | In place. Excluded from git. Picked up even without `tack.local.json`. |
| Folder on disk | `~/dev/my-harness` | yes | In place. Usually the developer's own git repository. |
| Git repository | `github:andrew/harness#main` | yes | A git working copy in `~/.tack/personal/<plugin name>/` |
| npm package | `npm:@andrew/harness@^2` | no | `~/.tack/cache/`. Installed with `--ignore-scripts`. |

npm and git sources never touch the project's `package.json` or lockfile. Exact versions and hashes go into `tack.local.lock.json` or `~/.tack/state.json`.

### Adding a source

```bash
npx tack personal add github:andrew/harness            # global: every project
npx tack personal add ./harness.local --project        # this project only
```

`~/.tack/config.json` (global) and `tack.local.json` (one project) have the same shape:

```json
{
  "extends": ["github:andrew/harness#main", "~/dev/work-harness"],
  "exclude": ["uikit:skills/uikit-storybook"],
  "replace": { "tasty:rules/lint-comments": "./harness.local/rules/lint-comments.md" },
  "trust": { "github:andrew/harness": true }
}
```

A developer can have several personal harnesses, for example one for work and one for private projects.

## 7.3 Per-project entries

A personal harness can carry tweaks for specific projects. They are matched by the project's git remote, so they also work in a fresh clone in a cloud session.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "andrew",
  "extensions": {
    "io.github.tenphi.tack": {
      "projects": {
        "github.com/cube-js/cube-ui-kit": "./projects/cube-ui-kit",
        "github.com/tenphi/cookbook": "./projects/cookbook"
      }
    }
  }
}
```

Each value is a folder inside the personal harness. That folder is a harness root of its own: it can hold rules, skills, scripts, a `plugin.json` with `replace` and `exclude`, and so on. Its units join the **local personal** layer of the matching project.

## 7.4 Editing and pushing back

A developer must be able to improve their personal harness from any project and any session, then save the change to their own repository. This covers every unit kind: rules, skills, sub-agents, scripts, hooks, MCP servers, permissions, per-project entries, and the harness's own `extends`.

### 7.4.1 Edit in place

1. Git and folder sources are **working copies**. Tack never copies them, so there is one place to edit.
2. Skill, sub-agent and file-scoped rule outputs are **links** into the working copy. Editing a linked file edits the source.
3. Generated text, such as the block in `CLAUDE.local.md`, names the source file of each rule. Agents MUST edit the source, never the output. Tack's own harness ships a rule that says so (see [11-dogfooding.md](11-dogfooding.md)).
4. Tack gives the agents write access to the working copies:

| Agent | Setting |
| --- | --- |
| Claude Code | The working copy is added to `permissions.additionalDirectories` (user settings for global sources, `.claude/settings.local.json` for project sources) |
| Codex | The working copy is added to `sandbox_workspace_write.writable_roots` (user config for global sources, the generated `.codex/config.toml` for project sources) |

### 7.4.2 Create new units

```bash
npx tack personal new rule commit-style            # global
npx tack personal new skill andrew-review          # global
npx tack personal new rule staging-tenant --project  # only this project, under projects/<repo>/
npx tack personal extend npm:@tenphi/entropy       # add to the personal harness's own extends
```

`new` writes a valid file from a template in the right folder and runs `tack sync`, so the agent can use the unit right away.

Tack's own harness ships the skill `tack-personal`. It tells agents how to choose between global and per-project, where each unit kind goes, and how to save.

### 7.4.3 Save, push and pull

| Command | What it does |
| --- | --- |
| `tack personal status` | Lists changed files in every working copy. |
| `tack personal diff` | Shows the changes. |
| `tack personal save -m "<message>"` | Validates the harness (the same checks as `tack pack-check`) and commits in the working copy. |
| `tack personal push` | Pushes the commits. `--branch <name>` pushes to a new branch instead, for review. |
| `tack personal pull` | Fetches and rebases. On a conflict it stops and reports. It never drops local changes. |

Rules:

1. `save` MUST refuse to commit when validation fails.
2. `save` MUST refuse to commit files that look like secrets (tokens, private keys, `.env` files) and name them.
3. When `push` has no access to the remote, Tack writes the commits as a patch to `~/.tack/outbox/<time>.patch` and prints how to apply it elsewhere. Nothing is lost.
4. Several projects and sessions on one machine share one working copy. `save` commits all pending changes in it and lists them first.
5. npm sources are read-only. To change one, edit its git source and publish a new version.

## 7.5 Privacy

1. Personal units MUST NOT be written into tracked files (see [04-outputs.md](04-outputs.md#41-principles)).
2. CI ignores personal layers (see [03-resolution.md](03-resolution.md#39-ci)).
3. In a cloud environment that several people share, the environment's setup script and cache are shared too. Personal setup belongs in the developer's own environment. See [08-cloud.md](08-cloud.md).

## 7.6 Memory

"Memory" is not part of v1. Editing and pushing back (7.4) already lets an agent keep what it learned as rules, notes or skills in the personal harness. What a dedicated memory unit would add is an open question. See [12-open-questions.md](12-open-questions.md#121-memory).

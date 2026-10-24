# ai-tools

Sohedra's AI tools: a monorepo of plugins for Claude Code, Codex and pi.

## Layout

```
plugins/<concept>/        one plugin per concept, installable on its own
  .claude-plugin/plugin.json
  .codex-plugin/plugin.json
  package.json            pi package (npm-publishable)
  skills/<name>/SKILL.md  shared by all three tools
  agents/ extensions/ prompts/ themes/   optional; agents are Claude Code only; extensions, prompts, themes are pi only
.claude-plugin/marketplace.json     Claude Code marketplace (lists every plugin)
.agents/plugins/marketplace.json    Codex marketplace (lists every plugin)
package.json              root pi package, globs plugins/*/…
```

## Plugins

None yet.

Skills work in Claude Code, Codex and pi. Agents work in Claude Code only (pi needs the `pi-subagents` extension; Codex agents are separate TOML files).

## New plugin

Create `plugins/<name>/` with the three manifests and a `skills/` folder, then add an entry to both marketplace files. Run `pnpm check` to validate. See `AGENTS.md` for the rules and `CONTRIBUTING.md` for the workflow.

## Install

```bash
# Claude Code
/plugin marketplace add sohedra/ai-tools
/plugin install <name>@sohedra

# Codex
codex plugin marketplace add sohedra/ai-tools
codex plugin add <name>@sohedra

# Any agent via the skills CLI (installs individual skills, grouped by plugin)
npx skills add sohedra/ai-tools

# pi: whole repo, then narrow with package filters in settings
pi install git:github.com/sohedra/ai-tools
# pi: one plugin from a local checkout
pi install ./plugins/<name>
# pi: one plugin from a registry, once published
pi install npm:@sohedra/<name>
```

pi git sources cannot select a subdirectory, hence the filters / local path / npm routes.

## License

[Apache-2.0](LICENSE)

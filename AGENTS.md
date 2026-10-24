# AGENTS.md

Sohedra `ai-tools`: a monorepo of plugins. Each `plugins/<concept>/` is a Claude Code plugin, a Codex plugin and a pi package at once.

## Commands

- `pnpm install`: install (pnpm only, Node ^24).
- `pnpm format`: format with oxfmt.
- `pnpm test`: tests for the repo scripts (`node --test`).
- `pnpm check`: format check + `scripts/validate.mjs` + tests. Run before every commit; CI runs the same.
- Keep this file current. If a rule here changes, change it in the same commit as the code.

## Plugins

- One plugin per concept someone could install alone. Not one per skill, not one for everything.
- Folder and plugin name: kebab-case and short. Folder = `name` in every manifest. npm name is `@sohedra/<name>`.
- Layout, components at the plugin root (never inside `.claude-plugin/` or `.codex-plugin/`):
  ```
  plugins/<name>/
    .claude-plugin/plugin.json
    .codex-plugin/plugin.json
    package.json
    skills/<skill>/SKILL.md
    agents/ extensions/ prompts/ themes/   optional
  ```
- Every plugin keeps `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and `package.json` in sync (name, version, description) and sets `license` to `Apache-2.0`. Each plugin folder contains a copy of the root `LICENSE` and `NOTICE`, because installs and npm packages include only the plugin folder. Also set `repository` (with `directory`), `bugs.url`, `homepage`, `keywords` and `publishConfig: { "access": "public" }` in `package.json` (scoped packages are private by default); add the `pi-package` keyword so it is discoverable.
- Keywords: 3 to 8 including `pi-package`, lowercase, hyphenated, no plugin name. Default set: `pi-package`, `agent-skills`, `claude-code`, `codex`, plus 2 topic words. `package.json` has them all; both `plugin.json` files carry the same list without `pi-package`. Also set GitHub topics on the repo.
- Paths in manifests start with `./`, stay inside the plugin folder, and use forward slashes. Never reference files outside the plugin root; installs copy only the plugin folder.
- Reference bundled files from hooks/MCP configs with `${CLAUDE_PLUGIN_ROOT}`, not absolute paths.
- Register every plugin in both `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.
- Claude marketplace entry: `source` is `./plugins/<name>`; list every skill in `skills` (`./skills/<skill>`, relative to `source`). `npx skills add` uses this to group skills by plugin.
- Codex marketplace entry: `source` is `{ "source": "local", "path": "./plugins/<name>" }` (path relative to the marketplace root, inside it), plus `policy.installation`, `policy.authentication` and `category`. The marketplace itself sets `name` and `interface.displayName`.
- Plugins are self-contained: no cross-plugin imports, no shared runtime code between plugins.

## Skills

Skills follow the open [Agent Skills spec](https://agentskills.io/specification) so they work in all three tools.

- Path: `plugins/<name>/skills/<kebab-name>/SKILL.md`, folder name = frontmatter `name`.
- Frontmatter `name`: max 64 chars, lowercase letters, digits, hyphens, no leading/trailing hyphen, no `claude`/`anthropic`. Prefer gerund or action names (`reviewing-prs`, `pdf-processing`); avoid `helper`, `utils`, `tools`.
- Frontmatter `description`: required, max 1024 chars, no XML tags, third person ("Reviews pull requests..."). Say what it does and when to use it, with concrete trigger terms. This is the only text loaded up front, so write it to be matched.
- Keep `SKILL.md` under 500 lines. Move detail to files one level deep (`references/`, `scripts/`, `assets/`) and link from `SKILL.md`. Reference files over 100 lines start with a table of contents.
- Be concise: only add context the model does not already have. One default approach, not a menu of options.
- Tool-neutral: no references to a single tool's UI, commands or paths unless the skill is explicitly about that tool.
- Scripts: prefer a script for deterministic steps, say whether to run or read it, handle errors inside it, document required packages. No time-sensitive info.
- Test a skill on real tasks (at least three) before releasing it.

## pi extensions, prompts, themes

- pi only: `extensions/<name>.ts` or `extensions/<name>/index.ts`, `prompts/*.md`, `themes/*.json`.
- Host-provided pi packages (`@earendil-works/*`, `typebox`) go in `peerDependencies` only, never `dependencies`.
- No network calls or file writes outside the working directory without an explicit, documented opt-in.

## Agents

- Markdown with frontmatter in `agents/<name>.md` (`name`, `description`, optional `tools`). Claude Code only (tested). Codex plugins have no documented agents support and ignore the folder; pi does not load it. Do not rely on an agent being available outside Claude Code, and put anything that must work everywhere in a skill.
- Codex custom agents use TOML and live outside plugins. Not supported here yet; if added, generate the TOML from the Markdown and never hand-edit it.

## Commits and pull requests

[Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>): <summary>`.

- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
- Scope: the plugin name (`feat(council): add debate skill`). Omit for repo-wide changes.
- Summary: imperative, lowercase, no trailing period, under 72 characters.
- Breaking changes: `!` after the type/scope (`feat(council)!: ...`) or a `BREAKING CHANGE:` footer.
- One logical change per commit. One plugin per PR when possible.
- No AI attribution in commits or PRs: no `Co-Authored-By` trailers, no "Generated with" lines. Turn off attribution in your own tool settings.
- Work on a branch and open a PR. PRs are squash-merged; the PR title must be a Conventional Commit (CI enforces it).

## Versioning and releases

Target process. It is not automated until release-please and the publish workflow exist.

- SemVer per plugin, versioned independently. `feat` = minor, `fix` = patch, breaking = major. While `0.x`, breaking changes bump minor.
- Bump versions only through the release process, never by hand in a feature PR. All three manifests move together.
- Tags: `<name>@<version>`. Changelog per plugin (`plugins/<name>/CHANGELOG.md`), generated from commits.
- Publish to npm as `@sohedra/<name>` from CI with provenance. No tokens on laptops. The root package is `private` and never published.

## Quality

- `scripts/validate.mjs` enforces manifest sync, package metadata, keywords, marketplace entries, and skill and agent frontmatter. Extend it when you add a rule here, and add a failing case to `scripts/validate.test.mjs`.
- Run `claude plugin validate ./plugins/<name>` for each plugin; treat warnings as failures (`--strict`).
- Formatting is oxfmt; do not hand-format or add other formatters.
- GitHub Actions are pinned to commit SHAs with the version in a comment. When updating, change the SHA and the comment together; never switch to a floating tag. CI installs with `--ignore-scripts`.
- Docs: each plugin has a `README.md` with what it does, install commands for each tool, and example prompts.

## Security and licensing

- Public repo, Apache-2.0 licensed. Never commit secrets, `.env` files or private/internal references.
- Only publish original content or content you have the rights to. Do not copy copyrighted frameworks, book excerpts or other companies' templates; write your own version or link to the source.
- No client names, client data or proprietary playbooks. Anything not meant for free reuse belongs in a private repo.
- No telemetry. Plugins must not exfiltrate data. Document any network access or shell execution a skill or extension performs.
- Copyright notice lives in `NOTICE` (`Copyright <year> Sohedra`); keep the `LICENSE` text unmodified. Third-party code keeps its own license and is credited in the plugin README.
- Report vulnerabilities per `SECURITY.md`.

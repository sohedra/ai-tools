#!/usr/bin/env node
// Validates plugin manifests, marketplace registration, skills and agents (see AGENTS.md).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const XML_TAG = /<\/?[a-z][^>]*>/i;

export function validate(root = ".") {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const at = (...p) => join(root, ...p);
  const dirsIn = (path) =>
    existsSync(path) ? readdirSync(path).filter((d) => statSync(join(path, d)).isDirectory()) : [];

  const readJson = (rel) => {
    try {
      return JSON.parse(readFileSync(at(rel), "utf8"));
    } catch (e) {
      fail(`${rel}: ${e.message}`);
      return null;
    }
  };

  // Returns { data, body } for a Markdown file with YAML frontmatter, or null (error recorded).
  const readFrontmatter = (rel) => {
    const text = readFileSync(at(rel), "utf8");
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) {
      fail(`${rel}: missing frontmatter`);
      return null;
    }
    try {
      const data = parseYaml(m[1]);
      if (!data || typeof data !== "object") throw new Error("frontmatter is not a mapping");
      return { data, text };
    } catch (e) {
      fail(`${rel}: invalid YAML frontmatter (${e.message.split("\n")[0]})`);
      return null;
    }
  };

  const claudeMarket = readJson(".claude-plugin/marketplace.json");
  const codexMarket = readJson(".agents/plugins/marketplace.json");
  const claudeEntries = new Map((claudeMarket?.plugins ?? []).map((p) => [p.name, p]));
  const codexEntries = new Map((codexMarket?.plugins ?? []).map((p) => [p.name, p]));
  const dirs = dirsIn(at("plugins"));

  for (const dir of dirs) {
    const base = `plugins/${dir}`;
    const claude = readJson(`${base}/.claude-plugin/plugin.json`);
    const codex = readJson(`${base}/.codex-plugin/plugin.json`);
    const pkg = readJson(`${base}/package.json`);
    if (!claude || !codex || !pkg) continue;

    for (const field of ["version", "description"]) {
      if (claude[field] !== codex[field] || claude[field] !== pkg[field]) {
        fail(`${base}: "${field}" differs between the three manifests`);
      }
    }
    if (!KEBAB.test(dir)) fail(`${base}: plugin folder name must be kebab-case`);
    if ([claude.name, codex.name].some((n) => n !== dir)) {
      fail(`${base}: plugin.json name must equal folder name "${dir}"`);
    }
    if (pkg.name !== `@sohedra/${dir}`)
      fail(`${base}: package.json name must be "@sohedra/${dir}"`);
    for (const [label, m] of [
      ["claude", claude],
      ["codex", codex],
      ["package", pkg],
    ]) {
      if (m.license !== "Apache-2.0") {
        fail(`${base}: ${label} manifest license must be "Apache-2.0"`);
      }
    }

    for (const file of ["LICENSE", "NOTICE"]) {
      if (!existsSync(at(base, file))) fail(`${base}: missing ${file} (copy from the repo root)`);
    }

    if (pkg.publishConfig?.access !== "public") {
      fail(`${base}: package.json needs publishConfig.access "public"`);
    }
    if (pkg.repository?.directory !== base) {
      fail(`${base}: package.json repository.directory must be "${base}"`);
    }
    if (!pkg.bugs?.url) fail(`${base}: package.json needs bugs.url`);
    if (!pkg.keywords?.includes("pi-package")) {
      fail(`${base}: package.json keywords need "pi-package"`);
    }

    const sorted = (list) => JSON.stringify([...(list ?? [])].sort());
    const keywords = (pkg.keywords ?? []).filter((k) => k !== "pi-package");
    if (keywords.length < 2 || keywords.length > 7) {
      fail(`${base}: keywords (besides pi-package) must number 2 to 7`);
    }
    if (keywords.some((k) => !KEBAB.test(k) || k === dir)) {
      fail(`${base}: keywords must be lowercase, hyphenated, and not the plugin name`);
    }
    if (
      sorted(claude.keywords) !== sorted(keywords) ||
      sorted(codex.keywords) !== sorted(keywords)
    ) {
      fail(`${base}: keywords must match across manifests (plugin.json files omit "pi-package")`);
    }

    const skills = dirsIn(at(base, "skills"));
    const claudeEntry = claudeEntries.get(dir);
    if (!claudeEntry) fail(`${dir}: missing from .claude-plugin/marketplace.json`);
    else {
      if (claudeEntry.source !== `./${base}`) {
        fail(`${dir}: Claude marketplace source must be "./${base}"`);
      }
      for (const listed of claudeEntry.skills ?? []) {
        const name = listed.replace(/^\.\/skills\//, "");
        if (!listed.startsWith("./skills/") || !skills.includes(name)) {
          fail(`${dir}: Claude marketplace lists skill "${listed}" that does not exist`);
        }
      }
    }

    const codexEntry = codexEntries.get(dir);
    if (!codexEntry) fail(`${dir}: missing from .agents/plugins/marketplace.json`);
    else {
      const src = codexEntry.source;
      if (src?.source !== "local" || src?.path !== `./${base}`) {
        fail(`${dir}: Codex marketplace source must be { "source": "local", "path": "./${base}" }`);
      }
      if (!codexEntry.policy?.installation || !codexEntry.policy?.authentication) {
        fail(`${dir}: Codex marketplace entry needs policy.installation and policy.authentication`);
      }
      if (!codexEntry.category) fail(`${dir}: Codex marketplace entry needs category`);
    }

    for (const skill of skills) {
      const rel = `${base}/skills/${skill}/SKILL.md`;
      if (!existsSync(at(rel))) {
        fail(`${rel}: missing`);
        continue;
      }
      const fm = readFrontmatter(rel);
      if (fm) {
        const { name, description } = fm.data;
        if (name !== skill) fail(`${rel}: frontmatter name must equal folder "${skill}"`);
        if (!KEBAB.test(skill) || skill.length > 64 || /claude|anthropic/.test(skill)) {
          fail(`${rel}: skill name must be kebab-case, max 64 chars, no claude/anthropic`);
        }
        if (typeof description !== "string" || !description.trim()) {
          fail(`${rel}: missing description`);
        } else {
          if (description.length > 1024) fail(`${rel}: description over 1024 characters`);
          if (XML_TAG.test(description)) fail(`${rel}: description must not contain XML tags`);
        }
        if (fm.text.split("\n").length > 500) fail(`${rel}: over 500 lines`);
      }
      if (claudeEntry && !(claudeEntry.skills ?? []).includes(`./skills/${skill}`)) {
        fail(`${dir}: skill "${skill}" not listed in Claude marketplace entry`);
      }
    }

    const agentsDir = at(base, "agents");
    const agents = existsSync(agentsDir)
      ? readdirSync(agentsDir).filter((f) => f.endsWith(".md"))
      : [];
    for (const file of agents) {
      const rel = `${base}/agents/${file}`;
      const fm = readFrontmatter(rel);
      if (!fm) continue;
      const stem = file.replace(/\.md$/, "");
      if (fm.data.name !== stem) fail(`${rel}: frontmatter name must equal filename "${stem}"`);
      if (!KEBAB.test(stem)) fail(`${rel}: agent name must be kebab-case`);
      if (typeof fm.data.description !== "string" || !fm.data.description.trim()) {
        fail(`${rel}: missing description`);
      }
    }
  }

  for (const [label, entries] of [
    ["Claude", claudeEntries],
    ["Codex", codexEntries],
  ]) {
    for (const name of entries.keys()) {
      if (!dirs.includes(name)) {
        fail(`${label} marketplace lists "${name}" but plugins/${name} does not exist`);
      }
    }
  }

  return { errors, plugins: dirs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, plugins } = validate(".");
  if (errors.length) {
    console.error(errors.map((e) => `- ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`validate: ok (${plugins} plugin${plugins === 1 ? "" : "s"})`);
}

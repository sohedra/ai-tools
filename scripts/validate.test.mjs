import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { validate } from "./validate.mjs";

const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

const write = (root, rel, content) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(
    join(root, rel),
    typeof content === "string" ? content : JSON.stringify(content, null, 2),
  );
};
const read = (root, rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const edit = (root, rel, fn) => write(root, rel, fn(read(root, rel)));

const KEYWORDS = ["agent-skills", "claude-code", "codex", "demo-topic"];
const SKILL = `---
name: greeting
description: Greets the user. Use when the user asks for a greeting.
---

# Greeting
`;
const AGENT = `---
name: greeter
description: Greets the user. Use when asked.
tools: Read
---

Say hello.
`;

// Builds a valid repo with one plugin "demo". Returns its root.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "validate-"));
  roots.push(root);
  const common = { version: "0.1.0", description: "Demo plugin.", license: "Apache-2.0" };
  write(root, "plugins/demo/LICENSE", "Apache License");
  write(root, "plugins/demo/NOTICE", "Copyright Sohedra");
  write(root, "plugins/demo/.claude-plugin/plugin.json", {
    name: "demo",
    ...common,
    keywords: KEYWORDS,
  });
  write(root, "plugins/demo/.codex-plugin/plugin.json", {
    name: "demo",
    ...common,
    keywords: KEYWORDS,
  });
  write(root, "plugins/demo/package.json", {
    name: "@sohedra/demo",
    ...common,
    keywords: ["pi-package", ...KEYWORDS],
    bugs: { url: "https://github.com/sohedra/ai-tools/issues" },
    repository: {
      type: "git",
      url: "git+https://github.com/sohedra/ai-tools.git",
      directory: "plugins/demo",
    },
    publishConfig: { access: "public" },
  });
  write(root, "plugins/demo/skills/greeting/SKILL.md", SKILL);
  write(root, "plugins/demo/agents/greeter.md", AGENT);
  write(root, ".claude-plugin/marketplace.json", {
    name: "sohedra",
    owner: { name: "Sohedra" },
    plugins: [{ name: "demo", source: "./plugins/demo", skills: ["./skills/greeting"] }],
  });
  write(root, ".agents/plugins/marketplace.json", {
    name: "sohedra",
    plugins: [
      {
        name: "demo",
        source: { source: "local", path: "./plugins/demo" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
    ],
  });
  return root;
}

const errorsOf = (root) => validate(root).errors;
const expectError = (root, fragment) => {
  const errors = errorsOf(root);
  assert.ok(
    errors.some((e) => e.includes(fragment)),
    `expected "${fragment}" in:\n${errors.join("\n")}`,
  );
};

describe("validate", () => {
  it("accepts a valid plugin", () => {
    assert.deepEqual(errorsOf(fixture()), []);
  });

  it("accepts an empty repo", () => {
    const root = mkdtempSync(join(tmpdir(), "validate-"));
    roots.push(root);
    write(root, ".claude-plugin/marketplace.json", {
      name: "s",
      owner: { name: "S" },
      plugins: [],
    });
    write(root, ".agents/plugins/marketplace.json", { name: "s", plugins: [] });
    assert.deepEqual(validate(root), { errors: [], plugins: 0 });
  });

  describe("manifests", () => {
    it("rejects version drift", () => {
      const r = fixture();
      edit(r, "plugins/demo/.codex-plugin/plugin.json", (m) => ({ ...m, version: "0.2.0" }));
      expectError(r, '"version" differs');
    });
    it("rejects a wrong license", () => {
      const r = fixture();
      edit(r, "plugins/demo/package.json", (m) => ({ ...m, license: "ISC" }));
      expectError(r, 'license must be "Apache-2.0"');
    });
    it("requires LICENSE and NOTICE in the plugin", () => {
      const r = fixture();
      rmSync(join(r, "plugins/demo/NOTICE"));
      expectError(r, "missing NOTICE");
    });
    it("rejects a name that differs from the folder", () => {
      const r = fixture();
      edit(r, "plugins/demo/.claude-plugin/plugin.json", (m) => ({ ...m, name: "other" }));
      expectError(r, "must equal folder name");
    });
    it("requires public publishConfig, bugs and pi-package", () => {
      const r = fixture();
      edit(r, "plugins/demo/package.json", ({ publishConfig, bugs, ...m }) => ({
        ...m,
        keywords: KEYWORDS,
      }));
      expectError(r, "publishConfig.access");
      expectError(r, "bugs.url");
      expectError(r, '"pi-package"');
    });
    it("rejects keywords that drift between manifests", () => {
      const r = fixture();
      edit(r, "plugins/demo/.codex-plugin/plugin.json", (m) => ({ ...m, keywords: ["other"] }));
      expectError(r, "keywords must match");
    });
    it("rejects the plugin name as a keyword", () => {
      const r = fixture();
      const kw = [...KEYWORDS, "demo"];
      for (const f of ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
        edit(r, `plugins/demo/${f}`, (m) => ({
          ...m,
          keywords: f === "package.json" ? ["pi-package", ...kw] : kw,
        }));
      }
      expectError(r, "not the plugin name");
    });
    it("reports invalid JSON", () => {
      const r = fixture();
      write(r, "plugins/demo/package.json", "{ not json");
      expectError(r, "plugins/demo/package.json");
    });
  });

  describe("marketplaces", () => {
    it("rejects an unregistered plugin", () => {
      const r = fixture();
      edit(r, ".claude-plugin/marketplace.json", (m) => ({ ...m, plugins: [] }));
      edit(r, ".agents/plugins/marketplace.json", (m) => ({ ...m, plugins: [] }));
      expectError(r, "missing from .claude-plugin/marketplace.json");
      expectError(r, "missing from .agents/plugins/marketplace.json");
    });
    it("rejects a marketplace entry without a plugin folder", () => {
      const r = fixture();
      edit(r, ".claude-plugin/marketplace.json", (m) => ({
        ...m,
        plugins: [...m.plugins, { name: "ghost", source: "./plugins/ghost" }],
      }));
      expectError(r, 'lists "ghost"');
    });
    it("rejects an unlisted skill and a phantom skill", () => {
      const r = fixture();
      edit(r, ".claude-plugin/marketplace.json", (m) => {
        m.plugins[0].skills = ["./skills/nope"];
        return m;
      });
      expectError(r, 'skill "greeting" not listed');
      expectError(r, 'skill "./skills/nope" that does not exist');
    });
    it("rejects an incomplete Codex entry", () => {
      const r = fixture();
      edit(r, ".agents/plugins/marketplace.json", (m) => {
        m.plugins[0] = { name: "demo", source: "./plugins/demo" };
        return m;
      });
      expectError(r, "Codex marketplace source must be");
      expectError(r, "policy.installation");
      expectError(r, "needs category");
    });
  });

  describe("skills", () => {
    const skill = (r, text) => write(r, "plugins/demo/skills/greeting/SKILL.md", text);
    it("rejects a name that differs from the folder", () => {
      const r = fixture();
      skill(r, SKILL.replace("name: greeting", "name: other"));
      expectError(r, "must equal folder");
    });
    it("rejects reserved words in the name", () => {
      const r = fixture();
      write(
        r,
        "plugins/demo/skills/claude-helper/SKILL.md",
        SKILL.replace("greeting", "claude-helper"),
      );
      expectError(r, "no claude/anthropic");
    });
    it("rejects missing frontmatter and invalid YAML", () => {
      const r = fixture();
      skill(r, "# no frontmatter");
      expectError(r, "missing frontmatter");
      skill(r, "---\nname: [unclosed\n---\n");
      expectError(r, "invalid YAML");
    });
    it("rejects a missing or empty description", () => {
      const r = fixture();
      skill(r, "---\nname: greeting\n---\n");
      expectError(r, "missing description");
    });
    it("measures a multi-line YAML description correctly", () => {
      const r = fixture();
      const long = Array(60).fill("Greets the user politely.").join(" ");
      skill(r, `---\nname: greeting\ndescription: >\n  ${long}\n---\n`);
      expectError(r, "over 1024 characters");
    });
    it("rejects XML tags in the description", () => {
      const r = fixture();
      skill(r, SKILL.replace("Greets the user.", "Greets <b>the</b> user."));
      expectError(r, "XML tags");
    });
    it("rejects a SKILL.md over 500 lines", () => {
      const r = fixture();
      skill(r, SKILL + "line\n".repeat(500));
      expectError(r, "over 500 lines");
    });
    it("rejects a skill folder without SKILL.md", () => {
      const r = fixture();
      mkdirSync(join(r, "plugins/demo/skills/empty"), { recursive: true });
      expectError(r, "empty/SKILL.md: missing");
    });
  });

  describe("agents", () => {
    it("rejects a name that differs from the filename", () => {
      const r = fixture();
      write(r, "plugins/demo/agents/greeter.md", AGENT.replace("name: greeter", "name: other"));
      expectError(r, "must equal filename");
    });
    it("rejects a missing description and broken frontmatter", () => {
      const r = fixture();
      write(r, "plugins/demo/agents/greeter.md", "---\nname: greeter\n---\n");
      expectError(r, "missing description");
      write(r, "plugins/demo/agents/greeter.md", "no frontmatter");
      expectError(r, "missing frontmatter");
    });
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown, section } from "./markdown.mjs";

const identity = {
  repository: "agents-tools/cli",
  revision: "a".repeat(40),
  path: "README.md",
  label: "Test",
};

test("selects the complete Install section without treating fenced headings as sections", () => {
  const source = "# README\n## Install\n```sh\n## Usage\n```\n### Source\nkeep\n## Usage\nnext\n";
  assert.equal(section(source, "Install"), "## Install\n```sh\n## Usage\n```\n### Source\nkeep");
  assert.throws(() => section(source, "Missing"), /Missing README section/);
});

test("retains language classes and stable GitHub heading IDs including duplicates", () => {
  const { html, headings } = renderMarkdown(
    "# CLI Reference\n## `--scope` & State\n## `--scope` & State\n```sh\nagents --help\n```",
    identity,
  );
  assert.deepEqual(
    headings.map(({ id }) => id),
    ["cli-reference", "--scope--state", "--scope--state-1"],
  );
  assert.match(html, /class="language-sh"/);
});

test("rewrites source-relative links and out-of-excerpt anchors at the pinned revision", () => {
  const { html } = renderMarkdown(
    "## Install\n[local](#install) [elsewhere](#requirements) [docs](Documentation/Reference/CLI.md#commands) [schema](Documentation/Reference/Schemas/a.json) [web](https://example.com)",
    identity,
  );
  assert.match(html, /href="#install"/);
  assert.match(html, /href="\/docs\/cli\/#commands"/);
  assert.ok(
    html.includes(
      `https://github.com/agents-tools/cli/blob/${identity.revision}/README.md#requirements`,
    ),
  );
  assert.ok(
    html.includes(
      `https://github.com/agents-tools/cli/blob/${identity.revision}/Documentation/Reference/Schemas/a.json`,
    ),
  );
  assert.match(html, /href="https:\/\/example.com"/);
  const docs = renderMarkdown("[schema](Schemas/example.json) [readme](../../README.md#usage)", {
    ...identity,
    path: "Documentation/Reference/CLI.md",
  });
  assert.ok(
    docs.html.includes(`/blob/${identity.revision}/Documentation/Reference/Schemas/example.json`),
  );
  assert.ok(docs.html.includes(`/blob/${identity.revision}/README.md#usage`));
});

test("rejects unvendored Markdown images and escapes executable HTML", () => {
  assert.throws(
    () => renderMarkdown("![remote](https://example.com/image.png)", identity),
    /vendored source/,
  );
  assert.match(renderMarkdown('<script>alert("x")</script>', identity).html, /&lt;script&gt;/);
});

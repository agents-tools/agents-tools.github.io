import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "parse5";
import { renderSite } from "./render-site.mjs";

const inputs = {
  manifest: JSON.parse(await readFile("sources.json", "utf8")),
  catalog: JSON.parse(await readFile("sources/standard/profile/catalog.json", "utf8")),
  readme: await readFile("sources/cli/README.md", "utf8"),
  reference: await readFile("sources/cli/Documentation/Reference/CLI.md", "utf8"),
};

for (const path of ['profile/assets/icon.png" onerror="alert(1)', "profile/assets/missing.png"]) {
  test(`rejects a catalog mark path absent from sources.json: ${path}`, () => {
    const candidate = structuredClone(inputs);
    candidate.catalog.mark.path = path;
    assert.throws(() => renderSite(candidate), /Catalog mark path.*vendored.*sources\.json/);
  });
}

test("requires the mark's upstream path from the organization repository", () => {
  for (const path of [
    "sources/standard/profile/assets/icon.png",
    "Documentation/Assets/Demo/Demo-light.svg",
  ]) {
    const candidate = structuredClone(inputs);
    candidate.catalog.mark.path = path;
    assert.throws(() => renderSite(candidate), /Catalog mark path.*vendored.*sources\.json/);
  }
});

for (const url of [
  "javascript:alert(1)",
  "http://example.com/",
  "/relative",
  "//example.com/",
  "https://",
]) {
  test(`rejects catalog navigation without an absolute HTTPS URL: ${url}`, () => {
    const candidate = structuredClone(inputs);
    candidate.catalog.navigation[0].url = url;
    assert.throws(() => renderSite(candidate), /Catalog navigation URL.*absolute https:/);
  });
}

for (const value of ["bad/name", 'bad"name', "bad?name", "", null, 123]) {
  test(`rejects an invalid GitHub organization or repository name: ${JSON.stringify(value)}`, () => {
    const candidate = structuredClone(inputs);
    candidate.catalog.organization = value;
    assert.throws(() => renderSite(candidate), /Invalid catalog organization/);
    candidate.catalog.organization = inputs.catalog.organization;
    candidate.catalog.groups.at(-1).repositories.at(-1).name = value;
    assert.throws(() => renderSite(candidate), /Invalid catalog repository name/);
  });
}

test("rejects Markdown images in repository summaries", () => {
  const candidate = structuredClone(inputs);
  candidate.catalog.groups[0].repositories[0].summary = "![remote](https://example.com/image.png)";
  assert.throws(
    () => renderSite(candidate),
    /Markdown image needs an explicit vendored source: https:\/\/example\.com\/image\.png/,
  );
});

test("rewrites summary links using the catalog's pinned source identity", () => {
  const candidate = structuredClone(inputs);
  candidate.catalog.groups[0].repositories[0].summary =
    "[guide](../CONTRIBUTING.md#development) [anchor](#repositories)";
  const source = inputs.manifest.files.find(
    (entry) => entry.repository === "agents-tools/.github" && entry.path === "profile/catalog.json",
  );
  const { home } = renderSite(candidate);
  assert.ok(
    home.includes(
      `<a href="https://github.com/agents-tools/.github/blob/${source.revision}/CONTRIBUTING.md#development">guide</a>`,
    ),
  );
  assert.ok(
    home.includes(
      `<a href="https://github.com/agents-tools/.github/blob/${source.revision}/profile/catalog.json#repositories">anchor</a>`,
    ),
  );
});

test("retains Markdown link validation and HTML escaping in summaries", () => {
  const candidate = structuredClone(inputs);
  candidate.catalog.groups[0].repositories[0].summary =
    '[unsafe](javascript:alert(1)) <script>alert("x")</script> `agents`';
  const { home } = renderSite(candidate);
  assert.ok(home.includes("[unsafe](javascript:alert(1))"));
  assert.ok(home.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(home.includes("<code>agents</code>"));
  assert.ok(!home.includes('href="javascript:'));
});

function elements(node, tagName) {
  return [
    ...(node.tagName === tagName ? [node] : []),
    ...(node.childNodes ?? []).flatMap((child) => elements(child, tagName)),
  ];
}

test("escapes vendored mark paths and valid navigation URLs in both pages", () => {
  const candidate = structuredClone(inputs);
  const path = 'profile/assets/icon.png" data-injected="yes&<';
  candidate.catalog.mark.path = path;
  candidate.manifest.files.push({
    repository: "agents-tools/.github",
    revision: "a".repeat(40),
    path,
    file: `sources/standard/${path}`,
  });
  candidate.catalog.navigation[0].url = 'https://example.com/?q="quoted"&next=<value>';
  candidate.catalog.mark.alt = 'Mark "quoted" & <value>';
  for (const html of Object.values(renderSite(candidate))) {
    const document = parse(html);
    const icon = elements(document, "link").find((node) =>
      node.attrs.some(({ name, value }) => name === "rel" && value === "icon"),
    );
    const mark = elements(document, "img")[0];
    assert.equal(icon.attrs.find(({ name }) => name === "href").value, `/assets/standard/${path}`);
    assert.equal(mark.attrs.find(({ name }) => name === "src").value, `/assets/standard/${path}`);
    assert.equal(mark.attrs.find(({ name }) => name === "alt").value, candidate.catalog.mark.alt);
    assert.ok(!icon.attrs.some(({ name }) => name === "data-injected"));
    assert.ok(!mark.attrs.some(({ name }) => name === "data-injected"));
    assert.ok(
      elements(document, "a").some((node) =>
        node.attrs.some(
          ({ name, value }) => name === "href" && value === candidate.catalog.navigation[0].url,
        ),
      ),
    );
  }
});

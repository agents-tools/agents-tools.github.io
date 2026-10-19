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

const RAW = "https://raw.githubusercontent.com";

for (const url of [
  `${RAW}/agents-tools/.github/HEAD/profile/assets/icon.png" onerror="alert(1)`,
  `${RAW}/agents-tools/.github/HEAD/profile/assets/missing.png`,
  `${RAW}/agents-tools/cli/HEAD/profile/assets/icon.png`,
  `${RAW}/agents-tools/.github/HEAD/Brand/Fonts/GoogleSansCodeProportional-Regular.woff2`,
  "https://example.com/icon.png",
  "../assets/icon.png",
  `${RAW}/agents-tools/.github/HEAD/profile/assets/%E0%A4%A.png`,
]) {
  test(`rejects a catalog image that is not a vendored raw GitHub file: ${url}`, () => {
    for (const place of ["mark", "icon"]) {
      const candidate = structuredClone(inputs);
      if (place === "mark") candidate.catalog.mark = url;
      else candidate.catalog.groups[0].repositories[0].icon = url;
      assert.throws(
        () => renderSite(candidate),
        /Catalog image must be a vendored raw GitHub file/,
      );
    }
  });
}

for (const url of [
  "javascript:alert(1)",
  "http://example.com/",
  "/relative",
  "//example.com/",
  "https://",
]) {
  test(`rejects catalog links without an absolute HTTPS URL: ${url}`, () => {
    const candidate = structuredClone(inputs);
    candidate.catalog.navigation.contributing.url = url;
    assert.throws(() => renderSite(candidate), /Catalog navigation URL.*absolute https:/);
    const maintained = structuredClone(inputs);
    maintained.catalog.maintainer.url = url;
    assert.throws(() => renderSite(maintained), /Catalog maintainer URL.*absolute https:/);
  });
}

for (const value of ["bad/name", 'bad"name', "bad?name", "", null, 123]) {
  test(`rejects an invalid GitHub organization or repository name: ${JSON.stringify(value)}`, () => {
    const candidate = structuredClone(inputs);
    candidate.catalog.organization.login = value;
    assert.throws(() => renderSite(candidate), /Invalid catalog organization/);
    candidate.catalog.organization.login = inputs.catalog.organization.login;
    candidate.catalog.groups.at(-1).repositories.at(-1).name = value;
    assert.throws(() => renderSite(candidate), /Invalid catalog repository name/);
  });
}

test("renders repository outcomes as escaped plain text", () => {
  const candidate = structuredClone(inputs);
  candidate.catalog.groups[0].repositories[0].outcome =
    '[link](javascript:alert(1)) <script>alert("x")</script> `agents`';
  const { home } = renderSite(candidate);
  assert.ok(
    home.includes(
      "[link](javascript:alert(1)) &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; `agents`",
    ),
  );
  assert.ok(!home.includes('href="javascript:'));
});

function elements(node, tagName) {
  return [
    ...(node.tagName === tagName ? [node] : []),
    ...(node.childNodes ?? []).flatMap((child) => elements(child, tagName)),
  ];
}

test("uses the brand for the home document title and the catalog heading for social titles", () => {
  const { home, documentation } = renderSite(inputs);
  const document = parse(home);
  assert.equal(elements(document, "title")[0].childNodes[0].value, "agents");
  assert.equal(elements(document, "h1")[0].childNodes[0].value, inputs.catalog.promise);
  for (const key of ["og:title", "twitter:title"]) {
    const meta = elements(document, "meta").find((node) =>
      node.attrs.some(({ name, value }) => ["name", "property"].includes(name) && value === key),
    );
    assert.equal(meta.attrs.find(({ name }) => name === "content").value, inputs.catalog.promise);
  }
  assert.match(documentation, /<title>CLI Reference · agents<\/title>/);
});

test("serves vendored images and escapes catalog values in both pages", () => {
  const candidate = structuredClone(inputs);
  const path = 'profile/assets/icon.png" data-injected="yes&<';
  candidate.catalog.mark = `${RAW}/agents-tools/.github/HEAD/${encodeURIComponent(path)}`;
  candidate.manifest.files.push({
    repository: "agents-tools/.github",
    revision: "a".repeat(40),
    path,
    file: `sources/standard/${path}`,
  });
  candidate.catalog.organization.name = 'Mark "quoted" & <value>';
  candidate.catalog.navigation.contributing.url = 'https://example.com/?q="quoted"&next=<value>';
  for (const html of Object.values(renderSite(candidate))) {
    const document = parse(html);
    const icon = elements(document, "link").find((node) =>
      node.attrs.some(({ name, value }) => name === "rel" && value === "icon"),
    );
    const mark = elements(document, "img")[0];
    assert.equal(icon.attrs.find(({ name }) => name === "href").value, `/assets/standard/${path}`);
    assert.equal(mark.attrs.find(({ name }) => name === "src").value, `/assets/standard/${path}`);
    assert.equal(
      mark.attrs.find(({ name }) => name === "alt").value,
      'Mark "quoted" & <value> mark',
    );
    assert.ok(!icon.attrs.some(({ name }) => name === "data-injected"));
    assert.ok(!mark.attrs.some(({ name }) => name === "data-injected"));
    assert.ok(
      elements(document, "a").some((node) =>
        node.attrs.some(
          ({ name, value }) =>
            name === "href" && value === candidate.catalog.navigation.contributing.url,
        ),
      ),
    );
  }
});

test("lists repositories with their vendored icons and a light/dark picture when declared", () => {
  const { home } = renderSite(inputs);
  for (const source of [
    "/assets/cli/Documentation/Assets/Logo.png",
    "/assets/core/Documentation/Assets/Logo.svg",
  ])
    assert.ok(home.includes(`<img src="${source}" width="32" height="32" alt="">`), source);
  const candidate = structuredClone(inputs);
  candidate.catalog.groups[0].repositories[0].icon = {
    light: `${RAW}/agents-tools/cli/HEAD/Documentation/Assets/Logo.png`,
    dark: `${RAW}/agents-tools/.github/HEAD/profile/assets/icon.png`,
  };
  assert.ok(
    renderSite(candidate).home.includes(
      '<picture><source media="(prefers-color-scheme: dark)" srcset="/assets/standard/profile/assets/icon.png"><img src="/assets/cli/Documentation/Assets/Logo.png"',
    ),
  );
});

test("links the website's own documentation in the header, not the footer", () => {
  const { home } = renderSite(inputs);
  const footer = home.slice(home.indexOf("<footer"));
  assert.ok(!footer.includes(inputs.catalog.navigation.documentation.url));
  for (const role of ["contributing", "security", "support"])
    assert.ok(footer.includes(`>${inputs.catalog.navigation[role].label}</a>`), role);
  assert.ok(footer.includes(`>${inputs.catalog.maintainer.label}</a>`));
});

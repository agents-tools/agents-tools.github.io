import { mkdir, readFile, rm, copyFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse } from "parse5";
import { escape, markdown, renderMarkdown, section } from "./markdown.mjs";

const manifest = JSON.parse(await readFile("sources.json", "utf8"));
const catalog = JSON.parse(await readFile("sources/standard/profile/catalog.json", "utf8"));
const readme = await readFile("sources/cli/README.md", "utf8");
const reference = await readFile("sources/cli/Documentation/Reference/CLI.md", "utf8");
const cliRevision = manifest.files.find(
  (entry) => entry.repository === "agents-tools/cli",
).revision;
const identity = (path, label) => ({
  repository: "agents-tools/cli",
  revision: cliRevision,
  path,
  label,
});
const install = renderMarkdown(section(readme, "Install"), identity("README.md", "Install"));
const usage = renderMarkdown(section(readme, "Usage"), identity("README.md", "Usage"));
const docs = renderMarkdown(reference, identity("Documentation/Reference/CLI.md", "CLI reference"));
const docsTitle = docs.headings.find(({ level }) => level === 1)?.text;
if (!docsTitle) throw new Error("CLI reference must have a title");

function findDemo(node) {
  if (
    node.tagName === "img" &&
    node.attrs.some((attr) => attr.name === "src" && attr.value.endsWith("Demo-light.svg"))
  )
    return node.attrs.find((attr) => attr.name === "alt")?.value;
  for (const child of node.childNodes ?? []) {
    const found = findDemo(child);
    if (found) return found;
  }
}
const demoAlt = findDemo(parse(readme));
if (!demoAlt) throw new Error("CLI README must supply the demo alternative text");

const origin = "https://agents-tools.github.io";
const icon = `/assets/standard/${catalog.mark.path}`;
const social = "/assets/standard/Brand/Social/cli/card.png";
const demo = "/assets/cli/Documentation/Assets/Demo/";
const title = catalog.promise.heading;

function page(path, pageTitle, content) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escape(pageTitle)} · agents</title>
    <meta name="description" content="${escape(catalog.promise.description)}">
    <link rel="canonical" href="${origin}${path}">
    <link rel="icon" type="image/png" href="${icon}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="agents">
    <meta property="og:title" content="${escape(pageTitle)}">
    <meta property="og:description" content="${escape(catalog.promise.description)}">
    <meta property="og:url" content="${origin}${path}">
    <meta property="og:image" content="${origin}${social}">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="640">
    <meta property="og:image:alt" content="${escape(title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(pageTitle)}">
    <meta name="twitter:description" content="${escape(catalog.promise.description)}">
    <meta name="twitter:image" content="${origin}${social}">
    <meta name="twitter:image:alt" content="${escape(title)}">
    <link rel="stylesheet" href="/site.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header container">
      <a class="brand" href="/" aria-label="agents home"><img src="${icon}" width="40" height="40" alt="${escape(catalog.mark.alt)}"><span>agents</span></a>
      <nav aria-label="Primary"><a href="/#install">Install</a><a href="/#usage">Usage</a><a href="/docs/cli/"${path === "/docs/cli/" ? ' aria-current="page"' : ""}>Docs</a><a href="https://github.com/${escape(catalog.organization)}">GitHub</a></nav>
    </header>
    <main id="main" class="container" tabindex="-1">${content}</main>
    <footer class="site-footer container"><nav aria-label="Footer">${catalog.navigation.map(({ title, url }) => `<a href="${escape(url)}">${escape(title)}</a>`).join("")}</nav></footer>
  </body>
</html>\n`;
}

const home = page(
  "/",
  title,
  `
  <div class="hero"><h1>${escape(title)}</h1><p class="lede">${escape(catalog.promise.secondary)}</p></div>
  <section class="section quick-look"><h2 id="quick-look">Quick look</h2>
  <!-- html-validate-disable-next prefer-native-element: The region is the section's keyboard scroll container. -->
  <div class="quick-look-frame" tabindex="0" role="region" aria-labelledby="quick-look"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="${demo}Demo-dark.svg">
    <img src="${demo}Demo-light.svg" width="763" height="788" alt="${escape(demoAlt)}" fetchpriority="high">
  </picture></div></section>
  <section class="section prose" aria-labelledby="install">${install.html}</section>
  <section class="section prose" aria-labelledby="usage">${usage.html}</section>
  <section class="section" aria-labelledby="repositories"><h2 id="repositories">Repositories</h2>
    <div class="repositories">${catalog.groups.map((group) => `<section class="repository-group"><h3>${escape(group.title)}</h3><ul>${group.repositories.map(({ name, summary }) => `<li><a class="repository-name" href="https://github.com/${escape(catalog.organization)}/${escape(name)}">${escape(name)}</a><p>${markdown.renderInline(summary)}</p></li>`).join("")}</ul></section>`).join("")}</div>
  </section>`,
);

const toc = `<nav class="contents" aria-label="On this page"><h2>On this page</h2><ul>${docs.headings
  .filter(({ level }) => level === 2)
  .map(({ id, text }) => `<li><a href="#${escape(id)}">${escape(text)}</a></li>`)
  .join("")}</ul></nav>`;
const referenceHTML = docs.html.replace(/(<\/h1>)/, `$1${toc}`);
const documentation = page(
  "/docs/cli/",
  docsTitle,
  `<article class="documentation prose">${referenceHTML}</article>`,
);

await rm(".build/site", { recursive: true, force: true });
for (const [path, html] of [
  ["index.html", home],
  ["docs/cli/index.html", documentation],
]) {
  await mkdir(dirname(`.build/site/${path}`), { recursive: true });
  await writeFile(`.build/site/${path}`, html);
}
await copyFile("src/site.css", ".build/site/site.css");
for (const entry of manifest.files) {
  if (!/\.(?:png|svg|woff2)$/.test(entry.file) && !/(?:OFL\.txt|LICENSE)$/.test(entry.file))
    continue;
  const destination = `.build/site/public/assets/${entry.file.slice("sources/".length)}`;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(entry.file, destination);
}
await writeFile(".build/site/public/.nojekyll", "");
console.log("Rendered / and /docs/cli/ from pinned sources.");

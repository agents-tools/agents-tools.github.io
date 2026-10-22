import { mkdir, readFile, rm, copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseFragment } from "parse5";
import { escape, renderMarkdown, section } from "./markdown.mjs";
import { site } from "./site.mjs";

const RAW_ASSET =
  /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/[^/?#]+\/([^?#]+)$/;
const FOOTER_ROLES = ["contributing", "security", "support"];
const DEMO_DIRECTORY = ".github/assets/terminal";

function validateGitHubName(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value))
    throw new Error(`Invalid catalog ${label}: ${JSON.stringify(value)}`);
}

function validateHttps(url, label) {
  if (typeof url !== "string" || !URL.canParse(url) || new URL(url).protocol !== "https:")
    throw new Error(`Catalog ${label} URL must be an absolute https: URL: ${url}`);
}

// GitHub Pages artifacts omit every path segment that starts with a dot, so served paths
// drop the leading dot of vendored directories such as `.github`.
export function servedAsset(file) {
  const segments = file.slice("sources/".length).split("/");
  return `/assets/${segments.map((segment) => segment.replace(/^\.+/, "")).join("/")}`;
}

// Catalog images are raw GitHub URLs; the site serves only their vendored copies.
function vendoredAsset(manifest, url) {
  const match = typeof url === "string" ? url.match(RAW_ASSET) : null;
  let path = null;
  try {
    path = match ? decodeURIComponent(match[3]) : null;
  } catch {}
  const entry =
    path &&
    manifest.files.find(
      (file) =>
        file.repository === `${match[1]}/${match[2]}` && file.path === path && !file.transform,
    );
  if (!entry)
    throw new Error(`Catalog image must be a vendored raw GitHub file in sources.json: ${url}`);
  return servedAsset(entry.file);
}

function vendoredImage(manifest, value) {
  if (typeof value === "string") return { light: vendoredAsset(manifest, value) };
  if (value && typeof value === "object")
    return {
      light: vendoredAsset(manifest, value.light),
      dark: vendoredAsset(manifest, value.dark),
    };
  throw new Error("Catalog image must be a URL or {light, dark} URLs");
}

function imageTag({ light, dark }, size, alt) {
  const img = `<img src="${escape(light)}" width="${size}" height="${size}" alt="${escape(alt)}">`;
  return dark
    ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${escape(dark)}">${img}</picture>`
    : img;
}

function svgDimensions(source, theme) {
  const root = parseFragment(source).childNodes.find((node) => node.tagName === "svg");
  const dimensions = {};
  for (const name of ["width", "height"]) {
    const value = root?.attrs.find((attr) => attr.name === name)?.value;
    if (!/^[1-9]\d*$/.test(value ?? "") || !Number.isSafeInteger(Number(value)))
      throw new Error(`Terminal demo ${theme} SVG root ${name} must be a positive integer`);
    dimensions[name] = Number(value);
  }
  return dimensions;
}

export function renderSite({ manifest, catalog, readme, reference, demoSvgs }) {
  const mark = vendoredImage(manifest, catalog.mark);
  for (const { url } of Object.values(catalog.navigation)) validateHttps(url, "navigation");
  if (catalog.maintainer) validateHttps(catalog.maintainer.url, "maintainer");
  const owner = catalog.organization.login;
  validateGitHubName(owner, "organization");
  const icons = new Map();
  for (const group of catalog.groups)
    for (const { name, icon } of group.repositories) {
      validateGitHubName(name, "repository name");
      icons.set(name, vendoredImage(manifest, icon));
    }

  const { standard, cli } = site.sources;
  const catalogSource = manifest.files.find(
    (entry) => entry.repository === standard.repository && entry.path === "profile/catalog.json",
  );
  if (!catalogSource)
    throw new Error(`Missing ${standard.repository} catalog source in sources.json`);
  const cliRevision = manifest.files.find((entry) => entry.repository === cli.repository).revision;
  const identity = (path, label) => ({
    repository: cli.repository,
    revision: cliRevision,
    path,
    label,
  });
  const install = renderMarkdown(section(readme, "Install"), identity("README.md", "Install"));
  const usage = renderMarkdown(section(readme, "Usage"), identity("README.md", "Usage"));
  const docs = renderMarkdown(
    reference,
    identity("Documentation/Reference/CLI.md", "CLI reference"),
  );
  const docsTitle = docs.headings.find(({ level }) => level === 1)?.text;
  if (!docsTitle) throw new Error("CLI reference must have a title");

  function findDemo(node) {
    if (
      node.tagName === "img" &&
      node.attrs.some((attr) => attr.name === "src" && attr.value.endsWith("terminal-light.svg"))
    )
      return node.attrs.find((attr) => attr.name === "alt")?.value;
    for (const child of node.childNodes ?? []) {
      const found = findDemo(child);
      if (found) return found;
    }
  }
  const demoAlt = findDemo(parse(readme));
  if (!demoAlt) throw new Error("CLI README must supply the demo alternative text");
  const demoSize = svgDimensions(demoSvgs.light, "light");
  const darkSize = svgDimensions(demoSvgs.dark, "dark");
  if (demoSize.width !== darkSize.width || demoSize.height !== darkSize.height)
    throw new Error("Terminal demo light and dark SVG dimensions must match");

  const { name, origin } = site;
  const social = servedAsset("sources/cli/.github/assets/social-preview/social-preview.png");
  const demo = servedAsset(`sources/cli/${DEMO_DIRECTORY}/`);
  const title = catalog.promise;
  const footer = [
    ...FOOTER_ROLES.filter((role) => catalog.navigation[role]).map(
      (role) => catalog.navigation[role],
    ),
    ...(catalog.maintainer ? [catalog.maintainer] : []),
  ];

  function page(path, pageTitle, content) {
    const documentTitle = path === "/" ? name : `${pageTitle} · ${name}`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escape(documentTitle)}</title>
    <meta name="description" content="${escape(catalog.description)}">
    <link rel="canonical" href="${escape(`${origin}${path}`)}">
    <link rel="icon" type="image/png" href="${escape(mark.light)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${escape(name)}">
    <meta property="og:title" content="${escape(pageTitle)}">
    <meta property="og:description" content="${escape(catalog.description)}">
    <meta property="og:url" content="${escape(`${origin}${path}`)}">
    <meta property="og:image" content="${escape(`${origin}${social}`)}">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="640">
    <meta property="og:image:alt" content="${escape(title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(pageTitle)}">
    <meta name="twitter:description" content="${escape(catalog.description)}">
    <meta name="twitter:image" content="${escape(`${origin}${social}`)}">
    <meta name="twitter:image:alt" content="${escape(title)}">
    <link rel="stylesheet" href="/site.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header container">
      <a class="brand" href="/" aria-label="${escape(`${name} home`)}">${imageTag(mark, 40, `${catalog.organization.name} mark`)}<span>${escape(name)}</span></a>
      <nav aria-label="Primary"><a href="/#install">Install</a><a href="/#usage">Usage</a><a href="/docs/cli/"${path === "/docs/cli/" ? ' aria-current="page"' : ""}>Docs</a><a href="${escape(`https://github.com/${owner}`)}">GitHub</a></nav>
    </header>
    <main id="main" class="container" tabindex="-1">${content}</main>
    <footer class="site-footer container"><nav aria-label="Footer">${footer.map(({ label, url }) => `<a href="${escape(url)}">${escape(label)}</a>`).join("")}</nav></footer>
  </body>
</html>\n`;
  }

  const home = page(
    "/",
    title,
    `
  <div class="hero"><h1>${escape(title)}</h1><p class="lede">${escape(catalog.secondary)}</p></div>
  <section class="section quick-look"><h2 id="quick-look">Quick look</h2>
  <!-- html-validate-disable-next prefer-native-element: The region is the section's keyboard scroll container. -->
  <div class="quick-look-frame" tabindex="0" role="region" aria-labelledby="quick-look"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="${escape(`${demo}terminal-dark.svg`)}">
    <img src="${escape(`${demo}terminal-light.svg`)}" width="${demoSize.width}" height="${demoSize.height}" alt="${escape(demoAlt)}" fetchpriority="high">
  </picture></div></section>
  <section class="section prose" aria-labelledby="install">${install.html}</section>
  <section class="section prose" aria-labelledby="usage">${usage.html}</section>
  <section class="section" aria-labelledby="repositories"><h2 id="repositories">Repositories</h2>
    <div class="repositories">${catalog.groups.map((group) => `<section class="repository-group"><h3>${escape(group.title)}</h3><ul>${group.repositories.map(({ name, outcome }) => `<li>${imageTag(icons.get(name), 32, "")}<div><a class="repository-name" href="${escape(`https://github.com/${owner}/${name}`)}">${escape(name)}</a><p>${escape(outcome)}</p></div></li>`).join("")}</ul></section>`).join("")}</div>
  </section>`,
  );

  const toc = `<nav class="contents" aria-label="On this page"><h2>On this page</h2><ul>${docs.headings
    .filter(({ level }) => level === 2)
    .map(({ id, text }) => `<li><a href="${escape(`#${id}`)}">${escape(text)}</a></li>`)
    .join("")}</ul></nav>`;
  const referenceHTML = docs.html.replace(/(<\/h1>)/, `$1${toc}`);
  const documentation = page(
    "/docs/cli/",
    docsTitle,
    `<article class="documentation prose">${referenceHTML}</article>`,
  );
  return { home, documentation };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await readFile("sources.json", "utf8"));
  const catalog = JSON.parse(await readFile("sources/standard/profile/catalog.json", "utf8"));
  const readme = await readFile("sources/cli/README.md", "utf8");
  const reference = await readFile("sources/cli/Documentation/Reference/CLI.md", "utf8");
  const demoSvgs = {
    light: await readFile(`sources/cli/${DEMO_DIRECTORY}/terminal-light.svg`, "utf8"),
    dark: await readFile(`sources/cli/${DEMO_DIRECTORY}/terminal-dark.svg`, "utf8"),
  };
  const { home, documentation } = renderSite({ manifest, catalog, readme, reference, demoSvgs });
  await rm(".build/site", { recursive: true, force: true });
  for (const [path, html] of [
    ["index.html", home],
    ["docs/cli/index.html", documentation],
  ]) {
    await mkdir(dirname(`.build/site/${path}`), { recursive: true });
    await writeFile(`.build/site/${path}`, html);
  }
  await copyFile("src/site.css", ".build/site/site.css");
  const served = new Set();
  for (const entry of manifest.files) {
    if (!/\.(?:png|svg|woff2)$/.test(entry.file) && !/(?:OFL\.txt|LICENSE)$/.test(entry.file))
      continue;
    const path = servedAsset(entry.file);
    if (served.has(path)) throw new Error(`Two vendored files are served at ${path}`);
    served.add(path);
    const destination = `.build/site/public${path}`;
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(entry.file, destination);
  }
  console.log("Rendered / and /docs/cli/ from pinned sources.");
}

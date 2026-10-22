import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "parse5";
import { site } from "./site.mjs";

const { origin } = site;

export function elements(node) {
  return [node, ...(node.childNodes ?? []).flatMap(elements)];
}

export async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    files.push(...(entry.isDirectory() ? await filesIn(path) : [path]));
  }
  return files;
}

export async function checkLinks(directory = "dist") {
  const root = resolve(directory);
  const files = await filesIn(root);
  const hidden = files
    .map((path) => relative(root, path))
    .filter((path) => path.split("/").some((segment) => segment.startsWith(".")));
  if (hidden.length)
    throw new Error(`GitHub Pages artifacts omit hidden paths: ${hidden.join(", ")}`);
  let checked = 0;
  for (const file of files.filter((path) => /\.(html|css)$/.test(path))) {
    const text = await readFile(file, "utf8");
    const url = new URL(`/${relative(root, file).replace(/index\.html$/, "")}`, origin);
    const targets = [];
    if (file.endsWith(".html")) {
      const nodes = elements(parse(text));
      for (const node of nodes) {
        for (const { name, value } of node.attrs ?? []) {
          if (["href", "src"].includes(name)) targets.push(value);
          if (name === "srcset")
            targets.push(...value.split(",").map((part) => part.trim().split(/\s+/)[0]));
          if (
            name === "content" &&
            node.attrs.some((attr) => /^(og:image|twitter:image)$/.test(attr.value))
          )
            targets.push(value);
        }
      }
    } else {
      targets.push(...[...text.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]));
    }
    for (const href of targets) {
      const target = new URL(href, url);
      if (target.origin !== origin) continue;
      let path = resolve(root, `.${decodeURIComponent(target.pathname)}`);
      if (relative(root, path).startsWith("..")) throw new Error(`Link escapes site: ${href}`);
      const entry = await stat(path).catch(() => null);
      if (!entry) throw new Error(`Missing target from ${relative(root, file)}: ${href}`);
      if (entry.isDirectory()) path = resolve(path, "index.html");
      const bytes = await readFile(path);
      if (target.hash && path.endsWith(".html")) {
        const id = decodeURIComponent(target.hash.slice(1));
        const ids = elements(parse(bytes.toString())).flatMap((node) =>
          (node.attrs ?? []).filter((attr) => attr.name === "id").map((attr) => attr.value),
        );
        if (!ids.includes(id))
          throw new Error(`Missing anchor from ${relative(root, file)}: ${href}`);
      }
      checked++;
    }
  }
  console.log(`Verified ${checked} internal links, anchors and assets in ${directory}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await checkLinks();

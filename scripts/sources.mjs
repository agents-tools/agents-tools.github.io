import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compress } from "wawoff2";

export const definitions = {
  standard: {
    repository: "agents-tools/.github",
    paths: [
      "profile/catalog.json",
      "profile/assets/icon.png",
      "Brand/Social/cli/card.png",
      "Brand/Fonts/GoogleSansCodeProportional-Regular.ttf",
      "Brand/Fonts/GoogleSansCodeProportional-Medium.ttf",
      "Brand/Fonts/GoogleSansCodeProportional-Bold.ttf",
      "Brand/Fonts/OFL.txt",
      "LICENSE",
    ],
  },
  cli: {
    repository: "agents-tools/cli",
    paths: [
      "README.md",
      "Documentation/Reference/CLI.md",
      "Documentation/Assets/Demo/Demo-light.svg",
      "Documentation/Assets/Demo/Demo-dark.svg",
      "LICENSE",
    ],
  },
};

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const stripTrailingWhitespace = (bytes) =>
  Buffer.from(bytes.toString("latin1").replace(/[ \t]+(?=[\r\n]|$)/g, ""), "latin1");

async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await inventory(path)));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unexpected source entry: ${path}`);
  }
  return files;
}

export async function checkSources() {
  const manifest = JSON.parse(await readFile("sources.json", "utf8"));
  if (manifest.schema !== 1) throw new Error("Unknown source manifest schema");
  const expected = [];
  for (const [key, definition] of Object.entries(definitions)) {
    const entries = manifest.files.filter((entry) => entry.repository === definition.repository);
    const revisions = new Set(entries.map((entry) => entry.revision));
    if (revisions.size !== 1 || !/^[0-9a-f]{40}$/.test([...revisions][0]))
      throw new Error(`Expected one full revision for ${definition.repository}`);
    for (const path of definition.paths) {
      for (const converted of path.endsWith(".ttf") ? [false, true] : [false]) {
        const file = `sources/${key}/${converted ? path.replace(/\.ttf$/, ".woff2") : path}`;
        expected.push(file);
        const matches = entries.filter((entry) => entry.file === file);
        if (matches.length !== 1) throw new Error(`Missing or duplicate manifest entry: ${file}`);
        const entry = matches[0];
        if (entry.path !== path || !/^[0-9a-f]{64}$/.test(entry.sha256))
          throw new Error(`Invalid source identity: ${file}`);
        const bytes = await readFile(file);
        if (digest(bytes) !== entry.sha256) throw new Error(`Source digest mismatch: ${file}`);
        if (converted) {
          if (entry.transform !== "wawoff2@2.0.1") throw new Error(`Unknown transform: ${file}`);
          const input = await readFile(`sources/${key}/${path}`);
          if (digest(await compress(input)) !== entry.sha256)
            throw new Error(`Font conversion is not reproducible: ${file}`);
        } else if (path === "Brand/Fonts/OFL.txt") {
          if (entry.transform !== "strip-trailing-whitespace")
            throw new Error(`Unknown transform: ${file}`);
          if (
            typeof entry.source_sha256 !== "string" ||
            !/^[0-9a-f]{64}$/.test(entry.source_sha256)
          )
            throw new Error(`Invalid source digest: ${file}`);
          if (!bytes.equals(stripTrailingWhitespace(bytes)))
            throw new Error(`Trailing whitespace in source: ${file}`);
        } else if (entry.transform) throw new Error(`Unexpected transform: ${file}`);
      }
    }
  }
  if (
    manifest.files.length !== expected.length ||
    JSON.stringify((await inventory("sources")).sort()) !== JSON.stringify(expected.sort())
  )
    throw new Error("Source inventory does not match the manifest");
  console.log(`Verified ${expected.length} source files offline, including font reproduction.`);
  return manifest;
}

async function github(path, accept = "application/vnd.github+json") {
  const response = await fetch(`https://api.github.com/repos/${path}`, {
    headers: {
      Accept: accept,
      "User-Agent": "agents-website-sources",
      ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`);
  return response;
}

async function updateSources(options) {
  const files = [];
  const staged = ".build/sources";
  await rm(staged, { recursive: true, force: true });
  try {
    for (const [key, definition] of Object.entries(definitions)) {
      const ref = options[key] ?? "master";
      if (ref !== "master" && !/^[0-9a-f]{40}$/.test(ref))
        throw new Error(`--${key} must be a full commit SHA`);
      const commit = await (await github(`${definition.repository}/commits/${ref}`)).json();
      const revision = commit.sha;
      if (!/^[0-9a-f]{40}$/.test(revision) || (ref !== "master" && revision !== ref))
        throw new Error(`Unexpected resolved revision for ${definition.repository}`);
      for (const path of definition.paths) {
        const response = await github(
          `${definition.repository}/contents/${path}?ref=${revision}`,
          "application/vnd.github.raw+json",
        );
        const original = Buffer.from(await response.arrayBuffer());
        const stripped = path === "Brand/Fonts/OFL.txt";
        for (const converted of path.endsWith(".ttf") ? [false, true] : [false]) {
          const output = converted ? path.replace(/\.ttf$/, ".woff2") : path;
          const bytes = converted
            ? Buffer.from(await compress(original))
            : stripped
              ? stripTrailingWhitespace(original)
              : original;
          const file = `sources/${key}/${output}`;
          await mkdir(dirname(`.build/${file}`), { recursive: true });
          await writeFile(`.build/${file}`, bytes);
          files.push({
            repository: definition.repository,
            revision,
            path,
            file,
            sha256: digest(bytes),
            ...(converted ? { transform: "wawoff2@2.0.1" } : {}),
            ...(stripped
              ? { transform: "strip-trailing-whitespace", source_sha256: digest(original) }
              : {}),
          });
        }
      }
      console.log(`${definition.repository}: ${revision}`);
    }
    // Fetch and convert every input successfully before replacing the accepted snapshot.
    await rm("sources", { recursive: true, force: true });
    for (const { file } of files) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, await readFile(`.build/${file}`));
    }
    await writeFile("sources.json", `${JSON.stringify({ schema: 1, files }, null, 2)}\n`);
    await checkSources();
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { cli: { type: "string" }, standard: { type: "string" } },
  });
  if (positionals.length !== 1) throw new Error("Use sources.mjs update or check");
  if (positionals[0] === "update") await updateSources(values);
  else if (positionals[0] === "check" && Object.keys(values).length === 0) await checkSources();
  else throw new Error("Use sources.mjs update [--cli SHA] [--standard SHA] or check");
}

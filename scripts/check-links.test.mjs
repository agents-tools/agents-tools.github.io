import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkLinks } from "./check-links.mjs";

test("rejects hidden paths that GitHub Pages artifacts omit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "site-"));
  try {
    await mkdir(join(directory, "assets/.github"), { recursive: true });
    await writeFile(join(directory, "assets/.github/logo.png"), "");
    await writeFile(join(directory, "index.html"), '<img src="/assets/.github/logo.png" alt="">');
    await assert.rejects(checkLinks(directory), /omit hidden paths: assets\/\.github\/logo\.png/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

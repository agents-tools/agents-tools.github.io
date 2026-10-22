import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filesIn } from "./check-links.mjs";

// Compares every file of the deployed artifact with the bytes the live site serves. The query
// string bypasses cached copies of an earlier deployment; retries cover propagation delay.
export async function verifyDeployment(
  origin,
  directory,
  { attempts = 5, delay = 15_000, fetch = globalThis.fetch } = {},
) {
  const root = resolve(directory);
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  let pending = (await filesIn(root)).map((file) => relative(root, file)).sort();
  const total = pending.length;
  if (!total) throw new Error(`No deployed files in ${directory}`);
  for (let attempt = 1; ; attempt++) {
    const failures = [];
    for (const path of pending) {
      const url = new URL(path, base);
      url.searchParams.set("verify", `${Date.now()}`);
      const response = await fetch(url);
      const served = response.ok ? Buffer.from(await response.arrayBuffer()) : null;
      if (!served?.equals(await readFile(resolve(root, path))))
        failures.push({ path, status: response.status });
    }
    if (!failures.length) return console.log(`Verified ${total} deployed files at ${base}.`);
    if (attempt === attempts)
      throw new Error(
        `Live site differs from the deployed artifact: ${failures.map(({ path, status }) => `${path} (${status})`).join(", ")}`,
      );
    pending = failures.map(({ path }) => path);
    await new Promise((done) => setTimeout(done, delay));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await verifyDeployment(process.argv[2], process.argv[3] ?? "dist");

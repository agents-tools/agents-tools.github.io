import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyDeployment } from "./verify-deployment.mjs";

async function withSite(run) {
  const directory = await mkdtemp(join(tmpdir(), "deployed-"));
  try {
    await mkdir(join(directory, "assets"), { recursive: true });
    await writeFile(join(directory, "index.html"), "home");
    await writeFile(join(directory, "assets/logo.png"), "logo");
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const served = (files) => async (url) => {
  const body = files[new URL(url).pathname];
  return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
};

test("accepts a live site that serves every deployed file byte for byte", () =>
  withSite((directory) =>
    verifyDeployment("https://example.test", directory, {
      fetch: served({ "/index.html": "home", "/assets/logo.png": "logo" }),
    }),
  ));

test("reports files the live site omits or serves differently after retrying", () =>
  withSite(async (directory) => {
    let requests = 0;
    const fetch = async (url) => {
      requests++;
      return served({ "/index.html": "stale" })(url);
    };
    await assert.rejects(
      verifyDeployment("https://example.test/", directory, { attempts: 2, delay: 0, fetch }),
      /differs from the deployed artifact: assets\/logo\.png \(404\), index\.html \(200\)/,
    );
    assert.equal(requests, 4);
  }));

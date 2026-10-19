import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir(".build/screenshots", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1280, 375]) {
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
      for (const [name, path] of [
        ["home", "/"],
        ["cli", "/docs/cli/"],
      ]) {
        await page.goto(`http://127.0.0.1:4173${path}`);
        await page.evaluate(() => document.fonts.ready);
        const file = `.build/screenshots/${name}-${colorScheme}-${width}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

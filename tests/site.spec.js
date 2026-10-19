import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("sources/standard/profile/catalog.json", "utf8"));

for (const path of ["/", "/docs/cli/"]) {
  test(`${path} renders accessibly with local assets and resolving links`, async ({
    page,
    request,
  }, testInfo) => {
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("requestfailed", (request) => errors.push(request.url()));
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== "http://127.0.0.1:4173") external.push(request.url());
    });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      path === "/" ? catalog.promise.heading : "CLI Reference",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://agents-tools.github.io${path}`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      catalog.promise.description,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator("script")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      testInfo.project.use.viewport.width,
    );
    const loaded = await page
      .locator("img")
      .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0));
    expect(loaded).toBe(true);
    if (path === "/") {
      await expect(page.locator(".lede")).toHaveText(catalog.promise.secondary);
      expect(await page.locator("picture img").evaluate((image) => image.currentSrc)).toContain(
        `Demo-${testInfo.project.use.colorScheme}.svg`,
      );
      const recording = await page.locator(".quick-look img").evaluate((image) => ({
        width: image.getBoundingClientRect().width,
        columnWidth: image.closest(".container").getBoundingClientRect().width,
      }));
      if (testInfo.project.use.viewport.width <= 375) {
        expect(recording.width).toBeGreaterThanOrEqual(763);
      } else {
        expect(recording.width).toBe(recording.columnWidth);
      }
      const frame = page.locator(".quick-look-frame");
      await expect(frame).toHaveAttribute("tabindex", "0");
      await expect(frame).toHaveRole("region");
      await expect(frame).toHaveAccessibleName("Quick look");
      const scrolling = await frame.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      if (testInfo.project.use.viewport.width <= 375) {
        expect(scrolling.scrollWidth).toBeGreaterThan(scrolling.width);
      } else {
        expect(scrolling.scrollWidth).toBe(scrolling.width);
      }
      await expect(page.locator("#install + p")).toHaveText("Build from source:");
      await expect(page.locator(".repositories li")).toHaveCount(
        catalog.groups.flatMap((group) => group.repositories).length,
      );
    }
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    for (const href of hrefs) {
      const url = new URL(href, page.url());
      if (url.origin !== new URL(page.url()).origin) continue;
      const response = await request.get(url.pathname);
      expect(response.status(), href).toBe(200);
      if (url.hash)
        expect(await response.text(), href).toContain(
          `id="${decodeURIComponent(url.hash.slice(1))}"`,
        );
    }
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${path} supports skip navigation and sequential visible keyboard focus`, async ({
    page,
  }) => {
    await page.goto(path);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await page.goto(path);
    const focusable = page.locator('a[href], [tabindex="0"]');
    const count = await focusable.count();
    for (let index = 0; index < count; index++) {
      await page.keyboard.press("Tab");
      const target = focusable.nth(index);
      await expect(target).toBeFocused();
      await expect(target).toBeInViewport();
      expect(await target.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
        "solid",
      );
      if (await target.evaluate((element) => element.scrollWidth > element.clientWidth)) {
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => target.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
    }
    await page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Docs" })
      .click();
    await expect(page).toHaveURL(/\/docs\/cli\/$/);
    await page
      .getByRole("navigation", { name: "Primary", exact: true })
      .getByRole("link", { name: "Install" })
      .click();
    await expect(page.locator("#install")).toBeInViewport();
  });
}

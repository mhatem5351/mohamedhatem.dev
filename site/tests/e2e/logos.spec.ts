/**
 * Company logos: the "Shipped at" row shows each company's official logo in its real colours, the right file for the
 * page's theme (dark by default), named by its alt text; the work cards carry the company's tile beside the eyebrow
 * (the employer's for client work, Logic Controls for the freelance site).
 */
import { expect, test, useTheme } from "./fixtures";

const NAMES = ["Globant", "Wakeb Data", "ArabsStock", "Empoweromics", "Tabaqat"];

for (const theme of ["dark", "light"] as const) {
  test(`"Shipped at" shows the official logos for the ${theme} page, named and loaded`, async ({ page }) => {
    if (theme === "light") await useTheme(page, "light");
    await page.goto("/", { waitUntil: "networkidle" });
    const row = page.locator(".logos__list");
    await row.scrollIntoViewIfNeeded();
    const visible = row.locator("img:visible");
    await expect(visible).toHaveCount(6);
    // Wait for the lazy images to finish loading (complete: loaded or broken), then require a real image: a natural size
    // (a broken image has none) and a successful decode. Decoding only after the load avoids a WebKit race where
    // decode(), called while a lazy image is still arriving, can reject under heavy load.
    await expect.poll(() => visible.evaluateAll((imgs) => (imgs as HTMLImageElement[]).every((i) => i.complete)), { timeout: 10_000 }).toBe(true);
    const shown = await visible.evaluateAll((imgs) =>
      Promise.all(
        (imgs as HTMLImageElement[]).map(async (i) => ({
          alt: i.alt,
          src: i.currentSrc || i.src,
          ok: i.naturalWidth > 0 && i.naturalHeight > 0 && (await i.decode().then(() => true, () => false)),
        })),
      ),
    );
    expect(shown.map((s) => s.alt)).toEqual([...NAMES, ""]);
    for (const s of shown) expect(s.ok, s.src).toBe(true);
    // the dark page uses the reversed artwork (Empoweromics has one file for both)
    const dark = shown.filter((s) => /-dark/.test(s.src)).length;
    expect(dark).toBe(theme === "dark" ? 5 : 0);
    // MDP: its symbol with the initials as text
    await expect(row.locator(".brand-logo--mdp .brand-logo__name")).toHaveText("MDP");
    // the other theme's files stay hidden (and lazy: never fetched)
    await expect(row.locator(theme === "dark" ? ".brand-logo__light" : ".brand-logo__dark").first()).toBeHidden();
  });
}

test("the logo row stays on one line on desktop and wraps without overflow on phones", async ({ page, isMobile }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const row = page.locator(".logos__list");
  await row.scrollIntoViewIfNeeded();
  const tops = await row.locator(".brand-logo").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  if (!isMobile) expect(new Set(tops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("every work card carries its company's logo tile beside the eyebrow", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const cards = page.locator("#work article.work");
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(7);
  const tiles = await cards.evaluateAll((els) =>
    els.map((card) => {
      const img = card.querySelector<HTMLImageElement>(".work__meta img.work__logo");
      return { title: card.querySelector(".work__title")?.textContent?.trim() ?? "", src: img?.getAttribute("src") ?? "", alt: img?.alt };
    }),
  );
  for (const t of tiles) {
    expect(t.src, t.title).toMatch(/\/_astro\//);
    expect(t.alt, t.title).toBe(""); // decorative: the eyebrow names the company
  }
  const tileOf = (re: RegExp) => tiles.find((t) => re.test(t.title))!.src;
  expect(tileOf(/ArabsStock Assistant/)).toMatch(/arabsstock/);
  expect(tileOf(/bilingual enterprise assistant/)).toMatch(/wakeb/); // the employer, never the client
  expect(tileOf(/logic-controls\.com/)).toMatch(/logic-controls/);
  expect(tileOf(/GIS data pipelines/)).toMatch(/tabaqat/);
  expect(tileOf(/real-estate platform/)).toMatch(/empoweromics/);
});

const CASE_TILES: Record<string, RegExp> = {
  "sta-tourism-assistants": /globant/,
  "arabsstock-assistant": /arabsstock/,
  "wakeb-bilingual-chatbot": /wakeb/,
  "gov-bilingual-assistant": /wakeb/, // the employer, never the client
  "aip-semantic-search": /wakeb/,
  "empoweromics-ml": /empoweromics/,
  "tabaqat-gis": /tabaqat/,
  "logic-controls-website": /logic-controls/,
};
for (const lang of ["", "/ar"]) {
  test(`every case study${lang ? " (Arabic)" : ""} opens with its company's logo before the company name`, async ({ page }) => {
    for (const [slug, tile] of Object.entries(CASE_TILES)) {
      await page.goto(`${lang}/work/${slug}/`);
      const logo = page.locator(".cs-hero .eyebrow > img.cs-hero__logo");
      await expect(logo, slug).toHaveCount(1);
      await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: slug }).toBe(true);
      const r = await logo.evaluate((img: HTMLImageElement) => {
        const name = img.nextElementSibling!.getBoundingClientRect();
        const box = img.getBoundingClientRect();
        const rtl = getComputedStyle(img.parentElement!).direction === "rtl";
        return {
          src: img.getAttribute("src") ?? "",
          alt: img.alt,
          first: img.parentElement!.firstElementChild === img,
          // inline-start of the name: left of it in English, right of it in Arabic, on the same line
          before: rtl ? box.left >= name.right - 1 : box.right <= name.left + 1,
          sameLine: Math.abs(box.top + box.height / 2 - (name.top + name.height / 2)) < 4,
        };
      });
      expect(r.src, slug).toMatch(tile);
      expect(r.alt, slug).toBe(""); // decorative: the eyebrow names the company
      expect(r, slug).toMatchObject({ first: true, before: true, sameLine: true });
    }
  });
}

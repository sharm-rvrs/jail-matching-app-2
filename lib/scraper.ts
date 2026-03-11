import { chromium, Page } from "playwright";
import { normalizeName } from "./nameUtils";
import type { RosterEntry, ScrapedInmate } from "./types";

const MADISON_BASE = "https://www.madisoncountysheriffal.org/inmate-roster";
const LIMESTONE_URL = "https://limestone-al-911.zuercherportal.com/#/inmates";

// 1x1 transparent PNG (base64) to satisfy image requests quickly.
const TRANSPARENT_PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6q3VwAAAAASUVORK5CYII=",
  "base64",
);

const SCRAPE_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? "200");
const SCRAPE_DELAY_JITTER_MS = Number(
  process.env.SCRAPE_DELAY_JITTER_MS ?? "150",
);

const LIMESTONE_MAX_PAGES = Number(process.env.LIMESTONE_MAX_PAGES ?? "2000");

function getScrapeDelayMs(): number {
  return (
    Math.max(0, SCRAPE_DELAY_MS) +
    Math.random() * Math.max(0, SCRAPE_DELAY_JITTER_MS)
  );
}

export async function scrapeRosters(): Promise<RosterEntry[]> {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 0,
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1920, height: 1080 },
  });

  // Speed up scraping
  await context.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    const requestUrl = route.request().url();
    if (
      resourceType === "image" ||
      resourceType === "stylesheet" ||
      resourceType === "font" ||
      resourceType === "media"
    ) {
      if (
        resourceType === "image" &&
        requestUrl.includes("storage.googleapis.com") &&
        requestUrl.includes("/mdsoal/roster/")
      ) {
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: TRANSPARENT_PNG_1X1,
        });
      }

      return route.abort();
    }
    return route.continue();
  });

  const allEntries: RosterEntry[] = [];

  try {
    console.log("Starting roster scraping...");

    // Run both scrapers in parallel for speed.
    const madisonPage = await context.newPage();
    const limestonePage = await context.newPage();

    const [madison, limestone] = await Promise.all([
      scrapeMadison(madisonPage),
      scrapeLimestone(limestonePage),
    ]);

    await Promise.allSettled([madisonPage.close(), limestonePage.close()]);

    allEntries.push(...madison, ...limestone);

    console.log(`Madison: ${madison.length} | Limestone: ${limestone.length}`);
  } catch (error) {
    console.error("Scraping error:", error);
  } finally {
    await browser.close();
  }

  return deduplicateEntries(allEntries);
}

// Madison County Scraper

async function scrapeMadison(page: Page): Promise<RosterEntry[]> {
  console.log("Scraping Madison roster...");

  const inmates: ScrapedInmate[] = [];
  let pageNum = 1;

  while (true) {
    console.log(`Madison: scraping page ${pageNum}...`);
    const startedAt = Date.now();

    const url =
      pageNum === 1
        ? MADISON_BASE
        : `${MADISON_BASE}/filters/current/booking_time=desc/${pageNum}`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    const pageInmates = await page.evaluate(() => {
      const results: Array<{ name: string; photoUrl: string | null }> = [];
      const cards = document.querySelectorAll(".col-lg-6");

      cards.forEach((card) => {
        const nameEl = card.querySelector(".roster_name");
        const imgEl = card.querySelector(".inmate_mugshot img");

        const name = nameEl?.textContent?.trim();
        if (!name || name.length < 3) return;

        const rawSrc =
          imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || null;
        // If the onerror handler already replaced the src, treat as missing.
        const photoUrl =
          rawSrc && /\/libs\/images\/pna\.gif$/i.test(rawSrc) ? null : rawSrc;

        results.push({ name, photoUrl });
      });
      return results;
    });

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `Madison: page ${pageNum} -> ${pageInmates.length} inmates (total ${inmates.length + pageInmates.length}) in ${elapsedMs}ms`,
    );

    if (pageInmates.length === 0) {
      console.log("Reached last page of Madison roster at page", pageNum);
      break;
    }

    inmates.push(...pageInmates);
    pageNum++;

    const delay = getScrapeDelayMs();
    if (delay > 0) await page.waitForTimeout(delay);
  }

  return inmates.map((inmate, index) => ({
    id: `madison-${index}`,
    name: inmate.name,
    normalizedName: normalizeName(inmate.name),
    photoUrl: inmate.photoUrl
      ? new URL(inmate.photoUrl, MADISON_BASE).toString()
      : "",
    jailSource: "Madison" as const,
  }));
}

// Limestone Scraper (Zuercher portal)

async function scrapeLimestone(page: Page): Promise<RosterEntry[]> {
  console.log("Scraping Limestone roster...");

  await page.goto(LIMESTONE_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("tr", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const allInmates: ScrapedInmate[] = [];
  let pageNum = 1;
  let previousSignature: string | null = null;
  let stagnantPages = 0;

  const getSignature = async (): Promise<string> => {
    return page.evaluate(() => {
      const names = Array.from(
        document.querySelectorAll<HTMLTableCellElement>("tr td:nth-child(2)"),
      )
        .map((td) => td.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 200);
      return names.join("|") || String(document.querySelectorAll("tr").length);
    });
  };

  while (true) {
    if (pageNum > LIMESTONE_MAX_PAGES) {
      console.log(
        `Stopping Limestone at page ${pageNum}: reached LIMESTONE_MAX_PAGES=${LIMESTONE_MAX_PAGES}`,
      );
      break;
    }

    console.log(`Limestone: scraping page ${pageNum}...`);
    const startedAt = Date.now();

    const signatureBefore = await getSignature();
    if (previousSignature !== null && signatureBefore === previousSignature) {
      stagnantPages++;
    } else {
      stagnantPages = 0;
    }

    if (stagnantPages >= 3) {
      console.log(
        `Stopping Limestone at page ${pageNum}: page content not changing (stagnant ${stagnantPages} pages)`,
      );
      break;
    }

    const inmatesOnPage = await page.evaluate(() => {
      const results: Array<{ name: string; photoUrl: string | null }> = [];
      const rows = document.querySelectorAll("tr");

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) return;

        const name = cells[1]?.textContent?.trim();
        const img = row.querySelector("img");

        if (!name || name.length < 3) return;

        results.push({
          name,
          photoUrl: img?.src || null,
        });
      });
      return results;
    });

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `Limestone: page ${pageNum} -> ${inmatesOnPage.length} inmates (total ${allInmates.length + inmatesOnPage.length}) in ${elapsedMs}ms`,
    );

    allInmates.push(...inmatesOnPage);

    const nextHandle = await page.evaluateHandle(() => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("button, a"),
      );

      let best: HTMLElement | null = null;
      let bestScore = -1;

      for (const el of elements) {
        const text = (el.textContent || "").trim();
        const aria = (el.getAttribute("aria-label") || "").trim();
        const title = (el.getAttribute("title") || "").trim();

        const matches =
          /next|›|»|forward/i.test(text) ||
          /next|forward/i.test(aria) ||
          /next|forward/i.test(title);
        if (!matches) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;

        let score = 0;
        if (/next/i.test(text)) score += 2;
        if (/›|»|forward/i.test(text)) score += 1;
        if (/next|forward/i.test(aria)) score += 3;
        if (/next|forward/i.test(title)) score += 2;
        if (el.tagName.toLowerCase() === "button") score += 1;

        const paginationAncestor = el.closest(
          "nav, [role='navigation'], .pagination, [class*='pagination'], [aria-label*='pagination' i]",
        );
        if (paginationAncestor) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }

      if (!best) return null;

      const ariaDisabled = best.getAttribute("aria-disabled");
      const disabledAttr = best.getAttribute("disabled");
      const classDisabled = best.classList.contains("disabled");
      const propDisabled =
        best instanceof HTMLButtonElement ? best.disabled : false;

      const disabled =
        propDisabled ||
        disabledAttr !== null ||
        ariaDisabled === "true" ||
        classDisabled;

      return disabled ? null : best;
    });

    const nextEl = nextHandle.asElement();

    if (!nextEl) {
      await nextHandle.dispose();
      console.log("Reached last page of Limestone roster at page", pageNum);
      break;
    }

    await nextEl.scrollIntoViewIfNeeded().catch(() => {});

    const clicked = await nextEl
      .click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    await nextHandle.dispose();

    if (!clicked) {
      console.log(
        `Stopping Limestone at page ${pageNum}: could not click Next button`,
      );
      break;
    }

    const changed = await page
      .waitForFunction(
        (prev) => {
          const names = Array.from(
            document.querySelectorAll<HTMLTableCellElement>(
              "tr td:nth-child(2)",
            ),
          )
            .map((td) => td.textContent?.trim() || "")
            .filter(Boolean)
            .slice(0, 200);
          const sig =
            names.join("|") || String(document.querySelectorAll("tr").length);
          return sig !== prev;
        },
        signatureBefore,
        { timeout: 10000 },
      )
      .then(() => true)
      .catch(() => false);

    if (!changed) {
      console.log(
        `Stopping Limestone at page ${pageNum}: clicked Next but page did not change`,
      );
      break;
    }

    const delay = getScrapeDelayMs();
    if (delay > 0) await page.waitForTimeout(delay);
    pageNum++;

    previousSignature = signatureBefore;
  }

  return allInmates.map((inmate, index) => ({
    id: `limestone-${index}`,
    name: inmate.name,
    normalizedName: normalizeName(inmate.name),
    photoUrl: inmate.photoUrl || "",
    jailSource: "Limestone" as const,
  }));
}

// Deduplication

function deduplicateEntries(entries: RosterEntry[]): RosterEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.normalizedName ?? normalizeName(entry.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

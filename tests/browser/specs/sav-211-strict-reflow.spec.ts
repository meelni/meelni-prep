import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertLayoutAndPrimaryAction,
  assertNoHorizontalOverflow,
  attachEvidence,
} from "../support/assertions";
import {
  SAV_211_BROWSER_SCENARIOS,
  sav211PrimaryAction,
  sav211ScenarioHref,
} from "../support/sav-211-matrix";
import { installBrowserActivityGuard } from "../support/public-fixtures";

for (const scenario of SAV_211_BROWSER_SCENARIOS) {
  test(`SAV-211 ${scenario.id} preserves 195x422 strict reflow`, async ({
    page,
  }, testInfo) => {
    const activity = await installBrowserActivityGuard(page, "harness");
    await page.goto(sav211ScenarioHref(scenario.id), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText(scenario.expectedText).first()).toBeVisible();

    const primaryAction = sav211PrimaryAction(page, scenario.id);
    const layout = primaryAction
      ? await assertLayoutAndPrimaryAction({
          action: primaryAction,
          page,
          mobile: true,
        })
      : await assertNoHorizontalOverflow(page);

    let consentTextContrast: number | null = null;
    if (scenario.id === "consent-undecided") {
      const viewport = page.viewportSize();
      expect(viewport).toEqual({ width: 195, height: 422 });
      await expect(page.getByRole("link", { name: "Privacy" })).toHaveCount(0);
      for (const action of [
        page.getByRole("button", { name: "Decline" }),
        page.getByRole("button", { name: "Allow analytics" }),
      ]) {
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      consentTextContrast = await computedContrastRatio(
        page.locator("[data-cookie-consent-banner] p")
      );
      expect(consentTextContrast).toBeGreaterThanOrEqual(4.5);
    }

    const accessibility = await assertCriticalAccessibility(
      page,
      testInfo,
      `${scenario.id}-strict-reflow`,
      scenario.id === "consent-undecided"
        ? { exclude: ["[data-cookie-consent-banner] p"] }
        : undefined
    );
    await attachEvidence(testInfo, {
      accessibility,
      consentTextContrast,
      layout,
      project: testInfo.project.name,
      scenario: scenario.id,
      unexpectedActivity: activity.unexpected,
      viewport: page.viewportSize(),
    });
    activity.assertClean();
  });
}

async function computedContrastRatio(
  locator: import("@playwright/test").Locator
): Promise<number> {
  const colors = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    let current: Element | null = element;
    let background = "rgb(255, 255, 255)";

    while (current) {
      const candidate = getComputedStyle(current).backgroundColor;
      if (candidate !== "rgba(0, 0, 0, 0)") {
        background = candidate;
        break;
      }
      current = current.parentElement;
    }

    return { background, foreground };
  });

  const parseRgb = (value: string): [number, number, number] => {
    const channels = value
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3) {
      throw new Error(`Expected an RGB color, received ${value}`);
    }
    return channels as [number, number, number];
  };
  const luminance = ([red, green, blue]: [number, number, number]) => {
    const linear = [red, green, blue].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const foreground = luminance(parseRgb(colors.foreground));
  const background = luminance(parseRgb(colors.background));
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);

  return (lighter + 0.05) / (darker + 0.05);
}

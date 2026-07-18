import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

export type LayoutEvidence = {
  bodyClientWidth: number;
  bodyScrollWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  primaryAction: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  primaryActionTabSteps: number;
};

type PageLocation = {
  hash: string;
  origin: string;
  pathname: string;
  search: string;
};

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]",
].join(",");

type AxeIncompleteAllowance = {
  expires: string;
  owner: string;
  projects: string[];
  reason: string;
  rule: string;
  selector: string;
};

// Axe cannot finish these exact project/surface/rule/selector combinations.
// Keep the raw incomplete evidence attached and expire each exception; any
// different project, rule, surface, or selector remains blocking.
const AXE_INCOMPLETE_ALLOWLIST: Record<string, AxeIncompleteAllowance[]> = {
  landing: [
    {
      expires: "2026-08-15",
      owner: "SAV-265",
      projects: ["mobile-chromium"],
      reason:
        "The closed Radix mobile navigation trigger references popup content that is mounted only while the menu is open.",
      rule: "aria-valid-attr-value",
      selector: ".min-h-11",
    },
    ...[
      "h1",
      ".text-body",
      ".border-primary\\/40",
      ".h-auto.hover\\:bg-transparent.py-3:nth-child(1) > .md\\:text-base.z-10.gap-2 > .whitespace-nowrap",
      ".text-info",
      ".leading-relaxed:nth-child(1) > .text-foreground",
      ".leading-relaxed:nth-child(2) > .font-semibold.text-primary",
      ".leading-relaxed:nth-child(2) > .text-foreground",
    ].map((selector) => ({
      expires: "2026-08-15",
      owner: "SAV-265",
      projects: ["mobile-chromium", "desktop-chromium"],
      reason:
        "Axe cannot determine the composited background through the landing page gradient or decorative overlap.",
      rule: "color-contrast",
      selector,
    })),
    {
      expires: "2026-08-15",
      owner: "SAV-265",
      projects: ["desktop-chromium"],
      reason:
        "Axe cannot determine the composited background through the landing page gradient.",
      rule: "color-contrast",
      selector: ".max-w-\\[140px\\]",
    },
  ],
  explore: [
    {
      expires: "2026-08-15",
      owner: "SAV-265",
      projects: ["mobile-chromium"],
      reason:
        "The closed Radix Select trigger references popup content that is mounted only while the listbox is open.",
      rule: "aria-valid-attr-value",
      selector: ".min-w-11",
    },
  ],
  dashboard: [
    '.hover\\:bg-dashboard-muted\\/10.min-h-11[data-browser-qa-href$="history"] > span',
  ].map((selector) => ({
    expires: "2026-08-15",
    owner: "SAV-265",
    projects: ["mobile-chromium"],
    reason:
      "Axe cannot calculate contrast for an inactive item that is intentionally clipped by the horizontally scrollable mobile workspace navigation.",
    rule: "color-contrast",
    selector,
  })),
  "new-interview": [
    ".bg-background\\/50",
    ".ring-primary\\/20.shadow-md.ring-2 > .flex-col.relative.h-full > h3",
    ".ring-primary\\/20.shadow-md.ring-2 > .flex-col.relative.h-full > .mt-1.font-medium",
    ".ring-primary\\/20.shadow-md.ring-2 > .flex-col.relative.h-full > .mt-1\\.5.min-h-8.flex-1",
    ".max-w-xl > span",
  ].map((selector) => ({
    expires: "2026-08-15",
    owner: "SAV-265",
    projects:
      selector === ".max-w-xl > span"
        ? ["mobile-chromium", "desktop-chromium"]
        : ["desktop-chromium"],
    reason:
      "Axe cannot determine the composited background through the selected-card overlay or translucent disclosure container.",
    rule: "color-contrast",
    selector,
  })),
  "new-interview-nav": [
    '.min-h-11.hover\\:text-dashboard-foreground[data-browser-qa-href$="history"] > span',
    '.min-h-11.hover\\:text-dashboard-foreground[data-browser-qa-href$="questions"] > span',
    '.min-h-11.hover\\:text-dashboard-foreground[data-browser-qa-href$="analytics"] > span',
    '.min-h-11.hover\\:text-dashboard-foreground[data-browser-qa-href$="settings"] > span',
  ].map((selector) => ({
    expires: "2026-08-15",
    owner: "SAV-265",
    projects: ["mobile-chromium"],
    reason:
      "Axe cannot calculate contrast for an inactive item that is intentionally clipped by the horizontally scrollable mobile workspace navigation.",
    rule: "color-contrast",
    selector,
  })),
  feedback: [
    ".text-6xl",
    ".mx-auto.max-w-2xl.space-y-3 > h2",
    ".mx-auto.max-w-2xl.space-y-3 > p",
  ].map((selector) => ({
    expires: "2026-08-15",
    owner: "SAV-265",
    projects: ["mobile-chromium", "desktop-chromium"],
    reason:
      "Axe cannot calculate text contrast against the tokenized gradient FeedbackScoreCard background.",
    rule: "color-contrast",
    selector,
  })),
  pricing: [
    {
      expires: "2026-08-15",
      owner: "SAV-265",
      projects: ["mobile-chromium"],
      reason:
        "The closed Radix mobile navigation trigger references popup content that is mounted only while the menu is open.",
      rule: "aria-valid-attr-value",
      selector: ".min-h-11",
    },
  ],
  settings: [
    '.gap-2.hover\\:bg-dashboard-muted\\/10[data-browser-qa-href$="history"] > span',
  ].map((selector) => ({
    expires: "2026-08-15",
    owner: "SAV-265",
    projects: ["mobile-chromium"],
    reason:
      "Axe cannot calculate contrast for an inactive item that is intentionally clipped by the horizontally scrollable mobile workspace navigation.",
    rule: "color-contrast",
    selector,
  })),
};

async function countTabbableElements(page: Page): Promise<number> {
  return page.locator(TABBABLE_SELECTOR).evaluateAll(
    (elements) =>
      elements.filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (element.tabIndex < 0 || element.closest("[inert]")) return false;
        if (element.closest('[aria-hidden="true"]')) return false;
        if (
          "disabled" in element &&
          (element as HTMLButtonElement | HTMLInputElement).disabled
        ) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      }).length
  );
}

async function reachActionThroughTabOrder({
  action,
  page,
}: {
  action: Locator;
  page: Page;
}): Promise<number> {
  const tabbableCount = await countTabbableElements(page);
  expect(
    tabbableCount,
    "page must expose at least one keyboard-reachable control"
  ).toBeGreaterThan(0);

  for (let tabSteps = 1; tabSteps <= tabbableCount + 1; tabSteps += 1) {
    await page.keyboard.press("Tab");
    if (
      await action.evaluate(
        (element) =>
          document.activeElement === element ||
          element.contains(document.activeElement)
      )
    ) {
      return tabSteps;
    }
  }

  expect(
    false,
    `primary action was not reached after traversing ${tabbableCount} keyboard tab stops`
  ).toBe(true);
  return 0;
}

export async function assertExactPageLocation({
  baseURL,
  expectedHref,
  page,
}: {
  baseURL?: string;
  expectedHref: string;
  page: Page;
}): Promise<PageLocation> {
  const expected = new URL(expectedHref, baseURL);
  const expectedLocation: PageLocation = {
    hash: expected.hash,
    origin: expected.origin,
    pathname: expected.pathname,
    search: expected.search,
  };

  await expect
    .poll(() => {
      const current = new URL(page.url());
      return {
        hash: current.hash,
        origin: current.origin,
        pathname: current.pathname,
        search: current.search,
      };
    })
    .toEqual(expectedLocation);

  return expectedLocation;
}

export async function assertLayoutAndPrimaryAction({
  action,
  page,
  mobile,
}: {
  action: Locator;
  page: Page;
  mobile: boolean;
}): Promise<LayoutEvidence> {
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  const primaryActionTabSteps = await reachActionThroughTabOrder({
    action,
    page,
  });
  await expect(action).toBeFocused();
  await action.scrollIntoViewIfNeeded();

  const primaryAction = await action.boundingBox();
  if (!primaryAction) {
    throw new Error("primary action must have a layout box");
  }

  const layout = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));

  expect(layout.documentScrollWidth).toBeLessThanOrEqual(
    layout.documentClientWidth + 1
  );
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(
    layout.bodyClientWidth + 1
  );

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("browser project must define a viewport");
  expect(primaryAction.x).toBeGreaterThanOrEqual(-1);
  expect(primaryAction.x + primaryAction.width).toBeLessThanOrEqual(
    viewport.width + 1
  );
  if (mobile) expect(primaryAction.height).toBeGreaterThanOrEqual(44);

  const centerIsAction = await action.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return hit === element || (hit !== null && element.contains(hit));
  });
  expect(centerIsAction, "primary action must not be covered").toBe(true);

  return { ...layout, primaryAction, primaryActionTabSteps };
}

export async function assertCriticalAccessibility(
  page: Page,
  testInfo: TestInfo,
  surfaceId: string
) {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const isBlocking = (finding: (typeof result.violations)[number]) =>
    finding.impact === "critical" ||
    finding.impact === "serious" ||
    finding.id === "color-contrast";
  const summarize = (finding: (typeof result.violations)[number]) => ({
    help: finding.help,
    impact: finding.impact,
    rule: finding.id,
    nodes: finding.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      selector: node.target,
    })),
  });
  const allowanceFor = (
    finding: (typeof result.incomplete)[number],
    selector: string
  ) =>
    [
      ...(AXE_INCOMPLETE_ALLOWLIST[surfaceId] ?? []),
      ...(surfaceId === "new-interview"
        ? (AXE_INCOMPLETE_ALLOWLIST["new-interview-nav"] ?? [])
        : []),
    ].find(
      (allowance) =>
        allowance.rule === finding.id &&
        allowance.selector === selector &&
        allowance.projects.includes(testInfo.project.name) &&
        Date.now() <= Date.parse(`${allowance.expires}T23:59:59.999Z`)
    );
  const allowedIncomplete = result.incomplete.flatMap((finding) =>
    finding.nodes.flatMap((node) => {
      const allowance = allowanceFor(finding, node.target.join(" > "));
      return allowance
        ? [
            {
              ...allowance,
              failureSummary: node.failureSummary,
              impact: finding.impact,
            },
          ]
        : [];
    })
  );
  const blockingIncomplete = result.incomplete.flatMap((finding) => {
    if (!isBlocking(finding)) return [];
    const nodes = finding.nodes.filter(
      (node) => !allowanceFor(finding, node.target.join(" > "))
    );
    return nodes.length > 0 ? [summarize({ ...finding, nodes })] : [];
  });
  const evidence = {
    allowedIncomplete,
    blocking: {
      incomplete: blockingIncomplete,
      violations: result.violations.filter(isBlocking).map(summarize),
    },
    incomplete: result.incomplete.map(summarize),
    passes: result.passes.length,
    violationCount: result.violations.length,
  };

  await testInfo.attach("axe-accessibility-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  expect(
    evidence.blocking,
    "serious, critical, and color-contrast Axe violations or incomplete results must be resolved"
  ).toEqual({ incomplete: [], violations: [] });

  return evidence;
}

type DialogFocusState = {
  activeDescription: string;
  activeIndex: number;
  count: number;
  inside: boolean;
};

async function readDialogFocusState(
  dialog: Locator
): Promise<DialogFocusState> {
  return dialog.evaluate((element, tabbableSelector) => {
    const allCandidates = Array.from(
      element.querySelectorAll<HTMLElement>(tabbableSelector)
    );
    const candidates = allCandidates.filter((candidate) => {
      if (candidate.tabIndex < 0 || candidate.closest("[inert]")) return false;
      if (candidate.closest('[aria-hidden="true"]')) return false;
      if (
        "disabled" in candidate &&
        (candidate as HTMLButtonElement | HTMLInputElement).disabled
      ) {
        return false;
      }

      const style = window.getComputedStyle(candidate);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        candidate.getClientRects().length === 0
      ) {
        return false;
      }

      if (candidate instanceof HTMLInputElement && candidate.type === "radio") {
        const group = allCandidates.filter(
          (other): other is HTMLInputElement =>
            other instanceof HTMLInputElement &&
            other.type === "radio" &&
            other.name === candidate.name &&
            other.form === candidate.form
        );
        const selected = group.find((radio) => radio.checked);
        if (selected ? selected !== candidate : group[0] !== candidate) {
          return false;
        }
      }

      return true;
    });
    const active = document.activeElement;

    return {
      activeDescription:
        active instanceof HTMLElement
          ? `${active.tagName.toLowerCase()}#${active.id || "(no-id)"} ${active.getAttribute("aria-label") || active.textContent?.trim().slice(0, 80) || "(no-name)"}`
          : "(no-active-element)",
      activeIndex:
        active instanceof HTMLElement ? candidates.indexOf(active) : -1,
      count: candidates.length,
      inside: active !== null && element.contains(active),
    };
  }, TABBABLE_SELECTOR);
}

export async function assertDialogFocusContract({
  dialogName,
  page,
  trigger,
}: {
  dialogName: string | RegExp;
  page: Page;
  trigger: Locator;
}) {
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(dialogName);
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);

  const initial = await readDialogFocusState(dialog);
  expect(
    initial.count,
    "dialog must have a keyboard focus cycle"
  ).toBeGreaterThan(0);
  expect(
    initial.activeIndex,
    `dialog auto-focus must land on a tabbable control; active element: ${initial.activeDescription}`
  ).toBeGreaterThanOrEqual(0);

  const forwardIndices: number[] = [];
  for (let index = 0; index < initial.count; index += 1) {
    await page.keyboard.press("Tab");
    const state = await readDialogFocusState(dialog);
    expect(
      state.inside,
      `forward Tab escaped the dialog to ${state.activeDescription}`
    ).toBe(true);
    expect(state.activeIndex).toBeGreaterThanOrEqual(0);
    forwardIndices.push(state.activeIndex);
  }
  expect(new Set(forwardIndices).size).toBe(initial.count);
  expect(forwardIndices.at(-1)).toBe(initial.activeIndex);

  const reverseIndices: number[] = [];
  for (let index = 0; index < initial.count; index += 1) {
    await page.keyboard.press("Shift+Tab");
    const state = await readDialogFocusState(dialog);
    expect(
      state.inside,
      `reverse Tab escaped the dialog to ${state.activeDescription}`
    ).toBe(true);
    expect(state.activeIndex).toBeGreaterThanOrEqual(0);
    reverseIndices.push(state.activeIndex);
  }
  expect(new Set(reverseIndices).size).toBe(initial.count);
  expect(reverseIndices.at(-1)).toBe(initial.activeIndex);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

export async function attachEvidence(
  testInfo: TestInfo,
  evidence: Record<string, unknown>
) {
  await testInfo.attach("browser-qa-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
}

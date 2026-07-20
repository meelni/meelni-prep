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
    document.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.scrollLeft !== 0) element.scrollLeft = 0;
      if (element.scrollTop !== 0) element.scrollTop = 0;
    });
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
  const blockingIncomplete = result.incomplete.flatMap((finding) => {
    if (!isBlocking(finding)) return [];
    return [summarize(finding)];
  });
  const evidence = {
    blocking: {
      incomplete: blockingIncomplete,
      violations: result.violations.filter(isBlocking).map(summarize),
    },
    incomplete: result.incomplete.map(summarize),
    passes: result.passes.length,
    violationCount: result.violations.length,
  };

  await testInfo.attach(
    surfaceId.endsWith("-open-popup")
      ? `axe-accessibility-evidence-${surfaceId}`
      : "axe-accessibility-evidence",
    {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json",
    }
  );
  expect(
    evidence.blocking,
    "serious, critical, and color-contrast Axe violations or incomplete results must be resolved"
  ).toEqual({ incomplete: [], violations: [] });

  return evidence;
}

export async function assertPopupAriaAccessibility(
  page: Page,
  testInfo: TestInfo,
  surfaceId: string
) {
  const result = await new AxeBuilder({ page })
    .withRules(["aria-valid-attr-value"])
    .analyze();
  const summarize = (finding: (typeof result.violations)[number]) => ({
    help: finding.help,
    impact: finding.impact,
    rule: finding.id,
    nodes: finding.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      selector: node.target,
    })),
  });
  const evidence = {
    incomplete: result.incomplete.map(summarize),
    passes: result.passes.map(summarize),
    violations: result.violations.map(summarize),
  };

  await testInfo.attach(`axe-popup-aria-evidence-${surfaceId}`, {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  expect(
    {
      incomplete: evidence.incomplete,
      violations: evidence.violations,
    },
    "open popup ARIA references must be valid without an Axe exception"
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

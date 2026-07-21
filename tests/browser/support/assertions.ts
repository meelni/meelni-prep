import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";

import {
  classifyVaulPseudoContrastReview,
  extractVaulPseudoReviewSelectors,
  VAUL_DRAWER_PSEUDO_REVIEW,
  type VaulAxeFinding,
  type PaintStyleEvidence,
  type VaulPseudoReviewContext,
  type VaulPseudoSnapshot,
  type VaulReviewSurface,
} from "./vaul-pseudo-review";

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

export type WidthEvidence = {
  bodyClientWidth: number;
  bodyScrollWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
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

type ScreenshotColor = [number, number, number];

function parseScreenshotColor(value: string): ScreenshotColor | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u
  );
  if (!match || (match[4] !== undefined && Number(match[4]) < 0.999)) {
    return null;
  }
  const color: ScreenshotColor = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  return color.every(Number.isFinite) ? color : null;
}

function colorDistance(first: ScreenshotColor, second: ScreenshotColor) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

function colorDistanceToSegment(
  color: ScreenshotColor,
  start: ScreenshotColor,
  end: ScreenshotColor
) {
  const delta: ScreenshotColor = [
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ];
  const lengthSquared = delta.reduce(
    (sum, channel) => sum + channel * channel,
    0
  );
  if (lengthSquared === 0) return colorDistance(color, start);
  const projection = Math.min(
    1,
    Math.max(
      0,
      color.reduce(
        (sum, channel, index) => sum + (channel - start[index]) * delta[index],
        0
      ) / lengthSquared
    )
  );
  return colorDistance(color, [
    start[0] + projection * delta[0],
    start[1] + projection * delta[1],
    start[2] + projection * delta[2],
  ]);
}

async function readRenderedPixelEvidence(
  page: Page,
  node: VaulPseudoSnapshot["nodes"][number]
): Promise<VaulPseudoSnapshot["nodes"][number]["renderedPixels"]> {
  const invalid = {
    backgroundPixelCount: 0,
    foregroundPixelCount: 0,
    height: 0,
    maxPaletteDistance: Number.POSITIVE_INFINITY,
    totalPixelCount: 0,
    unexpectedPixelCount: 0,
    width: 0,
  };
  const foreground = parseScreenshotColor(node.foreground);
  const background = node.background
    ? parseScreenshotColor(node.background)
    : null;
  const rect = node.layers[0]?.rect;
  const viewport = page.viewportSize();
  if (
    !foreground ||
    !background ||
    !rect ||
    !viewport ||
    rect.left < 0 ||
    rect.top < 0 ||
    rect.right > viewport.width ||
    rect.bottom > viewport.height
  ) {
    return invalid;
  }

  const palette = Array.from(
    new Set([
      node.foreground,
      node.background,
      ...node.layers.flatMap((layer) => [
        layer.borderTopColor,
        layer.borderRightColor,
        layer.borderBottomColor,
        layer.borderLeftColor,
      ]),
    ])
  ).flatMap((value) => {
    if (!value) return [];
    const color = parseScreenshotColor(value);
    return color ? [color] : [];
  });
  if (palette.length < 2) return invalid;

  let screenshot: Buffer;
  try {
    screenshot = await page.locator(node.selector).screenshot({ type: "png" });
  } catch {
    return invalid;
  }
  const { data, info } = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let backgroundPixelCount = 0;
  let foregroundPixelCount = 0;
  let maxPaletteDistance = 0;
  let unexpectedPixelCount = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const color: ScreenshotColor = [
      data[offset],
      data[offset + 1],
      data[offset + 2],
    ];
    if (colorDistance(color, foreground) <= 6) foregroundPixelCount += 1;
    if (colorDistance(color, background) <= 6) backgroundPixelCount += 1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let firstIndex = 0; firstIndex < palette.length; firstIndex++) {
      for (
        let secondIndex = firstIndex;
        secondIndex < palette.length;
        secondIndex++
      ) {
        nearestDistance = Math.min(
          nearestDistance,
          colorDistanceToSegment(
            color,
            palette[firstIndex],
            palette[secondIndex]
          )
        );
      }
    }
    maxPaletteDistance = Math.max(maxPaletteDistance, nearestDistance);
    if (nearestDistance > 6) unexpectedPixelCount += 1;
  }

  return {
    backgroundPixelCount,
    foregroundPixelCount,
    height: info.height,
    maxPaletteDistance,
    totalPixelCount: info.width * info.height,
    unexpectedPixelCount,
    width: info.width,
  };
}

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

  const layout = await assertNoHorizontalOverflow(page);

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

export async function assertNoHorizontalOverflow(
  page: Page
): Promise<WidthEvidence> {
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
  return layout;
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
    findingIsBlocking(finding);
  const blockingIncomplete = result.incomplete.flatMap((finding) => {
    if (!isBlocking(finding)) return [];
    return [summarizeAxeFinding(finding)];
  });
  const evidence = {
    blocking: {
      incomplete: blockingIncomplete,
      violations: result.violations.filter(isBlocking).map(summarizeAxeFinding),
    },
    incomplete: result.incomplete.map(summarizeAxeFinding),
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

function findingIsBlocking(finding: { id: string; impact?: string | null }) {
  return (
    finding.impact === "critical" ||
    finding.impact === "serious" ||
    finding.id === "color-contrast"
  );
}

function summarizeAxeFinding(finding: {
  help: string;
  id: string;
  impact?: string | null;
  nodes: Array<{ failureSummary?: string; target: unknown }>;
}) {
  return {
    help: finding.help,
    impact: finding.impact,
    rule: finding.id,
    nodes: finding.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      selector: node.target,
    })),
  };
}

async function verifyVaulPseudoContrastIncomplete({
  context,
  finding,
  page,
  surfaceId,
  targetId,
  testInfo,
}: {
  context: VaulPseudoReviewContext;
  finding: VaulAxeFinding;
  page: Page;
  surfaceId: string;
  targetId: string;
  testInfo: TestInfo;
}) {
  const selectors = extractVaulPseudoReviewSelectors(
    finding,
    targetId,
    context
  );
  if (!selectors) return null;

  const snapshot = await page.evaluate(
    ({ selectors: nodeSelectors, targetId: drawerId }) => {
      type Rgba = [number, number, number, number];

      const parseColor = (value: string): Rgba | null => {
        const match = value.match(
          /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u
        );
        if (!match) return null;
        const rgba: Rgba = [
          Number(match[1]),
          Number(match[2]),
          Number(match[3]),
          match[4] === undefined ? 1 : Number(match[4]),
        ];
        return rgba.every(Number.isFinite) ? rgba : null;
      };
      const composite = (front: Rgba, back: Rgba): Rgba => {
        const alpha = front[3] + back[3] * (1 - front[3]);
        if (alpha === 0) return [0, 0, 0, 0];
        return [
          (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
          (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
          (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
          alpha,
        ];
      };
      const effectiveBackground = (element: Element): Rgba | null => {
        let foreground: Rgba = [0, 0, 0, 0];
        let current: Element | null = element;
        while (current) {
          const style = getComputedStyle(current);
          if (style.backgroundImage !== "none" || style.opacity !== "1") {
            return null;
          }
          const layer = parseColor(style.backgroundColor);
          if (!layer) return null;
          foreground = composite(foreground, layer);
          if (foreground[3] >= 0.999) return foreground;
          current = current.parentElement;
        }
        return null;
      };
      const serializeColor = (color: Rgba) =>
        `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

      const animationPseudoElement = (animation: Animation) => {
        const effect = animation.effect as
          | (AnimationEffect & { pseudoElement?: string | null })
          | null;
        return effect?.pseudoElement ?? null;
      };
      const readPaintStyle = (
        element: Element,
        style: CSSStyleDeclaration,
        pseudoElement: string | null = null
      ): PaintStyleEvidence => ({
        activeAnimationCount: element
          .getAnimations({ subtree: false })
          .filter(
            (animation) =>
              animation.playState !== "finished" &&
              animation.playState !== "idle" &&
              animationPseudoElement(animation) === pseudoElement
          ).length,
        animationComposition: style.animationComposition,
        animationDelay: style.animationDelay,
        animationDirection: style.animationDirection,
        animationDuration: style.animationDuration,
        animationFillMode: style.animationFillMode,
        animationIterationCount: style.animationIterationCount,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        animationTimingFunction: style.animationTimingFunction,
        backfaceVisibility: style.backfaceVisibility,
        backdropFilter: style.backdropFilter,
        backgroundBlendMode: style.backgroundBlendMode,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderBottomColor: style.borderBottomColor,
        borderBottomStyle: style.borderBottomStyle,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftColor: style.borderLeftColor,
        borderLeftStyle: style.borderLeftStyle,
        borderLeftWidth: style.borderLeftWidth,
        borderRightColor: style.borderRightColor,
        borderRightStyle: style.borderRightStyle,
        borderRightWidth: style.borderRightWidth,
        borderTopColor: style.borderTopColor,
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: style.borderTopWidth,
        bottom: style.bottom,
        boxSizing: style.boxSizing,
        boxShadow: style.boxShadow,
        clipPath: style.clipPath,
        contain: style.contain,
        containerType: style.containerType,
        contentVisibility: style.contentVisibility,
        display: style.display,
        filter: style.filter,
        float: style.cssFloat,
        isolation: style.isolation,
        left: style.left,
        maskClip: style.maskClip,
        maskComposite: style.maskComposite,
        maskImage: style.maskImage,
        maskMode: style.maskMode,
        maskOrigin: style.maskOrigin,
        maskPosition: style.maskPosition,
        maskRepeat: style.maskRepeat,
        maskSize: style.maskSize,
        mixBlendMode: style.mixBlendMode,
        opacity: style.opacity,
        order: style.order,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        overflow: style.overflow,
        perspective: style.perspective,
        pointerEvents: style.pointerEvents,
        position: style.position,
        right: style.right,
        rotate: style.rotate,
        scale: style.scale,
        textColor: style.color,
        textFillColor: style.webkitTextFillColor,
        textShadow: style.textShadow,
        textStrokeColor: style.webkitTextStrokeColor,
        textStrokeWidth: style.webkitTextStrokeWidth,
        top: style.top,
        transform: style.transform,
        transformStyle: style.transformStyle,
        transitionDelay: style.transitionDelay,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
        transitionTimingFunction: style.transitionTimingFunction,
        translate: style.translate,
        visibility: style.visibility,
        webkitBackdropFilter: style.getPropertyValue("-webkit-backdrop-filter"),
        webkitMaskClip: style.getPropertyValue("-webkit-mask-clip"),
        webkitMaskComposite: style.getPropertyValue("-webkit-mask-composite"),
        webkitMaskImage: style.getPropertyValue("-webkit-mask-image"),
        webkitMaskOrigin: style.getPropertyValue("-webkit-mask-origin"),
        webkitMaskPosition: style.getPropertyValue("-webkit-mask-position"),
        webkitMaskRepeat: style.getPropertyValue("-webkit-mask-repeat"),
        webkitMaskSize: style.getPropertyValue("-webkit-mask-size"),
        willChange: style.willChange,
        zIndex: style.zIndex,
        zoom: style.zoom,
      });

      const drawer = document.getElementById(drawerId);
      if (!(drawer instanceof HTMLElement)) return null;

      const drawerBackground = effectiveBackground(drawer);
      const drawerStyle = getComputedStyle(drawer);
      const pseudo = getComputedStyle(drawer, "::after");
      const nodes = nodeSelectors.map((selector) => {
        let matches: NodeListOf<Element>;
        try {
          matches = document.querySelectorAll(selector);
        } catch {
          return {
            approvedMatchCount: 0,
            approvedMatchesTarget: false,
            approvedSelector: "",
            background: null,
            fontSize: Number.NaN,
            fontWeight: Number.NaN,
            foreground: "",
            insideDrawer: false,
            layers: [],
            matchCount: 0,
            reviewKey: null,
            selector,
          };
        }
        if (matches.length !== 1) {
          return {
            approvedMatchCount: 0,
            approvedMatchesTarget: false,
            approvedSelector: "",
            background: null,
            fontSize: Number.NaN,
            fontWeight: Number.NaN,
            foreground: "",
            insideDrawer: false,
            layers: [],
            matchCount: matches.length,
            reviewKey: null,
            selector,
          };
        }
        const element = matches[0];
        if (!(element instanceof HTMLElement)) {
          return {
            approvedMatchCount: 0,
            approvedMatchesTarget: false,
            approvedSelector: "",
            background: null,
            fontSize: Number.NaN,
            fontWeight: Number.NaN,
            foreground: "",
            insideDrawer: false,
            layers: [],
            matchCount: 1,
            reviewKey: null,
            selector,
          };
        }
        const style = getComputedStyle(element);
        const reviewKey = element.getAttribute("data-vaul-review-node");
        const approvedSelector = reviewKey
          ? `[data-vaul-review-node="${reviewKey}"]`
          : "";
        const approvedMatches = approvedSelector
          ? document.querySelectorAll(approvedSelector)
          : [];
        let foreground: Rgba = [0, 0, 0, 0];
        let current: Element | null = element;
        const layers: VaulPseudoSnapshot["nodes"][number]["layers"] = [];
        let background: Rgba | null = null;
        let backgroundResolved = false;
        while (current && drawer.contains(current)) {
          const layerStyle = getComputedStyle(current);
          const layerRect = current.getBoundingClientRect();
          layers.push({
            ...readPaintStyle(current, layerStyle),
            clientHeight:
              current instanceof HTMLElement ? current.clientHeight : 0,
            clientWidth:
              current instanceof HTMLElement ? current.clientWidth : 0,
            isDrawer: current === drawer,
            offsetHeight:
              current instanceof HTMLElement ? current.offsetHeight : 0,
            offsetWidth:
              current instanceof HTMLElement ? current.offsetWidth : 0,
            rect: {
              bottom: layerRect.bottom,
              height: layerRect.height,
              left: layerRect.left,
              right: layerRect.right,
              top: layerRect.top,
              width: layerRect.width,
            },
          });
          if (!backgroundResolved) {
            const layer = parseColor(layerStyle.backgroundColor);
            if (!layer) break;
            foreground = composite(foreground, layer);
            if (foreground[3] >= 0.999) {
              background = foreground;
              backgroundResolved = true;
            }
          }
          if (current === drawer) break;
          current = current.parentElement;
        }
        const targetRect = element.getBoundingClientRect();
        const sampleFractions = [0.2, 0.5, 0.8];
        const targetHitSampleCount = sampleFractions.length ** 2;
        let targetHitOwnedCount = 0;
        for (const xFraction of sampleFractions) {
          for (const yFraction of sampleFractions) {
            const hit = document.elementFromPoint(
              targetRect.left + targetRect.width * xFraction,
              targetRect.top + targetRect.height * yFraction
            );
            if (hit === element || element.contains(hit)) {
              targetHitOwnedCount += 1;
            }
          }
        }
        return {
          approvedMatchCount: approvedMatches.length,
          approvedMatchesTarget:
            approvedMatches.length === 1 && approvedMatches[0] === element,
          approvedSelector,
          background: background ? serializeColor(background) : null,
          fontSize: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseInt(style.fontWeight, 10),
          foreground: style.color,
          insideDrawer: drawer.contains(element),
          layers,
          matchCount: 1,
          reviewKey,
          selector,
          targetHitOwnedCount,
          targetHitSampleCount,
        };
      });

      return {
        drawer: {
          background: drawerBackground
            ? serializeColor(drawerBackground)
            : drawerStyle.backgroundColor,
          clientHeight: drawer.clientHeight,
          clientWidth: drawer.clientWidth,
          color: drawerStyle.color,
          customContainer: drawer.getAttribute("data-vaul-custom-container"),
          direction: drawer.getAttribute("data-vaul-drawer-direction"),
          hasDrawerAttribute: drawer.hasAttribute("data-vaul-drawer"),
          role: drawer.getAttribute("role"),
          runtimeVersion: drawer.getAttribute("data-meelni-vaul-version"),
        },
        nodes,
        pseudo: {
          ...readPaintStyle(drawer, pseudo, "::after"),
          borderBottomWidth: pseudo.borderBottomWidth,
          borderLeftWidth: pseudo.borderLeftWidth,
          borderRightWidth: pseudo.borderRightWidth,
          borderTopWidth: pseudo.borderTopWidth,
          bottom: pseudo.bottom,
          content: pseudo.content,
          height: pseudo.height,
          left: pseudo.left,
          marginBottom: pseudo.marginBottom,
          marginLeft: pseudo.marginLeft,
          marginRight: pseudo.marginRight,
          marginTop: pseudo.marginTop,
          paddingBottom: pseudo.paddingBottom,
          paddingLeft: pseudo.paddingLeft,
          paddingRight: pseudo.paddingRight,
          paddingTop: pseudo.paddingTop,
          position: pseudo.position,
          right: pseudo.right,
          rotate: pseudo.rotate,
          scale: pseudo.scale,
          top: pseudo.top,
          translate: pseudo.translate,
          width: pseudo.width,
          zIndex: pseudo.zIndex,
        },
      };
    },
    { selectors, targetId }
  );
  if (!snapshot) return null;

  const browserSnapshot = snapshot as VaulPseudoSnapshot;
  const renderedPixels = await Promise.all(
    browserSnapshot.nodes.map((node) => readRenderedPixelEvidence(page, node))
  );
  const snapshotWithRenderedPixels: VaulPseudoSnapshot = {
    ...browserSnapshot,
    nodes: browserSnapshot.nodes.map((node, index) => ({
      ...node,
      renderedPixels: renderedPixels[index],
    })),
  };

  const review = classifyVaulPseudoContrastReview({
    context,
    finding,
    now: Date.now(),
    snapshot: snapshotWithRenderedPixels,
    targetId,
  });
  if (!review) {
    await testInfo.attach(`vaul-pseudo-review-diagnostic-${surfaceId}`, {
      body: Buffer.from(
        JSON.stringify(
          {
            context,
            finding: {
              impact: finding.impact,
              nodes: finding.nodes.map((node) => ({
                failureSummary: node.failureSummary,
                target: node.target,
              })),
              rule: finding.id,
            },
            selectors,
            snapshot: {
              drawer: snapshotWithRenderedPixels.drawer,
              pseudo: snapshotWithRenderedPixels.pseudo,
              nodes: snapshotWithRenderedPixels.nodes.map((node) => ({
                approvedMatchCount: node.approvedMatchCount,
                approvedMatchesTarget: node.approvedMatchesTarget,
                approvedSelector: node.approvedSelector,
                background: node.background,
                foreground: node.foreground,
                insideDrawer: node.insideDrawer,
                layerCount: node.layers.length,
                layers: node.layers.map((layer) => ({
                  animationDuration: layer.animationDuration,
                  animationName: layer.animationName,
                  animationTimingFunction: layer.animationTimingFunction,
                  backgroundColor: layer.backgroundColor,
                  borderBottomColor: layer.borderBottomColor,
                  borderBottomStyle: layer.borderBottomStyle,
                  borderBottomWidth: layer.borderBottomWidth,
                  borderLeftColor: layer.borderLeftColor,
                  borderLeftStyle: layer.borderLeftStyle,
                  borderLeftWidth: layer.borderLeftWidth,
                  borderRightColor: layer.borderRightColor,
                  borderRightStyle: layer.borderRightStyle,
                  borderRightWidth: layer.borderRightWidth,
                  borderTopColor: layer.borderTopColor,
                  borderTopStyle: layer.borderTopStyle,
                  borderTopWidth: layer.borderTopWidth,
                  bottom: layer.bottom,
                  boxSizing: layer.boxSizing,
                  clientHeight: layer.clientHeight,
                  clientWidth: layer.clientWidth,
                  display: layer.display,
                  isDrawer: layer.isDrawer,
                  left: layer.left,
                  offsetHeight: layer.offsetHeight,
                  offsetWidth: layer.offsetWidth,
                  position: layer.position,
                  rect: layer.rect,
                  right: layer.right,
                  top: layer.top,
                  transitionDuration: layer.transitionDuration,
                  transitionProperty: layer.transitionProperty,
                  transitionTimingFunction: layer.transitionTimingFunction,
                  willChange: layer.willChange,
                  zIndex: layer.zIndex,
                })),
                matchCount: node.matchCount,
                renderedCoverage: {
                  background:
                    node.renderedPixels.backgroundPixelCount /
                    node.renderedPixels.totalPixelCount,
                  foreground:
                    node.renderedPixels.foregroundPixelCount /
                    node.renderedPixels.totalPixelCount,
                  unexpected:
                    node.renderedPixels.unexpectedPixelCount /
                    node.renderedPixels.totalPixelCount,
                },
                renderedPixels: node.renderedPixels,
                reviewKey: node.reviewKey,
                selector: node.selector,
                targetHitOwnedCount: node.targetHitOwnedCount,
                targetHitSampleCount: node.targetHitSampleCount,
              })),
            },
            targetId,
          },
          null,
          2
        )
      ),
      contentType: "application/json",
    });
  }
  return review;
}

export async function assertPopupAccessibility(
  page: Page,
  testInfo: TestInfo,
  surfaceId: string,
  targetId: string,
  options: {
    vaulDrawerPseudoReview?: { surfaceId: VaulReviewSurface };
  } = {}
) {
  expect(
    targetId,
    "popup target IDs must be safe to use as exact CSS ID selectors"
  ).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/u);
  await expect
    .poll(() =>
      page
        .locator(`#${targetId}`)
        .evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter(
                (animation) =>
                  animation.playState !== "finished" &&
                  animation.playState !== "idle"
              ).length
        )
    )
    .toBe(0);
  const result = await new AxeBuilder({ page })
    .include(`#${targetId}`)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const browserName = page.context().browser()?.browserType().name() ?? "none";
  const vaulPseudoReviews = options.vaulDrawerPseudoReview
    ? await Promise.all(
        result.incomplete.map((finding, findingIndex) =>
          verifyVaulPseudoContrastIncomplete({
            context: {
              browserName,
              findingCount: result.incomplete.length,
              findingIndex,
              projectName: testInfo.project.name,
              surfaceId: options.vaulDrawerPseudoReview!.surfaceId,
              vaulVersion: VAUL_DRAWER_PSEUDO_REVIEW.vaulVersion,
            },
            finding,
            page,
            surfaceId,
            targetId,
            testInfo,
          })
        )
      )
    : result.incomplete.map(() => null);
  const reviewedVaulPseudo = vaulPseudoReviews.filter(
    (review) => review !== null
  );
  const blockingIncomplete = result.incomplete.flatMap((finding, index) => {
    if (!findingIsBlocking(finding)) return [];
    return vaulPseudoReviews[index] === null
      ? [summarizeAxeFinding(finding)]
      : [];
  });
  const evidence = {
    blocking: {
      incomplete: blockingIncomplete,
      violations: result.violations
        .filter(findingIsBlocking)
        .map(summarizeAxeFinding),
    },
    incomplete: result.incomplete.map(summarizeAxeFinding),
    passes: result.passes.length,
    reviewedVaulPseudo,
    violationCount: result.violations.length,
  };

  await testInfo.attach(`axe-popup-accessibility-evidence-${surfaceId}`, {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  if (options.vaulDrawerPseudoReview) {
    expect(
      reviewedVaulPseudo.length,
      "the Vaul review may match at most one finding at its approved index"
    ).toBeLessThanOrEqual(1);
  }
  expect(
    evidence.blocking,
    "open popup serious, critical, and color-contrast Axe violations or incomplete results must be resolved"
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

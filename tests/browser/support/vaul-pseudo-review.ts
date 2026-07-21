import { MEELNI_VAUL_RUNTIME_VERSION } from "../../../lib/vaul-runtime";

export const VAUL_REVIEW_NODE_KEYS = [
  "title",
  "description",
  "nav-questions",
  "nav-companies",
  "nav-pricing",
  "nav-blog",
  "auth-signin",
  "activation",
] as const;

export type VaulReviewNodeKey = (typeof VAUL_REVIEW_NODE_KEYS)[number];
export type VaulReviewSurface = "landing" | "pricing";

export const VAUL_DRAWER_PSEUDO_REVIEW = {
  browserName: "chromium",
  expires: "2026-08-15",
  findingCount: 1,
  findingIndex: 0,
  followUp: "SAV-280",
  owner: "SAV-278",
  projectName: "mobile-chromium",
  surfaces: ["landing", "pricing"] as const,
  vaulVersion: MEELNI_VAUL_RUNTIME_VERSION,
} as const;

const EXPECTED_FAILURE_SUMMARY =
  "Fix any of the following:\n  Element's background color could not be determined due to a pseudo element";
const ALPHA_TOLERANCE = 0.001;
const PIXEL_TOLERANCE = 0.5;
const TRANSITION_COLORS =
  "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to";
const DESIGN_RING_OUTLINE_COLOR = "oklab(0.550628 0.0568162 -0.211642 / 0.5)";

const EXPECTED_RENDERED_COVERAGE: Record<
  VaulReviewNodeKey,
  {
    background: readonly [minimum: number, maximum: number];
    foreground: readonly [minimum: number, maximum: number];
  }
> = {
  title: { background: [0.48, 0.62], foreground: [0.1, 0.27] },
  description: { background: [0.7, 0.84], foreground: [0.015, 0.09] },
  "nav-questions": {
    background: [0.9, 0.975],
    foreground: [0.005, 0.025],
  },
  "nav-companies": {
    background: [0.9, 0.975],
    foreground: [0.005, 0.025],
  },
  "nav-pricing": {
    background: [0.92, 0.985],
    foreground: [0.004, 0.02],
  },
  "nav-blog": {
    background: [0.93, 0.99],
    foreground: [0.003, 0.018],
  },
  "auth-signin": {
    background: [0.95, 0.998],
    foreground: [0.001, 0.014],
  },
  activation: { background: [0.88, 0.99], foreground: [0.006, 0.035] },
};

const EXPECTED_LAYER_STACKING: Record<
  VaulReviewNodeKey,
  ReadonlyArray<
    readonly [
      position: string,
      zIndex: string,
      display: string,
      top: string,
      right: string,
      bottom: string,
      left: string,
    ]
  >
> = {
  title: [
    ["static", "auto", "block", "auto", "auto", "auto", "auto"],
    ["relative", "auto", "flex", "0px", "0px", "0px", "0px"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  description: [
    ["static", "auto", "block", "auto", "auto", "auto", "auto"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  "nav-questions": [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  "nav-companies": [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  "nav-pricing": [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  "nav-blog": [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "grid", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  "auth-signin": [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
  activation: [
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["static", "auto", "flex", "auto", "auto", "auto", "auto"],
    ["fixed", "50", "flex", "328px", "0px", "0px", "0px"],
  ],
};

type Rgba = [number, number, number, number];

export type VaulPseudoReviewContext = {
  browserName: string;
  findingCount: number;
  findingIndex: number;
  projectName: string;
  surfaceId: string;
  vaulVersion: string;
};

export type VaulAxeFinding = {
  id: string;
  impact?: string | null;
  nodes: Array<{
    all: unknown[];
    any: Array<{
      data: unknown;
      id: string;
      relatedNodes?: Array<{ target: unknown }>;
    }>;
    failureSummary?: string;
    none: unknown[];
    target: unknown;
  }>;
};

export type PaintStyleEvidence = {
  activeAnimationCount: number;
  animationComposition: string;
  animationDelay: string;
  animationDirection: string;
  animationDuration: string;
  animationFillMode: string;
  animationIterationCount: string;
  animationName: string;
  animationPlayState: string;
  animationTimingFunction: string;
  backfaceVisibility: string;
  backdropFilter: string;
  backgroundBlendMode: string;
  backgroundColor: string;
  backgroundImage: string;
  borderBottomColor: string;
  borderBottomStyle: string;
  borderBottomWidth: string;
  borderLeftColor: string;
  borderLeftStyle: string;
  borderLeftWidth: string;
  borderRightColor: string;
  borderRightStyle: string;
  borderRightWidth: string;
  borderTopColor: string;
  borderTopStyle: string;
  borderTopWidth: string;
  bottom: string;
  boxSizing: string;
  boxShadow: string;
  clipPath: string;
  contain: string;
  containerType: string;
  contentVisibility: string;
  display: string;
  filter: string;
  float: string;
  isolation: string;
  left: string;
  maskClip: string;
  maskComposite: string;
  maskImage: string;
  maskMode: string;
  maskOrigin: string;
  maskPosition: string;
  maskRepeat: string;
  maskSize: string;
  mixBlendMode: string;
  opacity: string;
  order: string;
  outlineColor: string;
  outlineOffset: string;
  outlineStyle: string;
  outlineWidth: string;
  overflow: string;
  perspective: string;
  pointerEvents: string;
  position: string;
  right: string;
  rotate: string;
  scale: string;
  textColor: string;
  textFillColor: string;
  textShadow: string;
  textStrokeColor: string;
  textStrokeWidth: string;
  top: string;
  transform: string;
  transformStyle: string;
  transitionDelay: string;
  transitionDuration: string;
  transitionProperty: string;
  transitionTimingFunction: string;
  translate: string;
  visibility: string;
  webkitBackdropFilter: string;
  webkitMaskClip: string;
  webkitMaskComposite: string;
  webkitMaskImage: string;
  webkitMaskOrigin: string;
  webkitMaskPosition: string;
  webkitMaskRepeat: string;
  webkitMaskSize: string;
  willChange: string;
  zIndex: string;
  zoom: string;
};

export type VaulPseudoSnapshot = {
  drawer: {
    background: string;
    clientHeight: number;
    clientWidth: number;
    color: string;
    customContainer: string | null;
    direction: string | null;
    hasDrawerAttribute: boolean;
    role: string | null;
    runtimeVersion: string | null;
  };
  nodes: Array<{
    approvedMatchCount: number;
    approvedMatchesTarget: boolean;
    approvedSelector: string;
    background: string | null;
    fontSize: number;
    fontWeight: number;
    foreground: string;
    insideDrawer: boolean;
    layers: Array<
      PaintStyleEvidence & {
        clientHeight: number;
        clientWidth: number;
        isDrawer: boolean;
        offsetHeight: number;
        offsetWidth: number;
        rect: {
          bottom: number;
          height: number;
          left: number;
          right: number;
          top: number;
          width: number;
        };
      }
    >;
    matchCount: number;
    reviewKey: string | null;
    renderedPixels: {
      backgroundPixelCount: number;
      foregroundPixelCount: number;
      height: number;
      maxPaletteDistance: number;
      totalPixelCount: number;
      unexpectedPixelCount: number;
      width: number;
    };
    selector: string;
    targetHitOwnedCount: number;
    targetHitSampleCount: number;
  }>;
  pseudo: PaintStyleEvidence & {
    content: string;
    height: string;
    marginBottom: string;
    marginLeft: string;
    marginRight: string;
    marginTop: string;
    paddingBottom: string;
    paddingLeft: string;
    paddingRight: string;
    paddingTop: string;
    width: string;
  };
};

export type VaulPseudoContrastEvidence = {
  background: string;
  context: VaulPseudoReviewContext;
  expires: string;
  followUp: string;
  geometry: {
    bottom: number;
    drawerHeight: number;
    drawerWidth: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
  };
  nodes: Array<{
    approvedSelector: string;
    background: string;
    contrastRatio: number;
    foreground: string;
    hitTopology: {
      ownedSamples: number;
      totalSamples: number;
    };
    layers: Array<{
      borderColors: [string, string, string, string];
      borderStyles: [string, string, string, string];
      borderWidths: [string, string, string, string];
      boxSizing: string;
      clientHeight: number;
      clientWidth: number;
      display: string;
      insets: [string, string, string, string];
      isDrawer: boolean;
      offsetHeight: number;
      offsetWidth: number;
      position: string;
      rect: VaulPseudoSnapshot["nodes"][number]["layers"][number]["rect"];
      zIndex: string;
    }>;
    renderedPixels: VaulPseudoSnapshot["nodes"][number]["renderedPixels"];
    requiredRatio: number;
    reviewKey: VaulReviewNodeKey;
    selector: string;
  }>;
  owner: string;
  pseudoBackground: string;
  targetId: string;
  vaulVersion: string;
};

function parseColor(value: string): Rgba | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/u
  );
  if (!match) return null;

  const color: Rgba = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] === undefined ? 1 : Number(match[4]),
  ];
  if (
    !color.every(Number.isFinite) ||
    color.some((channel, index) =>
      index === 3 ? channel < 0 || channel > 1 : channel < 0 || channel > 255
    )
  ) {
    return null;
  }
  return color;
}

function parsePixels(value: string): number | null {
  const match = value.match(/^(-?[\d.]+)px$/u);
  if (!match) return null;
  const pixels = Number(match[1]);
  return Number.isFinite(pixels) ? pixels : null;
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) <= PIXEL_TOLERANCE;
}

function colorsEqual(first: Rgba, second: Rgba) {
  return first.every((channel, index) =>
    index === 3
      ? Math.abs(channel - second[index]) <= ALPHA_TOLERANCE
      : nearlyEqual(channel, second[index])
  );
}

function compositeColors(front: Rgba, back: Rgba): Rgba {
  const alpha = front[3] + back[3] * (1 - front[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
    (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
    (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
    alpha,
  ];
}

function channelLuminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgba) {
  return (
    0.2126 * channelLuminance(color[0]) +
    0.7152 * channelLuminance(color[1]) +
    0.0722 * channelLuminance(color[2])
  );
}

function contrastRatio(first: Rgba, second: Rgba) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function serializeColor(color: Rgba) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
}

function contextIsExact(context: VaulPseudoReviewContext) {
  return (
    context.browserName === VAUL_DRAWER_PSEUDO_REVIEW.browserName &&
    context.projectName === VAUL_DRAWER_PSEUDO_REVIEW.projectName &&
    VAUL_DRAWER_PSEUDO_REVIEW.surfaces.includes(
      context.surfaceId as VaulReviewSurface
    ) &&
    context.findingIndex === VAUL_DRAWER_PSEUDO_REVIEW.findingIndex &&
    context.findingCount === VAUL_DRAWER_PSEUDO_REVIEW.findingCount &&
    context.vaulVersion === VAUL_DRAWER_PSEUDO_REVIEW.vaulVersion
  );
}

function timingIsExact(style: PaintStyleEvidence) {
  const animationBase =
    style.animationComposition === "replace" &&
    style.animationDelay === "0s" &&
    style.animationDirection === "normal" &&
    style.animationFillMode === "none" &&
    style.animationIterationCount === "1" &&
    style.animationPlayState === "running" &&
    style.activeAnimationCount === 0;
  const animationIdentity =
    (style.animationName === "none" &&
      style.animationDuration === "0s" &&
      style.animationTimingFunction === "ease") ||
    (style.animationName === "slideFromBottom" &&
      style.animationDuration === "0.5s" &&
      style.animationTimingFunction === "cubic-bezier(0.32, 0.72, 0, 1)");
  const transitionIdentity =
    (style.transitionDelay === "0s" &&
      style.transitionDuration === "0s" &&
      style.transitionProperty === "all" &&
      style.transitionTimingFunction === "ease") ||
    (style.transitionDelay === "0s" &&
      style.transitionDuration === "0.15s" &&
      style.transitionProperty === TRANSITION_COLORS &&
      style.transitionTimingFunction === "cubic-bezier(0.4, 0, 0.2, 1)") ||
    (style.transitionDelay === "0s" &&
      style.transitionDuration === "0.5s" &&
      style.transitionProperty === "transform" &&
      style.transitionTimingFunction === "cubic-bezier(0.32, 0.72, 0, 1)");

  return animationBase && animationIdentity && transitionIdentity;
}

function paintIsInert(style: PaintStyleEvidence) {
  const textColor = parseColor(style.textColor);
  const textFillColor = parseColor(style.textFillColor);
  const textStrokeColor = parseColor(style.textStrokeColor);
  const outlineColor = parseColor(style.outlineColor);
  const outlineColorIsExact =
    style.outlineColor === DESIGN_RING_OUTLINE_COLOR ||
    (outlineColor !== null &&
      textColor !== null &&
      colorsEqual(outlineColor, textColor));
  return (
    timingIsExact(style) &&
    style.backfaceVisibility === "visible" &&
    style.backdropFilter === "none" &&
    style.webkitBackdropFilter === "" &&
    style.backgroundBlendMode === "normal" &&
    style.backgroundImage === "none" &&
    style.boxShadow === "none" &&
    style.clipPath === "none" &&
    style.contain === "none" &&
    style.containerType === "normal" &&
    style.contentVisibility === "visible" &&
    style.filter === "none" &&
    style.float === "none" &&
    style.isolation === "auto" &&
    style.maskClip === "border-box" &&
    style.maskComposite === "add" &&
    style.maskImage === "none" &&
    style.maskMode === "match-source" &&
    style.maskOrigin === "border-box" &&
    style.maskPosition === "0% 0%" &&
    style.maskRepeat === "repeat" &&
    style.maskSize === "auto" &&
    style.webkitMaskClip === "border-box" &&
    style.webkitMaskComposite === "add" &&
    style.webkitMaskImage === "none" &&
    style.webkitMaskOrigin === "border-box" &&
    style.webkitMaskPosition === "0% 0%" &&
    style.webkitMaskRepeat === "repeat" &&
    style.webkitMaskSize === "auto" &&
    style.mixBlendMode === "normal" &&
    style.opacity === "1" &&
    style.order === "0" &&
    textColor !== null &&
    outlineColorIsExact &&
    style.outlineStyle === "none" &&
    style.outlineOffset === "0px" &&
    style.outlineWidth === "3px" &&
    style.overflow === "visible" &&
    style.perspective === "none" &&
    style.pointerEvents === "auto" &&
    style.rotate === "none" &&
    style.scale === "none" &&
    style.textShadow === "none" &&
    style.textStrokeWidth === "0px" &&
    textFillColor !== null &&
    textStrokeColor !== null &&
    colorsEqual(textColor, textFillColor) &&
    colorsEqual(textColor, textStrokeColor) &&
    style.transform === "none" &&
    style.transformStyle === "flat" &&
    style.translate === "none" &&
    style.visibility === "visible" &&
    (style.willChange === "auto" || style.willChange === "transform") &&
    style.zoom === "1"
  );
}

function pseudoPaintIsExact(style: PaintStyleEvidence) {
  return (
    paintIsInert(style) &&
    style.animationName === "none" &&
    style.animationDuration === "0s" &&
    style.animationTimingFunction === "ease" &&
    style.transitionDelay === "0s" &&
    style.transitionDuration === "0s" &&
    style.transitionProperty === "all" &&
    style.transitionTimingFunction === "ease" &&
    style.willChange === "auto"
  );
}

function pseudoBoxIsExact(style: PaintStyleEvidence, drawerColor: Rgba) {
  const borderColors = [
    style.borderTopColor,
    style.borderRightColor,
    style.borderBottomColor,
    style.borderLeftColor,
  ].map(parseColor);
  return (
    style.boxSizing === "border-box" &&
    style.display === "block" &&
    style.borderTopWidth === "0px" &&
    style.borderRightWidth === "0px" &&
    style.borderBottomWidth === "0px" &&
    style.borderLeftWidth === "0px" &&
    style.borderTopStyle === "solid" &&
    style.borderRightStyle === "solid" &&
    style.borderBottomStyle === "solid" &&
    style.borderLeftStyle === "solid" &&
    borderColors.every(
      (color) => color !== null && colorsEqual(color, drawerColor)
    )
  );
}

function layerPaintIsExact(style: PaintStyleEvidence & { isDrawer: boolean }) {
  if (!paintIsInert(style)) return false;
  if (style.isDrawer) {
    return (
      style.animationName === "slideFromBottom" &&
      style.animationDuration === "0.5s" &&
      style.animationTimingFunction === "cubic-bezier(0.32, 0.72, 0, 1)" &&
      style.transitionDelay === "0s" &&
      style.transitionDuration === "0.5s" &&
      style.transitionProperty === "transform" &&
      style.transitionTimingFunction === "cubic-bezier(0.32, 0.72, 0, 1)" &&
      style.willChange === "transform"
    );
  }

  const hasNoTransition =
    style.transitionDelay === "0s" &&
    style.transitionDuration === "0s" &&
    style.transitionProperty === "all" &&
    style.transitionTimingFunction === "ease";
  const hasColorTransition =
    style.transitionDelay === "0s" &&
    style.transitionDuration === "0.15s" &&
    style.transitionProperty === TRANSITION_COLORS &&
    style.transitionTimingFunction === "cubic-bezier(0.4, 0, 0.2, 1)";
  return (
    style.animationName === "none" &&
    style.animationDuration === "0s" &&
    style.animationTimingFunction === "ease" &&
    (hasNoTransition || hasColorTransition) &&
    style.willChange === "auto"
  );
}

function rectIsFinite(rect: {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}) {
  return (
    Object.values(rect).every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0 &&
    nearlyEqual(rect.right - rect.left, rect.width) &&
    nearlyEqual(rect.bottom - rect.top, rect.height)
  );
}

function rectContains(
  outer: VaulPseudoSnapshot["nodes"][number]["layers"][number]["rect"],
  inner: VaulPseudoSnapshot["nodes"][number]["layers"][number]["rect"]
) {
  return (
    inner.left + PIXEL_TOLERANCE >= outer.left &&
    inner.top + PIXEL_TOLERANCE >= outer.top &&
    inner.right - PIXEL_TOLERANCE <= outer.right &&
    inner.bottom - PIXEL_TOLERANCE <= outer.bottom
  );
}

function renderedPixelsAreExact(
  node: VaulPseudoSnapshot["nodes"][number],
  expectedKey: VaulReviewNodeKey
) {
  const rendered = node.renderedPixels;
  const rect = node.layers[0]?.rect;
  const expected = EXPECTED_RENDERED_COVERAGE[expectedKey];
  const foregroundCoverage =
    rendered.foregroundPixelCount / rendered.totalPixelCount;
  const backgroundCoverage =
    rendered.backgroundPixelCount / rendered.totalPixelCount;
  return (
    rect !== undefined &&
    Number.isInteger(rendered.width) &&
    Number.isInteger(rendered.height) &&
    rendered.width > 0 &&
    rendered.height > 0 &&
    nearlyEqual(rendered.width, rect.width) &&
    nearlyEqual(rendered.height, rect.height) &&
    rendered.totalPixelCount === rendered.width * rendered.height &&
    Number.isInteger(rendered.foregroundPixelCount) &&
    Number.isInteger(rendered.backgroundPixelCount) &&
    Number.isInteger(rendered.unexpectedPixelCount) &&
    foregroundCoverage >= expected.foreground[0] &&
    foregroundCoverage <= expected.foreground[1] &&
    backgroundCoverage >= expected.background[0] &&
    backgroundCoverage <= expected.background[1] &&
    rendered.unexpectedPixelCount === 0 &&
    Number.isFinite(rendered.maxPaletteDistance) &&
    rendered.maxPaletteDistance <= 6
  );
}

function layerBoxIsExact(
  layer: VaulPseudoSnapshot["nodes"][number]["layers"][number],
  expected: (typeof EXPECTED_LAYER_STACKING)[VaulReviewNodeKey][number]
) {
  const expectedBorderWidth = layer.isDrawer ? "1px" : "0px";
  const borderWidths = [
    layer.borderTopWidth,
    layer.borderRightWidth,
    layer.borderBottomWidth,
    layer.borderLeftWidth,
  ];
  const borderStyles = [
    layer.borderTopStyle,
    layer.borderRightStyle,
    layer.borderBottomStyle,
    layer.borderLeftStyle,
  ];
  const borderColors = [
    layer.borderTopColor,
    layer.borderRightColor,
    layer.borderBottomColor,
    layer.borderLeftColor,
  ];
  const horizontalBorder = layer.isDrawer ? 2 : 0;
  const verticalBorder = layer.isDrawer ? 2 : 0;
  return (
    layer.position === expected[0] &&
    layer.zIndex === expected[1] &&
    layer.display === expected[2] &&
    layer.top === expected[3] &&
    layer.right === expected[4] &&
    layer.bottom === expected[5] &&
    layer.left === expected[6] &&
    layer.boxSizing === "border-box" &&
    borderWidths.every((width) => width === expectedBorderWidth) &&
    borderStyles.every((style) => style === "solid") &&
    borderColors.every((color) => color === "rgb(229, 231, 235)") &&
    Number.isFinite(layer.clientWidth) &&
    Number.isFinite(layer.clientHeight) &&
    Number.isFinite(layer.offsetWidth) &&
    Number.isFinite(layer.offsetHeight) &&
    layer.clientWidth > 0 &&
    layer.clientHeight > 0 &&
    nearlyEqual(layer.offsetWidth, layer.clientWidth + horizontalBorder) &&
    nearlyEqual(layer.offsetHeight, layer.clientHeight + verticalBorder) &&
    rectIsFinite(layer.rect) &&
    nearlyEqual(layer.rect.width, layer.offsetWidth) &&
    nearlyEqual(layer.rect.height, layer.offsetHeight)
  );
}

export function extractVaulPseudoReviewSelectors(
  finding: VaulAxeFinding,
  _targetId: string,
  context: VaulPseudoReviewContext
): string[] | null {
  if (
    !contextIsExact(context) ||
    finding.id !== "color-contrast" ||
    finding.impact !== "serious" ||
    finding.nodes.length !== VAUL_REVIEW_NODE_KEYS.length
  ) {
    return null;
  }

  const selectors: string[] = [];
  for (const node of finding.nodes) {
    // Axe's internal check/related-node shape is not stable across Linux and
    // local Chromium for this pseudo-element incomplete. Keep extraction bound
    // to the exact stable finding shape, then let the classifier prove the
    // drawer identity, pseudo-element geometry, approved node mapping, rendered
    // pixels, and contrast.
    if (
      node.failureSummary !== EXPECTED_FAILURE_SUMMARY ||
      !Array.isArray(node.target) ||
      node.target.length !== 1 ||
      typeof node.target[0] !== "string"
    ) {
      return null;
    }
    selectors.push(node.target[0]);
  }

  return selectors;
}

export function classifyVaulPseudoContrastReview({
  context,
  finding,
  now,
  snapshot,
  targetId,
}: {
  context: VaulPseudoReviewContext;
  finding: VaulAxeFinding;
  now: number;
  snapshot: VaulPseudoSnapshot;
  targetId: string;
}): VaulPseudoContrastEvidence | null {
  if (
    !Number.isFinite(now) ||
    now > Date.parse(`${VAUL_DRAWER_PSEUDO_REVIEW.expires}T23:59:59.999Z`)
  ) {
    return null;
  }

  const selectors = extractVaulPseudoReviewSelectors(
    finding,
    targetId,
    context
  );
  if (!selectors || snapshot.nodes.length !== VAUL_REVIEW_NODE_KEYS.length) {
    return null;
  }

  const { drawer, pseudo } = snapshot;
  const drawerBackground = parseColor(drawer.background);
  const drawerColor = parseColor(drawer.color);
  const pseudoBackground = parseColor(pseudo.backgroundColor);
  const outlineColor = parseColor(pseudo.outlineColor);
  const top = parsePixels(pseudo.top);
  const bottom = parsePixels(pseudo.bottom);
  const left = parsePixels(pseudo.left);
  const right = parsePixels(pseudo.right);
  const width = parsePixels(pseudo.width);
  const height = parsePixels(pseudo.height);
  if (
    !contextIsExact(context) ||
    drawer.runtimeVersion !== VAUL_DRAWER_PSEUDO_REVIEW.vaulVersion ||
    drawer.role !== "dialog" ||
    !drawer.hasDrawerAttribute ||
    drawer.direction !== "bottom" ||
    drawer.customContainer !== "false" ||
    drawer.clientHeight <= 0 ||
    drawer.clientWidth <= 0 ||
    !drawerBackground ||
    !drawerColor ||
    !pseudoBackground ||
    !outlineColor ||
    !pseudoPaintIsExact(pseudo) ||
    !pseudoBoxIsExact(pseudo, drawerColor) ||
    !colorsEqual(outlineColor, drawerColor) ||
    pseudo.content !== '\"\"' ||
    pseudo.position !== "absolute" ||
    pseudo.zIndex !== "auto" ||
    pseudo.transform !== "none" ||
    pseudo.translate !== "none" ||
    pseudo.rotate !== "none" ||
    pseudo.scale !== "none" ||
    pseudo.marginTop !== "0px" ||
    pseudo.marginRight !== "0px" ||
    pseudo.marginBottom !== "0px" ||
    pseudo.marginLeft !== "0px" ||
    pseudo.paddingTop !== "0px" ||
    pseudo.paddingRight !== "0px" ||
    pseudo.paddingBottom !== "0px" ||
    pseudo.paddingLeft !== "0px" ||
    pseudo.borderTopWidth !== "0px" ||
    pseudo.borderRightWidth !== "0px" ||
    pseudo.borderBottomWidth !== "0px" ||
    pseudo.borderLeftWidth !== "0px" ||
    top === null ||
    bottom === null ||
    left === null ||
    right === null ||
    width === null ||
    height === null ||
    !nearlyEqual(top, drawer.clientHeight) ||
    !nearlyEqual(bottom, -2 * drawer.clientHeight) ||
    !nearlyEqual(left, 0) ||
    !nearlyEqual(right, 0) ||
    !nearlyEqual(width, drawer.clientWidth) ||
    !nearlyEqual(height, 2 * drawer.clientHeight) ||
    !colorsEqual(pseudoBackground, drawerBackground)
  ) {
    return null;
  }

  const reviewedNodes: VaulPseudoContrastEvidence["nodes"] = [];
  for (const [index, node] of snapshot.nodes.entries()) {
    const expectedKey = VAUL_REVIEW_NODE_KEYS[index];
    const expectedSelector = `[data-vaul-review-node="${expectedKey}"]`;
    const expectedLayerStacking = EXPECTED_LAYER_STACKING[expectedKey];
    if (
      node.selector !== selectors[index] ||
      node.reviewKey !== expectedKey ||
      node.approvedSelector !== expectedSelector ||
      node.approvedMatchCount !== 1 ||
      !node.approvedMatchesTarget ||
      node.matchCount !== 1 ||
      !node.insideDrawer ||
      node.layers.length !== expectedLayerStacking.length ||
      node.layers.some(
        (layer, layerIndex) =>
          !layerPaintIsExact(layer) ||
          !layerBoxIsExact(layer, expectedLayerStacking[layerIndex]) ||
          layer.isDrawer !== (layerIndex === expectedLayerStacking.length - 1)
      ) ||
      node.layers.at(-1)?.isDrawer !== true ||
      node.targetHitSampleCount !== 9 ||
      node.targetHitOwnedCount !== node.targetHitSampleCount ||
      !renderedPixelsAreExact(node, expectedKey) ||
      !node.background ||
      !Number.isFinite(node.fontSize) ||
      !Number.isFinite(node.fontWeight)
    ) {
      return null;
    }

    for (
      let layerIndex = 0;
      layerIndex < node.layers.length - 1;
      layerIndex++
    ) {
      if (
        !rectContains(
          node.layers[layerIndex + 1].rect,
          node.layers[layerIndex].rect
        )
      ) {
        return null;
      }
    }

    const foreground = parseColor(node.foreground);
    const background = parseColor(node.background);
    let effectiveLayerBackground: Rgba = [0, 0, 0, 0];
    for (const layer of node.layers) {
      const layerColor = parseColor(layer.backgroundColor);
      if (!layerColor) return null;
      effectiveLayerBackground = compositeColors(
        effectiveLayerBackground,
        layerColor
      );
      if (effectiveLayerBackground[3] >= 0.999) break;
    }
    if (
      !foreground ||
      foreground[3] !== 1 ||
      !background ||
      background[3] < 0.999 ||
      !colorsEqual(background, effectiveLayerBackground)
    ) {
      return null;
    }

    const requiredRatio =
      node.fontSize >= 24 || (node.fontSize >= 18.66 && node.fontWeight >= 700)
        ? 3
        : 4.5;
    const ratio = contrastRatio(foreground, background);
    if (ratio + 0.001 < requiredRatio) return null;

    reviewedNodes.push({
      approvedSelector: node.approvedSelector,
      background: serializeColor(background),
      contrastRatio: ratio,
      foreground: node.foreground,
      hitTopology: {
        ownedSamples: node.targetHitOwnedCount,
        totalSamples: node.targetHitSampleCount,
      },
      layers: node.layers.map((layer) => ({
        borderColors: [
          layer.borderTopColor,
          layer.borderRightColor,
          layer.borderBottomColor,
          layer.borderLeftColor,
        ],
        borderStyles: [
          layer.borderTopStyle,
          layer.borderRightStyle,
          layer.borderBottomStyle,
          layer.borderLeftStyle,
        ],
        borderWidths: [
          layer.borderTopWidth,
          layer.borderRightWidth,
          layer.borderBottomWidth,
          layer.borderLeftWidth,
        ],
        boxSizing: layer.boxSizing,
        clientHeight: layer.clientHeight,
        clientWidth: layer.clientWidth,
        display: layer.display,
        insets: [layer.top, layer.right, layer.bottom, layer.left],
        isDrawer: layer.isDrawer,
        offsetHeight: layer.offsetHeight,
        offsetWidth: layer.offsetWidth,
        position: layer.position,
        rect: layer.rect,
        zIndex: layer.zIndex,
      })),
      renderedPixels: node.renderedPixels,
      requiredRatio,
      reviewKey: expectedKey,
      selector: node.selector,
    });
  }

  for (let firstIndex = 0; firstIndex < snapshot.nodes.length; firstIndex++) {
    const first = snapshot.nodes[firstIndex].layers[0].rect;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < snapshot.nodes.length;
      secondIndex++
    ) {
      const second = snapshot.nodes[secondIndex].layers[0].rect;
      const overlapWidth = Math.max(
        0,
        Math.min(first.right, second.right) - Math.max(first.left, second.left)
      );
      const overlapHeight = Math.max(
        0,
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
      );
      if (overlapWidth > PIXEL_TOLERANCE && overlapHeight > PIXEL_TOLERANCE) {
        return null;
      }
    }
  }

  return {
    ...VAUL_DRAWER_PSEUDO_REVIEW,
    background: drawer.background,
    context,
    geometry: {
      bottom,
      drawerHeight: drawer.clientHeight,
      drawerWidth: drawer.clientWidth,
      height,
      left,
      right,
      top,
      width,
    },
    nodes: reviewedNodes,
    pseudoBackground: pseudo.backgroundColor,
    targetId,
  };
}

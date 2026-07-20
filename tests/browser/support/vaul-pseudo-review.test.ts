import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MEELNI_VAUL_RUNTIME_VERSION } from "../../../lib/vaul-runtime";
import {
  classifyVaulPseudoContrastReview,
  VAUL_DRAWER_PSEUDO_REVIEW,
  VAUL_REVIEW_NODE_KEYS,
  type PaintStyleEvidence,
  type VaulAxeFinding,
  type VaulPseudoReviewContext,
  type VaulPseudoSnapshot,
  type VaulReviewNodeKey,
} from "./vaul-pseudo-review";

const TARGET_ID = "mobile-navigation-test";
const BEFORE_EXPIRATION = Date.parse("2026-08-15T12:00:00.000Z");
const FAILURE_SUMMARY =
  "Fix any of the following:\n  Element's background color could not be determined due to a pseudo element";
const VALID_RENDERED_PIXEL_COUNTS: Record<
  VaulReviewNodeKey,
  { background: number; foreground: number }
> = {
  title: { background: 1_100, foreground: 270 },
  description: { background: 1_560, foreground: 40 },
  "nav-questions": { background: 1_896, foreground: 16 },
  "nav-companies": { background: 1_884, foreground: 17 },
  "nav-pricing": { background: 1_928, foreground: 14 },
  "nav-blog": { background: 1_944, foreground: 10 },
  "auth-signin": { background: 1_972, foreground: 4 },
  activation: { background: 1_890, foreground: 21 },
};
const VALID_LAYER_STACKING: Record<
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

function validContext(
  overrides: Partial<VaulPseudoReviewContext> = {}
): VaulPseudoReviewContext {
  return {
    browserName: "chromium",
    findingCount: 1,
    findingIndex: 0,
    projectName: "mobile-chromium",
    surfaceId: "landing",
    vaulVersion: "1.1.2",
    ...overrides,
  };
}

function validFinding(): VaulAxeFinding {
  return {
    id: "color-contrast",
    impact: "serious",
    nodes: VAUL_REVIEW_NODE_KEYS.map((key) => ({
      all: [],
      any: [
        {
          data: { messageKey: "pseudoContent" },
          id: "color-contrast",
          relatedNodes: [{ target: [`#${TARGET_ID}`] }],
        },
      ],
      failureSummary: FAILURE_SUMMARY,
      none: [],
      target: [`#axe-${key}`],
    })),
  };
}

function validPaint(
  overrides: Partial<PaintStyleEvidence> = {}
): PaintStyleEvidence {
  return {
    activeAnimationCount: 0,
    animationComposition: "replace",
    animationDelay: "0s",
    animationDirection: "normal",
    animationDuration: "0s",
    animationFillMode: "none",
    animationIterationCount: "1",
    animationName: "none",
    animationPlayState: "running",
    animationTimingFunction: "ease",
    backfaceVisibility: "visible",
    backdropFilter: "none",
    backgroundBlendMode: "normal",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    borderBottomColor: "rgb(229, 231, 235)",
    borderBottomStyle: "solid",
    borderBottomWidth: "0px",
    borderLeftColor: "rgb(229, 231, 235)",
    borderLeftStyle: "solid",
    borderLeftWidth: "0px",
    borderRightColor: "rgb(229, 231, 235)",
    borderRightStyle: "solid",
    borderRightWidth: "0px",
    borderTopColor: "rgb(229, 231, 235)",
    borderTopStyle: "solid",
    borderTopWidth: "0px",
    bottom: "auto",
    boxSizing: "border-box",
    boxShadow: "none",
    clipPath: "none",
    contain: "none",
    containerType: "normal",
    contentVisibility: "visible",
    display: "block",
    filter: "none",
    float: "none",
    isolation: "auto",
    left: "auto",
    maskClip: "border-box",
    maskComposite: "add",
    maskImage: "none",
    maskMode: "match-source",
    maskOrigin: "border-box",
    maskPosition: "0% 0%",
    maskRepeat: "repeat",
    maskSize: "auto",
    mixBlendMode: "normal",
    opacity: "1",
    order: "0",
    outlineColor: "rgb(17, 24, 39)",
    outlineOffset: "0px",
    outlineStyle: "none",
    outlineWidth: "3px",
    overflow: "visible",
    perspective: "none",
    pointerEvents: "auto",
    position: "static",
    right: "auto",
    rotate: "none",
    scale: "none",
    textColor: "rgb(17, 24, 39)",
    textFillColor: "rgb(17, 24, 39)",
    textShadow: "none",
    textStrokeColor: "rgb(17, 24, 39)",
    textStrokeWidth: "0px",
    top: "auto",
    transform: "none",
    transformStyle: "flat",
    transitionDelay: "0s",
    transitionDuration: "0s",
    transitionProperty: "all",
    transitionTimingFunction: "ease",
    translate: "none",
    visibility: "visible",
    webkitBackdropFilter: "",
    webkitMaskClip: "border-box",
    webkitMaskComposite: "add",
    webkitMaskImage: "none",
    webkitMaskOrigin: "border-box",
    webkitMaskPosition: "0% 0%",
    webkitMaskRepeat: "repeat",
    webkitMaskSize: "auto",
    willChange: "auto",
    zIndex: "auto",
    zoom: "1",
    ...overrides,
  };
}

function validSnapshot(): VaulPseudoSnapshot {
  const drawerPaint = validPaint({
    animationDuration: "0.5s",
    animationName: "slideFromBottom",
    animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderRightWidth: "1px",
    borderTopWidth: "1px",
    bottom: "0px",
    display: "flex",
    left: "0px",
    position: "fixed",
    right: "0px",
    top: "328px",
    transitionDuration: "0.5s",
    transitionProperty: "transform",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
    willChange: "transform",
    zIndex: "50",
  });
  return {
    drawer: {
      background: "rgba(255, 255, 255, 1)",
      clientHeight: 300,
      clientWidth: 390,
      color: "rgb(17, 24, 39)",
      customContainer: "false",
      direction: "bottom",
      hasDrawerAttribute: true,
      role: "dialog",
      runtimeVersion: "1.1.2",
    },
    nodes: VAUL_REVIEW_NODE_KEYS.map((key, nodeIndex) => {
      const expectedStacking = VALID_LAYER_STACKING[key];
      const renderedPixelCounts = VALID_RENDERED_PIXEL_COUNTS[key];
      return {
        approvedMatchCount: 1,
        approvedMatchesTarget: true,
        approvedSelector: `[data-vaul-review-node="${key}"]`,
        background: "rgba(255, 255, 255, 1)",
        fontSize: 16,
        fontWeight: 400,
        foreground: "rgb(17, 24, 39)",
        insideDrawer: true,
        layers: expectedStacking.map(
          ([position, zIndex, display, top, right, bottom, left], index) => {
            const isDrawer = index === expectedStacking.length - 1;
            const width = isDrawer ? 392 : 100 + index * 10;
            const height = isDrawer ? 302 : 20 + index * 10;
            const rectLeft = isDrawer ? 0 : 20 - index * 5;
            const rectTop = isDrawer ? 0 : 10 + nodeIndex * 30 - index * 5;
            return {
              ...(isDrawer
                ? drawerPaint
                : validPaint({
                    bottom,
                    display,
                    left,
                    position,
                    right,
                    top,
                    zIndex,
                  })),
              clientHeight: isDrawer ? 300 : height,
              clientWidth: isDrawer ? 390 : width,
              isDrawer,
              offsetHeight: height,
              offsetWidth: width,
              rect: {
                bottom: rectTop + height,
                height,
                left: rectLeft,
                right: rectLeft + width,
                top: rectTop,
                width,
              },
            };
          }
        ),
        matchCount: 1,
        renderedPixels: {
          backgroundPixelCount: renderedPixelCounts.background,
          foregroundPixelCount: renderedPixelCounts.foreground,
          height: 20,
          maxPaletteDistance: 0,
          totalPixelCount: 2_000,
          unexpectedPixelCount: 0,
          width: 100,
        },
        reviewKey: key,
        selector: `#axe-${key}`,
        targetHitOwnedCount: 9,
        targetHitSampleCount: 9,
      };
    }),
    pseudo: {
      ...validPaint({
        backgroundColor: "rgb(255, 255, 255)",
        borderBottomColor: "rgb(17, 24, 39)",
        borderLeftColor: "rgb(17, 24, 39)",
        borderRightColor: "rgb(17, 24, 39)",
        borderTopColor: "rgb(17, 24, 39)",
      }),
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
      borderRightWidth: "0px",
      borderTopWidth: "0px",
      bottom: "-600px",
      content: '\"\"',
      height: "600px",
      left: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      marginRight: "0px",
      marginTop: "0px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      position: "absolute",
      right: "0px",
      rotate: "none",
      scale: "none",
      top: "300px",
      translate: "none",
      width: "390px",
      zIndex: "auto",
    },
  };
}

function review({
  context = validContext(),
  finding = validFinding(),
  now = BEFORE_EXPIRATION,
  snapshot = validSnapshot(),
}: {
  context?: VaulPseudoReviewContext;
  finding?: VaulAxeFinding;
  now?: number;
  snapshot?: VaulPseudoSnapshot;
} = {}) {
  return classifyVaulPseudoContrastReview({
    context,
    finding,
    now,
    snapshot,
    targetId: TARGET_ID,
  });
}

test("pins the installed and runtime Vaul identity to 1.1.2", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.equal(packageJson.dependencies.vaul, "1.1.2");
  assert.equal(packageLock.packages[""].dependencies.vaul, "1.1.2");
  assert.equal(packageLock.packages["node_modules/vaul"].version, "1.1.2");
  assert.equal(MEELNI_VAUL_RUNTIME_VERSION, "1.1.2");
  assert.equal(VAUL_DRAWER_PSEUDO_REVIEW.vaulVersion, "1.1.2");
});

test("accepts only the exact approved bottom-drawer evidence", () => {
  const evidence = review();
  assert.ok(evidence);
  assert.equal(evidence.nodes.length, VAUL_REVIEW_NODE_KEYS.length);
  assert.deepEqual(
    evidence.nodes.map((node) => node.reviewKey),
    VAUL_REVIEW_NODE_KEYS
  );
  assert.deepEqual(evidence.nodes[0].hitTopology, {
    ownedSamples: 9,
    totalSamples: 9,
  });
  assert.deepEqual(evidence.nodes[0].renderedPixels, {
    backgroundPixelCount: 1_100,
    foregroundPixelCount: 270,
    height: 20,
    maxPaletteDistance: 0,
    totalPixelCount: 2_000,
    unexpectedPixelCount: 0,
    width: 100,
  });
  assert.deepEqual(evidence.nodes[0].layers[1].insets, [
    "0px",
    "0px",
    "0px",
    "0px",
  ]);
  assert.equal(evidence.nodes[0].layers[1].display, "flex");
  assert.deepEqual(evidence.nodes[1].layers[0].borderWidths, [
    "0px",
    "0px",
    "0px",
    "0px",
  ]);
  assert.deepEqual(evidence.nodes[1].layers[0].rect, {
    bottom: 60,
    height: 20,
    left: 20,
    right: 120,
    top: 40,
    width: 100,
  });
  assert.deepEqual(evidence.geometry, {
    bottom: -600,
    drawerHeight: 300,
    drawerWidth: 390,
    height: 600,
    left: 0,
    right: 0,
    top: 300,
    width: 390,
  });
  assert.equal(evidence.owner, "SAV-278");
  assert.equal(evidence.followUp, "SAV-280");
});

const contextMutations: Array<{
  label: string;
  value: Partial<VaulPseudoReviewContext>;
}> = [
  { label: "browser", value: { browserName: "firefox" } },
  { label: "project", value: { projectName: "desktop-chromium" } },
  { label: "surface", value: { surfaceId: "explore" } },
  { label: "finding index", value: { findingIndex: 1 } },
  { label: "finding count", value: { findingCount: 2 } },
  { label: "Vaul version", value: { vaulVersion: "1.1.3" } },
];

for (const { label, value } of contextMutations) {
  test(`fails closed for changed ${label} context`, () => {
    assert.equal(review({ context: validContext(value) }), null);
  });
}

const findingMutations: Array<{
  label: string;
  mutate: (finding: VaulAxeFinding) => void;
}> = [
  { label: "rule", mutate: (finding) => (finding.id = "image-alt") },
  { label: "impact", mutate: (finding) => (finding.impact = "moderate") },
  { label: "missing node", mutate: (finding) => finding.nodes.pop() },
  {
    label: "additional node",
    mutate: (finding) => finding.nodes.push(structuredClone(finding.nodes[0])),
  },
  { label: "all checks", mutate: (finding) => finding.nodes[0].all.push({}) },
  {
    label: "multiple any checks",
    mutate: (finding) => finding.nodes[0].any.push({ data: {}, id: "other" }),
  },
  { label: "none checks", mutate: (finding) => finding.nodes[0].none.push({}) },
  {
    label: "check id",
    mutate: (finding) => (finding.nodes[0].any[0].id = "other"),
  },
  {
    label: "diagnostic key",
    mutate: (finding) =>
      (finding.nodes[0].any[0].data = { messageKey: "other" }),
  },
  {
    label: "diagnostic text",
    mutate: (finding) =>
      (finding.nodes[0].failureSummary = `${FAILURE_SUMMARY}.`),
  },
  {
    label: "missing related node",
    mutate: (finding) => (finding.nodes[0].any[0].relatedNodes = []),
  },
  {
    label: "multiple related nodes",
    mutate: (finding) =>
      finding.nodes[0].any[0].relatedNodes?.push({
        target: [`#${TARGET_ID}`],
      }),
  },
  {
    label: "different related target",
    mutate: (finding) =>
      (finding.nodes[0].any[0].relatedNodes = [
        { target: ["#another-drawer"] },
      ]),
  },
  {
    label: "nested related selector",
    mutate: (finding) =>
      (finding.nodes[0].any[0].relatedNodes = [
        { target: [`#${TARGET_ID}`, ".nested"] },
      ]),
  },
  {
    label: "multiple target selectors",
    mutate: (finding) => (finding.nodes[0].target = ["#one", "#two"]),
  },
  {
    label: "non-string target selector",
    mutate: (finding) => (finding.nodes[0].target = [1]),
  },
];

for (const { label, mutate } of findingMutations) {
  test(`fails closed for changed Axe ${label}`, () => {
    const finding = validFinding();
    mutate(finding);
    assert.equal(review({ finding }), null);
  });
}

const snapshotMutations: Array<{
  label: string;
  mutate: (snapshot: VaulPseudoSnapshot) => void;
}> = [
  { label: "drawer role", mutate: (s) => (s.drawer.role = "region") },
  {
    label: "drawer marker",
    mutate: (s) => (s.drawer.hasDrawerAttribute = false),
  },
  {
    label: "custom-container mode",
    mutate: (s) => (s.drawer.customContainer = "true"),
  },
  { label: "direction", mutate: (s) => (s.drawer.direction = "top") },
  {
    label: "runtime Vaul version",
    mutate: (s) => (s.drawer.runtimeVersion = "1.1.3"),
  },
  { label: "pseudo content", mutate: (s) => (s.pseudo.content = '"warning"') },
  { label: "pseudo position", mutate: (s) => (s.pseudo.position = "fixed") },
  { label: "top geometry", mutate: (s) => (s.pseudo.top = "0px") },
  { label: "bottom geometry", mutate: (s) => (s.pseudo.bottom = "0px") },
  { label: "left geometry", mutate: (s) => (s.pseudo.left = "1px") },
  { label: "right geometry", mutate: (s) => (s.pseudo.right = "1px") },
  { label: "width geometry", mutate: (s) => (s.pseudo.width = "389px") },
  { label: "height geometry", mutate: (s) => (s.pseudo.height = "599px") },
  { label: "z-index stacking", mutate: (s) => (s.pseudo.zIndex = "1") },
  {
    label: "transform coverage",
    mutate: (s) => (s.pseudo.transform = "matrix(1, 0, 0, 1, 0, -300)"),
  },
  {
    label: "translate coverage",
    mutate: (s) => (s.pseudo.translate = "0px -300px"),
  },
  { label: "rotate coverage", mutate: (s) => (s.pseudo.rotate = "1deg") },
  { label: "scale coverage", mutate: (s) => (s.pseudo.scale = "2") },
  { label: "margin coverage", mutate: (s) => (s.pseudo.marginTop = "-1px") },
  { label: "padding coverage", mutate: (s) => (s.pseudo.paddingTop = "1px") },
  {
    label: "border coverage",
    mutate: (s) => (s.pseudo.borderTopWidth = "300px"),
  },
  {
    label: "pseudo background",
    mutate: (s) => (s.pseudo.backgroundColor = "rgb(254, 254, 254)"),
  },
  {
    label: "transparent pseudo background",
    mutate: (s) => (s.pseudo.backgroundColor = "rgba(255, 255, 255, 0.5)"),
  },
  { label: "missing reviewed node", mutate: (s) => s.nodes.pop() },
  {
    label: "additional reviewed node",
    mutate: (s) => s.nodes.push(structuredClone(s.nodes[0])),
  },
  {
    label: "approved node order",
    mutate: (s) => ([s.nodes[0], s.nodes[1]] = [s.nodes[1], s.nodes[0]]),
  },
  {
    label: "approved selector",
    mutate: (s) => (s.nodes[0].approvedSelector = "#unapproved"),
  },
  {
    label: "approved selector count",
    mutate: (s) => (s.nodes[0].approvedMatchCount = 2),
  },
  {
    label: "approved selector identity",
    mutate: (s) => (s.nodes[0].approvedMatchesTarget = false),
  },
  {
    label: "Axe selector count",
    mutate: (s) => (s.nodes[0].matchCount = 2),
  },
  {
    label: "node outside drawer",
    mutate: (s) => (s.nodes[0].insideDrawer = false),
  },
  {
    label: "Axe selector mismatch",
    mutate: (s) => (s.nodes[0].selector = "#other"),
  },
  {
    label: "transparent foreground",
    mutate: (s) => (s.nodes[0].foreground = "rgba(17, 24, 39, 0.9)"),
  },
  {
    label: "indeterminate node background",
    mutate: (s) => (s.nodes[0].background = null),
  },
  {
    label: "layer/background mismatch",
    mutate: (s) =>
      (s.nodes[0].layers[1].backgroundColor = "rgb(254, 254, 254)"),
  },
  {
    label: "missing drawer layer",
    mutate: (s) => s.nodes[0].layers.pop(),
  },
  {
    label: "insufficient contrast",
    mutate: (s) => (s.nodes[0].foreground = "rgb(180, 180, 180)"),
  },
];

for (const { label, mutate } of snapshotMutations) {
  test(`fails closed for changed ${label}`, () => {
    const snapshot = validSnapshot();
    mutate(snapshot);
    assert.equal(review({ snapshot }), null);
  });
}

const paintMutations: Array<{
  field: keyof PaintStyleEvidence;
  value: PaintStyleEvidence[keyof PaintStyleEvidence];
}> = [
  { field: "activeAnimationCount", value: 1 },
  { field: "animationComposition", value: "add" },
  { field: "animationDelay", value: "1s" },
  { field: "animationDirection", value: "reverse" },
  { field: "animationDuration", value: "1s" },
  { field: "animationFillMode", value: "both" },
  { field: "animationIterationCount", value: "infinite" },
  { field: "animationName", value: "unsafe-overlay" },
  { field: "animationPlayState", value: "paused" },
  { field: "animationTimingFunction", value: "linear" },
  { field: "backfaceVisibility", value: "hidden" },
  { field: "backdropFilter", value: "blur(1px)" },
  { field: "webkitBackdropFilter", value: "blur(1px)" },
  { field: "backgroundBlendMode", value: "multiply" },
  { field: "backgroundImage", value: "linear-gradient(red, red)" },
  { field: "borderBottomColor", value: "rgb(255, 0, 0)" },
  { field: "borderBottomStyle", value: "dashed" },
  { field: "borderBottomWidth", value: "300px" },
  { field: "borderLeftColor", value: "rgb(255, 0, 0)" },
  { field: "borderLeftStyle", value: "dashed" },
  { field: "borderLeftWidth", value: "300px" },
  { field: "borderRightColor", value: "rgb(255, 0, 0)" },
  { field: "borderRightStyle", value: "dashed" },
  { field: "borderRightWidth", value: "300px" },
  { field: "borderTopColor", value: "rgb(255, 0, 0)" },
  { field: "borderTopStyle", value: "dashed" },
  { field: "borderTopWidth", value: "300px" },
  { field: "bottom", value: "307px" },
  { field: "boxSizing", value: "content-box" },
  { field: "boxShadow", value: "inset 0 0 0 600px red" },
  { field: "clipPath", value: "inset(-600px)" },
  { field: "contain", value: "paint" },
  { field: "containerType", value: "inline-size" },
  { field: "contentVisibility", value: "hidden" },
  { field: "display", value: "contents" },
  { field: "filter", value: "brightness(0)" },
  { field: "float", value: "left" },
  { field: "isolation", value: "isolate" },
  { field: "left", value: "80px" },
  { field: "maskClip", value: "content-box" },
  { field: "maskComposite", value: "subtract" },
  { field: "maskImage", value: "linear-gradient(black, black)" },
  { field: "maskMode", value: "alpha" },
  { field: "maskOrigin", value: "content-box" },
  { field: "maskPosition", value: "1px 0px" },
  { field: "maskRepeat", value: "no-repeat" },
  { field: "maskSize", value: "1px 1px" },
  { field: "webkitMaskClip", value: "content-box" },
  { field: "webkitMaskComposite", value: "source-out" },
  { field: "webkitMaskImage", value: "linear-gradient(black, black)" },
  { field: "webkitMaskOrigin", value: "content-box" },
  { field: "webkitMaskPosition", value: "1px 0px" },
  { field: "webkitMaskRepeat", value: "no-repeat" },
  { field: "webkitMaskSize", value: "1px 1px" },
  { field: "mixBlendMode", value: "multiply" },
  { field: "opacity", value: "0.5" },
  { field: "order", value: "1" },
  { field: "outlineColor", value: "rgb(255, 0, 0)" },
  { field: "outlineOffset", value: "1px" },
  { field: "outlineStyle", value: "solid" },
  { field: "outlineWidth", value: "600px" },
  { field: "overflow", value: "hidden" },
  { field: "perspective", value: "1000px" },
  { field: "pointerEvents", value: "none" },
  { field: "right", value: "80px" },
  { field: "rotate", value: "1deg" },
  { field: "scale", value: "0.5" },
  { field: "textColor", value: "rgb(0, 0, 0)" },
  { field: "textFillColor", value: "rgb(255, 255, 255)" },
  { field: "textShadow", value: "0 0 10px white" },
  { field: "textStrokeColor", value: "rgb(255, 255, 255)" },
  { field: "textStrokeWidth", value: "1px" },
  { field: "top", value: "307px" },
  { field: "transform", value: "matrix(1, 0, 0, 1, 0, -300)" },
  { field: "transformStyle", value: "preserve-3d" },
  { field: "transitionDelay", value: "1s" },
  { field: "transitionDuration", value: "1s" },
  { field: "transitionProperty", value: "opacity" },
  { field: "transitionTimingFunction", value: "linear" },
  { field: "translate", value: "0px -300px" },
  { field: "visibility", value: "hidden" },
  { field: "willChange", value: "opacity" },
  { field: "zoom", value: "2" },
];

for (const { field, value } of paintMutations) {
  test(`fails closed for changed pseudo paint ${field}`, () => {
    const snapshot = validSnapshot();
    Object.assign(snapshot.pseudo, { [field]: value });
    assert.equal(review({ snapshot }), null);
  });

  test(`fails closed for changed target/ancestor paint ${field}`, () => {
    const snapshot = validSnapshot();
    Object.assign(snapshot.nodes[0].layers[0], { [field]: value });
    assert.equal(review({ snapshot }), null);
  });
}

for (const [nodeIndex, key] of VAUL_REVIEW_NODE_KEYS.entries()) {
  for (const [layerIndex, [position, zIndex]] of VALID_LAYER_STACKING[
    key
  ].entries()) {
    const layerLabel = `${key} layer ${layerIndex}`;

    test(`fails closed for changed ${layerLabel} position`, () => {
      const snapshot = validSnapshot();
      snapshot.nodes[nodeIndex].layers[layerIndex].position =
        position === "static" ? "relative" : "static";
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} z-index`, () => {
      const snapshot = validSnapshot();
      snapshot.nodes[nodeIndex].layers[layerIndex].zIndex =
        zIndex === "auto" ? "-1" : "auto";
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} stacking combination`, () => {
      const snapshot = validSnapshot();
      Object.assign(snapshot.nodes[nodeIndex].layers[layerIndex], {
        position: "relative",
        zIndex: "-1",
      });
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} positioned insets`, () => {
      const snapshot = validSnapshot();
      Object.assign(snapshot.nodes[nodeIndex].layers[layerIndex], {
        left: "80px",
        top: "307px",
      });
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} display`, () => {
      const snapshot = validSnapshot();
      snapshot.nodes[nodeIndex].layers[layerIndex].display = "contents";
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} painted border`, () => {
      const snapshot = validSnapshot();
      Object.assign(snapshot.nodes[nodeIndex].layers[layerIndex], {
        borderBottomColor: "rgb(255, 0, 0)",
        borderBottomWidth: "300px",
        borderLeftColor: "rgb(255, 0, 0)",
        borderLeftWidth: "300px",
        borderRightColor: "rgb(255, 0, 0)",
        borderRightWidth: "300px",
        borderTopColor: "rgb(255, 0, 0)",
        borderTopWidth: "300px",
      });
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} geometry`, () => {
      const snapshot = validSnapshot();
      const rect = snapshot.nodes[nodeIndex].layers[layerIndex].rect;
      rect.left += 500;
      rect.right += 500;
      assert.equal(review({ snapshot }), null);
    });

    test(`fails closed for changed ${layerLabel} box model`, () => {
      const snapshot = validSnapshot();
      snapshot.nodes[nodeIndex].layers[layerIndex].offsetWidth += 1;
      assert.equal(review({ snapshot }), null);
    });
  }
}

for (const [nodeIndex, key] of VAUL_REVIEW_NODE_KEYS.entries()) {
  test(`fails closed for changed ${key} target hit topology`, () => {
    const snapshot = validSnapshot();
    snapshot.nodes[nodeIndex].targetHitOwnedCount = 8;
    assert.equal(review({ snapshot }), null);
  });

  test(`fails closed for unexpected ${key} rendered pixels`, () => {
    const snapshot = validSnapshot();
    snapshot.nodes[nodeIndex].renderedPixels.unexpectedPixelCount = 1;
    snapshot.nodes[nodeIndex].renderedPixels.maxPaletteDistance = 255;
    assert.equal(review({ snapshot }), null);
  });

  test(`fails closed for obscured ${key} rendered foreground`, () => {
    const snapshot = validSnapshot();
    snapshot.nodes[nodeIndex].renderedPixels.foregroundPixelCount = 0;
    assert.equal(review({ snapshot }), null);
  });

  test(`fails closed for changed ${key} rendered coverage`, () => {
    const snapshot = validSnapshot();
    const rendered = snapshot.nodes[nodeIndex].renderedPixels;
    rendered.backgroundPixelCount = rendered.totalPixelCount;
    rendered.foregroundPixelCount = Math.max(
      1,
      Math.floor(rendered.foregroundPixelCount / 2)
    );
    assert.equal(review({ snapshot }), null);
  });
}

test("fails closed for overlapping reviewed target geometry", () => {
  const snapshot = validSnapshot();
  snapshot.nodes[1].layers[0].rect = structuredClone(
    snapshot.nodes[0].layers[0].rect
  );
  assert.equal(review({ snapshot }), null);
});

test("fails closed for a non-finite review time", () => {
  assert.equal(review({ now: Number.NaN }), null);
});

test("fails closed after the temporary review expires", () => {
  const afterExpiration =
    Date.parse(`${VAUL_DRAWER_PSEUDO_REVIEW.expires}T23:59:59.999Z`) + 1;
  assert.equal(review({ now: afterExpiration }), null);
});

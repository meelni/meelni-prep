import type { RoundType } from "@meelni/core";

export const EXPLORE_QUESTIONS_PER_PAGE = 20;
const MAX_EXPLORE_PAGE = 5_001;

export type ExploreTypeLabel =
  | "All Types"
  | "Product Sense"
  | "Execution"
  | "Behavioral"
  | "Strategy";

export interface ExploreUrlState {
  search: string;
  roundType: RoundType | null;
  typeLabel: ExploreTypeLabel;
  page: number;
}

const TYPE_LABELS: Record<RoundType, Exclude<ExploreTypeLabel, "All Types">> = {
  product_sense: "Product Sense",
  execution: "Execution",
  behavioral: "Behavioral",
  strategy: "Strategy",
};

const LABEL_TYPES: Record<Exclude<ExploreTypeLabel, "All Types">, RoundType> = {
  "Product Sense": "product_sense",
  Execution: "execution",
  Behavioral: "behavioral",
  Strategy: "strategy",
};

export function parseExploreUrlState(
  params: Pick<URLSearchParams, "get">
): ExploreUrlState {
  const rawType = params.get("type");
  const roundType = isRoundType(rawType) ? rawType : null;

  return {
    search: (params.get("search") ?? "").trim().slice(0, 160),
    roundType,
    typeLabel: roundType ? TYPE_LABELS[roundType] : "All Types",
    page: parsePage(params.get("page")),
  };
}

export function buildExploreUrl(
  pathname: string,
  currentParams: Pick<URLSearchParams, "get" | "toString">,
  patch: Partial<Pick<ExploreUrlState, "search" | "roundType" | "page">>
) {
  const state = { ...parseExploreUrlState(currentParams), ...patch };
  const params = new URLSearchParams(currentParams.toString());

  setOptionalParam(params, "search", state.search.trim());
  setOptionalParam(params, "type", state.roundType);
  setOptionalParam(params, "page", state.page > 1 ? String(state.page) : null);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildExploreQuestionRequest(state: ExploreUrlState) {
  const params = new URLSearchParams({
    limit: String(EXPLORE_QUESTIONS_PER_PAGE),
    offset: String((state.page - 1) * EXPLORE_QUESTIONS_PER_PAGE),
    activeOnly: "true",
  });
  if (state.search) params.set("search", state.search);
  if (state.roundType) params.set("type", state.roundType);
  return `/api/questions?${params.toString()}`;
}

export function roundTypeForExploreLabel(label: ExploreTypeLabel) {
  return label === "All Types" ? null : LABEL_TYPES[label];
}

function parsePage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1
    ? Math.min(parsed, MAX_EXPLORE_PAGE)
    : 1;
}

function isRoundType(value: string | null): value is RoundType {
  return (
    value === "product_sense" ||
    value === "execution" ||
    value === "behavioral" ||
    value === "strategy"
  );
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | null
) {
  if (value) params.set(key, value);
  else params.delete(key);
}

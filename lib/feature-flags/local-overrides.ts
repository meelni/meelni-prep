export const LOCAL_FEATURE_FLAG_OVERRIDES_KEY = "meelni_feature_flag_overrides";

export type FeatureFlagStoredOverride = "on" | "off";
export type FeatureFlagOverrideMode = FeatureFlagStoredOverride | "statsig";
export type FeatureFlagOverrides = Record<string, FeatureFlagStoredOverride>;

type FeatureFlagStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function parseFeatureFlagOverrides(value: string | null): FeatureFlagOverrides {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([gate, override]) =>
          typeof gate === "string" && (override === "on" || override === "off")
      )
    ) as FeatureFlagOverrides;
  } catch {
    return {};
  }
}

export function readFeatureFlagOverrides(storage: FeatureFlagStorage): FeatureFlagOverrides {
  return parseFeatureFlagOverrides(storage.getItem(LOCAL_FEATURE_FLAG_OVERRIDES_KEY));
}

export function setFeatureFlagOverride(
  storage: FeatureFlagStorage,
  gate: string,
  mode: FeatureFlagOverrideMode
): FeatureFlagOverrides {
  const overrides = readFeatureFlagOverrides(storage);

  if (mode === "statsig") {
    delete overrides[gate];
  } else {
    overrides[gate] = mode;
  }

  if (Object.keys(overrides).length === 0) {
    storage.removeItem(LOCAL_FEATURE_FLAG_OVERRIDES_KEY);
  } else {
    storage.setItem(LOCAL_FEATURE_FLAG_OVERRIDES_KEY, JSON.stringify(overrides));
  }

  return overrides;
}

export function applyFeatureFlagOverride(
  statsigValue: boolean,
  mode: FeatureFlagOverrideMode
) {
  if (mode === "on") {
    return true;
  }

  if (mode === "off") {
    return false;
  }

  return statsigValue;
}

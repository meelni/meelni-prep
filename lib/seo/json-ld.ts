export type JsonLdValue =
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

/** Serialize JSON-LD without allowing stored text to terminate its script tag. */
export function serializeJsonLd(data: JsonLdValue): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

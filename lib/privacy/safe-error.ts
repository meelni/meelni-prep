export type SafeErrorClass =
  | "TypeError"
  | "RangeError"
  | "SyntaxError"
  | "DOMException"
  | "Error"
  | "NonError";

export function getSafeErrorClass(error: unknown): SafeErrorClass {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return "DOMException";
  }
  if (error instanceof Error) return "Error";
  return "NonError";
}

export function toSafeErrorLog(error: unknown): {
  error_class: SafeErrorClass;
} {
  return { error_class: getSafeErrorClass(error) };
}

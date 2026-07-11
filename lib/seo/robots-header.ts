export const ROBOTS_NOINDEX_HEADER = "noindex, nofollow, noarchive";

export function withNoindexHeader<
  T extends { headers: { set(name: string, value: string): void } },
>(response: T): T {
  response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX_HEADER);
  return response;
}

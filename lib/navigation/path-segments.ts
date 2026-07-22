export function matchesPathSegment(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

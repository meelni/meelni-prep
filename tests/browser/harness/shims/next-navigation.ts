const searchParams = new URLSearchParams();

export function useRouter() {
  return {
    back() {},
    forward() {},
    prefetch: async () => undefined,
    push() {},
    refresh() {},
    replace() {},
  };
}

export function usePathname() {
  return "/browser-qa";
}

export function useSearchParams() {
  return searchParams;
}

export function useParams() {
  return { sessionId: "browser-qa-session" };
}

export function redirect(): never {
  throw new Error("redirect is unavailable in the browser QA fixture");
}

export const permanentRedirect = redirect;

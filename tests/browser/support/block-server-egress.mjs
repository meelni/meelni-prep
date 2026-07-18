import http from "node:http";
import https from "node:https";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function hostnameFromRequest(input) {
  if (input instanceof URL) return input.hostname;
  if (typeof input === "string") return new URL(input).hostname;
  if (!input || typeof input !== "object") return "localhost";
  if (typeof input.url === "string") return new URL(input.url).hostname;
  return input.hostname ?? input.host?.split(":")[0] ?? "localhost";
}

function assertLoopback(input) {
  const hostname = hostnameFromRequest(input).toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) return;

  const message = `Browser QA blocked server-side egress to ${hostname}`;
  console.error(message);
  process.exit(86);
}

const nativeFetch = globalThis.fetch;
if (nativeFetch) {
  globalThis.fetch = (input, init) => {
    assertLoopback(input);
    return nativeFetch(input, init);
  };
}

for (const transport of [http, https]) {
  const nativeRequest = transport.request.bind(transport);
  const nativeGet = transport.get.bind(transport);

  transport.request = (input, ...args) => {
    assertLoopback(input);
    return nativeRequest(input, ...args);
  };
  transport.get = (input, ...args) => {
    assertLoopback(input);
    return nativeGet(input, ...args);
  };
}

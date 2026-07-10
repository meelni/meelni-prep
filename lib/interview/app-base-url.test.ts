import assert from "node:assert/strict";
import test from "node:test";

import { resolveInterviewAppBaseUrl } from "./app-base-url";

test("interview callbacks prefer the explicit canonical application origin", () => {
  assert.equal(
    resolveInterviewAppBaseUrl({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://preview.example.test/some/path",
      VERCEL_URL: "ignored.vercel.app",
    }),
    "https://preview.example.test"
  );
});

test("Vercel deployments derive a public HTTPS callback without extra config", () => {
  assert.equal(
    resolveInterviewAppBaseUrl({
      NODE_ENV: "production",
      VERCEL_URL: "meelni-git-branch.vercel.app",
    }),
    "https://meelni-git-branch.vercel.app"
  );
});

test("non-development deployments fail closed without a public callback origin", () => {
  assert.throws(
    () => resolveInterviewAppBaseUrl({ NODE_ENV: "production" }),
    /interview_app_base_url_unavailable/
  );
});

test("local development keeps the loopback callback default", () => {
  assert.equal(
    resolveInterviewAppBaseUrl({ NODE_ENV: "development" }),
    "http://localhost:3000"
  );
});

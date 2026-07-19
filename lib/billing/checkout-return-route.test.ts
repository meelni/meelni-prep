import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { GET } from "@/app/api/checkout/return/route";

test("legacy Checkout return discards every query and redirects queryless", async () => {
  for (const url of [
    "https://meelni.com/api/checkout/return",
    "https://meelni.com/api/checkout/return?session_id=cs_test_fake",
    "https://meelni.com/api/checkout/return?checkout_return=cr_0123456789abcdef0123456789abcdef",
    "https://meelni.com/api/checkout/return?anything=attacker-controlled",
  ]) {
    const response = await GET(new NextRequest(url));
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://meelni.com/pricing/success"
    );
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.cookies.getAll().length, 0);
  }
});

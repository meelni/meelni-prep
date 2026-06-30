import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInngestDevArgs,
  deriveInngestPorts,
  resolveSdkHost,
  serviceIsSkipped,
} from "./local-dev-config.mjs";

test("deriveInngestPorts keeps the default Inngest UI for the default web port", () => {
  assert.deepEqual(deriveInngestPorts({ webPort: "3000" }), {
    connectExecutorGrpcPort: "8291",
    connectGatewayGrpcPort: "8290",
    connectGatewayPort: "8289",
    port: "8288",
  });
});

test("deriveInngestPorts offsets local ports for adjacent worktree web ports", () => {
  assert.deepEqual(deriveInngestPorts({ webPort: "3002" }), {
    connectExecutorGrpcPort: "8311",
    connectGatewayGrpcPort: "8310",
    connectGatewayPort: "8309",
    port: "8308",
  });
});

test("deriveInngestPorts derives companion ports from an explicit Inngest port", () => {
  assert.deepEqual(
    deriveInngestPorts({ explicitPort: "9100", webPort: "3005" }),
    {
      connectExecutorGrpcPort: "9103",
      connectGatewayGrpcPort: "9102",
      connectGatewayPort: "9101",
      port: "9100",
    }
  );
});

test("resolveSdkHost uses loopback for wildcard hosts", () => {
  assert.equal(resolveSdkHost("0.0.0.0"), "127.0.0.1");
  assert.equal(resolveSdkHost("::"), "127.0.0.1");
  assert.equal(resolveSdkHost("localhost"), "localhost");
});

test("buildInngestDevArgs points the CLI at the local Next.js route", () => {
  assert.deepEqual(
    buildInngestDevArgs({
      host: "0.0.0.0",
      inngestPort: "9100",
      webPort: "3007",
    }),
    [
      "--yes",
      "inngest-cli@latest",
      "dev",
      "--sdk-url",
      "http://127.0.0.1:3007/api/inngest",
      "--port",
      "9100",
      "--connect-gateway-port",
      "9101",
      "--connect-gateway-grpc-port",
      "9102",
      "--connect-executor-grpc-port",
      "9103",
    ]
  );
});

test("serviceIsSkipped accepts common truthy opt-out values", () => {
  assert.equal(serviceIsSkipped("1"), true);
  assert.equal(serviceIsSkipped("true"), true);
  assert.equal(serviceIsSkipped("yes"), true);
  assert.equal(serviceIsSkipped("0"), false);
  assert.equal(serviceIsSkipped(undefined), false);
});

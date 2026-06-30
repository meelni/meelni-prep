const DEFAULT_WEB_PORT = 3000;
const DEFAULT_INNGEST_PORT = 8288;

export function resolveSdkHost(host) {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

export function serviceIsSkipped(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());
}

export function deriveInngestPorts({ explicitPort, webPort }) {
  const port = parsePort(explicitPort) ?? deriveDefaultInngestPort(webPort);

  return {
    connectExecutorGrpcPort: String(port + 3),
    connectGatewayGrpcPort: String(port + 2),
    connectGatewayPort: String(port + 1),
    port: String(port),
  };
}

export function buildInngestDevArgs({ host, inngestPort, webPort }) {
  const ports = deriveInngestPorts({ explicitPort: inngestPort, webPort });
  const sdkHost = resolveSdkHost(host);

  return [
    "--yes",
    "inngest-cli@latest",
    "dev",
    "--sdk-url",
    `http://${sdkHost}:${webPort}/api/inngest`,
    "--port",
    ports.port,
    "--connect-gateway-port",
    ports.connectGatewayPort,
    "--connect-gateway-grpc-port",
    ports.connectGatewayGrpcPort,
    "--connect-executor-grpc-port",
    ports.connectExecutorGrpcPort,
  ];
}

function deriveDefaultInngestPort(webPort) {
  const parsedWebPort = parsePort(webPort) ?? DEFAULT_WEB_PORT;
  const offset = Math.max(0, parsedWebPort - DEFAULT_WEB_PORT);

  return DEFAULT_INNGEST_PORT + offset * 10;
}

function parsePort(value) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

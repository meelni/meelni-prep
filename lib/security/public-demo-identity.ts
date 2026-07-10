import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const PUBLIC_DEMO_DEVICE_COOKIE = "meelni_demo_device";
export const PUBLIC_DEMO_SESSION_COOKIE = "meelni_demo_session";
export const PUBLIC_DEMO_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PUBLIC_DEMO_SESSION_MAX_AGE_SECONDS = 15 * 60;

export interface PublicDemoIdentity {
  sessionId: string;
  deviceCookie: string;
  sessionCookie: string;
  identifiers: {
    ipHash: string;
    deviceHash: string;
    sessionHash: string;
  };
  participantIdentity: string;
}

export interface ResolvePublicDemoIdentityInput {
  headers: Headers;
  deviceCookie?: string;
  sessionCookie?: string;
  secret: string;
  randomId?: () => string;
  now?: () => Date;
  trustedVercelDeployment?: boolean;
  trustedLocalDevelopment?: boolean;
}

interface SignedId {
  id: string;
  issuedAtSeconds: number;
  expiresAtSeconds: number;
}

export class PublicDemoClientIpUnavailableError extends Error {
  constructor() {
    super("Trusted public demo client IP is unavailable");
    this.name = "PublicDemoClientIpUnavailableError";
  }
}

export function resolvePublicDemoIdentity({
  headers,
  deviceCookie,
  sessionCookie,
  secret,
  randomId = randomUUID,
  now = () => new Date(),
  trustedVercelDeployment = process.env.VERCEL === "1",
  trustedLocalDevelopment = false,
}: ResolvePublicDemoIdentityInput): PublicDemoIdentity {
  const key = deriveIdentityKey(secret);
  const ip = getTrustedClientIp(headers, {
    trustedLocalDevelopment,
    trustedVercelDeployment,
  });
  if (!ip) {
    throw new PublicDemoClientIpUnavailableError();
  }

  const nowSeconds = Math.floor(now().getTime() / 1000);
  const device =
    readSignedId(deviceCookie, key, "device", nowSeconds) ??
    createSignedId(randomId(), "device", nowSeconds);
  const session =
    readSignedId(sessionCookie, key, "session", nowSeconds) ??
    createSignedId(randomId(), "session", nowSeconds);
  const signedDevice = signId(device, key, "device");
  const signedSession = signId(session, key, "session");
  const sessionHash = hashIdentifier(key, "session", session.id);

  return {
    sessionId: session.id,
    deviceCookie: signedDevice,
    sessionCookie: signedSession,
    identifiers: {
      ipHash: hashIdentifier(key, "ip", ip),
      deviceHash: hashIdentifier(key, "device", device.id),
      sessionHash,
    },
    participantIdentity: `demo-${sessionHash.slice(0, 20)}`,
  };
}

export function readPublicDemoSessionId({
  sessionCookie,
  secret,
  now = () => new Date(),
}: {
  sessionCookie?: string;
  secret: string;
  now?: () => Date;
}): string | null {
  const key = deriveIdentityKey(secret);
  const nowSeconds = Math.floor(now().getTime() / 1000);
  return readSignedId(sessionCookie, key, "session", nowSeconds)?.id ?? null;
}

export function getTrustedClientIp(
  headers: Headers,
  {
    trustedVercelDeployment = process.env.VERCEL === "1",
    trustedLocalDevelopment = false,
  }: {
    trustedVercelDeployment?: boolean;
    trustedLocalDevelopment?: boolean;
  } = {}
): string | null {
  if (trustedLocalDevelopment && !trustedVercelDeployment) {
    return "127.0.0.1";
  }
  if (!trustedVercelDeployment) return null;

  const candidate = headers.get("x-vercel-forwarded-for");
  const first = candidate?.split(",", 1)[0]?.trim();
  return first ? normalizeAbuseIp(first) : null;
}

function normalizeAbuseIp(value: string): string | null {
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;

  // URL's IPv6 parser gives us a stable compressed representation, including
  // conversion of embedded dotted quads. Rate-limit native IPv6 by /64 so
  // rotating privacy addresses cannot bypass the budget.
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left = "", right = ""] = normalized.split("::", 2);
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const zeroCount = 8 - leftGroups.length - rightGroups.length;
  const groups = [
    ...leftGroups,
    ...Array.from({ length: Math.max(0, zeroCount) }, () => "0"),
    ...rightGroups,
  ].map((group) => Number.parseInt(group || "0", 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group))) {
    return null;
  }

  // Do not collapse all IPv4-mapped addresses into one IPv6 /64 bucket.
  if (
    groups.slice(0, 5).every((group) => group === 0) &&
    groups[5] === 0xffff
  ) {
    return [
      groups[6]! >> 8,
      groups[6]! & 0xff,
      groups[7]! >> 8,
      groups[7]! & 0xff,
    ].join(".");
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

function deriveIdentityKey(secret: string): Buffer {
  if (!secret.trim()) {
    throw new Error("Public demo identity secret is required");
  }
  return createHmac("sha256", secret)
    .update("meelni/public-demo/identity/v1")
    .digest();
}

function signId(
  value: SignedId,
  key: Buffer,
  purpose: "device" | "session"
): string {
  const signature = createHmac("sha256", key)
    .update(
      `cookie:${purpose}:${value.id}:${value.issuedAtSeconds}:${value.expiresAtSeconds}`
    )
    .digest("base64url");
  return `v2.${value.id}.${value.issuedAtSeconds}.${value.expiresAtSeconds}.${signature}`;
}

function readSignedId(
  value: string | undefined,
  key: Buffer,
  purpose: "device" | "session",
  nowSeconds: number
): SignedId | null {
  const match = value?.match(
    /^v2\.([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(\d{1,12})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/i
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;

  const signedId: SignedId = {
    id: match[1],
    issuedAtSeconds: Number(match[2]),
    expiresAtSeconds: Number(match[3]),
  };
  const ttlSeconds = cookieTtlSeconds(purpose);
  if (
    !Number.isSafeInteger(signedId.issuedAtSeconds) ||
    !Number.isSafeInteger(signedId.expiresAtSeconds) ||
    signedId.issuedAtSeconds > nowSeconds + 60 ||
    signedId.expiresAtSeconds <= nowSeconds ||
    signedId.expiresAtSeconds - signedId.issuedAtSeconds !== ttlSeconds
  ) {
    return null;
  }

  const expected = signId(signedId, key, purpose).split(".").at(-1);
  if (!expected) return null;
  const actualBuffer = Buffer.from(match[4], "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  return signedId;
}

function createSignedId(
  id: string,
  purpose: "device" | "session",
  nowSeconds: number
): SignedId {
  return {
    id,
    issuedAtSeconds: nowSeconds,
    expiresAtSeconds: nowSeconds + cookieTtlSeconds(purpose),
  };
}

function cookieTtlSeconds(purpose: "device" | "session"): number {
  return purpose === "device"
    ? PUBLIC_DEMO_DEVICE_MAX_AGE_SECONDS
    : PUBLIC_DEMO_SESSION_MAX_AGE_SECONDS;
}

function hashIdentifier(
  key: Buffer,
  scope: "ip" | "device" | "session",
  value: string
): string {
  return createHmac("sha256", key)
    .update(`rate-limit:${scope}:${value}`)
    .digest("hex");
}

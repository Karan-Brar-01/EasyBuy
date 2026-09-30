import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const DEFAULT_TTL_SECONDS = 180; // 3 minutes — rotating QR window
const TOKEN_VERSION = "v1";

export type HandshakePayload = {
  /** Compact token embedded in QR / pasted as fallback */
  token: string;
  /** Human-friendly 8-digit code derived from the same material */
  numericToken: string;
  orderId: string;
  nonce: string;
  /** Unix epoch seconds */
  expiresAt: number;
  /** Hex SHA-256 of the HMAC signature (stored server-side for consume) */
  signatureHash: string;
  ttlSeconds: number;
};

export type VerifiedHandshake = {
  orderId: string;
  nonce: string;
  expiresAt: number;
  signatureHash: string;
  numericToken: string;
};

function getSecret(): string {
  const secret = process.env.ESCROW_HMAC_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ESCROW_HMAC_SECRET must be set to a strong secret (≥16 chars)",
    );
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function signMaterial(
  orderId: string,
  nonce: string,
  expiresAt: number,
): { signature: Buffer; signatureHash: string; numericToken: string } {
  const material = `${TOKEN_VERSION}.${orderId}.${nonce}.${expiresAt}`;
  const signature = createHmac("sha256", getSecret())
    .update(material)
    .digest();
  const signatureHash = createHash("sha256").update(signature).digest("hex");
  // Time-hashed numeric fallback: first 8 decimal digits of HMAC
  const slice = signature.toString("hex").slice(0, 10);
  const numericToken = (BigInt(`0x${slice}`) % BigInt(100_000_000))
    .toString()
    .padStart(8, "0");
  return { signature, signatureHash, numericToken };
}

/**
 * Issue a short-lived, HMAC-signed verification payload for an IN_TRANSIT order.
 * Re-call periodically so the traveler QR rotates (time-hashed).
 */
export function generateHandshakePayload(
  orderId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  nowMs: number = Date.now(),
): HandshakePayload {
  if (!orderId) {
    throw new Error("orderId is required");
  }

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const { signature, signatureHash, numericToken } = signMaterial(
    orderId,
    nonce,
    expiresAt,
  );

  const body = `${TOKEN_VERSION}.${orderId}.${nonce}.${expiresAt}.${base64UrlEncode(signature)}`;
  const token = base64UrlEncode(body);

  return {
    token,
    numericToken,
    orderId,
    nonce,
    expiresAt,
    signatureHash,
    ttlSeconds,
  };
}

/**
 * Verify a QR / numeric token. Accepts either the full compact token or the
 * 8-digit numeric fallback when `expectedNumeric` context is loaded from DB.
 */
export function verifyHandshakeToken(
  tokenOrNumeric: string,
  options?: {
    /** When verifying numeric-only entry, pass the active challenge fields */
    challenge?: {
      orderId: string;
      nonce: string;
      expiresAt: number;
      numericToken: string;
      signatureHash: string;
    };
    nowMs?: number;
  },
): VerifiedHandshake {
  const raw = tokenOrNumeric.trim();
  const nowSec = Math.floor((options?.nowMs ?? Date.now()) / 1000);

  // Numeric fallback path — must match the registered challenge
  if (/^\d{8}$/.test(raw)) {
    const challenge = options?.challenge;
    if (!challenge) {
      throw new Error("Numeric token requires an active handshake challenge");
    }
    if (challenge.numericToken !== raw) {
      throw new Error("Invalid numeric verification code");
    }
    if (challenge.expiresAt < nowSec) {
      throw new Error("Handshake token expired");
    }
    // Re-derive to ensure HMAC still matches stored hash
    const { signatureHash } = signMaterial(
      challenge.orderId,
      challenge.nonce,
      challenge.expiresAt,
    );
    if (signatureHash !== challenge.signatureHash) {
      throw new Error("Handshake integrity check failed");
    }
    return {
      orderId: challenge.orderId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      signatureHash,
      numericToken: challenge.numericToken,
    };
  }

  let decoded: string;
  try {
    decoded = base64UrlDecode(raw).toString("utf8");
  } catch {
    throw new Error("Malformed handshake token");
  }

  const parts = decoded.split(".");
  if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) {
    throw new Error("Unsupported handshake token format");
  }

  const [, orderId, nonce, expiresAtRaw, signatureB64] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!orderId || !nonce || !Number.isFinite(expiresAt)) {
    throw new Error("Malformed handshake token fields");
  }
  if (expiresAt < nowSec) {
    throw new Error("Handshake token expired");
  }

  const providedSig = base64UrlDecode(signatureB64);
  const { signature, signatureHash, numericToken } = signMaterial(
    orderId,
    nonce,
    expiresAt,
  );

  if (
    providedSig.length !== signature.length ||
    !timingSafeEqual(providedSig, signature)
  ) {
    throw new Error("Invalid handshake signature");
  }

  return {
    orderId,
    nonce,
    expiresAt,
    signatureHash,
    numericToken,
  };
}

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  verifiedAccessEmail,
  verifyAccessToken,
} from "../src/access.js";

const issuer = "https://team.cloudflareaccess.com";
const audience = "knowledge-audience";
const env = {
  CF_ACCESS_AUD: audience,
  CF_ACCESS_ISS: issuer,
};

let privateKey: CryptoKey;
let keyResolver: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  keyResolver = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "RS256", kid: "access-test", use: "sig" }],
  });
});

async function accessToken(options: {
  email?: string;
  issuer?: string;
  audience?: string;
  expiresAt?: number;
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: options.email ?? "Person@Example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "access-test", typ: "JWT" })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt(now)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(privateKey);
}

function requestWithToken(token: string): Request {
  return new Request("https://knowledge.example/gatekeeper/custom/connect", {
    headers: { "cf-access-jwt-assertion": token },
  });
}

const verifyWithTestKey = (token: string, verificationEnv: typeof env) =>
  verifyAccessToken(token, verificationEnv, keyResolver);

describe("Cloudflare Access verification", () => {
  it("accepts and normalizes email only after jose verifies a signed token", async () => {
    await expect(verifiedAccessEmail(
      requestWithToken(await accessToken()),
      env,
      verifyWithTestKey,
    )).resolves.toBe("person@example.com");
  });

  it("rejects issuer, audience, expiry, and signature failures", async () => {
    const now = Math.floor(Date.now() / 1000);
    const valid = await accessToken();
    const parts = valid.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;

    for (const token of [
      await accessToken({ issuer: "https://other.cloudflareaccess.com" }),
      await accessToken({ audience: "other-audience" }),
      await accessToken({ expiresAt: now - 1 }),
      parts.join("."),
    ]) {
      await expect(verifiedAccessEmail(
        requestWithToken(token),
        env,
        verifyWithTestKey,
      )).resolves.toBeNull();
    }
  });

  it("rejects invalid email claims and requests without an assertion", async () => {
    await expect(verifiedAccessEmail(
      requestWithToken(await accessToken({ email: "not-an-email" })),
      env,
      verifyWithTestKey,
    )).resolves.toBeNull();
    await expect(verifiedAccessEmail(
      new Request("https://knowledge.example/gatekeeper/custom/connect"),
      env,
      verifyWithTestKey,
    )).resolves.toBeNull();
  });
});

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";

export type AccessVerificationEnv = Readonly<{
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ISS?: string;
}>;

type AccessTokenVerifier = (
  token: string,
  env: AccessVerificationEnv,
) => Promise<JWTPayload>;

const remoteJwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function remoteKeyResolver(issuer: string): JWTVerifyGetKey {
  let jwks = remoteJwkSets.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    remoteJwkSets.set(issuer, jwks);
  }
  return jwks;
}

export async function verifyAccessToken(
  token: string,
  env: AccessVerificationEnv,
  keyResolver?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_ISS) {
    throw new Error("Cloudflare Access issuer and audience must both be configured.");
  }

  const issuer = env.CF_ACCESS_ISS.replace(/\/$/, "");
  const jwks = keyResolver ?? remoteKeyResolver(issuer);

  return (await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    issuer,
    audience: env.CF_ACCESS_AUD,
  })).payload;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return null;
  }
  return email;
}

/** Returns an email only after validating the Access JWT signature and application boundary. */
export async function verifiedAccessEmail(
  request: Request,
  env: AccessVerificationEnv,
  verifier: AccessTokenVerifier = verifyAccessToken,
): Promise<string | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;

  try {
    const claims = await verifier(token, env);
    return normalizeEmail(claims.email);
  } catch {
    return null;
  }
}

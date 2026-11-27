import { createHash, createPublicKey, createSign, createVerify, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const KEY_DIR = process.env.OIDC_KEY_DIR || path.join(process.cwd(), ".oidc");

let privatePem = "";
let publicPem = "";

function keys() {
  if (!privatePem) {
    privatePem = readFileSync(path.join(KEY_DIR, "private.pem"), "utf8");
    publicPem = readFileSync(path.join(KEY_DIR, "public.pem"), "utf8");
  }
  return { privatePem, publicPem };
}

export const ISSUER = process.env.OIDC_ISSUER || "https://reading.gxwtf.cn/oidc";
export const CLIENT_ID = process.env.OIDC_CLIENT_ID || "gxwtf-reading";
export const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || "";
const KID = "gxwtf-1";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signJwt(payload: Record<string, unknown>): string {
  const { privatePem } = keys();
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createSign("RSA-SHA256").update(data).sign(privatePem);
  return `${data}.${b64url(sig)}`;
}

export function verifyJwt<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const { publicPem } = keys();
  const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(publicPem, fromB64url(parts[2]));
  if (!ok) return null;
  try {
    const payload = JSON.parse(fromB64url(parts[1]).toString()) as T & { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function jwks() {
  const { publicPem } = keys();
  const jwk = createPublicKey(publicPem).export({ format: "jwk" }) as Record<string, string>;
  return { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] };
}

export function discovery() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256", "plain"],
    claims_supported: ["sub", "name", "preferred_username", "email"],
  };
}

export function checkClient(id: string | null, secret: string | null): boolean {
  return id === CLIENT_ID && !!CLIENT_SECRET && secret === CLIENT_SECRET;
}

export function checkPkce(verifier: string | null, challenge: string | null, method: string | null): boolean {
  if (!challenge) return true;
  if (!verifier) return false;
  if ((method || "plain") === "S256") {
    return b64url(createHash("sha256").update(verifier).digest()) === challenge;
  }
  return verifier === challenge;
}

export function newJti() {
  return randomUUID();
}

export function claimsFor(user: { userId: number; userName?: string; email?: string; realName?: string }) {
  return {
    sub: `u${user.userId}`,
    preferred_username: `u${user.userId}`,
    name: user.realName || user.userName || `u${user.userId}`,
    // BookOrbit 建号时 email 必填，广学账号没邮箱时兜底一个
    email: user.email || `u${user.userId}@gxwtf.cn`,
  };
}

import { CLIENT_ID, CLIENT_SECRET, ISSUER, checkPkce, signJwt, verifyJwt } from "@/lib/oidc";

export const dynamic = "force-dynamic";

type CodePayload = {
  typ?: string;
  sub?: string;
  claims?: Record<string, unknown>;
  redirect_uri?: string;
  nonce?: string;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
};

export async function POST(req: Request) {
  const form = await req.formData();
  const grant = String(form.get("grant_type") || "");
  const code = String(form.get("code") || "");
  const verifier = form.get("code_verifier") ? String(form.get("code_verifier")) : null;

  // 客户端认证：post 或 basic
  let clientId = String(form.get("client_id") || "");
  let clientSecret = String(form.get("client_secret") || "");
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    clientId = id;
    clientSecret = secret ?? "";
  }

  if (grant !== "authorization_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  const payload = verifyJwt<CodePayload>(code);
  if (!payload || payload.typ !== "code" || !payload.sub) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  if (!checkPkce(verifier, payload.code_challenge ?? null, payload.code_challenge_method ?? null)) {
    return Response.json({ error: "invalid_grant", detail: "pkce" }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = payload.claims || {};
  const idToken = signJwt({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: payload.sub,
    ...claims,
    nonce: payload.nonce || undefined,
    iat: now,
    exp: now + 3600,
    auth_time: now,
  });
  const accessToken = signJwt({
    iss: ISSUER,
    aud: CLIENT_ID,
    typ: "access",
    sub: payload.sub,
    ...claims,
    iat: now,
    exp: now + 3600,
  });

  return Response.json(
    { access_token: accessToken, token_type: "Bearer", expires_in: 3600, id_token: idToken, scope: "openid profile email" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

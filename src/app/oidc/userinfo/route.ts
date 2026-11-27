import { verifyJwt } from "@/lib/oidc";

export const dynamic = "force-dynamic";

type AccessPayload = { typ?: string; sub?: string } & Record<string, unknown>;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = verifyJwt<AccessPayload>(token);
  if (!payload || payload.typ !== "access" || !payload.sub) {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }
  const { typ: _typ, iss: _iss, aud: _aud, iat: _iat, exp: _exp, ...claims } = payload;
  void _typ; void _iss; void _aud; void _iat; void _exp;
  return Response.json({ sub: payload.sub, ...claims });
}

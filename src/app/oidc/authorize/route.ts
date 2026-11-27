import { NextResponse } from "next/server";

import { CLIENT_ID, ISSUER, claimsFor, signJwt } from "@/lib/oidc";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const redirectUri = p.get("redirect_uri") || "";
  const state = p.get("state") || "";
  const nonce = p.get("nonce") || "";
  const challenge = p.get("code_challenge");
  const method = p.get("code_challenge_method");

  if (p.get("client_id") !== CLIENT_ID || !redirectUri.startsWith("https://")) {
    return new Response("invalid client or redirect_uri", { status: 400 });
  }
  if (p.get("response_type") !== "code") {
    return new Response("unsupported response_type", { status: 400 });
  }

  const session = await getSession();
  const uid = session.userId;
  if (!uid) {
    const back = encodeURIComponent(url.pathname + url.search);
    return NextResponse.redirect(`https://reading.gxwtf.cn/login?back=${back}`);
  }

  const code = signJwt({
    iss: ISSUER,
    aud: CLIENT_ID,
    typ: "code",
    sub: `u${uid}`,
    claims: claimsFor({ ...session, userId: uid }),
    redirect_uri: redirectUri,
    nonce,
    code_challenge: challenge,
    code_challenge_method: method,
    exp: Math.floor(Date.now() / 1000) + 120,
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return NextResponse.redirect(target.toString());
}

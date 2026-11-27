import { jwks } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(jwks(), { headers: { "Cache-Control": "public, max-age=3600" } });
}

import { discovery } from "@/lib/oidc";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(discovery());
}

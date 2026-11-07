import { signToken, unauthorized, SYNC_USER_ID } from "@/lib/readest";

export async function POST(req: Request) {
  let body: { username?: string; password?: string } = {};
  try {
    body = (await req.json()) as { username?: string; password?: string };
  } catch {
    return unauthorized();
  }

  const user = process.env.READEST_USER || "readest";
  const pass = process.env.READEST_PASSWORD || "";
  if (!pass || body.username !== user || body.password !== pass) return unauthorized();

  return Response.json({ accessToken: signToken(SYNC_USER_ID) });
}

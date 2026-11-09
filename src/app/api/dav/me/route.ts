// 当前广学账号的 WebDAV 凭据：给 /readest-boot 自动写入 Readest 设置用
import { ensureDavUser } from "@/lib/dav-users";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "未登录" }, { status: 401 });
  const dav = await ensureDavUser(session.userId);
  return Response.json({
    username: dav.username,
    password: dav.password,
    serverUrl: "https://reading.gxwtf.cn/dav",
    rootPath: `/${dav.username}`,
  });
}

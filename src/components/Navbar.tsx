import { getSession } from "@/lib/session";
import { logout } from "@/actions/auth";
import { HeaderBar } from "@/components/HeaderBar";

/**
 * 全站统一 header：服务端读会话后交给客户端组件渲染（移动端菜单需要展开状态）。
 * 视觉与交互对齐广学题库：纯文字导航、无下划线，移动端通栏列表。
 */
export async function Navbar() {
  const session = await getSession();

  return (
    <HeaderBar
      isLoggedIn={session.isLoggedIn}
      userId={session.userId}
      userName={session.userName}
      admin={session.admin}
      logout={logout}
    />
  );
}

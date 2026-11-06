import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="text-lg font-semibold">找不到这条内容</h1>
      <p className="text-sm text-muted-foreground">
        它可能被删除了，或者不属于当前账号。
      </p>
      <Link
        href="/"
        className="inline-block rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        回到我的收藏
      </Link>
    </div>
  );
}

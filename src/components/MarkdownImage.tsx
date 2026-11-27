import type { ComponentProps } from "react";

/**
 * 正文里的图片。
 *
 * 两件事必须处理，否则图片要么裂要么越权：
 *
 * 1. **分享页没有登录态**。`/api/attachments/<id>` 默认按 userId 校验，
 *    分享页得换成 `?share=<token>`。所以由渲染层统一补参数，正文里存的
 *    永远是不带 token 的干净地址。
 * 2. **本站附件必须走鉴权路由**。用户上传的图存在私有目录里，没有任何静态
 *    映射；只有 `/api/attachments/*` 这一条出口。外站图片保持原样直连。
 */
export function MarkdownImage({
  src,
  alt,
  shareToken,
  ...rest
}: ComponentProps<"img"> & { shareToken?: string | null }) {
  const clean = typeof src === "string" ? src : "";
  let finalSrc = clean;

  if (shareToken && clean.startsWith("/api/attachments/")) {
    finalSrc = `${clean}${clean.includes("?") ? "&" : "?"}share=${encodeURIComponent(shareToken)}`;
  }

  return (
    // 用原生 img：图片地址是动态的、可能来自任意站点，next/image 的优化
    // 对私有路由没有意义，反而多一层鉴权麻烦。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className="my-4 max-w-full rounded-lg border border-border"
      {...rest}
    />
  );
}

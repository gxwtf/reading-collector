import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 文章正文里的外链图片可能来自任意站点，交给浏览器直连即可
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;

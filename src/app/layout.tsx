import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ServiceWorker } from "@/components/ServiceWorker";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1e1d" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "稍后再看",
    template: "%s | 稍后再看",
  },
  description:
    "把链接、文件、图片丢进来，自动分类；每条都有原文与 AI 概括，读完还能生成分享小图。",
  applicationName: "稍后再看",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "稍后再看", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <ThemeProvider>
          <ServiceWorker />
          <Navbar />
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 md:px-12 md:py-10">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/components/ThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#a31f24" },
    { media: "(prefers-color-scheme: dark)", color: "#8a1010" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "阅读收集",
    template: "%s | 阅读收集",
  },
  description:
    "广学五题坊旗下的阅读收集：把链接存进来，自动抓正文、转写音视频，在线读完、划线、打标签。",
  applicationName: "阅读收集",
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased flex flex-col min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <Navbar />
          <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}

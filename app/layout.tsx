import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ming Image Studio · 生图与图层拆分",
  description: "用 Ming-Image Design 生成设计图，用 Design-Layer 拆分透明图层。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}


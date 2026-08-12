import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://neon-grid-defense-07.sperajuanap.chatgpt.site"),
  title: "霓虹防线｜中文塔防小游戏",
  description: "部署防御塔，守住核心，在六个战区与三种特殊模式中迎战敌袭。",
  openGraph: {
    title: "霓虹防线",
    description: "部署 · 防守 · 生存——一款可直接游玩的中文塔防小游戏。",
    images: [{ url: "/og-v3.png", width: 1672, height: 941, alt: "霓虹防线游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "霓虹防线",
    description: "部署 · 防守 · 生存——一款可直接游玩的中文塔防小游戏。",
    images: ["/og-v3.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

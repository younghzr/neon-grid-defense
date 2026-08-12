import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://neon-grid-defense-07.sperajuanap.chatgpt.site"),
  title: "霓虹防线｜中文塔防小游戏",
  description: "预判敌军波次、选择炮塔专精并释放战术技能，在六个战区与三种特殊模式中守住核心。",
  openGraph: {
    title: "霓虹防线",
    description: "波次情报、炮塔专精、首领战与战术技能——一款可直接游玩的中文塔防小游戏。",
    images: [{ url: "/og-v4.png", width: 1672, height: 941, alt: "霓虹防线首领战游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "霓虹防线",
    description: "波次情报、炮塔专精、首领战与战术技能——一款可直接游玩的中文塔防小游戏。",
    images: ["/og-v4.png"],
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

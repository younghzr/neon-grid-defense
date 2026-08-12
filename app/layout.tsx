import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "霓虹防线｜塔防小游戏",
  description: "部署防御塔、升级火力并守住核心，撑过八波霓虹敌袭。",
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

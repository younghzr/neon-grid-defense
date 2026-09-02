import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://neon-grid-defense-07.sperajuanap.chatgpt.site"),
  title: "果园守卫队｜温暖可爱的中文塔防小游戏",
  description: "叫上蓝莓、薄荷和栗子伙伴，在六片果园与三种趣味挑战中赶走贪吃小虫，守住新鲜果篮。",
  openGraph: {
    title: "果园守卫队",
    description: "摆放植物伙伴、观察下一群小虫、选择成长路线——一款轻松温暖的中文塔防小游戏。",
    images: [{ url: "/og-orchard.png", width: 1536, height: 1024, alt: "果园守卫队游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "果园守卫队",
    description: "摆放植物伙伴、赶走贪吃小虫，守住新鲜果篮。",
    images: ["/og-orchard.png"],
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

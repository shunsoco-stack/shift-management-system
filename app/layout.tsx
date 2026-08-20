import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "シフト管理システム | 希望・必要人数・制約からシフトを作成";
const description = "従業員の希望提出から必要人数との比較、自動配置、Conflict確認、確定・公開までを一つにつなぐシフト管理システムです。";

async function requestBaseUrl(): Promise<URL> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost") ? "http" : "https";
  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = await requestBaseUrl();
  const socialImage = new URL("/og.png", metadataBase).toString();
  return {
    metadataBase,
    title,
    description,
    applicationName: "シフト管理システム",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName: "シフト管理システム",
      title,
      description,
      images: [{ url: socialImage, width: 1792, height: 896, alt: "シフト管理システムの週間シフト表と作成Workflow" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#087d70",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

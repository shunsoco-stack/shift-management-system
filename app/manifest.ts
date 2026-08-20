import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "シフト管理システム",
    short_name: "シフト管理",
    description: "希望・必要人数・勤務制約を比較し、シフト作成から公開までを支援する業務システム",
    start_url: "/demo",
    display: "standalone",
    background_color: "#f4f7f6",
    theme_color: "#087d70",
    lang: "ja",
    icons: [
      { src: "/brand/shift-management-system-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/shift-management-system-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

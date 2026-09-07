import type { MetadataRoute } from "next";

// [DECISION 2026-09-07] 試験開発中は検索エンジンに載せない（URLを知る人だけが使う前提）
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}

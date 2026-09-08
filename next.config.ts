import type { NextConfig } from "next";

// GitHub Pages 會把站台放在 /<repo 名>/ 底下，所以建置時要帶 basePath。
// 本機開發（next dev）不需要，用環境變數切換，避免寫死。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // 純靜態輸出：沒有伺服器端執行，才能免費放在 GitHub Pages。
  output: "export",
  basePath,
  // 靜態託管的資料夾式路由需要結尾斜線，否則 /new 會 404。
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Transformers.js 在瀏覽器端跑，不要讓 webpack 去打包 Node 專用的 sharp／fs。
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;

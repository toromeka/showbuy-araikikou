import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // マスタのCSV取り込み（商品マスタは約14.6万行・15MB前後）はServer Actionでファイルを受け取るため、
    // 既定の1MB（Server Action）・10MB（proxyのボディバッファ）では途中で打ち切られてしまう。
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;

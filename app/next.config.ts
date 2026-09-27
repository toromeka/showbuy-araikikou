import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

// ホーム画面に表示するバージョン（どのコミットの状態で動いているか）。
// 手元の環境ではgitから取得する。Dockerビルド（Railway等）ではコンテナ内に.gitが無いため、
// ビルド引数（APP_COMMIT_SHA、またはRailwayが渡すRAILWAY_GIT_COMMIT_SHA）から取得する。
const commitSha = process.env.APP_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || git("rev-parse HEAD");
const commitDate = git("log -1 --format=%cI");

const nextConfig: NextConfig = {
  env: {
    APP_COMMIT: commitSha ? commitSha.slice(0, 7) : "",
    APP_COMMIT_DATE: commitDate,
    APP_BUILT_AT: new Date().toISOString(),
  },
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

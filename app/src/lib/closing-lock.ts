import type { Prisma } from "@/generated/prisma/client";

type TxClient = Prisma.TransactionClient;

// 請求更新・仕入支払更新の実行/取り消しを、複数端末から同時に走らせないためのロック。
//
// 「未請求（未払）データを集計 → 実績レコードを作成 → 対象伝票をis_billed/is_settled済みにする」を
// 1つのDBトランザクションにまとめていても、2人がほぼ同時に「実行」を押すと、両方が同じ未処理データを
// 読み取ってから書き込むため二重計上が起こり得る（PostgreSQLの既定の分離レベル=READ COMMITTEDでは、
// この種の「読んでから書く」競合は自動検出されない）。
// トランザクション冒頭でpg_try_advisory_xact_lockを取得することで、同じ種類の締め処理
// （請求更新・仕入支払更新それぞれ）はクラスタ全体で常に1つずつ順番に処理されるようにする。
// ロックはトランザクションの終了（コミット/ロールバック）時に自動的に解放される。
export async function acquireClosingLock(tx: TxClient, lockKey: string): Promise<void> {
  const rows = await tx.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS locked
  `;
  if (!rows[0]?.locked) {
    throw new Error("他の端末で同じ種類の締め処理を実行中です。少し待ってから、もう一度お試しください。");
  }
}

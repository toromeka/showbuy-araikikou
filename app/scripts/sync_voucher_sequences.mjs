// voucher_sequences（伝票番号の採番カウンタ）を、各伝票テーブルに実際に存在する
// voucher_no の最大値に合わせて引き上げる、冪等なメンテナンススクリプト。
//
// なぜ必要か:
//   このアプリの採番は voucher_sequences.last_number を原子的にincrementして行うが、
//   旧システムからの実データ移行や手作業でのDB調整があった場合、このカウンタが
//   実際の伝票番号（旧システム由来のものを含む）より低い値のままになっていることがある。
//   その状態で新規登録を続けると、採番した番号が既存の伝票番号と衝突し、
//   withVoucherNoRetry（src/lib/voucher-number.ts）による自動リトライが何度も
//   発生してしまう（カウンタと実データの差が大きいほど、衝突しなくなるまでの
//   リトライ回数が増える。差が非常に大きい場合はリトライ上限に達して失敗しうる）。
//
// このスクリプトは各伝票種別について、
//   voucher_sequences.last_number ← GREATEST(現在のlast_number, 対象テーブルのMAX(voucher_no))
// という「現在値より小さくなる方向には絶対に変更しない」更新を行うため、何度実行しても
// 安全（冪等）。今すぐ一度実行しておくことを推奨するが、将来的に本番データへの
// 一括移行（カットオーバー）を行う際にも、同じスクリプトをもう一度実行すればよい。
//
//   node scripts/sync_voucher_sequences.mjs
//
// 事前にDBが起動していればよい（アプリ本体の起動は不要）。

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function loadDatabaseUrlFromEnvFile() {
  try {
    const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL\s*=\s*"?(.*?)"?\s*$/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

const dbUrl = process.env.DATABASE_URL_OVERRIDE ?? process.env.DATABASE_URL ?? loadDatabaseUrlFromEnvFile();
if (!dbUrl) {
  console.error("DATABASE_URL が見つかりません（環境変数、または app/.env のいずれかに設定してください）");
  process.exit(1);
}

// voucher_type と、対応する伝票テーブル・番号カラムの対応表
const TARGETS = [
  { voucher_type: "sales", table: "sales_vouchers" },
  { voucher_type: "purchase", table: "purchase_vouchers" },
  { voucher_type: "receipt", table: "receipt_vouchers" },
  { voucher_type: "payment", table: "payment_vouchers" },
  { voucher_type: "quotation", table: "quotations" },
];

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

try {
  console.log("voucher_sequences の同期を開始します（現在値より小さくなる変更は行いません）\n");

  for (const { voucher_type, table } of TARGETS) {
    // voucher_no は6桁ゼロ埋めの数字文字列だが、念のため数字以外を含む行は無視する
    const { rows: maxRows } = await db.query(
      `select max(voucher_no::bigint) as max_no
         from ${table}
        where voucher_no ~ '^[0-9]+$'`,
    );
    const maxNo = maxRows[0]?.max_no != null ? BigInt(maxRows[0].max_no) : null;

    const { rows: seqRows } = await db.query(
      `select last_number from voucher_sequences where voucher_type = $1`,
      [voucher_type],
    );
    const currentLastNumber = seqRows[0]?.last_number != null ? BigInt(seqRows[0].last_number) : null;

    if (maxNo === null) {
      console.log(`- ${voucher_type} (${table}): 実データなし。スキップ（現在値: ${currentLastNumber ?? "未設定"}）`);
      continue;
    }

    if (currentLastNumber === null) {
      await db.query(
        `insert into voucher_sequences (voucher_type, last_number) values ($1, $2)`,
        [voucher_type, maxNo.toString()],
      );
      console.log(`- ${voucher_type} (${table}): カウンタ未作成だったため ${maxNo} で新規作成しました`);
      continue;
    }

    if (currentLastNumber >= maxNo) {
      console.log(
        `- ${voucher_type} (${table}): 変更なし（現在値 ${currentLastNumber} は実データ最大値 ${maxNo} 以上）`,
      );
      continue;
    }

    await db.query(
      `update voucher_sequences set last_number = $2 where voucher_type = $1`,
      [voucher_type, maxNo.toString()],
    );
    console.log(`- ${voucher_type} (${table}): ${currentLastNumber} → ${maxNo} に引き上げました`);
  }

  console.log("\n完了しました。");
} finally {
  await db.end();
}

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// 伝票番号の採番は voucher_sequences への原子的なUPDATE（increment）で行っており、
// 通常はこれだけで複数端末からの同時採番でも重複しない。
//
// ただし、旧システムから引き継いだ実データの伝票番号（例: 6桁の連番）と、
// このアプリのvoucher_sequences側のカウンタが一致していない状態（データ移行直後など）や、
// 手作業でのDB調整などがあった場合、採番した番号がたまたま既存の伝票番号と衝突し、
// UNIQUE制約違反で保存に失敗することがありうる。
//
// 旧システムでは、他端末との競合が起きそうな場合は自動的に次の番号へ送って登録・印刷を
// 続行する方式だったとのことなので、同様に「番号の衝突を検知したら、自動的に次の番号を
// 採番し直してもう一度保存を試みる」処理をここに実装する。ユーザーからは、たとえ衝突が
// 起きても保存が失敗したように見えず、そのまま登録が完了する。
//
// 重要: 採番（voucher_sequences のincrement）は、伝票本体の保存とは別の、独立して
// コミットされる処理として行う必要がある。もし採番と伝票保存を同じ prisma.$transaction
// の中で行ってしまうと、保存側がUNIQUE制約違反で失敗した際にトランザクション全体が
// ロールバックされ、採番のincrementまで巻き戻ってしまう。その結果、リトライしても
// 毎回まったく同じ番号を採番し直すことになり、衝突が永遠に解消しない
// （実際にこの実装で最初にハマった不具合であり、テストで再現・修正した）。
// そのため、このヘルパーでは「採番」と「保存の試行」を別ステップに分け、採番の結果
// （incrementそのもの）は保存が失敗しても取り消さない設計にしている。
const MAX_VOUCHER_NO_RETRIES = 5;

function isVoucherNoConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;

  const meta = e.meta as
    | {
        target?: unknown;
        // @prisma/adapter-pg（driver adapter）経由の場合、meta.targetではなく
        // driverAdapterError.cause.constraint.fields に違反したカラム名が入る。
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
      }
    | undefined;

  // 従来形式: meta.target が対象カラム名の配列（またはカラム名を含む文字列）
  const target = meta?.target;
  if (Array.isArray(target) && target.includes("voucher_no")) return true;
  if (typeof target === "string" && target.includes("voucher_no")) return true;

  // driver adapter経由のPostgresエラー形式
  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(fields) && fields.includes("voucher_no")) return true;

  return false;
}

/**
 * 伝票番号を採番したうえで、attempt(voucherNo) を実行する。
 * attempt が「採番した番号が既に使われている（UNIQUE制約違反）」ことによる失敗を返した場合は、
 * 自動的に次の番号を採番し直して再試行する（旧システムの挙動に合わせた自動リトライ）。
 * それ以外のエラーはそのまま呼び出し元に伝播する。
 */
export async function withVoucherNoRetry<T>(
  voucherType: string,
  attempt: (voucherNo: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < MAX_VOUCHER_NO_RETRIES; i++) {
    // 採番は独立した呼び出しでコミットする（下のattempt()が失敗してロールバックしても
    // この採番結果自体は巻き戻らない。これにより、次のループでは必ず新しい番号になる）。
    const seq = await prisma.voucher_sequences.upsert({
      where: { voucher_type: voucherType },
      update: { last_number: { increment: 1 } },
      create: { voucher_type: voucherType, last_number: 1 },
    });
    const voucherNo = seq.last_number.toString().padStart(6, "0");

    try {
      return await attempt(voucherNo);
    } catch (e) {
      if (!isVoucherNoConflict(e)) throw e;
      lastError = e;
      // 次のループで新しい番号を採番し直して再試行する
    }
  }
  throw lastError;
}

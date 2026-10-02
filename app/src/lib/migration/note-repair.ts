import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import { padNumeric, splitSalesNote, trimOrNull } from "@/lib/migration/voucher-migration";

// 取り込み済みの売上伝票の備考を、備考1・備考2に分け直す（2026-10）。
// 以前のデータ移行・日計伝票取込は、旧システムのCSVの「備考」（備考1と備考2を半角スペースでつなげたもの）を
// そのまま備考1に入れていた。同じCSVをもう一度読み、伝票番号と明細の順番・商品名で突き合わせて、
// 取り込んだあとに備考が書き換えられていない明細だけを分け直す（画面で直した明細はそのまま残す）。

export type NoteRepairPreview = {
  errors: string[];
  vouchers: number; // CSVにあった売上伝票の数
  notFound: number; // 登録されていない伝票（取り込んでいない伝票）
  toUpdate: number; // 分け直す明細
  alreadySplit: number; // 既に分かれている、または分ける必要のない明細
  changed: number; // 明細の数・商品名・備考が取り込んだときと違うため、そのままにする明細
  samples: { voucherNo: string; lineNo: number; before: string; note: string | null; note2: string | null }[];
};

type Update = { id: bigint; note: string | null; note2: string | null };

async function plan(csv: string): Promise<{ preview: NoteRepairPreview; updates: Update[] }> {
  const preview: NoteRepairPreview = { errors: [], vouchers: 0, notFound: 0, toUpdate: 0, alreadySplit: 0, changed: 0, samples: [] };
  const rows = parseCsv(csv, { trim: false });
  if (rows.length === 0 || !("伝票番号" in rows[0]) || !("備考" in rows[0]) || !("商品名" in rows[0])) {
    preview.errors.push("売上伝票のCSV（伝票番号・商品名・備考の列があるもの）を選んでください。");
    return { preview, updates: [] };
  }

  // 伝票番号ごとに、CSVの並び順のまま売上の明細をまとめる（仕入の行は除く）
  const byVoucher = new Map<string, { name: string; rawNote: string }[]>();
  for (const r of rows) {
    if (trimOrNull(r["区分"]) === "仕入") continue;
    const no = trimOrNull(r["伝票番号"]);
    const name = trimOrNull(r["商品名"]);
    if (!no || !name) continue;
    const key = padNumeric(no, 6);
    if (!byVoucher.has(key)) byVoucher.set(key, []);
    byVoucher.get(key)!.push({ name, rawNote: r["備考"] ?? "" });
  }
  preview.vouchers = byVoucher.size;

  const nos = [...byVoucher.keys()];
  const updates: Update[] = [];
  for (let i = 0; i < nos.length; i += 1000) {
    const vouchers = await prisma.sales_vouchers.findMany({
      where: { voucher_no: { in: nos.slice(i, i + 1000) } },
      select: { voucher_no: true, sales_voucher_lines: { orderBy: { line_no: "asc" }, select: { id: true, line_no: true, product_name: true, note: true, note2: true } } },
    });
    const found = new Map(vouchers.map((v) => [v.voucher_no, v]));
    for (const no of nos.slice(i, i + 1000)) {
      const v = found.get(no);
      const csvLines = byVoucher.get(no)!;
      if (!v) {
        preview.notFound++;
        continue;
      }
      // 明細の数が違う伝票は、取り込んだあとに画面で直したものなので、そのままにする
      if (v.sales_voucher_lines.length !== csvLines.length) {
        preview.changed += v.sales_voucher_lines.length;
        continue;
      }
      v.sales_voucher_lines.forEach((line, idx) => {
        const c = csvLines[idx];
        const split = splitSalesNote(c.rawNote);
        const combined = trimOrNull(c.rawNote);
        if (line.note === split.note && line.note2 === split.note2) {
          preview.alreadySplit++;
          return;
        }
        // 取り込んだときのまま（備考1に、つなげた備考がそのまま入っていて、備考2が空）の明細だけを分け直す
        if (line.product_name !== c.name || line.note !== combined || line.note2 !== null) {
          preview.changed++;
          return;
        }
        preview.toUpdate++;
        updates.push({ id: line.id, note: split.note, note2: split.note2 });
        if (preview.samples.length < 15 && split.note2) {
          preview.samples.push({ voucherNo: no, lineNo: line.line_no, before: combined ?? "", note: split.note, note2: split.note2 });
        }
      });
    }
  }
  return { preview, updates };
}

export async function previewNoteRepair(csv: string): Promise<NoteRepairPreview> {
  return (await plan(csv)).preview;
}

export async function executeNoteRepair(csv: string): Promise<NoteRepairPreview> {
  const { preview, updates } = await plan(csv);
  if (preview.errors.length > 0 || updates.length === 0) return preview;
  await prisma.$transaction(
    async (tx) => {
      for (const u of updates) {
        await tx.sales_voucher_lines.update({ where: { id: u.id }, data: { note: u.note, note2: u.note2 } });
      }
    },
    { timeout: 5 * 60 * 1000, maxWait: 30 * 1000 },
  );
  return preview;
}

import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";

/**
 * 旧システムのCSVエクスポートはUTF-8のこともShift_JIS(CP932)のこともあるため、
 * UTF-8として妥当かどうかを見て自動判定する。
 */
export function decodeCsvBuffer(buf: Buffer): string {
  let bytes = buf;
  // UTF-8 BOMがあれば除去
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return iconv.decode(Buffer.from(bytes), "cp932");
  }
}

/**
 * 旧システムのCSVは列見出しに全角スペースを含むことがある（例:「商　品　名」）ほか、
 * 数字が全角のことがある（例:「得意先名称１」）ため、NFKC正規化で全角英数字を半角にそろえ、
 * 空白を除去して比較できるようにする（見出しのみが対象で、データ値は変換しない）。
 */
export function normalizeHeader(h: string): string {
  return h.normalize("NFKC").replace(/\s/g, "");
}

export function parseCsv(text: string): Record<string, string>[] {
  return parse(text, {
    columns: (header: string[]) => header.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];
}

export function emptyToNull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

export function toIntOrNull(v: string | undefined): number | null {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function toDecimalOrNull(v: string | undefined): string | null {
  const s = emptyToNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : s;
}

// 得意先・仕入先のコードは4桁（例: 0006）。CSVをExcelで開いて保存すると先頭の0が消える（0006 → 6）ため、
// 数字だけで4桁未満のコードは、先頭に0を補って4桁にそろえる。商品コード（「1」=手打ち商品など）は対象外。
export const PARTNER_CODE_LENGTH = 4;
export function padPartnerCode(code: string | null): string | null {
  if (code && /^\d+$/.test(code) && code.length < PARTNER_CODE_LENGTH) return code.padStart(PARTNER_CODE_LENGTH, "0");
  return code;
}

export type ImportResult = {
  message?: string;
  total?: number;
  created?: number;
  updated?: number;
  failed?: number;
  nulledRefs?: number;
  errors?: string[];
  // 先頭の0を補ってコードを4桁にそろえた行数
  paddedCodes?: number;
  // 以前の取り込みで先頭の0が無いコード（6 など）のまま登録されていたものを削除した件数
  removedDuplicates?: number;
  // 同上で、伝票などが紐づいているため削除できなかったコード
  keptDuplicates?: string[];
};

const MAX_ERRORS_SHOWN = 20;

export class ErrorCollector {
  errors: string[] = [];
  count = 0;
  add(message: string) {
    this.count += 1;
    if (this.errors.length < MAX_ERRORS_SHOWN) this.errors.push(message);
  }
}

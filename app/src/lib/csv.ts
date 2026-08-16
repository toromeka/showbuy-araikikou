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
 * 旧システムのCSVは列見出しに全角スペースを含むことがある（例:「商　品　名」）ため、
 * 通常の空白・全角スペースを除去して比較できるようにする。
 */
export function normalizeHeader(h: string): string {
  return h.replace(/[\s　]/g, "");
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

export type ImportResult = {
  message?: string;
  total?: number;
  created?: number;
  updated?: number;
  failed?: number;
  nulledRefs?: number;
  errors?: string[];
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

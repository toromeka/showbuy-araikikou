// 印刷での文字の幅の数え方（納品書・見積書は文字幅が一定のフォントで印刷するため、半角1文字＝1、全角1文字＝2 と数えられる）。
// 印刷側（src/lib/pdf.ts の fitText）と、画面の入力欄の文字数の上限（src/components/PrintWidthInput.tsx）で同じ数え方を使う。

export function isHalfWidth(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c <= 0x7e || (c >= 0xff61 && c <= 0xff9f);
}

// 半角に換算した文字数（全角は2）
export function halfWidthCount(s: string): number {
  let n = 0;
  for (const ch of s) n += isHalfWidth(ch) ? 1 : 2;
  return n;
}

// 半角に換算して max 文字までに切り詰める（超えた分は捨てる）
export function truncateToHalfWidth(s: string, max: number): string {
  let n = 0;
  let out = "";
  for (const ch of s) {
    const w = isHalfWidth(ch) ? 1 : 2;
    if (n + w > max) break;
    n += w;
    out += ch;
  }
  return out;
}

// 納品書の商品名・規格の欄に、文字を小さくせずに印刷できる文字数（半角換算）。
// 欄の幅80mm（文字を置ける幅77mm）に、17.2pxの等幅フォントの半角（約2.27mm）が33文字入る。
// 画面の入力欄に見える文字数とそろえるため、上限は1文字少ない32文字にしている。
export const DELIVERY_NOTE_NAME_MAX = 32;

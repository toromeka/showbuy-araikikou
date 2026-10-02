"use client";

import { useRef } from "react";
import { halfWidthCount, truncateToHalfWidth } from "@/lib/text-width";

// 印刷と同じ等幅のフォント（BIZ UDゴシック。Windows 10以降に入っている。無ければMSゴシック）
const PRINT_FONT = `"BIZ UDGothic", "BIZ UDゴシック", "MS Gothic", "ＭＳ ゴシック", "IPAGothic", monospace`;

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "maxLength"> & {
  value: string;
  onValueChange: (v: string) => void;
  // 入力できる文字数（半角換算。全角は2と数える）
  maxHalfWidth: number;
};

// 印刷できる文字数までしか入力できない入力欄。超えた分の文字は入らない（貼り付けた場合も切り詰める）。
// 日本語入力の変換中は切り詰めず、変換を確定したときに切り詰める（変換中に切ると入力が壊れるため）。
// 印刷と同じ等幅のフォントで、上限の文字数がちょうど見える幅にする。
export function PrintWidthInput({ value, onValueChange, maxHalfWidth, className, style, ...rest }: Props) {
  const composing = useRef(false);
  const limit = (v: string) => (halfWidthCount(v) > maxHalfWidth ? truncateToHalfWidth(v, maxHalfWidth) : v);
  const used = halfWidthCount(value);

  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onValueChange(composing.current ? e.target.value : limit(e.target.value))}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onValueChange(limit(e.currentTarget.value));
      }}
      title={`半角${maxHalfWidth}文字（全角${Math.floor(maxHalfWidth / 2)}文字）まで入力できます（いま${used}文字）`}
      className={`${className ?? ""} ${used >= maxHalfWidth ? "border-amber-400" : ""}`}
      // 1ch は等幅フォントの半角1文字の幅。左右の余白（0.75rem×2）と枠線（1px×2）を足して、上限の文字数がちょうど見える幅にする
      style={{ fontFamily: PRINT_FONT, width: `calc(${maxHalfWidth}ch + 1.5rem + 2px)`, ...style }}
    />
  );
}

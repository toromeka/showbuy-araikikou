"use client";

import { usePathname } from "next/navigation";
import { DEFAULT_BACKGROUND, workColorFor } from "@/lib/work-colors";

// 今の画面の作業に応じて、画面全体の背景色を変える（色の対応は src/lib/work-colors.ts）
export function WorkBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const color = workColorFor(pathname) ?? DEFAULT_BACKGROUND;
  return (
    <div className="min-h-screen transition-colors duration-200" style={{ backgroundColor: color }} data-work-color={color}>
      {children}
    </div>
  );
}

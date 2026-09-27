// 締日（1〜31。28以上や月の日数を超える値はその月の末日＝月末締めとして扱う）から、
// 基準日（today）以前で一番新しい締め日を YYYY-MM-DD で返す。
// 例: 締日20・今日9/27 → 9/20、締日25・今日9/24 → 8/25、締日31・今日9/27 → 8/31
export function lastClosingDateOnOrBefore(closingDay: number, today: { y: number; m: number; d: number }): string {
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m は1〜12
  const clamp = (y: number, m: number) => Math.min(closingDay, daysInMonth(y, m));

  let { y, m } = today;
  if (today.d < clamp(y, m)) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  const d = clamp(y, m);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 日本時間での今日の日付
export function todayInJapan(now: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** YYYYMMDD形式の文字列を返す */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** YYYY-MM-DD or YYYYMMDD → Date */
export function parseDate(s: string): Date {
  const clean = s.replace(/-/g, '');
  const y = parseInt(clean.slice(0, 4));
  const m = parseInt(clean.slice(4, 6)) - 1;
  const d = parseInt(clean.slice(6, 8));
  return new Date(y, m, d);
}

/** N営業日前の日付を概算で返す（カレンダー日ベース、バッファ込み） */
export function subtractBusinessDays(from: Date, businessDays: number): Date {
  const calendarDays = Math.ceil(businessDays * 1.5) + 5;
  const result = new Date(from);
  result.setDate(result.getDate() - calendarDays);
  return result;
}

/** 今日の日付 */
export function today(): Date {
  return new Date();
}

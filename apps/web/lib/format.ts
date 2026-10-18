const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** Buddhist-era date, e.g. 12 ก.ย. 2569 (HTML formatDate). */
export function formatDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear() + 543}`;
}

/** วันนี้ / เมื่อวาน / N วันที่แล้ว, falling back to formatDate after a week. */
export function relativeDay(d: Date | string, now = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const day = (v: Date) => new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  const n = Math.round((day(now) - day(x)) / 86400000);
  if (n <= 0) return 'วันนี้';
  if (n === 1) return 'เมื่อวาน';
  if (n < 7) return `${n} วันที่แล้ว`;
  return formatDate(x);
}

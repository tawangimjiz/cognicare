export const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalize(raw: number, maxRaw: number): number {
  if (!(maxRaw > 0)) throw new Error('maxRaw must be > 0');
  return Math.min(100, Math.max(0, round2((100 * raw) / maxRaw)));
}

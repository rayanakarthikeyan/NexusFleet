export function shortestDelta(from: number, to: number): number {
  'worklet';
  // Positive modulo handles negative and accumulated/unwrapped angles.
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}
export function normalizeLongitude(value: number): number {
  'worklet';
  return ((((value + 180) % 360) + 360) % 360) - 180;
}
export function normalizeHeading(value: number): number {
  'worklet';
  return ((value % 360) + 360) % 360;
}
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number | null {
  const rad = Math.PI / 180;
  const a = lat1 * rad,
    b = lat2 * rad;
  const d = shortestDelta(lng1, lng2) * rad;
  const y = Math.sin(d) * Math.cos(b);
  const x = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d);
  return Math.abs(x) + Math.abs(y) < 1e-12 ? null : normalizeHeading(Math.atan2(y, x) / rad);
}

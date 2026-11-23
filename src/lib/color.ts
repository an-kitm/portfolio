/** Small colour helpers shared by the SVG drawings and the 3D scenes. */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix colour `a` towards colour `b` by `t` (0..1). Both are #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return (
    '#' +
    A.map((v, i) =>
      Math.round(v + ((B[i] ?? 0) - v) * t)
        .toString(16)
        .padStart(2, '0'),
    ).join('')
  );
}

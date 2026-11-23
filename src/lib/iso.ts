import { mix } from './color';

/**
 * Block geometry shared by the static SVG drawings and the Three.js scenes (world units).
 * Every block has a 2 x 2 footprint and is 1.1 tall. Stacked blocks sit `gap` apart; split blocks `split` apart.
 */
export const GEO = { w: 2, d: 2, h: 1.1, gap: 0.12, split: 0.8, shadowK: 1.22 } as const;

const COS30 = Math.cos(Math.PI / 6);

export type FacePalette = { top: string; left: string; right: string };

export type IsoBlockSpec = FacePalette & {
  /** Bottom of the block, in world units. */
  y0: number;
  h: number;
  edge: string;
  edgeWidth?: number;
  dashed?: boolean;
};

export type IsoFace = { points: string; fill: string; edge: string; edgeWidth: number; dashed: boolean };

export type IsoDrawing = {
  width: number;
  height: number;
  shadow?: { points: string; fill: string };
  /** Faces in paint order: for each block (bottom first) left, right, top. */
  faces: IsoFace[];
  /** Vertical centre of each block's right-hand corner edge, as % of the drawing height (bottom block first). */
  blockMidY: number[];
  /** Right-most corner of the blocks, as % of the drawing width. */
  rightX: number;
};

/**
 * Draw stacked blocks in isometric projection (the +y face on top, +z face on the left, +x face on the right).
 * `frameTop` reserves headroom so drawings of different heights share a baseline.
 */
export function drawBlocks(
  blocks: IsoBlockSpec[],
  opts: { scale?: number; pad?: number; shadow?: { k: number; fill: string }; frameTop?: number } = {},
): IsoDrawing {
  const s = opts.scale ?? 40;
  const pad = opts.pad ?? 3;
  const hx = GEO.w / 2;
  const hz = GEO.d / 2;
  const k = opts.shadow ? opts.shadow.k : 1;
  const top = Math.max(opts.frameTop ?? 0, ...blocks.map((b) => b.y0 + b.h));
  const minX = -(hx + hz) * COS30 * k;
  const minY = -(hx + hz) * 0.5 - top;
  const maxY = (hx + hz) * 0.5 * k;
  const width = Math.ceil(-2 * minX * s + 2 * pad);
  const height = Math.ceil((maxY - minY) * s + 2 * pad);
  const ox = -minX * s + pad;
  const oy = -minY * s + pad;

  const pt = (x: number, y: number, z: number) =>
    `${(ox + (x - z) * COS30 * s).toFixed(1)},${(oy + ((x + z) * 0.5 - y) * s).toFixed(1)}`;
  const poly = (ps: [number, number, number][]) => ps.map(([x, y, z]) => pt(x, y, z)).join(' ');

  const faces: IsoFace[] = [];
  const blockMidY: number[] = [];
  for (const b of blocks) {
    const y0 = b.y0;
    const y1 = b.y0 + b.h;
    const base = { edge: b.edge, edgeWidth: b.edgeWidth ?? 1, dashed: Boolean(b.dashed) };
    faces.push({ ...base, fill: b.left, points: poly([[-hx, y0, hz], [-hx, y1, hz], [hx, y1, hz], [hx, y0, hz]]) });
    faces.push({ ...base, fill: b.right, points: poly([[hx, y0, -hz], [hx, y1, -hz], [hx, y1, hz], [hx, y0, hz]]) });
    faces.push({ ...base, fill: b.top, points: poly([[-hx, y1, -hz], [hx, y1, -hz], [hx, y1, hz], [-hx, y1, hz]]) });
    blockMidY.push(((oy - ((y0 + y1) / 2) * s) / height) * 100);
  }

  const shadow = opts.shadow
    ? {
        fill: opts.shadow.fill,
        points: poly([
          [-hx * k, 0, -hz * k],
          [hx * k, 0, -hz * k],
          [hx * k, 0, hz * k],
          [-hx * k, 0, hz * k],
        ]),
      }
    : undefined;

  return { width, height, faces, shadow, blockMidY, rightX: ((ox + (hx + hz) * COS30 * s) / width) * 100 };
}

/** Bottom offsets for three stacked blocks, `split` from 0 (stacked) to 1 (fully split). */
export function stackOffsets(split: number, count = 3, h: number = GEO.h): number[] {
  const g = GEO.gap + (GEO.split - GEO.gap) * split;
  return Array.from({ length: count }, (_, i) => i * (h + g));
}

/** Face colours for a solid block in a base colour (top lighter, right darker), as in version B. */
export function facesFor(base: string, k = 0): FacePalette {
  const b = k ? mix(base, k > 0 ? '#FFFFFF' : '#000000', Math.abs(k)) : base;
  return { top: mix(b, '#FFFFFF', 0.34), left: mix(b, '#FFFFFF', 0.08), right: mix(b, '#000000', 0.24) };
}

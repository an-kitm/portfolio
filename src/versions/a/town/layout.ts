/**
 * The town, as plain data (world units; one unit is about the width of a window bay).
 *
 * A main street runs along world +x. Every district stands on its far side (−z), so with the camera looking
 * from (−x, +z) the walker on the street is never hidden behind a building. Walking the street from the home at
 * the west end to the square at the east end visits the districts in page order.
 *
 * Each district has a headquarters block at the back (company name on its face, a neon strip in the district
 * colour and a floating emblem above) and three smaller buildings in front: the three areas of work.
 */

export type DistrictId = 'even' | 'pixis' | 'noesys' | 'atlas';
export const DISTRICT_IDS: readonly DistrictId[] = ['even', 'pixis', 'noesys', 'atlas'];

export const SPACING = 13;
/** Where the walker walks and stops: on the street, just in front of the district plots. */
export const WALK_Z = -1.9;
export const PLOT = { half: 5.4, z0: -12.2, z1: -2.7, h: 0.22 } as const;
export const HQ = { w: 4.4, d: 3, h: 6.2, z: -8.7 } as const;
export const WORK = { w: 1.9, d: 1.9, z: -4.6, gap: 3.1 } as const;

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface District {
  id: DistrictId;
  cx: number;
  /** Neon colour of the district. */
  color: string;
  /** Under construction: drawn as outlines. */
  draft: boolean;
  hq: Box;
  /** The three areas of work, in walking order (block 01 first). */
  work: Box[];
}

const HEIGHTS: Record<DistrictId, [number, number, number]> = {
  even: [2.3, 1.9, 2.6],
  pixis: [2.0, 2.7, 2.2],
  noesys: [1.6, 2.0, 1.8],
  atlas: [2.1, 2.1, 2.1],
};

/** Each district's neon, from the company's brand colours (Atlas, the side project, keeps a violet). */
export const COLORS: Record<DistrictId, string> = {
  even: '#2F74FF',
  pixis: '#1EF4B4',
  noesys: '#BFD73E',
  atlas: '#B48CFF',
};

export const DISTRICTS: District[] = DISTRICT_IDS.map((id, i) => {
  const cx = i * SPACING;
  return {
    id,
    cx,
    color: COLORS[id],
    draft: id === 'atlas',
    hq: { x: cx, z: HQ.z, w: HQ.w, d: HQ.d, h: HQ.h },
    work: [-1, 0, 1].map((k, j) => ({
      x: cx + k * WORK.gap,
      z: WORK.z,
      w: WORK.w,
      d: WORK.d,
      h: HEIGHTS[id][j] ?? 2,
    })),
  };
});

export const district = (id: DistrictId): District => DISTRICTS.find((d) => d.id === id) as District;

/** The walker's home at the west end, and the square with the mailbox at the east end. */
export const HOME = { x: -SPACING + 1.5, z: -6.2, w: 3.2, d: 3, h: 2.2 } as const;
export const SQUARE = { x: DISTRICT_IDS.length * SPACING - 1, z: -5.4 } as const;

/** Extent of the town, for the overview framing and for keeping the walker inside it. */
export const BOUNDS = { x0: HOME.x - 5, x1: SQUARE.x + 5, z0: PLOT.z0 - 1.5, z1: 5 } as const;

/** One stop on the scroll tour. `anchor` is the id of the page element that brings the walker here. */
export interface Stop {
  x: number;
  anchor: string | null;
  district: DistrictId | null;
  /** Building index within the district (0 = block 01). */
  index: number;
  /** Turn to face the camera (and wave at the end) instead of the building. */
  greet: boolean;
}

const at = (id: DistrictId, i: number): number => district(id).work[i]?.x ?? 0;

export const STOPS: Stop[] = [
  { x: HOME.x, anchor: null, district: null, index: 0, greet: true },
  ...[0, 1, 2].map((i) => ({ x: at('even', i), anchor: `even-${i + 1}`, district: 'even' as const, index: i, greet: false })),
  ...[0, 1, 2].map((i) => ({ x: at('pixis', i), anchor: `pixis-${i + 1}`, district: 'pixis' as const, index: i, greet: false })),
  { x: at('noesys', 1), anchor: 'noesys', district: 'noesys', index: 1, greet: false },
  { x: at('atlas', 1), anchor: 'atlas', district: 'atlas', index: 1, greet: false },
  { x: SQUARE.x, anchor: 'contact', district: null, index: 0, greet: true },
];

/** Footprints the walker cannot walk through in free roam. */
export function colliders(): Box[] {
  const list: Box[] = [{ ...HOME }];
  for (const d of DISTRICTS) {
    list.push(d.hq, ...d.work);
  }
  list.push({ x: SQUARE.x, z: SQUARE.z - 1.2, w: 2.6, d: 1.6, h: 2 });
  return list;
}

/** The district whose plot contains a point, if any. */
export function districtAt(x: number, z: number): DistrictId | null {
  if (z > PLOT.z1 + 1.2 || z < PLOT.z0) return null;
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.cx) <= PLOT.half) return d.id;
  }
  return null;
}

/** Height of the ground under a point: the district plots are raised a little. */
export function groundAt(x: number, z: number): number {
  if (z > PLOT.z1 || z < PLOT.z0) return 0;
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.cx) <= PLOT.half) return PLOT.h;
  }
  return 0;
}

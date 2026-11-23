import { mix } from '../../lib/color';
import { GEO, stackOffsets, type IsoBlockSpec } from '../../lib/iso';

/** Version A design tokens (dark observatory), exactly as on the A artboards. */
export const T = {
  ground: '#0A0D14',
  text: '#E8ECF3',
  muted: '#A0AABD',
  faint: '#7D879B',
  accent: '#5AA9FF',
  signal: '#FFB547',
} as const;

/** Block looks. `dim` is not a look: it is any look drawn at low opacity. */
export type Look = 'idle' | 'now' | 'active' | 'hover' | 'side';

export type Palette = { top: string; left: string; right: string; edge: string; ew: number };

export const PAL: Record<Look, Palette> = {
  idle: { top: '#1C2436', left: '#141B29', right: '#0F1520', edge: '#3D4A66', ew: 1 },
  now: {
    top: mix('#1C2436', T.accent, 0.2),
    left: mix('#141B29', T.accent, 0.12),
    right: mix('#0F1520', T.accent, 0.08),
    edge: T.accent,
    ew: 1.4,
  },
  active: {
    top: mix(T.ground, T.signal, 0.45),
    left: mix(T.ground, T.signal, 0.26),
    right: mix(T.ground, T.signal, 0.16),
    edge: T.signal,
    ew: 1.6,
  },
  hover: { top: '#27334D', left: '#1C2538', right: '#151C2B', edge: '#B4CCFF', ew: 1.4 },
  side: {
    top: mix(T.ground, T.accent, 0.1),
    left: mix(T.ground, T.accent, 0.06),
    right: mix(T.ground, T.accent, 0.03),
    edge: T.accent,
    ew: 1.2,
  },
};

/** Heights reserved above the ground so drawings in one row share a baseline. */
export const STACKED_TOP = 3 * GEO.h + 2 * GEO.gap;
export const SPLIT_TOP = 3 * GEO.h + 2 * GEO.split;

/** Plinth colour under a tower. */
export function shadowFill(dim = false): string {
  return mix(T.ground, T.accent, dim ? 0.03 : 0.08);
}

/**
 * Block specs for a tower drawing. `looks` is top-first (block 01 is the top block);
 * the result is bottom-first, as `drawBlocks` expects.
 */
export function towerSpecs(
  looks: readonly [Look, Look, Look],
  split: number,
  lift = 0,
  dashed = false,
): IsoBlockSpec[] {
  const offs = stackOffsets(split);
  return [...looks].reverse().map((look, i) => {
    const p = PAL[look];
    return {
      y0: lift + (offs[i] ?? 0),
      h: GEO.h,
      top: p.top,
      left: p.left,
      right: p.right,
      edge: p.edge,
      edgeWidth: p.ew,
      dashed,
    };
  });
}

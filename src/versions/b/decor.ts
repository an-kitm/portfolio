import { drawBlocks, facesFor, GEO, type FacePalette, type IsoDrawing } from '../../lib/iso';
import type { CompanyId } from '../../content/site';

/** Version B colours (editorial colour direction). */
export const B = {
  paper: '#E8E4DC',
  white: '#FBFAF7',
  ink: '#1F1611',
  espresso: '#18100C',
  even: '#2747C9',
  pixis: '#BF3F14',
  noesys: '#2F6B3A',
} as const;

export const COMPANY_COLOUR: Record<CompanyId, string> = { even: B.even, pixis: B.pixis, noesys: B.noesys };

export const ATLAS_PAPER: FacePalette = { top: '#F1EEE8', left: '#E6E1D8', right: '#DAD4CA' };
export const ATLAS_DARK: FacePalette = { top: '#2C211B', left: '#231914', right: '#1C1410' };

const EDGE_ON_PAPER = 'rgba(31, 22, 17, 0.35)';
const EDGE_ON_COLOUR = 'rgba(255, 255, 255, 0.55)';

/**
 * Where a decorative block sits inside its section. Desktop values first; `m*` values apply at phone width.
 * `x`/`y` are CSS lengths (left/top), `w` is the drawing width in px and `r` an in-plane rotation in degrees.
 */
export type Place = {
  x: string;
  y: string;
  w: number;
  r: number;
  mx?: string;
  my?: string;
  mw?: number;
  mr?: number;
  mobile?: 'hide';
  /** Out-of-focus particle: blurred in the SVG fallback, translucent in 3D. */
  blur?: number;
};

export type SlabPlace = Place & { n: '01' | '02' | '03'; k: number; lx: string; ly: string; mlx: string; mly: string };

export type CompanyDecor = {
  gradient: string;
  /** Space between the company name and the role row (desktop / phone), leaving room for the blocks. */
  gap: number;
  mgap: number;
  slabs: [SlabPlace, SlabPlace, SlabPlace];
  cubes: Place[];
};

export const decor: Record<CompanyId, CompanyDecor> = {
  even: {
    gradient: 'linear-gradient(180deg, #2747C9 0%, #1D3596 46%, #0B1233 100%)',
    gap: 260,
    mgap: 300,
    slabs: [
      { n: '01', k: 0.14, x: '72%', y: '64px', w: 230, r: -12, mx: '50%', my: '196px', mw: 120, mr: -12, lx: '70%', ly: '84px', mlx: '46%', mly: '212px' },
      { n: '02', k: 0.04, x: '85%', y: '236px', w: 200, r: 10, mx: '73%', my: '262px', mw: 96, mr: 10, lx: '83.5%', ly: '256px', mlx: '80%', mly: '352px' },
      { n: '03', k: -0.06, x: '71%', y: '400px', w: 250, r: -4, mx: '40%', my: '326px', mw: 130, mr: -4, lx: '69%', ly: '424px', mlx: '35%', mly: '346px' },
    ],
    cubes: [
      { x: '64%', y: '214px', w: 34, r: 15, mx: '22%', my: '240px', mw: 18 },
      { x: '93%', y: '126px', w: 26, r: -20, blur: 2, mx: '86%', my: '190px', mw: 14 },
      { x: '82%', y: '520px', w: 40, r: 8, mx: '82%', my: '400px', mw: 22 },
      { x: '62%', y: '470px', w: 22, r: -10, blur: 3, mobile: 'hide' },
      { x: '96%', y: '440px', w: 30, r: 25, blur: 1, mobile: 'hide' },
      { x: '77%', y: '26px', w: 18, r: 12, blur: 3, mobile: 'hide' },
    ],
  },
  pixis: {
    gradient: 'linear-gradient(180deg, #BF3F14 0%, #8A2A0B 46%, #2B0D04 100%)',
    gap: 324,
    mgap: 290,
    slabs: [
      { n: '01', k: 0.14, x: '58%', y: '92px', w: 240, r: 14, mx: '50%', my: '140px', mw: 120, mr: 14, lx: '56.5%', ly: '116px', mlx: '45%', mly: '156px' },
      { n: '02', k: 0.04, x: '77%', y: '56px', w: 210, r: -9, mx: '74%', my: '204px', mw: 96, mr: -9, lx: '92%', ly: '64px', mlx: '80%', mly: '294px' },
      { n: '03', k: -0.06, x: '67%', y: '300px', w: 260, r: 6, mx: '40%', my: '270px', mw: 130, mr: 6, lx: '65%', ly: '330px', mlx: '35%', mly: '290px' },
    ],
    cubes: [
      { x: '52%', y: '40px', w: 28, r: -14, blur: 2.5, mx: '24%', my: '170px', mw: 16 },
      { x: '92%', y: '300px', w: 38, r: 18, mx: '86%', my: '330px', mw: 20 },
      { x: '60%', y: '470px', w: 24, r: 6, blur: 2, mobile: 'hide' },
      { x: '87%', y: '480px', w: 32, r: -22, blur: 1, mobile: 'hide' },
    ],
  },
  noesys: {
    gradient: 'linear-gradient(180deg, #2F6B3A 0%, #1F4A28 46%, #08180C 100%)',
    gap: 244,
    mgap: 300,
    slabs: [
      { n: '01', k: 0.14, x: '70%', y: '80px', w: 230, r: -8, mx: '50%', my: '196px', mw: 120, mr: -8, lx: '68.5%', ly: '100px', mlx: '46%', mly: '212px' },
      { n: '02', k: 0.04, x: '84%', y: '250px', w: 200, r: 12, mx: '73%', my: '262px', mw: 96, mr: 12, lx: '82.5%', ly: '270px', mlx: '80%', mly: '352px' },
      { n: '03', k: -0.06, x: '68%', y: '390px', w: 250, r: 3, mx: '40%', my: '326px', mw: 130, mr: 3, lx: '66%', ly: '414px', mlx: '35%', mly: '346px' },
    ],
    cubes: [
      { x: '63%', y: '250px', w: 30, r: 20, mx: '22%', my: '240px', mw: 18 },
      { x: '94%', y: '120px', w: 24, r: -16, blur: 2.5, mx: '86%', my: '190px', mw: 14 },
      { x: '86%', y: '530px', w: 36, r: 9, mx: '82%', my: '400px', mw: 22 },
    ],
  },
};

/** Blocks resting on the giant name in the footer (positions relative to the name). */
export const footerBlocks: { palette: CompanyId | 'atlas-paper'; place: Place }[] = [
  { palette: 'noesys', place: { x: '21%', y: '-66px', w: 110, r: -6, mx: '55%', my: '-40px', mw: 70, mr: -6 } },
  { palette: 'pixis', place: { x: '43%', y: '-60px', w: 100, r: 10, mx: '76%', my: '-14px', mw: 62, mr: 12 } },
  { palette: 'even', place: { x: '83%', y: '4px', w: 110, r: -6, mx: '70%', my: '70px', mw: 74, mr: -4 } },
  { palette: 'atlas-paper', place: { x: '70%', y: '-150px', w: 70, r: 8, mobile: 'hide' } },
];

// Static isometric drawings used as the no-WebGL fallback (and as the layout boxes the 3D blocks fill).

export function slabDrawing(base: string, k: number, onPaper = false): IsoDrawing {
  return drawBlocks([{ y0: 0, h: GEO.h, ...facesFor(base, k), edge: onPaper ? EDGE_ON_PAPER : EDGE_ON_COLOUR }], { scale: 60 });
}

export function cubeDrawing(base: string): IsoDrawing {
  return drawBlocks([{ y0: 0, h: 2, ...facesFor(base, 0.3), edge: 'none' }], { scale: 24 });
}

export function atlasDrawing(dark: boolean): IsoDrawing {
  return drawBlocks(
    [{ y0: 0, h: GEO.h, ...(dark ? ATLAS_DARK : ATLAS_PAPER), edge: dark ? 'rgba(255, 255, 255, 0.75)' : B.ink, dashed: true }],
    { scale: 60 },
  );
}

/** The hero's career tower: Noesys, Pixis and Even stacked, with Atlas floating on top. */
export function careerTowerDrawing(): IsoDrawing {
  return drawBlocks(
    [
      { y0: 0, h: GEO.h, ...facesFor(B.noesys), edge: EDGE_ON_PAPER },
      { y0: 1.2, h: GEO.h, ...facesFor(B.pixis), edge: EDGE_ON_PAPER },
      { y0: 2.4, h: GEO.h, ...facesFor(B.even), edge: EDGE_ON_PAPER },
      { y0: 4.2, h: GEO.h, ...ATLAS_PAPER, edge: B.ink, dashed: true },
    ],
    { scale: 60 },
  );
}

export function markDrawing(): IsoDrawing {
  return drawBlocks([{ y0: 0, h: 2, top: '#FFFFFF', left: '#D9E0F8', right: '#AFBEF0', edge: 'none' }], { scale: 24 });
}

/** CSS custom properties for a placed element. */
export function placeStyle(p: Place, extra: string[] = []): string {
  const parts = [`--x:${p.x}`, `--y:${p.y}`, `--w:${p.w}px`, `--r:${p.r}deg`];
  if (p.mx) parts.push(`--mx:${p.mx}`);
  if (p.my) parts.push(`--my:${p.my}`);
  if (p.mw) parts.push(`--mw:${p.mw}px`);
  if (p.mr !== undefined) parts.push(`--mr:${p.mr}deg`);
  if (p.blur) parts.push(`--f:blur(${p.blur}px)`);
  return [...parts, ...extra].join(';');
}

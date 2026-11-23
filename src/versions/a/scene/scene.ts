import * as THREE from 'three';
import { atlas, companies } from '../../../content/site';
import { GEO, stackOffsets } from '../../../lib/iso';
import { createBlock, type Block3D } from '../../../lib/three/blocks';
import { createStage } from '../../../lib/three/stage';
import { PAL, T, shadowFill, type Look } from '../palettes';
import { createGrid } from './grid';
import { createRig, type Pose } from './rig';
import { scrollToSection } from './stack';

/**
 * Layout box in page coordinates that ignores CSS transforms. The stacked sections scale down while they are
 * being covered, so measurements for the hero framing use layout offsets rather than on-screen rectangles.
 */
function layoutX(el: HTMLElement): { left: number; right: number } {
  let x = 0;
  let n: HTMLElement | null = el;
  while (n) {
    x += n.offsetLeft;
    n = n.offsetParent as HTMLElement | null;
  }
  return { left: x, right: x + el.offsetWidth };
}

/**
 * Version A scene: one fixed canvas behind the page. Three company towers stand left to right on a
 * timeline floor (Noesys, Pixis, Even) with the dashed Atlas tower floating beyond the end. Scroll
 * position picks a camera pose per section; the focused tower splits and its active block turns amber.
 *
 * Compact screens (≤900px) show the canvas as a band across the top of the screen instead, with the
 * text scrolling below it.
 */

type TowerId = 'noesys' | 'pixis' | 'even' | 'atlas';
type Step = 'hero' | TowerId | 'outro';

interface Tower {
  id: TowerId;
  base: THREE.Vector3;
  group: THREE.Group;
  /** Bottom block first: index 0 is block 03, index 2 is block 01. */
  blocks: Block3D[];
  split: number;
  lift: number;
  plinth: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  phase: number;
}

const SPACING = 4.4;
/** Extra distance between Even and the Atlas tower, which floats beyond the end of the timeline. */
const ATLAS_GAP = 1.8;
/** The timeline runs along this world axis, which the camera sees as screen-horizontal. */
const AXIS = new THREE.Vector3(1, 0, -1).normalize();
const ORDER: readonly TowerId[] = ['noesys', 'pixis', 'even', 'atlas'];
const COMPACT = '(max-width: 900px)';
/** Pointer events over these elements never hover or click the 3D towers. */
const NO_PICK = 'a, button, input, select, textarea, label, p, h1, h2, h3, h4, li, figure, img, .a-card, .a-header';

const isFocus = (s: Step): s is TowerId => s === 'even' || s === 'pixis' || s === 'noesys' || s === 'atlas';

function makeTower(id: TowerId, index: number): Tower {
  const base = AXIS.clone().multiplyScalar((index - 1) * SPACING + (id === 'atlas' ? ATLAS_GAP : 0));
  const group = new THREE.Group();
  group.position.copy(base);
  const dashed = id === 'atlas';
  const look: Look = id === 'atlas' ? 'side' : id === 'even' ? 'now' : 'idle';
  const p = PAL[look];
  const blocks = [0, 1, 2].map(() => {
    const b = createBlock({ palette: p, edge: p.edge, dashed });
    b.userData.mesh.userData.towerId = id;
    group.add(b);
    return b;
  });
  const plinth = new THREE.Mesh(
    new THREE.PlaneGeometry(GEO.w * GEO.shadowK, GEO.d * GEO.shadowK),
    new THREE.MeshBasicMaterial({ color: shadowFill(), transparent: true, depthWrite: false }),
  );
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.y = 0.004;
  group.add(plinth);
  return { id, base, group, blocks, split: 0, lift: dashed ? 0.7 : 0, plinth, phase: index * 1.9 };
}

export function startScene({ reduced }: { reduced: boolean }): void {
  const canvasEl = document.querySelector<HTMLCanvasElement>('.a3d-canvas');
  const overlayEl = document.querySelector<HTMLElement>('.a3d-overlay');
  if (!canvasEl || !overlayEl) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const overlay: HTMLElement = overlayEl;

  const root = document.documentElement;
  const compactQuery = window.matchMedia(COMPACT);
  let compact = compactQuery.matches;

  root.classList.add('a3d-pre', 'a3d-boot');
  const stage = createStage(canvas, { maxDpr: compact ? 1.5 : 1.75 });
  stage.renderer.setClearColor(T.ground, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const rig = createRig(camera);
  const grid = createGrid();
  scene.add(grid.mesh);

  const towers = ORDER.map((id, i) => makeTower(id, i));
  towers.forEach((t) => scene.add(t.group));
  const byId = new Map(towers.map((t) => [t.id, t] as const));
  const tower = (id: TowerId): Tower => byId.get(id) as Tower;
  const pickables = towers.flatMap((t) => t.blocks.map((b) => b.userData.mesh));

  const state = {
    step: 'hero' as Step,
    /** Active block (1 = top) per company, from the block row in view. */
    active: { even: 1, pixis: 1 } as Record<'even' | 'pixis', number>,
    /** Progress through the current company chapter, 0..1 (drives the orbit). */
    progress: 0.5,
    hover: null as TowerId | null,
    atlasHover: 0,
  };

  // ---- Looks per scroll step -------------------------------------------------------------------

  function desired(t: Tower): { looks: Look[]; opacity: number; split: number } {
    const base: Look = t.id === 'atlas' ? 'side' : t.id === 'even' ? 'now' : 'idle';
    let looks: Look[] = [base, base, base];
    let opacity = 1;
    let split = 0;
    const s = state.step;
    if (isFocus(s)) {
      if (s === t.id) {
        split = 1;
        if (t.id === 'noesys') looks = ['active', 'active', 'active'];
        else if (t.id === 'atlas') {
          if (state.atlasHover) looks[3 - state.atlasHover] = 'active';
        } else {
          looks = ['idle', 'idle', 'idle'];
          looks[3 - state.active[t.id]] = 'active';
        }
      } else {
        opacity = 0.28;
      }
    } else if (t.id === 'atlas') {
      // The hero shows the three companies only; Atlas appears when the camera pulls back at the end.
      opacity = s === 'hero' ? 0 : 0.55;
    }
    if (state.hover === t.id) {
      looks = looks.map((l) => (l === 'active' ? l : 'hover'));
      opacity = 1;
    }
    return { looks, opacity, split };
  }

  const at = (id: TowerId, y: number) => tower(id).base.clone().setY(y);

  const FOCUS_Y: Record<TowerId, number> = { even: 2.45, pixis: 2.45, noesys: 2.45, atlas: 3.15 };

  function poseFor(): Pose {
    const c = compact;
    const focus = { el: FOCUS_EL, dist: c ? 15 : 17.5, sx: 0.34, sy: c ? 0.6 : 0.53, grid: 9 };
    const s = state.step;
    if (isFocus(s)) {
      const fit = c ? null : (focusFit.get(s) ?? focusFit.set(s, fitFocus(s)).get(s));
      const az = (s === 'even' || s === 'pixis') && !reduced ? 35 + 20 * state.progress : 45;
      return { ...focus, ...fit, target: at(s, FOCUS_Y[s]), az };
    }
    switch (s) {
      case 'outro':
        outroSy ??= fitOutro();
        return { target: at('pixis', 1.6), az: 45, el: 40, dist: c ? 40 : 46, sx: 0.5, sy: outroSy, grid: 22 };
      case 'hero':
      default: {
        heroFit ??= fitHero();
        return { target: at('pixis', HERO.y), az: HERO.az, el: HERO.el, ...heroFit, grid: 16 };
      }
    }
  }

  // ---- Hero framing: fit the three towers and their tags beside the hero text ---------------------

  const HERO = { az: 45, el: 30, y: 1.8 } as const;
  const HERO_IDS = ['noesys', 'pixis', 'even'] as const;
  const STACK_TOP = 3 * GEO.h + 2 * GEO.gap + 0.08; // plus the idle float
  const MARGIN = 24;
  const fitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const fitVec = new THREE.Vector3();
  let heroFit: { dist: number; sx: number; sy: number } | null = null;

  /** Where the hero towers may go: beside the text column on desktop, inside the top band on compact screens. */
  function heroRegion(W: number, H: number) {
    const header = document.querySelector('.a-header')?.getBoundingClientRect().height ?? 73;
    if (compact) return { L: 16, R: W - 16, T: header + 10, B: H - 12, cx: W / 2 };
    const textEl = document.querySelector<HTMLElement>('.a-hero__text');
    const visualEl = document.querySelector<HTMLElement>('.a-hero__visual');
    const heroEl = document.getElementById('top');
    const text = textEl ? layoutX(textEl) : null;
    const visual = visualEl && visualEl.offsetWidth > 0 ? layoutX(visualEl) : null;
    // The hero is the first section, so its page position is the top of <main>, which never pins or scales.
    const mainTop = (document.getElementById('main')?.getBoundingClientRect().top ?? 0) + window.scrollY;
    const L = Math.max(text ? text.right + 40 : W * 0.5, MARGIN);
    const R = W - MARGIN - 8; // a little headroom for the idle float
    const top = heroEl ? mainTop : header;
    const bottom = heroEl ? mainTop + heroEl.offsetHeight : H;
    const T = Math.max(header + 24, top + 16);
    const B = Math.min(H - MARGIN, bottom - 16);
    const cx = visual ? (visual.left + visual.right) / 2 : (L + R) / 2;
    return { L, R, T, B, cx };
  }

  /** Screen bounds of the hero towers, tags and hint for a camera `dist` away, with no view offset. */
  function heroBounds(dist: number, W: number, H: number) {
    const target = at('pixis', HERO.y);
    const az = THREE.MathUtils.degToRad(HERO.az);
    const el = THREE.MathUtils.degToRad(HERO.el);
    fitCam.aspect = W / H;
    fitCam.clearViewOffset();
    fitCam.position.set(
      target.x + dist * Math.sin(az) * Math.cos(el),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(az) * Math.cos(el),
    );
    fitCam.lookAt(target);
    fitCam.updateMatrixWorld();
    fitCam.updateProjectionMatrix();
    const proj = (x: number, y: number, z: number): [number, number] => {
      fitVec.set(x, y, z).project(fitCam);
      return [((fitVec.x + 1) / 2) * W, ((1 - fitVec.y) / 2) * H];
    };

    const ext = (GEO.w / 2) * GEO.shadowK;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const grow = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    };
    const anchors = HERO_IDS.map((id) => {
      const b = tower(id).base;
      for (const dx of [-ext, ext]) for (const dz of [-ext, ext]) for (const y of [0, STACK_TOP]) grow(...proj(b.x + dx, y, b.z + dz));
      return proj(b.x + ext, 0, b.z + ext);
    });

    // Tags may be no wider than the gap between towers, so neighbours never collide.
    const xs = anchors.map(([x]) => x);
    const spacing = Math.min((xs[1] ?? 0) - (xs[0] ?? 0), (xs[2] ?? 0) - (xs[1] ?? 0));
    const tagWidth = Math.max(92, Math.floor(spacing - 16));
    HERO_IDS.forEach((id, i) => {
      const el = tags.get(id);
      const a = anchors[i];
      if (!el || !a) return;
      el.style.maxWidth = `${tagWidth}px`;
      grow(a[0] - el.offsetWidth / 2, a[1] + TAG_GAP);
      grow(a[0] + el.offsetWidth / 2, a[1] + TAG_GAP + el.offsetHeight);
    });
    if (hint && !compact) {
      const cx = (x0 + x1) / 2;
      const hy = y1 + HINT_GAP;
      grow(cx - hint.offsetWidth / 2, hy);
      grow(cx + hint.offsetWidth / 2, hy + hint.offsetHeight);
    }
    return { x0, x1, y0, y1 };
  }

  /** Pull the camera back until everything fits the region, then centre it there (on the visual column if possible). */
  function fitHero(): { dist: number; sx: number; sy: number } {
    const W = stage.width || window.innerWidth;
    const H = stage.height || window.innerHeight;
    const r = heroRegion(W, H);
    let dist = compact ? 27 : 34;
    let b = heroBounds(dist, W, H);
    for (let i = 0; i < 6; i++) {
      const scale = Math.max((b.x1 - b.x0) / Math.max(r.R - r.L, 1), (b.y1 - b.y0) / Math.max(r.B - r.T, 1));
      if (scale <= 1) break;
      dist *= scale * 1.02;
      b = heroBounds(dist, W, H);
    }
    const bw = b.x1 - b.x0;
    const lo = r.L + bw / 2;
    const hi = r.R - bw / 2;
    const cx = lo > hi ? (lo + hi) / 2 : Math.min(Math.max(r.cx, lo), hi);
    const cy = (r.T + r.B) / 2;
    const sx = 0.5 + (cx - (b.x0 + b.x1) / 2) / W;
    const sy = 0.5 + (cy - (b.y0 + b.y1) / 2) / H;
    const shift = { x: (sx - 0.5) * W, y: (sy - 0.5) * H };
    canvas.dataset.heroFit = [b.x0 + shift.x, b.x1 + shift.x, b.y0 + shift.y, b.y1 + shift.y, W, H]
      .map((n) => Math.round(n))
      .join(',');
    return { dist, sx, sy };
  }

  // ---- Closing framing: at the end of the page the towers stand where the contact emblem is ----------

  let outroSy: number | null = null;
  function fitOutro(): number {
    if (compact) return 0.5;
    const em = document.querySelector<HTMLElement>('.a-emblem');
    if (!em || em.offsetHeight === 0) return 0.3;
    const H = stage.height || window.innerHeight;
    const end = document.documentElement.scrollHeight - window.innerHeight;
    const r = em.getBoundingClientRect();
    const centre = r.top + window.scrollY - end + r.height / 2;
    return Math.min(0.5, Math.max(0.15, centre / H));
  }

  // ---- Focus framing: the tower in focus sits between the text column and its block labels ------------

  const FOCUS_EL = 24;
  const FOCUS_GAP = 32; // clear space between the text column and the tower
  const focusFit = new Map<TowerId, { dist: number; sx: number }>();

  /** Horizontal extent of a focused tower around its target point, in px, for a camera `dist` away. */
  function focusBounds(id: TowerId, dist: number, W: number, H: number): { l: number; r: number } {
    const target = at(id, FOCUS_Y[id]);
    const b = tower(id).base;
    const half = GEO.w / 2;
    const top = FOCUS_Y[id] * 2;
    // Even and Pixis orbit a little as the chapter scrolls, so allow for the whole swing.
    const azs = (id === 'even' || id === 'pixis') && !reduced ? [35, 45, 55] : [45];
    const el = THREE.MathUtils.degToRad(FOCUS_EL);
    let l = Infinity;
    let r = -Infinity;
    fitCam.aspect = W / H;
    fitCam.clearViewOffset();
    for (const azDeg of azs) {
      const az = THREE.MathUtils.degToRad(azDeg);
      fitCam.position.set(
        target.x + dist * Math.sin(az) * Math.cos(el),
        target.y + dist * Math.sin(el),
        target.z + dist * Math.cos(az) * Math.cos(el),
      );
      fitCam.lookAt(target);
      fitCam.updateMatrixWorld();
      fitCam.updateProjectionMatrix();
      for (const dx of [-half, half]) {
        for (const dz of [-half, half]) {
          for (const y of [0, top]) {
            fitVec.set(b.x + dx, y, b.z + dz).project(fitCam);
            const x = ((fitVec.x + 1) / 2) * W;
            l = Math.min(l, x);
            r = Math.max(r, x);
          }
        }
      }
    }
    return { l: l - W / 2, r: r - W / 2 };
  }

  /**
   * Place the focused tower just right of the text column with room for its block labels after it. The default
   * spot is kept when it already fits; on narrower screens the camera moves back until the tower and labels fit.
   */
  function fitFocus(id: TowerId): { dist: number; sx: number } {
    const W = stage.width || window.innerWidth;
    const H = stage.height || window.innerHeight;
    const base = { dist: 17.5, sx: W >= 1300 ? 0.7 : 0.64 };
    const col = document.querySelector<HTMLElement>(`#${id} .a-row__text`);
    if (!col || col.offsetWidth === 0) return base;
    const textRight = layoutX(col).right;
    setLabelText(id);
    const labelW = Math.max(160, ...labels.map((el) => el.offsetWidth));
    let fit = base;
    for (let dist = base.dist; dist <= base.dist * 2; dist *= 1.05) {
      const b = focusBounds(id, dist, W, H);
      const lo = textRight + FOCUS_GAP - b.l;
      const hi = W - MARGIN - LABEL_GAP - labelW - b.r;
      // If nothing fits, the text stays clear and the labels may run to the edge.
      fit = { dist, sx: lo / W };
      if (lo <= hi) return { dist, sx: Math.min(Math.max(base.sx * W, lo), hi) / W };
    }
    return fit;
  }

  // ---- HTML overlay: tower tags and block labels ---------------------------------------------

  const tags = new Map<TowerId, HTMLElement>();
  overlay.querySelectorAll<HTMLElement>('.a3d-tag').forEach((el) => {
    const id = el.dataset.tower as TowerId | undefined;
    if (id) tags.set(id, el);
  });
  const hint = overlay.querySelector<HTMLElement>('.a3d-hint');
  const TAG_GAP = 12;
  const LABEL_GAP = 16;
  const HINT_GAP = 14;
  const labels = Array.from(overlay.querySelectorAll<HTMLElement>('.a3d-blocklabel'));
  const labelNums = labels.map((el) => el.querySelector<HTMLElement>('.a3d-blocklabel__num'));
  const labelTitles = labels.map((el) => el.querySelector<HTMLElement>('.a3d-blocklabel__title'));
  let labelsFor: Step | null = null;

  function setLabelText(step: TowerId): void {
    if (labelsFor === step) return;
    labelsFor = step;
    const data =
      step === 'atlas'
        ? atlas.features.map((f) => ({ n: f.n, title: f.title }))
        : companies.find((c) => c.id === step)?.blocks.map((b) => ({ n: b.n, title: b.title }));
    labels.forEach((_, i) => {
      const d = data?.[i];
      const num = labelNums[i];
      const title = labelTitles[i];
      if (d && num && title) {
        num.textContent = d.n;
        title.textContent = d.title;
      }
    });
  }

  const scratch = new THREE.Vector3();
  function toScreen(x: number, y: number, z: number): [number, number] {
    scratch.set(x, y, z).project(camera);
    return [((scratch.x + 1) / 2) * stage.width, ((1 - scratch.y) / 2) * stage.height];
  }

  // The closing sections are solid sheets that slide up over the scene; tags and labels are clipped at their edge.
  const solidSheet = document.querySelector<HTMLElement>('.a-panel--solid');
  let overlayClip = '';

  function updateOverlay(): void {
    const s = state.step;
    const sheetTop = !compact && solidSheet ? solidSheet.getBoundingClientRect().top : Infinity;
    const clip = sheetTop < stage.height ? `inset(0 0 ${Math.ceil(stage.height - Math.max(0, sheetTop))}px 0)` : '';
    if (clip !== overlayClip) {
      overlayClip = clip;
      overlay.style.clipPath = clip;
    }
    const corner = (GEO.w / 2) * GEO.shadowK;
    let tagsBottom = -Infinity;
    let tagsLeft = Infinity;
    let tagsRight = -Infinity;
    for (const t of towers) {
      const el = tags.get(t.id);
      if (!el) continue;
      const show = (s === 'hero' && t.id !== 'atlas') || (state.hover === t.id && !compact);
      el.classList.toggle('is-shown', show);
      if (!show) continue;
      const p = t.group.position;
      const [x, y] = toScreen(p.x + corner, 0, p.z + corner);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + TAG_GAP).toFixed(1)}px, 0) translateX(-50%)`;
      if (s === 'hero') {
        tagsBottom = Math.max(tagsBottom, y + TAG_GAP + el.offsetHeight);
        tagsLeft = Math.min(tagsLeft, x);
        tagsRight = Math.max(tagsRight, x);
      }
    }
    if (hint) {
      // The 3D hint sits below the tower tags, never over a tower.
      const showHint = s === 'hero' && !compact && Number.isFinite(tagsBottom);
      hint.classList.toggle('is-shown', showHint);
      if (showHint) {
        const cx = (tagsLeft + tagsRight) / 2;
        hint.style.transform = `translate3d(${cx.toFixed(1)}px, ${(tagsBottom + HINT_GAP).toFixed(1)}px, 0) translateX(-50%)`;
      }
    }

    const focus = isFocus(s);
    if (focus) setLabelText(s);
    labels.forEach((el, i) => {
      el.classList.toggle('is-shown', focus);
      if (!isFocus(s)) return;
      const t = tower(s);
      const b = t.blocks[2 - i];
      if (!b) return;
      const p = t.group.position;
      const [x, y] = toScreen(p.x + GEO.w / 2, p.y + b.position.y, p.z - GEO.d / 2);
      el.style.transform = `translate3d(${(x + LABEL_GAP).toFixed(1)}px, ${y.toFixed(1)}px, 0) translateY(-50%)`;
      const n = i + 1;
      const active =
        s === 'noesys' || (s === 'atlas' ? state.atlasHover === n : state.active[s] === n);
      el.classList.toggle('is-active', active);
      el.classList.toggle('tone-accent', s === 'atlas');
    });
  }

  // ---- Step changes ------------------------------------------------------------------------------

  let cutTimer = 0;
  let pending: Step | null = null;

  function afterStepChange(): void {
    root.classList.toggle('a3d-band-off', compact && state.step === 'outro');
    if (state.step === 'outro') rig.resetPointer();
  }

  function setStep(step: Step): void {
    if (!reduced) {
      if (step === state.step) return;
      state.step = step;
      afterStepChange();
      return;
    }
    // Reduced motion: no camera travel. Fade out, cut to the new pose, fade back in.
    if (step === (pending ?? state.step)) return;
    pending = step;
    canvas.style.opacity = '0';
    overlay.style.opacity = '0';
    window.clearTimeout(cutTimer);
    cutTimer = window.setTimeout(() => {
      if (pending) state.step = pending;
      pending = null;
      rig.setGoal(poseFor(), true);
      afterStepChange();
      canvas.style.opacity = '';
      overlay.style.opacity = '';
    }, 170);
  }

  const stepTargets: [string, Step][] = [
    ['top', 'hero'],
    ['even', 'even'],
    ['pixis', 'pixis'],
    ['noesys', 'noesys'],
    ['atlas', 'atlas'],
    ['principles', 'outro'],
    ['toolkit', 'outro'],
    ['contact', 'outro'],
  ];

  const stepEls = stepTargets
    .map(([id, step]) => [document.getElementById(id), step] as const)
    .filter((e): e is readonly [HTMLElement, Step] => e[0] !== null);
  const rowEls = (['even', 'pixis'] as const).map(
    (company) =>
      [company, [1, 2, 3].map((n) => document.getElementById(`${company}-${n}`)).filter((el) => el !== null)] as const,
  );

  /**
   * Work out the step for the current scroll position. Sections sit in sticky panels that pin and get covered by the
   * next one, so this reads on-screen rectangles: the step is the last section whose top has passed the read line.
   */
  function stepFromScroll(): Step {
    const line = window.innerHeight * 0.55;
    let found: Step = 'hero';
    for (const [el, step] of stepEls) {
      if (el.getBoundingClientRect().top <= line) found = step;
    }
    return found;
  }

  /** Scroll-driven state: the step in focus, progress through a chapter, and the row (block) being read. */
  function sync(): void {
    const vh = window.innerHeight;
    const step = stepFromScroll();
    setStep(step);
    if (step === 'even' || step === 'pixis') {
      const r = document.getElementById(step)?.getBoundingClientRect();
      if (r && r.height > 0) state.progress = Math.min(1, Math.max(0, (vh * 0.55 - r.top) / r.height));
    }
    // On compact screens the top of the viewport is covered by the 3D band, so read lower down.
    const read = vh * (compact ? 0.66 : 0.4);
    for (const [company, rows] of rowEls) {
      let n = 1;
      rows.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= read) n = i + 1;
      });
      // Once the chapter has scrolled to its end it pins, so its last row may never reach the read line.
      const end = document.getElementById(company)?.getBoundingClientRect().bottom ?? Infinity;
      if (end <= vh + 1) n = rows.length;
      state.active[company] = n;
    }
  }

  let syncQueued = false;
  const queueSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      sync();
    });
  };
  window.addEventListener('scroll', queueSync, { passive: true });
  window.addEventListener('resize', queueSync, { passive: true });

  // ---- Atlas cards light their block -------------------------------------------------------------

  document.querySelectorAll<HTMLElement>('[data-atlas-card]').forEach((el) => {
    const n = Number(el.dataset.atlasCard);
    el.addEventListener('pointerenter', () => (state.atlasHover = n));
    el.addEventListener('pointerleave', () => {
      if (state.atlasHover === n) state.atlasHover = 0;
    });
  });

  // ---- Hover and click on towers -----------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(cx: number, cy: number): TowerId | null {
    const r = canvas.getBoundingClientRect();
    if (r.height < 2 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return (hit?.object.userData.towerId as TowerId | undefined) ?? null;
  }
  const blocked = (target: EventTarget | null) => target instanceof Element && target.closest(NO_PICK) !== null;
  const setHover = (id: TowerId | null) => {
    if (id === state.hover) return;
    state.hover = id;
    root.classList.toggle('a3d-hovering', id !== null);
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!reduced && state.step !== 'outro' && e.pointerType === 'mouse') {
        // In the hero, parallax is vertical only so the fitted framing never drifts off the side.
        const nx = state.step === 'hero' ? 0 : (e.clientX / window.innerWidth) * 2 - 1;
        rig.pointer(nx, (e.clientY / window.innerHeight) * 2 - 1);
      }
      setHover(blocked(e.target) ? null : pick(e.clientX, e.clientY));
    },
    { passive: true },
  );
  window.addEventListener('blur', () => setHover(null));
  document.documentElement.addEventListener('pointerleave', () => setHover(null));
  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || blocked(e.target)) return;
    const id = pick(e.clientX, e.clientY);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) scrollToSection(el);
  });

  compactQuery.addEventListener('change', (e) => {
    compact = e.matches;
    heroFit = null;
    outroSy = null;
    focusFit.clear();
    afterStepChange();
    rig.setGoal(poseFor(), true);
    sync();
  });
  stage.onResize(() => {
    heroFit = null;
    outroSy = null;
    focusFit.clear();
  });

  // ---- Frame loop ----------------------------------------------------------------------------------

  const tmp = new THREE.Color();
  const lerpColor = (c: THREE.Color, hex: string, k: number) => {
    tmp.set(hex);
    c.lerp(tmp, k);
  };
  let ready = false;

  stage.onFrame((time, dt) => {
    if (stage.height < 2) return;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    const ks = reduced ? 1 : 1 - Math.exp(-dt * 4);
    const floating = !reduced && state.step !== 'outro';

    for (const t of towers) {
      const want = desired(t);
      t.split += (want.split - t.split) * ks;
      const offs = stackOffsets(t.split);
      t.blocks.forEach((b, i) => {
        const p = PAL[want.looks[i] ?? 'idle'];
        const m = b.userData.material;
        lerpColor(m.uniforms.uTop.value, p.top, k);
        lerpColor(m.uniforms.uLeft.value, p.left, k);
        lerpColor(m.uniforms.uRight.value, p.right, k);
        m.uniforms.uOpacity.value += (want.opacity - m.uniforms.uOpacity.value) * k;
        m.depthWrite = m.uniforms.uOpacity.value > 0.98;
        const edges = b.userData.edges;
        if (edges) {
          const lm = edges.material as THREE.LineBasicMaterial;
          lerpColor(lm.color, p.edge, k);
          lm.opacity += (want.opacity - lm.opacity) * k;
        }
        b.position.y = t.lift + (offs[i] ?? 0) + GEO.h / 2;
      });
      const plinth = want.opacity < 0.05 ? 0 : want.opacity < 1 ? 0.35 : 1;
      t.plinth.material.opacity += (plinth - t.plinth.material.opacity) * k;
      t.group.position.y = floating ? Math.sin(time * 0.8 + t.phase) * 0.05 : 0;
    }

    // The first frame snaps straight to the pose for the current scroll position.
    rig.setGoal(poseFor(), !ready);
    const pose = rig.update(dt, stage.width, stage.height, !reduced);
    grid.update(pose.target, pose.grid);
    stage.renderer.render(scene, camera);
    updateOverlay();

    if (!ready) {
      ready = true;
      root.classList.add('a3d');
      root.classList.remove('a3d-boot');
      sync();
    }
  });

  state.step = stepFromScroll();
  afterStepChange();
  sync();
  stage.start();
  void document.fonts?.ready.then(() => {
    heroFit = null; // tag and label widths change once the fonts load
    outroSy = null;
    focusFit.clear();
    sync();
  });
}

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { atlas, companies, person } from '../../../content/site';
import { createStage } from '../../../lib/three/stage';
import { T } from '../palettes';
import { buildTown, type WorkBuilding } from '../town/build';
import {
  BOUNDS,
  DISTRICTS,
  HOME,
  PLOT,
  SQUARE,
  STOPS,
  WALK_Z,
  colliders,
  district,
  districtAt,
  groundAt,
  type DistrictId,
} from '../town/layout';
import { createWalker } from '../town/person';
import { createRig, type Pose } from './rig';
import { STACK_MEASURED, scrollReach, scrollToSection } from './stack';

/**
 * Version A scene: a small night town on one fixed canvas behind the page. A walker strolls down the main street
 * as the page scrolls, stopping in front of the building for the section being read: home, then the Even, Pixis
 * and Noesys districts, the Atlas construction site, and the square with the mailbox for the contact section.
 * "Explore the town" hides the page and lets the visitor walk around freely.
 *
 * Compact screens (≤900px) show the canvas as a band across the top of the screen instead, with the text scrolling
 * below it, and use a lighter renderer (no reflections, shadows or bloom).
 */

/**
 * Layout box in page coordinates that ignores CSS transforms. The stacked sections scale down while they are
 * being covered, so measurements for the camera framing use layout offsets rather than on-screen rectangles.
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

type Step = 'hero' | DistrictId | 'outro';
type Zone = DistrictId | 'home' | 'square';
type Pick = { district: DistrictId; index: number };

const COMPACT = '(max-width: 900px)';
/** The camera looks from (−x, +z), so the street (world +x) climbs to the right across the screen. */
const AZ = -45;
const HERO_EL = 33;
/** Pointer events over these elements never hover or click the town. */
const NO_PICK = 'a, button, input, select, textarea, label, p, h1, h2, h3, h4, li, figure, img, .a-card, .a-header';
const SIGNAL = new THREE.Color('#FFB547');
const COOL = new THREE.Color('#a9c1e6');
const AMBER = new THREE.Color('#ffb547');

const isDistrict = (s: Step): s is DistrictId => s === 'even' || s === 'pixis' || s === 'noesys' || s === 'atlas';

export function startScene({ reduced }: { reduced: boolean }): void {
  const canvasEl = document.querySelector<HTMLCanvasElement>('.a3d-canvas');
  const overlayEl = document.querySelector<HTMLElement>('.a3d-overlay');
  if (!canvasEl || !overlayEl) return;
  const canvas: HTMLCanvasElement = canvasEl;
  const overlay: HTMLElement = overlayEl;

  const root = document.documentElement;
  const compactQuery = window.matchMedia(COMPACT);
  let compact = compactQuery.matches;
  const params = new URLSearchParams(location.search);
  const high = !compact && params.get('quality') !== 'low' && (navigator.hardwareConcurrency ?? 4) >= 4;

  root.classList.add('a3d-pre', 'a3d-boot');
  const stage = createStage(canvas, { maxDpr: 1.5, alpha: false });
  const renderer = stage.renderer;
  renderer.setClearColor(T.ground, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  if (high) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  // The page ground colour after tone mapping. Fog (and, with the bloom pipeline, the background too) goes
  // through tone mapping, so it starts from the linear colour that comes out as exactly the page's #0A0D14.
  const toneGround = new THREE.Color().setRGB(0.009886, 0.011986, 0.017646, THREE.LinearSRGBColorSpace);
  const scene = new THREE.Scene();
  scene.background = high ? toneGround : new THREE.Color(T.ground);
  const fog = new THREE.Fog(toneGround, 40, 110);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const rig = createRig(camera);

  const town = buildTown({ quality: high ? 'high' : 'low' });
  scene.add(town.root);
  town.drawSigns();
  void document.fonts?.ready.then(() => town.drawSigns());

  const walker = createWalker();
  scene.add(walker.group);
  walker.pos.set(STOPS[0]?.x ?? 0, 0, WALK_Z);
  walker.yaw = -Math.PI / 4;

  // Where a click in free roam sends the walker.
  const target = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.36, 32),
    new THREE.MeshBasicMaterial({
      color: SIGNAL.clone().multiplyScalar(2),
      transparent: true,
      opacity: 0,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  target.rotation.x = -Math.PI / 2;
  scene.add(target);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (high) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.55, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const state = {
    step: 'hero' as Step,
    /** Position along the tour, in stops (0 = home, last = the square). */
    u: 0,
    hover: null as Pick | null,
    atlasHover: 0,
    roam: false,
    zone: null as Zone | null,
  };
  const lit = new Map<WorkBuilding, number>(town.work.map((w) => [w, 0]));
  let ready = false;

  // ---- Scroll tour: page position → place along the street ----------------------------------------------

  const anchorEls = STOPS.map((s) => (s.anchor ? document.getElementById(s.anchor) : null));
  let reach: number[] = STOPS.map((_, i) => i * 1000);

  function measureTour(): void {
    const line = window.innerHeight * (compact ? 0.68 : 0.5);
    const r = scrollReach(anchorEls, line);
    r[0] = 0;
    for (let i = 1; i < r.length; i++) r[i] = Math.max(r[i] ?? 0, (r[i - 1] ?? 0) + 1);
    reach = r;
  }

  function tourU(): number {
    const y = window.scrollY;
    for (let i = 0; i < reach.length - 1; i++) {
      const a = reach[i] ?? 0;
      const b = reach[i + 1] ?? a + 1;
      if (y < b) return i + Math.max(0, (y - a) / (b - a));
    }
    return reach.length - 1;
  }

  function tourX(u: number): number {
    const i = Math.min(Math.floor(u), STOPS.length - 1);
    const a = STOPS[i]?.x ?? 0;
    const b = STOPS[Math.min(i + 1, STOPS.length - 1)]?.x ?? a;
    return a + (b - a) * (u - i);
  }

  /** The building being read in a district (index), from the stop nearest the walker. */
  function activeIndex(d: DistrictId): number {
    const s = STOPS[Math.round(state.u)];
    return s && s.district === d ? s.index : -1;
  }

  // ---- Camera framing ------------------------------------------------------------------------------------

  const fitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  const fitVec = new THREE.Vector3();
  const TOWN_CENTER = new THREE.Vector3((BOUNDS.x0 + BOUNDS.x1) / 2, 1.5, -5);
  const MARGIN = 24;
  const TAG_Z = 2.9;
  const TAG_GAP = 10;
  const HINT_GAP = 14;
  let heroFit: { dist: number; sx: number; sy: number } | null = null;
  let outroSy: number | null = null;
  let focusX: number | null = null;

  const tags = new Map<DistrictId, HTMLElement>();
  overlay.querySelectorAll<HTMLElement>('.a3d-tag').forEach((el) => {
    const id = el.dataset.district as DistrictId | undefined;
    if (id) tags.set(id, el);
  });
  const hint = overlay.querySelector<HTMLElement>('.a3d-hint');

  function placeFitCam(at: THREE.Vector3, elDeg: number, dist: number, W: number, H: number): void {
    const az = THREE.MathUtils.degToRad(AZ);
    const el = THREE.MathUtils.degToRad(elDeg);
    fitCam.aspect = W / H;
    fitCam.clearViewOffset();
    fitCam.position.set(
      at.x + dist * Math.sin(az) * Math.cos(el),
      at.y + dist * Math.sin(el),
      at.z + dist * Math.cos(az) * Math.cos(el),
    );
    fitCam.lookAt(at);
    fitCam.updateMatrixWorld();
    fitCam.updateProjectionMatrix();
  }

  const project = (x: number, y: number, z: number, W: number, H: number): [number, number] => {
    fitVec.set(x, y, z).project(fitCam);
    return [((fitVec.x + 1) / 2) * W, ((1 - fitVec.y) / 2) * H];
  };

  /** Where the opening view may go: beside the hero text on desktop, inside the top band on compact screens. */
  function heroRegion(W: number, H: number) {
    const header = document.querySelector('.a-header')?.getBoundingClientRect().height ?? 73;
    if (compact) return { L: 12, R: W - 12, T: header + 8, B: H - 10 };
    const textEl = document.querySelector<HTMLElement>('.a-hero__text');
    const heroEl = document.getElementById('top');
    const text = textEl ? layoutX(textEl) : null;
    const mainTop = (document.getElementById('main')?.getBoundingClientRect().top ?? 0) + window.scrollY;
    const L = Math.max(text ? text.right + 32 : W * 0.5, MARGIN);
    const R = W - MARGIN;
    const top = Math.max(header + 16, mainTop + 8);
    const B = Math.min(H - MARGIN, heroEl ? mainTop + heroEl.offsetHeight - 8 : H);
    return { L, R, T: top, B };
  }

  /** Screen bounds of the whole town (and its district tags and the hint) for a camera `dist` away. */
  function heroBounds(dist: number, W: number, H: number) {
    placeFitCam(TOWN_CENTER, HERO_EL, dist, W, H);
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
    const corners = (cx: number, cz: number, hw: number, hd: number, y: number) => {
      for (const dx of [-hw, hw]) for (const dz of [-hd, hd]) grow(...project(cx + dx, y, cz + dz, W, H));
    };
    corners(HOME.x, HOME.z, HOME.w / 2, HOME.d / 2, 0);
    corners(HOME.x, HOME.z, HOME.w / 2, HOME.d / 2, HOME.h + 1.3);
    for (const d of DISTRICTS) {
      corners(d.cx, (PLOT.z0 + PLOT.z1) / 2, 5.4, (PLOT.z1 - PLOT.z0) / 2, 0);
      corners(d.hq.x, d.hq.z, d.hq.w / 2, d.hq.d / 2, PLOT.h + d.hq.h + 2.4);
      const tag = tags.get(d.id);
      if (tag) {
        const [tx, ty] = project(d.cx, 0, TAG_Z, W, H);
        grow(tx - tag.offsetWidth / 2, ty + TAG_GAP);
        grow(tx + tag.offsetWidth / 2, ty + TAG_GAP + tag.offsetHeight);
      }
    }
    corners(SQUARE.x, SQUARE.z, 3, 2, 0);
    corners(SQUARE.x, SQUARE.z, 3, 2, 2.4);
    if (hint && !compact) {
      const cx = (x0 + x1) / 2;
      grow(cx - hint.offsetWidth / 2, y1 + HINT_GAP);
      grow(cx + hint.offsetWidth / 2, y1 + HINT_GAP + hint.offsetHeight);
    }
    return { x0, x1, y0, y1 };
  }

  /** Pull the camera in or back until the whole town fits the region, then centre it there. */
  function fitHero(): { dist: number; sx: number; sy: number } {
    const W = stage.width || window.innerWidth;
    const H = stage.height || window.innerHeight;
    const r = heroRegion(W, H);
    let dist = compact ? 70 : 80;
    let b = heroBounds(dist, W, H);
    for (let i = 0; i < 8; i++) {
      const scale = Math.max((b.x1 - b.x0) / Math.max(r.R - r.L, 1), (b.y1 - b.y0) / Math.max(r.B - r.T, 1));
      if (Math.abs(scale - 1) < 0.01) break;
      dist *= scale * 1.01;
      b = heroBounds(dist, W, H);
    }
    const cx = (r.L + r.R) / 2;
    const cy = (r.T + r.B) / 2;
    return {
      dist,
      sx: 0.5 + (cx - (b.x0 + b.x1) / 2) / W,
      sy: 0.5 + (cy - (b.y0 + b.y1) / 2) / H,
    };
  }

  /** Right edge of the text column on desktop: labels never sit over it. */
  let textEdge = 0;

  /** Horizontal place of the walker while reading a district: the middle of the space beside the text. */
  function fitFocus(): number {
    const W = stage.width || window.innerWidth;
    const col = document.querySelector<HTMLElement>('.a-row__text');
    if (compact || !col || col.offsetWidth === 0) {
      textEdge = 0;
      return 0.66;
    }
    textEdge = layoutX(col).right + 12;
    return Math.max(0.5, (textEdge + 12 + W - MARGIN) / 2 / W);
  }

  /** At the end of the page the walker stands where the contact emblem is, just above the title. */
  function fitOutro(): number {
    if (compact) return 0.55;
    const em = document.querySelector<HTMLElement>('.a-emblem');
    if (!em || em.offsetHeight === 0) return 0.3;
    const H = stage.height || window.innerHeight;
    const end = document.documentElement.scrollHeight - window.innerHeight;
    const r = em.getBoundingClientRect();
    const centre = r.top + window.scrollY - end + r.height * 0.5;
    return Math.min(0.5, Math.max(0.15, centre / H));
  }

  const poseTarget = new THREE.Vector3();
  function poseFor(): Pose {
    const c = compact;
    const p = walker.pos;
    if (state.roam) {
      return {
        target: poseTarget.set(p.x + 0.6, 1.2, p.z - 0.6),
        az: AZ,
        el: 34,
        dist: c ? 15 : 18,
        sx: 0.5,
        sy: c ? 0.52 : 0.55,
        grid: 0,
      };
    }
    switch (state.step) {
      case 'hero':
        heroFit ??= fitHero();
        return { target: TOWN_CENTER, az: AZ, el: HERO_EL, ...heroFit, grid: 0 };
      case 'outro':
        outroSy ??= fitOutro();
        return {
          target: poseTarget.set(SQUARE.x - 0.3, 1.1, SQUARE.z + 0.9),
          az: AZ,
          el: 24,
          dist: c ? 22 : 27,
          sx: 0.5,
          sy: outroSy,
          grid: 0,
        };
      default:
        focusX ??= fitFocus();
        // Frame the whole district (headquarters, its three buildings and the walker in front of them).
        return {
          target: poseTarget.set(p.x + 0.6, 2.7, -5.6),
          az: AZ,
          el: 25,
          dist: c ? 27 : 31,
          sx: c ? 0.5 : focusX,
          sy: c ? 0.56 : 0.52,
          grid: 0,
        };
    }
  }

  // ---- Overlay: district tags, building labels, hint ------------------------------------------------------

  const labels = Array.from(overlay.querySelectorAll<HTMLElement>('.a3d-blocklabel'));
  const labelTitles = labels.map((el) => el.querySelector<HTMLElement>('.a3d-blocklabel__title'));
  let labelsFor: DistrictId | null = null;

  function setLabelText(d: DistrictId): void {
    if (labelsFor === d) return;
    labelsFor = d;
    const titles =
      d === 'atlas'
        ? atlas.features.map((f) => f.title)
        : (companies.find((c) => c.id === d)?.blocks.map((b) => b.title) ?? []);
    labelTitles.forEach((el, i) => {
      if (el) el.textContent = titles[i] ?? '';
    });
  }

  const scratch = new THREE.Vector3();
  function toScreen(x: number, y: number, z: number): [number, number] {
    scratch.set(x, y, z).project(camera);
    return [((scratch.x + 1) / 2) * stage.width, ((1 - scratch.y) / 2) * stage.height];
  }

  // The closing sections are solid sheets that slide up over the scene; tags and labels are clipped at their edge.
  const solidSheet = document.querySelector<HTMLElement>('.a-panel--solid');
  const roamBtn = overlay.querySelector<HTMLButtonElement>('.a3d-roam-btn');
  let overlayClip = '';

  function updateOverlay(): void {
    const s = state.step;
    const sheetTop = !compact && !state.roam && solidSheet ? solidSheet.getBoundingClientRect().top : Infinity;
    const clip = sheetTop < stage.height ? `inset(0 0 ${Math.ceil(stage.height - Math.max(0, sheetTop))}px 0)` : '';
    if (clip !== overlayClip) {
      overlayClip = clip;
      overlay.style.clipPath = clip;
    }

    const showTags = s === 'hero' && !state.roam;
    let tagsBottom = -Infinity;
    let tagsLeft = Infinity;
    let tagsRight = -Infinity;
    for (const d of DISTRICTS) {
      const el = tags.get(d.id);
      if (!el) continue;
      el.classList.toggle('is-shown', showTags);
      if (!showTags) continue;
      const [x, y] = toScreen(d.cx, 0, TAG_Z);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + TAG_GAP).toFixed(1)}px, 0) translateX(-50%)`;
      tagsBottom = Math.max(tagsBottom, y + TAG_GAP + el.offsetHeight);
      tagsLeft = Math.min(tagsLeft, x);
      tagsRight = Math.max(tagsRight, x);
    }
    if (hint) {
      const showHint = showTags && !compact && Number.isFinite(tagsBottom);
      hint.classList.toggle('is-shown', showHint);
      if (showHint) {
        const cx = (tagsLeft + tagsRight) / 2;
        hint.style.transform = `translate3d(${cx.toFixed(1)}px, ${(tagsBottom + HINT_GAP).toFixed(1)}px, 0) translateX(-50%)`;
      }
    }

    const fd: DistrictId | null = isDistrict(s) && !state.roam ? s : null;
    if (fd) setLabelText(fd);
    labels.forEach((el, i) => {
      if (!fd) {
        el.classList.remove('is-shown');
        return;
      }
      const b = district(fd).work[i];
      const [x, y] = b ? toScreen(b.x, PLOT.h + b.h + 0.35, b.z) : [0, 0];
      // Hidden while its building is still behind the text column.
      el.classList.toggle('is-shown', Boolean(b) && x - el.offsetWidth / 2 > textEdge);
      if (!b) return;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      const active =
        fd === 'noesys' ||
        (fd === 'atlas' ? state.atlasHover === i + 1 : activeIndex(fd) === i) ||
        (state.hover?.district === fd && state.hover.index === i);
      el.classList.toggle('is-active', active);
      el.classList.toggle('tone-accent', fd === 'atlas');
    });

    roamBtn?.classList.toggle('is-shown', ready && !state.roam && s !== 'outro');
  }

  // ---- Steps (which part of the page is in view) ------------------------------------------------------------

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
    // Reduced motion: no camera travel. Fade out, cut to the new view, fade back in.
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

  function stepFromScroll(): Step {
    const line = window.innerHeight * 0.55;
    let found: Step = 'hero';
    for (const [el, step] of stepEls) {
      if (el.getBoundingClientRect().top <= line) found = step;
    }
    return found;
  }

  function sync(): void {
    if (state.roam) return;
    setStep(stepFromScroll());
    state.u = tourU();
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
  window.addEventListener(STACK_MEASURED, () => {
    measureTour();
    queueSync();
  });

  // ---- Atlas cards light their building ---------------------------------------------------------------------

  document.querySelectorAll<HTMLElement>('[data-atlas-card]').forEach((el) => {
    const n = Number(el.dataset.atlasCard);
    el.addEventListener('pointerenter', () => (state.atlasHover = n));
    el.addEventListener('pointerleave', () => {
      if (state.atlasHover === n) state.atlasHover = 0;
    });
  });

  // ---- Hover and click ----------------------------------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function aim(cx: number, cy: number): boolean {
    const r = canvas.getBoundingClientRect();
    if (r.height < 2 || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return true;
  }
  function pick(cx: number, cy: number): Pick | null {
    if (!aim(cx, cy)) return null;
    const h = raycaster.intersectObjects(town.pickables, false)[0];
    return (h?.object.userData.pick as Pick | undefined) ?? null;
  }
  const blocked = (t: EventTarget | null) => t instanceof Element && t.closest(NO_PICK) !== null;
  const setHover = (h: Pick | null) => {
    if (h?.district === state.hover?.district && h?.index === state.hover?.index) return;
    state.hover = h;
    root.classList.toggle('a3d-hovering', h !== null);
  };

  /** The page section for a building: its block row, or the district itself for a headquarters. */
  function sectionFor(h: Pick): HTMLElement | null {
    if (h.index < 0 || h.district === 'noesys') return document.getElementById(h.district);
    if (h.district === 'atlas') return document.getElementById(atlas.features[h.index]?.id ?? 'atlas');
    return document.getElementById(`${h.district}-${h.index + 1}`);
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!reduced && !state.roam && state.step !== 'outro' && e.pointerType === 'mouse') {
        const nx = state.step === 'hero' ? 0 : (e.clientX / window.innerWidth) * 2 - 1;
        rig.pointer(nx * 0.5, ((e.clientY / window.innerHeight) * 2 - 1) * 0.5);
      }
      setHover(state.roam || blocked(e.target) ? null : pick(e.clientX, e.clientY));
    },
    { passive: true },
  );
  window.addEventListener('blur', () => setHover(null));
  document.documentElement.addEventListener('pointerleave', () => setHover(null));
  window.addEventListener('click', (e) => {
    if (state.roam || e.defaultPrevented || blocked(e.target)) return;
    const h = pick(e.clientX, e.clientY);
    const el = h ? sectionFor(h) : null;
    if (el) scrollToSection(el);
  });

  // ---- Free roam ------------------------------------------------------------------------------------------

  const hud = overlay.querySelector<HTMLElement>('.a3d-roam');
  const exitBtn = overlay.querySelector<HTMLButtonElement>('.a3d-roam__exit');
  const card = overlay.querySelector<HTMLElement>('.a3d-roam__card');
  const cardEyebrow = overlay.querySelector<HTMLElement>('.a3d-roam__eyebrow');
  const cardTitle = overlay.querySelector<HTMLElement>('.a3d-roam__title');
  const cardMeta = overlay.querySelector<HTMLElement>('.a3d-roam__meta');
  const cardGo = overlay.querySelector<HTMLAnchorElement>('.a3d-roam__go');
  const keys = new Set<string>();
  const walls = colliders();
  const RADIUS = 0.32;
  const FWD = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const RIGHT = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
  let goal: THREE.Vector3 | null = null;
  let goalFade = 0;
  let pop = 1;

  function enterRoam(): void {
    if (state.roam || !hud) return;
    state.roam = true;
    root.classList.add('a-roam');
    hud.hidden = false;
    hud.focus({ preventScroll: true });
    setHover(null);
    rig.resetPointer();
    state.zone = null;
    updateZone(true);
  }

  function exitRoam(section?: HTMLElement | null): void {
    if (!state.roam || !hud) return;
    state.roam = false;
    root.classList.remove('a-roam');
    hud.hidden = true;
    keys.clear();
    goal = null;
    // Back onto the tour: the walker reappears at the place for the current scroll position.
    walker.pos.set(tourX(state.u), 0, WALK_Z);
    pop = 0;
    sync();
    if (section) scrollToSection(section);
    else if (roamBtn) {
      // Show the button straight away (the overlay updates on the next frame) so focus can return to it.
      roamBtn.classList.add('is-shown');
      roamBtn.focus({ preventScroll: true });
    }
  }

  roamBtn?.addEventListener('click', enterRoam);
  exitBtn?.addEventListener('click', () => exitRoam());
  cardGo?.addEventListener('click', (e) => {
    const href = cardGo.getAttribute('href') ?? '';
    if (!href.startsWith('#')) return; // mailto and other links behave normally
    e.preventDefault();
    exitRoam(document.getElementById(href.slice(1)));
  });

  const keyFor = (e: KeyboardEvent): string | null => {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        return 'up';
      case 'ArrowDown':
      case 'KeyS':
        return 'down';
      case 'ArrowLeft':
      case 'KeyA':
        return 'left';
      case 'ArrowRight':
      case 'KeyD':
        return 'right';
      case 'ShiftLeft':
      case 'ShiftRight':
        return 'run';
      default:
        return null;
    }
  };
  window.addEventListener('keydown', (e) => {
    if (!state.roam) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      exitRoam();
      return;
    }
    const onControl = e.target instanceof Element && e.target.closest('a, button') !== null;
    if (e.code === 'Space' && !onControl) {
      e.preventDefault();
      if (!e.repeat) walker.jump();
      return;
    }
    const k = keyFor(e);
    if (!k) return;
    e.preventDefault();
    keys.add(k);
    if (k !== 'run') goal = null;
  });
  window.addEventListener('keyup', (e) => {
    const k = keyFor(e);
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.roam || !aim(e.clientX, e.clientY)) return;
    const h = raycaster.intersectObjects(town.pickables, false)[0];
    const p = h?.object.userData.pick as Pick | undefined;
    let next: THREE.Vector3 | null = null;
    if (p) {
      // Walk to the front of the building that was clicked.
      const d = district(p.district);
      const b = p.index >= 0 ? d.work[p.index] : d.hq;
      if (b) next = new THREE.Vector3(b.x, 0, b.z + b.d / 2 + 0.7);
    } else if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      next = hit.clone();
    }
    if (!next) return;
    next.x = THREE.MathUtils.clamp(next.x, BOUNDS.x0, BOUNDS.x1);
    next.z = THREE.MathUtils.clamp(next.z, BOUNDS.z0, BOUNDS.z1);
    goal = next;
    target.position.set(next.x, groundAt(next.x, next.z) + 0.02, next.z);
    goalFade = 1;
  });

  const isBlocked = (x: number, z: number) =>
    walls.some((b) => Math.abs(x - b.x) < b.w / 2 + RADIUS && Math.abs(z - b.z) < b.d / 2 + RADIUS);

  const move = new THREE.Vector3();
  /** Free-roam movement for one frame. Returns the distance walked. */
  function roamStep(dt: number): number {
    move.set(0, 0, 0);
    if (keys.has('up')) move.add(FWD);
    if (keys.has('down')) move.sub(FWD);
    if (keys.has('right')) move.add(RIGHT);
    if (keys.has('left')) move.sub(RIGHT);
    let limit = Infinity;
    if (move.lengthSq() > 0) {
      move.normalize();
    } else if (goal) {
      move.subVectors(goal, walker.pos).setY(0);
      limit = move.length();
      if (limit < 0.06) {
        goal = null;
        move.set(0, 0, 0);
      } else move.divideScalar(limit);
    }
    if (move.lengthSq() === 0) return 0;
    const speed = keys.has('run') ? 7.5 : 3.9;
    const stepLen = Math.min(speed * dt, limit);
    const p = walker.pos;
    const x0 = p.x;
    const z0 = p.z;
    const nx = THREE.MathUtils.clamp(p.x + move.x * stepLen, BOUNDS.x0, BOUNDS.x1);
    if (!isBlocked(nx, p.z)) p.x = nx;
    const nz = THREE.MathUtils.clamp(p.z + move.z * stepLen, BOUNDS.z0, BOUNDS.z1);
    if (!isBlocked(p.x, nz)) p.z = nz;
    const moved = Math.hypot(p.x - x0, p.z - z0);
    if (moved < stepLen * 0.2 && goal) goal = null; // walked into a wall: give up on the click target
    walker.turnTo(Math.atan2(move.x, move.z), dt);
    return moved;
  }

  function zoneAt(x: number, z: number): Zone | null {
    if (Math.abs(x - HOME.x) < 4.5 && z < 2.5) return 'home';
    if (Math.abs(x - SQUARE.x) < 4.5 && z < 3.5) return 'square';
    return districtAt(x, z);
  }

  function updateZone(force = false): void {
    const zone = zoneAt(walker.pos.x, walker.pos.z);
    if (zone === state.zone && !force) return;
    state.zone = zone;
    if (!card || !cardEyebrow || !cardTitle || !cardMeta || !cardGo) return;
    card.hidden = zone === null;
    if (!zone) return;
    if (zone === 'home') {
      cardEyebrow.textContent = 'Home';
      cardTitle.textContent = person.name;
      cardMeta.textContent = person.title;
      cardGo.textContent = 'Back to the top';
      cardGo.href = '#top';
    } else if (zone === 'square') {
      cardEyebrow.textContent = 'The square';
      cardTitle.textContent = 'Let’s talk';
      cardMeta.textContent = 'Email is the fastest way to reach me.';
      cardGo.textContent = 'Email me';
      cardGo.href = `mailto:${person.email}`;
    } else if (zone === 'atlas') {
      cardEyebrow.textContent = 'Side project · under construction';
      cardTitle.textContent = atlas.name;
      cardMeta.textContent = atlas.role;
      cardGo.textContent = `Read about ${atlas.name}`;
      cardGo.href = '#atlas';
    } else {
      const c = companies.find((x) => x.id === zone);
      const n = DISTRICTS.findIndex((d) => d.id === zone) + 1;
      cardEyebrow.textContent = `District ${String(n).padStart(2, '0')}${c?.domain ? ` · ${c.domain}` : ''}`;
      cardTitle.textContent = c?.name ?? zone;
      cardMeta.textContent = `${c?.role ?? ''} · ${c?.period ?? ''}`;
      cardGo.textContent = `Read about ${c?.name ?? zone}`;
      cardGo.href = `#${zone}`;
    }
  }

  compactQuery.addEventListener('change', (e) => {
    compact = e.matches;
    heroFit = null;
    outroSy = null;
    focusX = null;
    afterStepChange();
    measureTour();
    rig.setGoal(poseFor(), true);
    sync();
  });
  stage.onResize((w, h) => {
    heroFit = null;
    outroSy = null;
    focusX = null;
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(w, h);
    bloom?.resolution.set(w / 2, h / 2);
  });

  // ---- Frame loop ---------------------------------------------------------------------------------------------

  let greetUntil = 4;

  stage.onFrame((time, dt) => {
    if (stage.height < 2) return;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6);

    // Walker
    let moved = 0;
    let wave = false;
    if (state.roam) {
      moved = roamStep(dt);
      if (moved > 0) updateZone();
    } else {
      const u = state.u;
      const nearest = STOPS[Math.min(STOPS.length - 1, Math.max(0, Math.round(u)))];
      // With reduced motion the walker jumps to a stop only once its section has been reached.
      const reached = STOPS[Math.min(STOPS.length - 1, Math.floor(u + 1e-3))];
      const tx = reduced && reached ? reached.x : tourX(u);
      const dx = tx - walker.pos.x;
      // Walk at a stroll, faster when far behind (a long jump down the page); snap when motion is reduced.
      const maxStep = Math.max(2.6, Math.abs(dx) * 3.2) * dt;
      const stepX = reduced ? dx : THREE.MathUtils.clamp(dx, -maxStep, maxStep);
      walker.pos.x += stepX;
      walker.pos.z = WALK_Z;
      moved = reduced ? 0 : Math.abs(stepX);
      if (moved > 0.002) {
        walker.turnTo(stepX > 0 ? Math.PI / 2 : -Math.PI / 2, dt);
      } else if (nearest) {
        // At a stop: look at the building, or turn to the camera at home and at the square.
        walker.turnTo(nearest.greet ? -Math.PI / 4 : -2.75, dt, reduced);
        const last = nearest === STOPS[STOPS.length - 1];
        wave = nearest.greet && Math.abs(dx) < 0.05 && (last || time < greetUntil);
      }
    }
    if (pop < 1) pop = Math.min(1, pop + dt * 4);
    walker.group.scale.setScalar(0.2 + 0.8 * (1 - (1 - pop) ** 3));
    walker.update({
      dt,
      time,
      moved,
      wave,
      ground: groundAt(walker.pos.x, walker.pos.z),
      marker: state.step === 'hero' && !state.roam ? 1 : 0,
    });
    goalFade = goal ? 1 : Math.max(0, goalFade - dt * 3);
    (target.material as THREE.MeshBasicMaterial).opacity = goalFade * 0.9;

    // Buildings: windows warm up and the neon foot lights while a building's section is read.
    const s = state.step;
    for (const w of town.work) {
      let on = 0;
      if (state.roam) {
        on = state.zone === w.district && Math.abs(walker.pos.x - w.box.x) < 1.6 && walker.pos.z > w.box.z ? 1 : 0;
      } else if (s === w.district) {
        if (w.district === 'noesys') on = 1;
        else if (w.district === 'atlas') on = state.atlasHover === w.index + 1 ? 1 : 0;
        else on = activeIndex(w.district) === w.index ? 1 : 0;
      }
      const hovered = state.hover?.district === w.district && state.hover.index === w.index;
      const was = lit.get(w) ?? 0;
      const level = was + (Math.max(on, hovered ? 0.6 : 0) - was) * k;
      lit.set(w, level);
      for (const m of w.walls) {
        m.emissive.lerpColors(COOL, AMBER, level);
        m.emissiveIntensity = 0.5 + level * 1.5;
      }
      w.strip.material.opacity = level;
      if (w.outline) w.outline.material.color.set(district(w.district).color).lerp(AMBER, level);
    }

    // The first frame snaps straight to the view for the current scroll position.
    rig.setGoal(poseFor(), !ready);
    const pose = rig.update(dt, stage.width, stage.height, !reduced);
    // Fog starts a little past what the camera is looking at, so far streets fade into the page.
    fog.near = pose.dist * 0.9;
    fog.far = pose.dist * 2.4;
    town.update(time);

    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    updateOverlay();

    if (!ready) {
      ready = true;
      greetUntil = time + 4;
      root.classList.add('a3d');
      root.classList.remove('a3d-boot');
      sync();
    }
  });

  measureTour();
  state.step = stepFromScroll();
  state.u = tourU();
  walker.pos.x = tourX(state.u);
  afterStepChange();
  stage.start();
  void document.fonts?.ready.then(() => {
    heroFit = null; // tag widths change once the fonts load
    outroSy = null;
    focusX = null;
    measureTour();
    sync();
  });
}

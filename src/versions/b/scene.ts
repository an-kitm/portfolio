import * as THREE from 'three';
import gsap from 'gsap';
import { createStage, type Stage } from '../../lib/three/stage';
import { createBlock, ISO_EULER, type BlockOptions, type IsoMaterial } from '../../lib/three/blocks';
import { facesFor, GEO } from '../../lib/iso';
import type { CompanyId } from '../../content/site';
import { ATLAS_DARK, ATLAS_PAPER, B, COMPANY_COLOUR } from './decor';

/**
 * Version B's 3D layer.
 *
 * Every `.b3d` element in the page is a layout box holding a static isometric drawing. One transparent, fixed
 * canvas draws a real block in each box: an orthographic camera works in CSS pixels, so a block is placed at its
 * box's centre and scaled to its width every frame. CSS decides where things go (desktop and phone).
 *
 * Sections stack (see ui.ts), so each section's blocks are drawn only inside that section's visible strip of the
 * screen, using one scissored render pass per visible section. Blocks in a section that is being covered dim
 * along with it.
 */

type Entrance = 'rise' | 'cluster' | 'drop' | 'pop';

type Obj = {
  el: HTMLElement;
  group: string;
  panel: number;
  entrance: Entrance;
  outer: THREE.Group;
  inner: THREE.Group;
  mats: IsoMaterial[];
  /** Projected width of the block(s) in world units, and the share of the box width the drawing fills. */
  projW: number;
  frac: number;
  depth: number;
  /** In-plane rotation from the CSS `--rot` value, in radians. */
  rot: number;
  phase: number;
  speed: number;
  amp: number;
  enter: { v: number };
  cx: number;
  cy: number;
  w: number;
  show: boolean;
};

const isCompany = (v: string): v is CompanyId => v === 'even' || v === 'pixis' || v === 'noesys';
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function makeInner(el: HTMLElement): THREE.Group {
  const kind = el.dataset.b3d ?? 'slab';
  const palette = el.dataset.palette ?? 'even';
  const k = Number(el.dataset.k ?? 0);
  const edge = el.dataset.edge ?? 'colour';
  const blurred = Number(el.dataset.blur ?? 0) > 0;
  const inner = new THREE.Group();

  // B rotates each block into the isometric view, so faces are painted in the block's own frame.
  const add = (o: BlockOptions, y0: number) => {
    const block = createBlock({ ...o, shading: 'object' });
    block.position.y = y0 + (o.h ?? GEO.h) / 2;
    inner.add(block);
  };

  if (kind === 'tower') {
    add({ palette: facesFor(B.noesys), edge: B.ink, edgeOpacity: 0.35 }, 0);
    add({ palette: facesFor(B.pixis), edge: B.ink, edgeOpacity: 0.35 }, 1.2);
    add({ palette: facesFor(B.even), edge: B.ink, edgeOpacity: 0.35 }, 2.4);
    add({ palette: ATLAS_PAPER, edge: B.ink, edgeOpacity: 0.9, dashed: true }, 4.2);
  } else if (kind === 'cube') {
    const base = isCompany(palette) ? COMPANY_COLOUR[palette] : B.even;
    add({ palette: facesFor(base, 0.3), h: 2, opacity: blurred ? 0.55 : 1 }, 0);
  } else if (kind === 'atlas') {
    const dark = palette === 'atlas-dark';
    add(
      {
        palette: dark ? ATLAS_DARK : ATLAS_PAPER,
        edge: dark ? '#FFFFFF' : B.ink,
        edgeOpacity: dark ? 0.75 : 0.9,
        dashed: true,
      },
      0,
    );
  } else {
    const base = isCompany(palette) ? COMPANY_COLOUR[palette] : B.even;
    const onPaper = edge === 'paper';
    add({ palette: facesFor(base, k), edge: onPaper ? B.ink : '#FFFFFF', edgeOpacity: onPaper ? 0.35 : 0.55 }, 0);
  }
  inner.rotation.copy(ISO_EULER);
  return inner;
}

function entranceFor(group: string, kind: string): Entrance {
  if (group === 'hero') return 'rise';
  if (group === 'footer' || group === 'atlas') return 'drop';
  return kind === 'cube' ? 'pop' : 'cluster';
}

export function startScene({ reduced }: { reduced: boolean }): void {
  const canvas = document.querySelector<HTMLCanvasElement>('.b-canvas');
  const anchors = Array.from(document.querySelectorAll<HTMLElement>('.b3d'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.b-panel'));
  if (!canvas || anchors.length === 0) return;

  let stage: Stage;
  try {
    stage = createStage(canvas, { maxDpr: 2 });
  } catch (err) {
    console.warn('[portfolio] WebGL renderer could not start, keeping the static drawings.', err);
    return;
  }
  const renderer = stage.renderer;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
  camera.position.set(0, 0, 4000);

  const objs: Obj[] = anchors.map((el, i) => {
    const kind = el.dataset.b3d ?? 'slab';
    const group = el.dataset.group ?? 'hero';
    const inner = makeInner(el);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.set(-centre.x, -centre.y, -centre.z);
    pivot.add(inner);
    const outer = new THREE.Group();
    outer.add(pivot);
    outer.visible = false;
    scene.add(outer);
    const mats: IsoMaterial[] = [];
    inner.traverse((node) => {
      const m = (node as THREE.Mesh).material as IsoMaterial | undefined;
      if (m && 'uniforms' in m && m.uniforms.uDim) mats.push(m);
    });
    const host = el.closest<HTMLElement>('.b-panel');
    return {
      el,
      group,
      panel: host ? panels.indexOf(host) : -1,
      entrance: entranceFor(group, kind),
      outer,
      inner,
      mats,
      projW: size.x || 1,
      frac: Number(el.dataset.frac ?? 0.97),
      depth: Number(el.dataset.depth ?? 1),
      rot: 0,
      phase: i * 1.73,
      speed: kind === 'cube' ? 0.85 + (i % 5) * 0.11 : 0.5 + (i % 4) * 0.07,
      amp: kind === 'cube' ? 9 : kind === 'tower' ? 5 : 7,
      enter: { v: reduced ? 1 : 0 },
      cx: 0,
      cy: 0,
      w: 0,
      show: false,
    };
  });

  const byPanel = new Map<number, Obj[]>();
  for (const o of objs) byPanel.set(o.panel, [...(byPanel.get(o.panel) ?? []), o]);

  const readRotations = () => {
    for (const o of objs) {
      const deg = parseFloat(getComputedStyle(o.el).getPropertyValue('--rot'));
      o.rot = ((Number.isFinite(deg) ? deg : 0) * Math.PI) / 180;
    }
  };

  stage.onResize((w, h) => {
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    readRotations();
  });

  // Entrances: the hero tower rises on load; each section's blocks play when the section scrolls into view.
  if (!reduced) {
    const groups = new Map<string, Obj[]>();
    for (const o of objs) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);
    const play = (name: string) => {
      const list = groups.get(name);
      if (!list) return;
      groups.delete(name);
      const footer = name === 'footer';
      gsap.to(
        list.map((o) => o.enter),
        {
          v: 1,
          duration: footer ? 1.4 : 1.2,
          ease: footer ? 'bounce.out' : 'power3.out',
          stagger: footer ? 0.14 : 0.08,
          delay: name === 'hero' ? 0.15 : 0,
        },
      );
    };
    play('hero');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const name = (e.target as HTMLElement).dataset.b3dGroup;
          if (name) play(name);
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    groups.forEach((list, name) => {
      const host = list[0]?.el.closest<HTMLElement>('section, footer');
      if (!host) return;
      host.dataset.b3dGroup = name;
      io.observe(host);
    });
  }

  const clusters = new Map<string, { x: number; y: number; n: number }>();
  let shown = false;

  stage.onFrame((t) => {
    const vw = stage.width;
    const vh = stage.height;

    // Each section's visible strip: from its top (or the screen top) down to where the next section covers it.
    const rects = panels.map((p) => p.getBoundingClientRect());
    const bands = rects.map((r, i) => {
      const next = rects[i + 1];
      return {
        top: Math.max(r.top, 0),
        bottom: Math.min(r.bottom, vh, next ? next.top : Infinity),
        cover: next ? clamp01(1 - next.top / vh) : 0,
      };
    });

    clusters.clear();
    for (const o of objs) {
      const r = o.el.getBoundingClientRect();
      o.w = r.width;
      o.cx = r.left + r.width / 2 - vw / 2;
      o.cy = vh / 2 - (r.top + r.height / 2);
      const near = r.width > 0 && r.bottom > -260 && r.top < vh + 260;
      const waiting = !reduced && o.enter.v <= 0.001 && o.entrance !== 'rise';
      o.show = near && !waiting;
      if (o.entrance === 'cluster' && o.w > 0) {
        const c = clusters.get(o.group) ?? { x: 0, y: 0, n: 0 };
        c.x += o.cx;
        c.y += o.cy;
        c.n += 1;
        clusters.set(o.group, c);
      }
    }

    for (const o of objs) {
      if (!o.show) continue;
      const e = o.enter.v;
      let x = o.cx;
      let y = o.cy;
      let s = (o.w * o.frac) / o.projW;
      let spin = 0;

      if (!reduced) {
        y += Math.sin(t * o.speed + o.phase) * o.amp;
        y += o.cy * 0.06 * o.depth;
        spin = Math.sin(t * o.speed * 0.6 + o.phase) * 0.035;
        o.inner.rotation.set(
          ISO_EULER.x + Math.sin(t * o.speed * 0.5 + o.phase) * 0.06,
          ISO_EULER.y + Math.sin(t * o.speed * 0.4 + o.phase * 1.3) * 0.12,
          0,
        );
        if (e < 1) {
          const rest = 1 - e;
          if (o.entrance === 'rise') y -= rest * 140;
          else if (o.entrance === 'drop') y += rest * 260;
          else if (o.entrance === 'cluster') {
            const c = clusters.get(o.group);
            if (c && c.n) {
              x += (c.x / c.n - o.cx) * rest;
              y += (c.y / c.n - o.cy) * rest;
            }
          }
          s *= o.entrance === 'pop' ? e : 0.7 + 0.3 * e;
          spin += rest * (o.entrance === 'drop' ? 0.5 : -0.35);
        }
      }

      o.outer.position.set(x, y, 0);
      o.outer.scale.setScalar(Math.max(s, 1e-4));
      o.outer.rotation.z = -o.rot + spin;
      const dim = (bands[o.panel]?.cover ?? 0) * 0.45;
      for (const m of o.mats) m.uniforms.uDim.value = dim;
    }

    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    byPanel.forEach((list, pi) => {
      const band = bands[pi];
      const top = band ? band.top : 0;
      const bottom = band ? band.bottom : vh;
      if (bottom - top < 1 || !list.some((o) => o.show)) return;
      for (const o of objs) o.outer.visible = false;
      for (const o of list) o.outer.visible = o.show;
      renderer.setScissor(0, vh - bottom, vw, bottom - top);
      renderer.render(scene, camera);
    });
    renderer.setScissorTest(false);

    if (!shown) {
      shown = true;
      document.documentElement.classList.add('b3d-on');
    }
  });

  // If the GPU drops the context, fall back to the static drawings.
  canvas.addEventListener('webglcontextlost', () => document.documentElement.classList.remove('b3d-on'));

  if (reduced) {
    // No motion: draw only when the page moves.
    let queued = false;
    const draw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        stage.renderOnce();
      });
    };
    window.addEventListener('scroll', draw, { passive: true });
    window.addEventListener('resize', draw);
    draw();
  } else {
    stage.start();
  }
}

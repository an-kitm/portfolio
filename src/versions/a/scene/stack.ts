/**
 * Stacked sections for version A.
 *
 * Each section sits in a `.a-panel`. A panel scrolls normally until its bottom meets the bottom of the screen (or,
 * for a short panel, until its top meets the header), then stays pinned while the next panel slides up over it.
 * The covered panel eases back and dims. On desktop with the 3D scene, a panel is only solid behind its text, so
 * the towers on the right stay visible while the sheets slide over each other.
 *
 * Also here: content rising in as it scrolls into view, and in-page links that land correctly on pinned sections.
 */

import { reducedMotion } from '../../../lib/env';

const WIDE = '(min-width: 901px)';
/** Room between the end of the text and the start of a sheet's fade to see-through. */
const SOLID_PAD = 8;

/** Elements that rise in as they scroll into view. */
const REVEAL = [
  '.a-hero__text > *',
  '.a-head > *',
  '.a-blockhead',
  '.a-card',
  '.a-stack',
  '.a-shot',
  '.a-principles__list li',
  '.a-toolkit__group',
  '.a-contact__inner > :not(.a-emblem)',
].join(', ');

/** Boxes (besides text) that a sheet's solid part has to cover. */
const BOXES = '.a-card, .a-shot, .a-btn, .a-chip, .a-col, .a-stack';

let panels: HTMLElement[] = [];

export function initStack(): void {
  panels = Array.from(document.querySelectorAll<HTMLElement>('.a-panel'));
  if (panels.length === 0) return;
  const root = document.documentElement;
  if (reducedMotion()) root.classList.add('a-reduce');
  const main = document.getElementById('main') ?? document.body;
  const header = document.querySelector<HTMLElement>('.a-header');
  const wide = window.matchMedia(WIDE);
  const pinTop = new Map<HTMLElement, number>();
  /** Where each panel sits in the page with nothing pinned, and where it pins (px from the top of the screen). */
  const flowTop = new Map<HTMLElement, number>();
  const stickAt = new Map<HTMLElement, number>();
  let vh = window.innerHeight;
  let queued = false;
  let has3d = false;

  /** Matches --a-band: the height of the 3D band across the top of compact screens. */
  const bandHeight = () => Math.min(440, Math.max(280, vh * 0.44));

  const measure = () => {
    vh = window.innerHeight;
    const head = header?.offsetHeight ?? 0;
    has3d = root.classList.contains('a3d-pre');
    const sheets = wide.matches && has3d;
    main.classList.add('a-measuring');
    let below = 0; // right edge of what shows of the previous panel while it is pinned
    for (const p of panels) {
      const solid = p.classList.contains('a-panel--solid');
      // On compact screens the 3D band covers the top of the screen while a chapter is in view.
      const top = !wide.matches && has3d && !solid ? bandHeight() : head;
      const stick = Math.min(top, vh - p.offsetHeight);
      pinTop.set(p, top);
      stickAt.set(p, p.classList.contains('a-panel--last') ? -Infinity : stick);
      p.style.setProperty('--stick', `${stick}px`);
      if (sheets && !solid) {
        // While pinned, the panel shows from the header to the bottom of the screen (in panel coordinates).
        const shown = contentRight(p, head - stick, vh - stick) + SOLID_PAD;
        // A sheet only needs to be solid as far as the text it slides over, so the towers stay clear.
        p.style.setProperty('--solid', `${Math.ceil(below || shown)}px`);
        p.style.setProperty('--shade', `${Math.ceil(shown)}px`);
        below = shown;
      } else {
        p.style.removeProperty('--solid');
        p.style.removeProperty('--shade');
        below = 0;
      }
    }
    main.classList.add('a-unstick');
    for (const p of panels) flowTop.set(p, p.getBoundingClientRect().top + window.scrollY);
    main.classList.remove('a-measuring', 'a-unstick');
  };

  const update = () => {
    queued = false;
    // Work the panel tops out from the layout rather than reading them back, since covered panels are scaled.
    const y = window.scrollY;
    const mainBottom = main.getBoundingClientRect().bottom;
    const tops = panels.map((p) => {
      const top = Math.max(stickAt.get(p) ?? 0, (flowTop.get(p) ?? 0) - y);
      return Math.min(top, mainBottom - p.offsetHeight);
    });
    panels.forEach((p, i) => {
      const next = panels[i + 1];
      let cover = 0;
      if (next) {
        // Fully covered once the next panel reaches the place where it pins.
        const end = pinTop.get(next) ?? 0;
        cover = Math.min(1, Math.max(0, (vh - tops[i + 1]!) / Math.max(1, vh - end)));
      }
      p.style.setProperty('--cover', cover.toFixed(3));
      p.classList.toggle('is-covered', cover >= 0.999);
    });
  };

  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  const remeasure = () => {
    measure();
    schedule();
  };

  measure();
  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', remeasure);
  wide.addEventListener('change', remeasure);
  // Fonts, images and the 3D scene starting (or giving up) can all change the layout after first paint.
  new ResizeObserver(remeasure).observe(document.body);
  // The 3D scene reserves its space before first paint and gives it back if WebGL fails.
  new MutationObserver(() => {
    if (root.classList.contains('a3d-pre') !== has3d) remeasure();
  }).observe(root, { attributeFilter: ['class'] });
  void document.fonts?.ready.then(remeasure);

  initLinks();
  initReveal();
}

/**
 * Right edge of the readable content (its text and card-like boxes) in the band from `y0` to `y1` of a panel, measured
 * from the panel's left edge.
 */
function contentRight(panel: HTMLElement, y0: number, y1: number): number {
  const box = panel.getBoundingClientRect();
  let right = 0;
  const take = (r: DOMRect) => {
    if (r.width === 0 || r.bottom - box.top < y0 || r.top - box.top > y1) return;
    right = Math.max(right, r.right - box.left);
  };
  const range = document.createRange();
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim() || n.parentElement?.closest('.a-fallback')) continue;
    range.selectNodeContents(n);
    take(range.getBoundingClientRect());
  }
  panel.querySelectorAll<HTMLElement>(BOXES).forEach((el) => {
    if (!el.closest('.a-fallback')) take(el.getBoundingClientRect());
  });
  return right;
}

/**
 * Scrolls to an element inside the stack. A pinned panel reports where it is stuck, not where it sits in the page,
 * so this measures with the panels laid out in normal flow.
 */
export function scrollToSection(el: Element): void {
  const main = document.getElementById('main') ?? document.body;
  main.classList.add('a-measuring', 'a-unstick');
  const y = el.getBoundingClientRect().top + window.scrollY;
  main.classList.remove('a-measuring', 'a-unstick');
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  window.scrollTo({ top: Math.max(0, y - pad), behavior: reducedMotion() ? 'instant' : 'smooth' });
}

function initLinks(): void {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href*="#"]') : null;
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname || a.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    scrollToSection(target);
    history.pushState(null, '', a.hash);
    // Move focus too, so keyboard and screen reader users continue from the section they jumped to.
    if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

function initReveal(): void {
  const root = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  const vh = window.innerHeight;
  const items = Array.from(document.querySelectorAll<HTMLElement>(REVEAL)).filter((el) => {
    // Content already on screen at load stays put; only what is further down rises in.
    if (el.closest('.a-fallback')) return false;
    return el.getBoundingClientRect().top > vh * 0.9;
  });
  items.forEach((el) => {
    const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
    el.style.setProperty('--i', String(Math.min(6, Math.max(0, siblings.indexOf(el)))));
    el.classList.add('a-rv');
  });
  root.classList.add('a-js-reveal');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('is-in');
        io.unobserve(el);
        // Once risen, hand the element back its own transitions (card hovers and the like).
        el.addEventListener('transitionend', function done(t) {
          if (t.target !== el || t.propertyName !== 'transform') return;
          el.removeEventListener('transitionend', done);
          el.classList.remove('a-rv', 'is-in');
        });
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

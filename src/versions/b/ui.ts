/**
 * Version B interface behaviour:
 * - stacked sections: each section scrolls normally until its bottom meets the bottom of the screen, then stays
 *   pinned while the next section slides up over it (the covered one dims and eases back);
 * - content rises in as it scrolls into view;
 * - the nav switches to light text over dark sections, and the company chips show while a company is on top;
 * - the phone menu.
 */

export function initUI(): void {
  document.documentElement.classList.add('b-js');
  initStack(Array.from(document.querySelectorAll<HTMLElement>('.b-panel')));
  initReveal();
  initMenu();
}

function initStack(panels: HTMLElement[]): void {
  if (panels.length === 0) return;
  const nav = document.querySelector<HTMLElement>('.b-nav');
  const chips = document.querySelector<HTMLElement>('.b-chips');
  const chipLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.b-chips a'));
  let vh = window.innerHeight;
  let queued = false;
  let lastY = window.scrollY;

  /** A panel taller than the screen sticks when its bottom reaches the bottom of the screen. */
  const measure = () => {
    vh = window.innerHeight;
    for (const p of panels) p.style.setProperty('--stick', `${Math.min(0, vh - p.offsetHeight)}px`);
  };

  const update = () => {
    queued = false;
    const rects = panels.map((p) => p.getBoundingClientRect());
    const probe = nav ? nav.offsetHeight / 2 : 28;
    let current: HTMLElement | undefined;
    let under: HTMLElement | undefined;
    panels.forEach((p, i) => {
      const r = rects[i]!;
      const next = rects[i + 1];
      const cover = next ? Math.min(1, Math.max(0, 1 - next.top / vh)) : 0;
      p.style.setProperty('--cover', cover.toFixed(3));
      p.classList.toggle('is-covered', cover >= 0.999);
      if (r.top <= vh * 0.5) current = p;
      if (r.top <= probe) under = p;
    });
    if (nav) {
      nav.dataset.theme = (under ?? panels[0])?.dataset.nav ?? 'light';
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
    }
    const company = current?.classList.contains('b-co') ? current : undefined;
    chips?.classList.toggle('is-on', Boolean(company));
    // The chips step out of the way while reading (scrolling down) and come back when scrolling up.
    const y = window.scrollY;
    if (Math.abs(y - lastY) > 6) {
      chips?.classList.toggle('is-tucked', y > lastY);
      lastY = y;
    }
    for (const a of chipLinks) {
      if (company && a.hash === `#${company.id}`) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
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
  // Fonts and images can change section heights after first paint.
  new ResizeObserver(remeasure).observe(document.body);
  void document.fonts?.ready.then(remeasure);
}

function initReveal(): void {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.b-reveal, .b-line'));
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.1 },
  );
  items.forEach((el) => io.observe(el));
}

function initMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>('.b-nav__menu');
  const panel = document.getElementById('b-menu');
  if (!btn || !panel) return;
  const set = (open: boolean) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    panel.hidden = !open;
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      set(false);
      btn.focus();
    }
  });
}

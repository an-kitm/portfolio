import * as THREE from 'three';

/**
 * A WebGL renderer bound to a canvas, with a render loop that pauses when the tab is hidden
 * and a resize hook. Frame callbacks are responsible for calling `renderer.render`.
 */
export type Stage = {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  onResize(cb: (width: number, height: number) => void): void;
  onFrame(cb: (time: number, delta: number) => void): void;
  /** Request one frame even when the loop is stopped (used for static, reduced-motion rendering). */
  renderOnce(): void;
  start(): void;
  stop(): void;
  dispose(): void;
};

export function createStage(canvas: HTMLCanvasElement, opts: { maxDpr?: number; alpha?: boolean } = {}): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: opts.alpha ?? true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 1.75));

  const resizeCbs: ((w: number, h: number) => void)[] = [];
  const frameCbs: ((t: number, dt: number) => void)[] = [];
  let width = 0;
  let height = 0;
  let raf = 0;
  let running = false;
  let last = performance.now();

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    resizeCbs.forEach((cb) => cb(w, h));
  };

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    resize();
    frameCbs.forEach((cb) => cb(now / 1000, dt));
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    frame(now);
  };

  const onVisibility = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && running) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  return {
    renderer,
    canvas,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    onResize(cb) {
      resizeCbs.push(cb);
    },
    onFrame(cb) {
      frameCbs.push(cb);
    },
    renderOnce() {
      requestAnimationFrame((now) => frame(now));
    },
    start() {
      if (running) return;
      running = true;
      resize();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
    },
  };
}

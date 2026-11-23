import { reducedMotion, webglAvailable } from '../../../lib/env';

/**
 * Starts the 3D town after first paint. Three.js loads in a separate chunk, so the page's text is
 * never blocked on it. If WebGL is missing (or `?webgl=0`), the static SVG towers stay.
 */
export function boot(): void {
  const root = document.documentElement;
  const giveUp = (reason?: unknown) => {
    root.classList.remove('a3d-pre', 'a3d-boot', 'a3d', 'a3d-band-off');
    if (reason) console.warn('[portfolio:a] 3D scene disabled:', reason);
  };

  if (!webglAvailable()) {
    giveUp();
    return;
  }
  root.classList.add('a3d-pre');

  const run = () => {
    import('./scene')
      .then((m) => m.startScene({ reduced: reducedMotion() }))
      .catch(giveUp);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 200);
}

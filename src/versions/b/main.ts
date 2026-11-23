import { reducedMotion, webglAvailable } from '../../lib/env';
import { initUI } from './ui';

const reduced = reducedMotion();
document.documentElement.classList.toggle('b-reduce', reduced);
initUI();

// The 3D layer is an enhancement: load it after first paint, and keep the static drawings if it can't run.
if (webglAvailable()) {
  const load = () => {
    import('./scene')
      .then((m) => m.startScene({ reduced }))
      .catch((err: unknown) => console.warn('[portfolio] 3D scene unavailable, keeping the static drawings.', err));
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 1200 });
  else setTimeout(load, 300);
}

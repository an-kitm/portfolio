/**
 * Browser capability checks used by both versions.
 * `?motion=reduce` forces the reduced-motion path and `?webgl=0` forces the static fallback, for testing.
 */

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function reducedMotion(): boolean {
  if (params().get('motion') === 'reduce') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function webglAvailable(): boolean {
  if (params().get('webgl') === '0') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

import * as THREE from 'three';

/**
 * Textures drawn on canvases at start-up (no image downloads): concrete grain, window grids, the signs on each
 * headquarters and a soft round glow.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

/** Small deterministic random generator, so the town looks the same on every visit. */
export function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let grain: THREE.CanvasTexture | null = null;

/** Fine concrete grain, tiled across every concrete surface. */
export function grainTexture(): THREE.CanvasTexture {
  if (grain) return grain;
  const [c, ctx] = canvas(256, 256);
  const img = ctx.createImageData(256, 256);
  const rnd = random(7);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // A few soft blotches so large faces do not look flat.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 10 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.05 + rnd() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.colorSpace = THREE.SRGBColorSpace;
  return grain;
}

export function concrete(color: string, roughness = 0.88, repeat = 1): THREE.MeshStandardMaterial {
  const map = grainTexture().clone();
  map.repeat.set(repeat, repeat);
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, map });
}

/**
 * A wall with windows. The colour map darkens the window glass; the emissive map lights some of the windows,
 * so the building's emissive colour and intensity decide how lit it looks.
 */
export function windowWall(o: {
  cols: number;
  rows: number;
  seed: number;
  lit: number;
  wall: string;
}): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const cw = 64;
  const rh = 56;
  const pad = 14;
  const w = o.cols * cw;
  const h = o.rows * rh + pad * 2;
  const [mc, m] = canvas(w, h);
  const [gc, g] = canvas(w, h);
  m.fillStyle = o.wall;
  m.fillRect(0, 0, w, h);
  // Concrete grain under the windows (the grain canvas is light grey, so multiply it over the wall colour).
  m.globalCompositeOperation = 'multiply';
  m.drawImage(grainTexture().image as HTMLCanvasElement, 0, 0, w, h);
  m.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000000';
  g.fillRect(0, 0, w, h);
  const rnd = random(o.seed);
  for (let r = 0; r < o.rows; r++) {
    for (let col = 0; col < o.cols; col++) {
      const x = col * cw + cw * 0.24;
      const y = pad + r * rh + rh * 0.2;
      const ww = cw * 0.52;
      const wh = rh * 0.58;
      m.fillStyle = '#2a2f38';
      m.fillRect(x, y, ww, wh);
      if (rnd() < o.lit) {
        const k = 0.55 + rnd() * 0.45;
        g.fillStyle = `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`;
        g.fillRect(x, y, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(gc);
  glow.colorSpace = THREE.SRGBColorSpace;
  return { map, glow };
}

let glowTex: THREE.CanvasTexture | null = null;

/** Soft round glow, white in the middle and clear at the edge. Tinted by the material colour. */
export function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** A flat glow lying on the ground (a light pool), additive so it brightens what is under it. */
export function floorGlow(color: string, w: number, d: number, opacity: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: glowTexture(),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

/** A glowing bar (neon tube). `boost` pushes the colour past white so the bloom pass picks it up. */
export function neon(color: string, boost = 2.6): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color).multiplyScalar(boost);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true });
}

export type SignText = {
  title: string;
  lines: string[];
  badge?: string;
  accent: string;
  /** A wordmark drawn in place of the title once its image has loaded. */
  logo?: { image: HTMLImageElement; aspect: number };
};

/** An SVG as an image that can be drawn on a canvas. Resolves when it has loaded. */
export function svgImage(svg: string, aspect: number): HTMLImageElement {
  const h = 256;
  const sized = svg.replace('<svg ', `<svg width="${Math.round(h * aspect)}" height="${h}" `);
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  return img;
}

/**
 * Text printed on a building face: a big title, smaller lines below and a neon rule. Drawn once the page fonts
 * have loaded, so it uses the same Roboto as the page.
 */
export function signTexture(w: number, h: number): { texture: THREE.CanvasTexture; draw(t: SignText): void } {
  const [c, ctx] = canvas(w, h);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    draw(t: SignText) {
      ctx.clearRect(0, 0, w, h);
      const padX = w * 0.06;
      const logo = t.logo && t.logo.image.complete && t.logo.image.naturalWidth > 0 ? t.logo : null;
      if (logo) {
        // The company's own wordmark, then the badge and the lines under it.
        let lh = h * 0.3;
        let lw = lh * logo.aspect;
        const room = w - padX * 2 - (t.badge ? h * 0.42 : 0);
        if (lw > room) {
          lw = room;
          lh = lw / logo.aspect;
        }
        const top = h * 0.42 - lh;
        ctx.shadowColor = 'rgba(255,255,255,0.25)';
        ctx.shadowBlur = lh * 0.12;
        ctx.drawImage(logo.image, padX, top, lw, lh);
        ctx.shadowBlur = 0;
        if (t.badge) drawBadge(padX + lw + h * 0.06, h * 0.42 - lh / 2, h * 0.11, t.badge, t.accent);
        drawLines(h * 0.42, padX);
        texture.needsUpdate = true;
        return;
      }
      let size = h * 0.3;
      ctx.font = `700 ${size}px "Roboto Variable", Roboto, Arial, sans-serif`;
      while (ctx.measureText(t.title).width > w - padX * 2 - (t.badge ? h * 0.36 : 0) && size > 20) {
        size -= 4;
        ctx.font = `700 ${size}px "Roboto Variable", Roboto, Arial, sans-serif`;
      }
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#F4F6FA';
      ctx.shadowColor = 'rgba(255,255,255,0.35)';
      ctx.shadowBlur = size * 0.18;
      const titleY = h * 0.42;
      ctx.fillText(t.title, padX, titleY);
      ctx.shadowBlur = 0;
      if (t.badge) drawBadge(padX + ctx.measureText(t.title).width + size * 0.3, titleY - size * 0.34, size * 0.36, t.badge, t.accent);
      drawLines(titleY, padX);
      texture.needsUpdate = true;

      /** A small outlined pill (for "NOW"), vertically centred on `cy`. */
      function drawBadge(x: number, cy: number, bs: number, text: string, color: string) {
        ctx.font = `600 ${bs}px "Roboto Mono Variable", "Roboto Mono", monospace`;
        const bw = ctx.measureText(text).width + bs * 1.1;
        const bh = bs * 1.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = bs * 0.12;
        ctx.beginPath();
        ctx.roundRect(x, cy - bh / 2, bw, bh, bh / 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + bs * 0.55, cy + bs * 0.05);
        ctx.textBaseline = 'alphabetic';
      }

      function drawLines(y: number, x: number) {
        const lineSize = h * 0.115;
        t.lines.forEach((line, i) => {
          const mono = i > 0;
          ctx.font = mono
            ? `500 ${lineSize * 0.85}px "Roboto Mono Variable", "Roboto Mono", monospace`
            : `500 ${lineSize}px "Roboto Variable", Roboto, Arial, sans-serif`;
          ctx.fillStyle = mono ? '#9AA4B8' : '#D5DBE6';
          ctx.fillText(line, x, y + lineSize * (1.55 + i * 1.35));
        });
      }
    },
  };
}

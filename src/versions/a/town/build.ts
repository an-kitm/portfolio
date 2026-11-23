import * as THREE from 'three';
import { atlas, companies } from '../../../content/site';
import { BOUNDS, DISTRICTS, HOME, PLOT, SQUARE, type Box, type District, type DistrictId } from './layout';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EVEN_MARK, EVEN_WORDMARK, NOESYS_MARK, NOESYS_WORDMARK, PIXIS_MARK, PIXIS_WORDMARK, type Logo } from './logos';
import {
  concrete,
  floorGlow,
  glowTexture,
  neon,
  random,
  signTexture,
  svgImage,
  windowWall,
  type SignText,
} from './materials';

export interface WorkBuilding {
  district: DistrictId;
  index: number;
  box: Box;
  mesh: THREE.Mesh;
  /** Wall materials; their emissive colour and intensity decide how lit the windows look. */
  walls: THREE.MeshStandardMaterial[];
  /** Neon bar along the foot of the building, lit while its section is being read. */
  strip: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  /** Outline for buildings still under construction (Atlas). */
  outline?: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineDashedMaterial>;
}

export interface Town {
  root: THREE.Group;
  work: WorkBuilding[];
  pickables: THREE.Object3D[];
  /** Draw the signs on the headquarters (call once the page fonts have loaded). */
  drawSigns(): void;
  update(time: number): void;
}

const WALL = '#454b56';
const ROOF = '#2a2f37';
/** Tuned so the lit floor comes out as the page's ground colour, and the scene meets the page without a seam. */
const FLOOR = '#222c39';
/** The same, for the opaque floor used without reflections. */
const FLOOR_SOLID = '#222c39';
const WARM = '#FFD39A';
const SIGNAL = '#FFB547';
const ROW = 0.56;

const rows = (h: number) => Math.max(1, Math.floor((h - 0.5) / ROW));

/** A box standing on the ground at `y0`, with one material per face (+x, −x, +y, −y, +z, −z). */
function block(b: Box, materials: THREE.Material | THREE.Material[], y0: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), materials);
  mesh.position.set(b.x, y0 + b.h / 2, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function walls(b: Box, seed: number, lit: number, glow: string, intensity: number) {
  const make = (width: number, s: number) => {
    const t = windowWall({ cols: Math.max(2, Math.round(width / 0.68)), rows: rows(b.h), seed: s, lit, wall: WALL });
    return new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: t.map,
      emissiveMap: t.glow,
      emissive: glow,
      emissiveIntensity: intensity,
      roughness: 0.82,
      metalness: 0.05,
    });
  };
  return { x: make(b.d, seed), z: make(b.w, seed + 1), back: make(b.w, seed + 2) };
}

function dashedOutline(b: Box, color: string, y0: number) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w, b.h, b.d));
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0.9 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.computeLineDistances();
  lines.position.set(b.x, y0 + b.h / 2, b.z);
  return lines;
}

/** Company marks that float over each headquarters, and the wordmarks on their signs. */
const MARKS: Partial<Record<DistrictId, Logo>> = { even: EVEN_MARK, pixis: PIXIS_MARK, noesys: NOESYS_MARK };
const WORDMARKS: Partial<Record<DistrictId, Logo>> = {
  even: EVEN_WORDMARK,
  pixis: PIXIS_WORDMARK,
  noesys: NOESYS_WORDMARK,
};

/** A logo extruded into a thick, softly bevelled 3D badge, `size` units across its longer side, centred. */
function logoModel(logo: Logo, size: number): THREE.Group {
  const data = new SVGLoader().parse(logo.svg);
  const shapesByPath = data.paths
    .filter((p) => (p.userData?.style as { fill?: string } | undefined)?.fill !== 'none')
    .map((p) => ({ color: p.color, shapes: p.toShapes() }));
  const box = new THREE.Box2();
  for (const { shapes } of shapesByPath) for (const sh of shapes) for (const pt of sh.getPoints()) box.expandByPoint(pt);
  const w = box.max.x - box.min.x;
  const h = box.max.y - box.min.y;
  const k = size / Math.max(w, h, 1e-6);
  // Depth and bevel in the SVG's own units, so every logo ends up equally thick.
  const depth = (size * 0.14) / k;
  const bevel = (size * 0.014) / k;
  const g = new THREE.Group();
  for (const { color, shapes } of shapesByPath) {
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel * 1.4,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 12,
    });
    geo.translate(-(box.min.x + w / 2), -(box.min.y + h / 2), -depth / 2);
    // Light colours (Pixis cream) glow less, so the bloom does not wash them out to white.
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: hsl.l > 0.6 ? 0.22 : 0.85,
      roughness: 0.3,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(k, -k, k); // SVG y runs down
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** What floats over a headquarters: the company's mark (Atlas, still being built, has a wireframe globe). */
function emblem(id: DistrictId, color: string): THREE.Object3D {
  const g = new THREE.Group();
  const mark = MARKS[id];
  if (mark) {
    g.add(logoModel(mark, 1.7));
  } else {
    const ico = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.62, 1)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false }),
    );
    g.add(ico);
  }
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.scale.setScalar(3.4);
  g.add(halo);
  return g;
}

const wordmarkImages = new Map<DistrictId, HTMLImageElement>();

function signFor(d: District): SignText {
  if (d.id === 'atlas') return { title: atlas.name, lines: ['Side project', '2026 · open source'], accent: d.color };
  const c = companies.find((x) => x.id === d.id);
  const mark = WORDMARKS[d.id];
  let image = wordmarkImages.get(d.id);
  if (mark && !image) {
    image = svgImage(mark.svg, mark.aspect);
    wordmarkImages.set(d.id, image);
  }
  return {
    title: c?.name ?? d.id,
    lines: [c?.role ?? '', c?.period ?? ''],
    badge: d.id === 'even' ? 'NOW' : undefined,
    accent: d.id === 'even' ? '#5AA9FF' : d.color,
    logo: mark && image ? { image, aspect: mark.aspect } : undefined,
  };
}

export function buildTown(o: { quality: 'high' | 'low' }): Town {
  const root = new THREE.Group();
  const work: WorkBuilding[] = [];
  const pickables: THREE.Object3D[] = [];
  const signs: { draw: (t: SignText) => void; text: SignText }[] = [];
  const spinners: { obj: THREE.Object3D; y: number; phase: number; sway: boolean }[] = [];
  const high = o.quality === 'high';
  const cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
  const cz = (BOUNDS.z0 + BOUNDS.z1) / 2;

  // ---- Lights -----------------------------------------------------------------------------------------

  root.add(new THREE.HemisphereLight('#8ea3cc', '#0b0907', 0.7));
  const sun = new THREE.DirectionalLight('#ffe7cf', 1.7);
  sun.position.set(cx - 16, 26, cz + 20);
  sun.target.position.set(cx, 0, cz);
  root.add(sun, sun.target);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -48;
    s.right = 48;
    s.top = 26;
    s.bottom = -26;
    s.near = 1;
    s.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
  }

  // ---- Floor: dark and glossy. On desktop a mirrored copy of the town sits under a see-through floor, which
  // reads as a soft reflection (cheaper and steadier than rendering a reflection texture).

  const reflect = high;
  const floorW = BOUNDS.x1 - BOUNDS.x0 + 160;
  const floorD = BOUNDS.z1 - BOUNDS.z0 + 140;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorD),
    new THREE.MeshStandardMaterial({
      color: reflect ? FLOOR : FLOOR_SOLID,
      roughness: 0.6,
      metalness: 0,
      transparent: reflect,
      opacity: reflect ? 0.8 : 1,
      depthWrite: !reflect,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  floor.renderOrder = 1;
  root.add(floor);

  /** Everything that stands on the floor (and is mirrored under it). */
  const world = new THREE.Group();
  root.add(world);

  // Street markings: a dashed centre line and a solid kerb line on the near side.
  const dash = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.9, 0.01, 0.07),
    new THREE.MeshStandardMaterial({ color: '#3b4252', emissive: '#3b4252', emissiveIntensity: 0.4 }),
    Math.ceil((BOUNDS.x1 - BOUNDS.x0) / 2.2),
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < dash.count; i++) {
    dash.setMatrixAt(i, m4.makeTranslation(BOUNDS.x0 + i * 2.2, 0.006, 0.1));
  }
  root.add(dash);
  const kerb = new THREE.Mesh(
    new THREE.BoxGeometry(BOUNDS.x1 - BOUNDS.x0, 0.06, 0.12),
    new THREE.MeshStandardMaterial({ color: '#232833', roughness: 0.7 }),
  );
  kerb.position.set(cx, 0.03, 1.6);
  kerb.receiveShadow = true;
  root.add(kerb);

  // ---- Districts ---------------------------------------------------------------------------------------

  const plotMat = concrete('#2a2f37', 0.9, 3);
  const roofMat = concrete(ROOF, 0.9, 1);
  const frontMat = concrete(WALL, 0.88, 1.5);

  DISTRICTS.forEach((d, di) => {
    const plot = block(
      { x: d.cx, z: (PLOT.z0 + PLOT.z1) / 2, w: PLOT.half * 2, d: PLOT.z1 - PLOT.z0, h: PLOT.h },
      plotMat,
      0,
    );
    plot.castShadow = false;
    world.add(plot);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(PLOT.half * 2, 0.035, 0.035), neon(d.color, 1.5));
    edge.position.set(d.cx, PLOT.h + 0.005, PLOT.z1);
    world.add(edge);

    // Headquarters
    const hq = d.hq;
    const hqTop = PLOT.h + hq.h;
    const front = hq.z + hq.d / 2;
    if (d.draft) {
      const glass = block(
        hq,
        new THREE.MeshStandardMaterial({ color: d.color, transparent: true, opacity: 0.07, roughness: 0.2 }),
        PLOT.h,
      );
      glass.castShadow = false;
      world.add(glass, dashedOutline(hq, d.color, PLOT.h));
      // Floor slabs of the building going up.
      for (let y = 1.2; y < hq.h; y += 1.2) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(hq.w - 0.1, 0.08, hq.d - 0.1),
          new THREE.MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.9 }),
        );
        slab.position.set(hq.x, PLOT.h + y, hq.z);
        slab.castShadow = true;
        world.add(slab);
      }
      pickables.push(glass);
      glass.userData.pick = { district: d.id, index: -1 };
      // A crane over the site.
      const crane = new THREE.MeshStandardMaterial({ color: '#b8932c', roughness: 0.6 });
      const mastH = hq.h + 3.4;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.32, mastH, 0.32), crane);
      mast.position.set(hq.x + hq.w / 2 + 1, PLOT.h + mastH / 2, hq.z - 0.4);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.26, 0.26), crane);
      jib.position.set(mast.position.x - 2.6, PLOT.h + mastH - 0.2, mast.position.z);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), concrete('#3a3f48'));
      weight.position.set(mast.position.x + 1.1, PLOT.h + mastH - 0.5, mast.position.z);
      const hookX = hq.x - 0.6;
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 3.2),
        new THREE.MeshBasicMaterial({ color: '#9aa4b8' }),
      );
      cable.position.set(hookX, PLOT.h + mastH - 1.9, mast.position.z);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), crane);
      hook.position.set(hookX, PLOT.h + mastH - 3.6, mast.position.z);
      [mast, jib, weight, hook].forEach((m) => (m.castShadow = true));
      world.add(mast, jib, weight, cable, hook);
    } else {
      const w = walls(hq, 101 + di * 17, 0.42, '#a9c1e6', 0.55);
      const mesh = block(hq, [w.x, w.x, roofMat, roofMat, frontMat, w.back], PLOT.h);
      mesh.userData.pick = { district: d.id, index: -1 };
      pickables.push(mesh);
      world.add(mesh);
      const unit = block({ x: hq.x - 0.7, z: hq.z - 0.4, w: 1.4, d: 1, h: 0.5 }, roofMat, hqTop);
      world.add(unit);
    }

    // The sign on the front face, and the neon strip under it.
    const sign = signTexture(1024, 512);
    const signW = hq.w - 0.35;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signW / 2),
      new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true, toneMapped: false, color: '#e9edf4' }),
    );
    plate.position.set(hq.x, hqTop - signW / 4 - 0.35, front + 0.015);
    world.add(plate);
    const text = signFor(d);
    signs.push({ draw: sign.draw, text });
    text.logo?.image.addEventListener('load', () => sign.draw(text), { once: true });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(hq.w - 0.7, 0.07, 0.05), neon(d.color, 3));
    strip.position.set(hq.x, hqTop - signW / 2 - 0.55, front + 0.03);
    world.add(strip);
    const pool = floorGlow(d.color, 7, 3.6, 0.28);
    pool.position.set(hq.x, PLOT.h + 0.01, front + 1.4);
    world.add(pool);
    if (high) {
      const light = new THREE.PointLight(d.color, 9, 10, 1.6);
      light.position.set(hq.x, 1.6, front + 2.2);
      root.add(light);
    }

    // Emblem floating over the roof, with a glow on the roof under it.
    const roofGlow = floorGlow(d.color, 3.2, 3.2, 0.5);
    roofGlow.position.set(hq.x, hqTop + 0.02, hq.z);
    world.add(roofGlow);
    const em = emblem(d.id, d.color);
    em.position.set(hq.x, hqTop + 1.7, hq.z);
    em.userData.spin = { y: hqTop + 1.8, phase: di * 1.3, sway: d.id !== 'atlas' };
    world.add(em);

    // The three areas of work.
    d.work.forEach((b, i) => {
      const stripMat = neon(SIGNAL, 3);
      stripMat.opacity = 0;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.2, 0.05, 0.05), stripMat);
      foot.position.set(b.x, PLOT.h + 0.08, b.z + b.d / 2 + 0.06);
      world.add(foot);
      if (d.draft) {
        const glass = block(
          b,
          new THREE.MeshStandardMaterial({ color: d.color, transparent: true, opacity: 0.08, roughness: 0.2 }),
          PLOT.h,
        );
        glass.castShadow = false;
        const outline = dashedOutline(b, d.color, PLOT.h);
        world.add(glass, outline);
        glass.userData.pick = { district: d.id, index: i };
        pickables.push(glass);
        work.push({ district: d.id, index: i, box: b, mesh: glass, walls: [], strip: foot, outline });
        return;
      }
      const w = walls(b, 300 + di * 31 + i * 7, 0.5, '#a9c1e6', 0.5);
      const mats = [w.x, w.x, roofMat, roofMat, w.z, w.back];
      const mesh = block(b, mats, PLOT.h);
      mesh.userData.pick = { district: d.id, index: i };
      pickables.push(mesh);
      world.add(mesh);
      work.push({ district: d.id, index: i, box: b, mesh, walls: [w.x, w.z, w.back], strip: foot });
    });

    // Background buildings behind the headquarters give the district some depth.
    const rnd = random(900 + di);
    for (let k = 0; k < 3; k++) {
      const h = 2.2 + rnd() * 3.2;
      const b = { x: d.cx - 4 + k * 4 + (rnd() - 0.5), z: -13.6 - rnd() * 1.4, w: 2.2, d: 2.2, h };
      if (d.draft && k > 0) continue;
      const fw = walls(b, 500 + di * 13 + k, 0.25, '#8aa2c8', 0.35);
      world.add(block(b, [fw.x, fw.x, roofMat, roofMat, fw.z, fw.back], 0));
    }
  });

  // ---- Home at the start, and the square with the mailbox at the end -------------------------------------

  const homeWalls = walls(HOME, 77, 0.8, WARM, 0.9);
  const house = block(HOME, [homeWalls.x, homeWalls.x, roofMat, roofMat, homeWalls.z, homeWalls.back], 0);
  world.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.3, 4), concrete('#2f3540', 0.85));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(HOME.x, HOME.h + 0.65, HOME.z);
  roof.castShadow = true;
  world.add(roof);
  const porch = floorGlow(WARM, 4, 3, 0.22);
  porch.position.set(HOME.x, 0.01, HOME.z + HOME.d / 2 + 1.2);
  world.add(porch);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 48),
    new THREE.MeshStandardMaterial({ color: '#151a22', roughness: 0.7 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(SQUARE.x, 0.004, SQUARE.z + 1.6);
  plaza.receiveShadow = true;
  world.add(plaza);
  const kioskBox = { x: SQUARE.x, z: SQUARE.z - 1.2, w: 2.6, d: 1.6, h: 2.1 };
  world.add(block(kioskBox, frontMat, 0));
  const talk = signTexture(1024, 384);
  const talkPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.9),
    new THREE.MeshBasicMaterial({ map: talk.texture, transparent: true, toneMapped: false }),
  );
  talkPlate.position.set(kioskBox.x, 1.45, kioskBox.z + kioskBox.d / 2 + 0.015);
  world.add(talkPlate);
  signs.push({ draw: talk.draw, text: { title: 'Let’s talk', lines: [], accent: SIGNAL } });
  const talkStrip = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.05), neon(SIGNAL, 3));
  talkStrip.position.set(kioskBox.x, 0.85, kioskBox.z + kioskBox.d / 2 + 0.03);
  world.add(talkStrip);
  const talkPool = floorGlow(SIGNAL, 5, 3, 0.25);
  talkPool.position.set(SQUARE.x, 0.012, SQUARE.z + 1.2);
  world.add(talkPool);
  const boxMat = new THREE.MeshStandardMaterial({ color: '#d4862a', roughness: 0.45, emissive: '#5a3208' });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), concrete('#2a2f37'));
  post.position.set(SQUARE.x - 2.1, 0.45, SQUARE.z + 1.6);
  const mailbox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.48, 0.42), boxMat);
  mailbox.position.set(SQUARE.x - 2.1, 1.12, SQUARE.z + 1.6);
  [post, mailbox].forEach((m) => (m.castShadow = true));
  world.add(post, mailbox);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.5), concrete('#3a404a'));
  bench.position.set(SQUARE.x + 2.3, 0.45, SQUARE.z + 1.4);
  bench.castShadow = true;
  world.add(bench);

  // ---- Street lamps and trees ----------------------------------------------------------------------------

  const poleMat = new THREE.MeshStandardMaterial({ color: '#2b313c', roughness: 0.5, metalness: 0.4 });
  const bulbMat = neon(WARM, 3.2);
  const lampXs: number[] = [];
  for (let x = BOUNDS.x0 + 3; x < BOUNDS.x1 - 2; x += 8) lampXs.push(x);
  for (const x of lampXs) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.7, 8), poleMat);
    pole.position.set(x, 1.35, 2.1);
    pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), poleMat);
    arm.position.set(x, 2.66, 1.85);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), bulbMat);
    bulb.position.set(x, 2.58, 1.6);
    const glow = floorGlow(WARM, 3.6, 3.6, 0.16);
    glow.position.set(x, 0.008, 1.2);
    world.add(pole, arm, bulb, glow);
  }

  const treeSpots: [number, number, number][] = [];
  const trnd = random(42);
  for (let x = BOUNDS.x0 + 1; x < BOUNDS.x1; x += 3.1) {
    if (lampXs.some((lx) => Math.abs(lx - x) < 1)) continue;
    if (Math.abs(x - SQUARE.x) < 4) continue;
    treeSpots.push([x + (trnd() - 0.5) * 0.6, 3.9 + trnd() * 1.4, 0.75 + trnd() * 0.4]);
  }
  for (let x = BOUNDS.x0; x < BOUNDS.x1; x += 2.4) {
    treeSpots.push([x + (trnd() - 0.5), -16.6 - trnd() * 2, 0.9 + trnd() * 0.6]);
  }
  DISTRICTS.forEach((d) => {
    treeSpots.push([d.cx + 6.5, -10.5, 0.8], [d.cx + 6.5, -7.6, 0.7]);
  });
  treeSpots.push([HOME.x - 3, -5, 0.9], [HOME.x + 3.2, -8, 0.8]);
  const canopy = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#21423c', roughness: 0.85, flatShading: true }),
    treeSpots.length,
  );
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.08, 0.11, 1, 6),
    new THREE.MeshStandardMaterial({ color: '#2d2621', roughness: 0.9 }),
    treeSpots.length,
  );
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  treeSpots.forEach(([x, z, s], i) => {
    q.setFromEuler(new THREE.Euler(0, trnd() * Math.PI, 0));
    canopy.setMatrixAt(i, m4.compose(pos.set(x, 0.75 + s * 0.95, z), q, sc.set(s * 0.85, s * 1.15, s * 0.85)));
    trunk.setMatrixAt(i, m4.compose(pos.set(x, 0.45, z), q, sc.set(1, 0.9, 1)));
  });
  canopy.castShadow = true;
  trunk.castShadow = true;
  world.add(canopy, trunk);

  // Glows and other see-through things on the town draw after the floor; their mirror images draw before it,
  // so the floor dims the reflections but never what stands on it.
  world.traverse((obj) => {
    const m = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const clear = Array.isArray(m) ? m.some((x) => x.transparent) : m?.transparent;
    if (clear || (obj as THREE.Sprite).isSprite) obj.renderOrder = 2;
  });
  const roots = [world];
  if (reflect) {
    const mirror = world.clone();
    mirror.scale.y = -1;
    mirror.traverse((obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.renderOrder = 0;
      delete obj.userData.pick;
    });
    root.add(mirror);
    roots.push(mirror);
  }
  for (const r of roots) {
    r.traverse((obj) => {
      const spin = obj.userData.spin as { y: number; phase: number; sway: boolean } | undefined;
      if (spin) spinners.push({ obj, y: spin.y, phase: spin.phase, sway: spin.sway });
    });
  }

  return {
    root,
    work,
    pickables,
    drawSigns() {
      signs.forEach((s) => s.draw(s.text));
    },
    update(time: number) {
      for (const s of spinners) {
        // Logos face the camera (which looks from −x, +z) and sway a little; the globe turns.
        s.obj.rotation.y = s.sway ? -Math.PI / 4 + Math.sin(time * 0.7 + s.phase) * 0.45 : time * 0.6 + s.phase;
        s.obj.position.y = s.y + Math.sin(time * 1.3 + s.phase) * 0.12;
      }
    },
  };
}

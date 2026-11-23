import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GEO, type FacePalette } from '../iso';

/**
 * 3D blocks that match the isometric drawings exactly.
 *
 * The shader colours each fragment by its world-space normal: faces pointing up get the `top` colour,
 * faces pointing +z get `left` and faces pointing +x get `right`. Seen from the isometric angle
 * (camera along -1,-1,-1) a block looks like the SVG drawing, and the shading stays consistent
 * when a block tilts or tumbles.
 */

const vertexShader = /* glsl */ `
  varying vec3 vNormalW;
  void main() {
    #ifdef OBJECT_SPACE_NORMALS
      vNormalW = normal;
    #else
      vNormalW = normalize(mat3(modelMatrix) * normal);
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uLeft;
  uniform vec3 uRight;
  uniform float uOpacity;
  uniform float uDim;
  varying vec3 vNormalW;
  void main() {
    vec3 n = normalize(vNormalW);
    float wt = max(n.y, 0.0);
    float wl = max(n.z, 0.0);
    float wr = max(n.x, 0.0);
    float wb = max(-n.y, 0.0) + max(-n.z, 0.0) + max(-n.x, 0.0);
    wt *= wt; wl *= wl; wr *= wr; wb *= wb;
    vec3 c = (uTop * wt + uLeft * wl + uRight * wr + uRight * 0.8 * wb) / max(wt + wl + wr + wb, 1e-4);
    c *= 1.0 - uDim;
    gl_FragColor = vec4(c, uOpacity);
    #include <colorspace_fragment>
  }
`;

export type IsoMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uTop: { value: THREE.Color };
    uLeft: { value: THREE.Color };
    uRight: { value: THREE.Color };
    uOpacity: { value: number };
    /** 0 = full colour, 1 = black. Used to darken blocks in a section that is being covered. */
    uDim: { value: number };
  };
};

/**
 * Shading space: 'world' (default) colours faces by world direction, for scenes whose camera sits at the
 * isometric angle. 'object' paints each face by the block's own axes, for scenes that rotate the blocks
 * into the isometric view instead of the camera.
 */
export type Shading = 'world' | 'object';

export function isoMaterial(p: FacePalette, opacity = 1, shading: Shading = 'world'): IsoMaterial {
  return new THREE.ShaderMaterial({
    defines: shading === 'object' ? { OBJECT_SPACE_NORMALS: '' } : {},
    uniforms: {
      uTop: { value: new THREE.Color(p.top) },
      uLeft: { value: new THREE.Color(p.left) },
      uRight: { value: new THREE.Color(p.right) },
      uOpacity: { value: opacity },
      uDim: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: opacity >= 1,
  }) as IsoMaterial;
}

/** Set a material's palette immediately. For a smooth change, tween the three Color uniforms instead. */
export function setPalette(mat: IsoMaterial, p: FacePalette): void {
  mat.uniforms.uTop.value.set(p.top);
  mat.uniforms.uLeft.value.set(p.left);
  mat.uniforms.uRight.value.set(p.right);
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function roundedBox(h: number, radius: number): THREE.BufferGeometry {
  const key = `r:${h}:${radius}`;
  let g = geometryCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(GEO.w, h, GEO.d, 3, radius);
    geometryCache.set(key, g);
  }
  return g;
}

function edgeBox(h: number): THREE.BufferGeometry {
  const key = `e:${h}`;
  let g = geometryCache.get(key);
  if (!g) {
    g = new THREE.EdgesGeometry(new THREE.BoxGeometry(GEO.w, h, GEO.d));
    geometryCache.set(key, g);
  }
  return g;
}

export type BlockOptions = {
  palette: FacePalette;
  /** Block height in world units (defaults to the standard 1.1). */
  h?: number;
  /** Edge line colour (#rrggbb). Omit for no edges. */
  edge?: string;
  edgeOpacity?: number;
  dashed?: boolean;
  opacity?: number;
  radius?: number;
  shading?: Shading;
};

export type Block3D = THREE.Group & {
  userData: { mesh: THREE.Mesh; material: IsoMaterial; edges?: THREE.LineSegments; h: number };
};

/** A block centred on its own origin (y from -h/2 to h/2). */
export function createBlock(o: BlockOptions): Block3D {
  const h = o.h ?? GEO.h;
  const group = new THREE.Group() as Block3D;
  const material = isoMaterial(o.palette, o.opacity ?? 1, o.shading ?? 'world');
  const mesh = new THREE.Mesh(roundedBox(h, o.radius ?? 0.05), material);
  group.add(mesh);
  group.userData = { mesh, material, h };
  if (o.edge) {
    const lineMaterial = o.dashed
      ? new THREE.LineDashedMaterial({
          color: o.edge,
          dashSize: 0.16,
          gapSize: 0.11,
          transparent: true,
          opacity: o.edgeOpacity ?? 1,
        })
      : new THREE.LineBasicMaterial({ color: o.edge, transparent: true, opacity: o.edgeOpacity ?? 1 });
    const edges = new THREE.LineSegments(edgeBox(h), lineMaterial);
    edges.scale.setScalar(1.002);
    if (o.dashed) edges.computeLineDistances();
    group.add(edges);
    group.userData.edges = edges;
  }
  return group;
}

/** Rotation that turns a block so a camera looking down -z sees it in true isometric view. */
export const ISO_EULER = new THREE.Euler(Math.atan(1 / Math.SQRT2), -Math.PI / 4, 0, 'XYZ');

/** Free GPU resources for everything under `root`. Shared geometries are kept. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = (obj as THREE.Mesh).material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else if (m) m.dispose();
  });
}

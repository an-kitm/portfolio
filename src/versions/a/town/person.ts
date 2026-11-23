import * as THREE from 'three';
import { glowTexture } from './materials';

/**
 * The walker: a small low-poly figure with a walk cycle driven by distance travelled (so the feet never slide),
 * a jump, and a wave for greetings. It faces +z when its yaw is 0.
 */
export interface Walker {
  group: THREE.Group;
  /** World position on the ground (the group follows it, plus the jump height). */
  pos: THREE.Vector3;
  yaw: number;
  /** Turn smoothly towards `yaw` (radians). */
  turnTo(yaw: number, dt: number, snap?: boolean): void;
  jump(): void;
  update(o: { dt: number; time: number; moved: number; wave: boolean; ground: number; marker: number }): void;
}

function mat(color: string, roughness = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

export function createWalker(): Walker {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const shirt = mat('#4f9bf2', 0.55);
  const trousers = mat('#2a3242', 0.7);
  const skin = mat('#e7bd97', 0.6);
  const hair = mat('#2b211a', 0.8);
  const shoe = mat('#e9edf3', 0.5);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 4, 12), shirt);
  torso.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), skin);
  head.position.y = 1.44;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.set(0, 1.46, -0.012);
  hairCap.rotation.x = -0.18;
  body.add(torso, head, hairCap);

  const limb = (r: number, len: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), m);
    mesh.position.y = -(len / 2 + r * 0.6);
    return mesh;
  };
  const pivot = (x: number, y: number, child: THREE.Object3D, extra?: THREE.Object3D) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    p.add(child);
    if (extra) p.add(extra);
    body.add(p);
    return p;
  };
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.22), shoe);
  footL.position.set(0, -0.6, 0.04);
  const footR = footL.clone();
  const legL = pivot(0.1, 0.66, limb(0.075, 0.44, trousers), footL);
  const legR = pivot(-0.1, 0.66, limb(0.075, 0.44, trousers), footR);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skin);
  handL.position.y = -0.5;
  const handR = handL.clone();
  const armL = pivot(0.27, 1.16, limb(0.062, 0.36, shirt), handL);
  const armR = pivot(-0.27, 1.16, limb(0.062, 0.36, shirt), handR);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });

  // A soft contact shadow and a ring that marks the walker in wide shots.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.6, 40),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFB547').multiplyScalar(2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({
      color: '#FFB547',
      map: glowTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  const marks = new THREE.Group();
  marks.add(shadow, ring, glow);

  const scale = 0.78;
  body.scale.setScalar(scale);
  const root = new THREE.Group();
  root.add(group, marks);

  const pos = new THREE.Vector3();
  let yaw = 0;
  let phase = 0;
  let stride = 0;
  let waveAmt = 0;
  let lift = 0;
  let vy = 0;

  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  return {
    group: root,
    pos,
    get yaw() {
      return yaw;
    },
    set yaw(v: number) {
      yaw = v;
    },
    turnTo(target: number, dt: number, snap = false) {
      const diff = wrap(target - yaw);
      yaw = snap ? target : yaw + diff * (1 - Math.exp(-dt * 10));
    },
    jump() {
      if (lift <= 0.001) vy = 4.6;
    },
    update({ dt, time, moved, wave, ground, marker }) {
      const speed = dt > 0 ? moved / dt : 0;
      stride += (Math.min(1, speed / 2.2) - stride) * (1 - Math.exp(-dt * 12));
      phase += moved * 5.2;
      // Jump: simple ballistic arc above whatever ground is underneath.
      if (vy !== 0 || lift > 0) {
        vy -= 13 * dt;
        lift = Math.max(0, lift + vy * dt);
        if (lift === 0) vy = 0;
      }
      const swing = Math.sin(phase) * 0.75 * stride;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      waveAmt += ((wave ? 1 : 0) - waveAmt) * (1 - Math.exp(-dt * 6));
      armR.rotation.x = swing * 0.8 * (1 - waveAmt);
      armR.rotation.z = -waveAmt * (2.5 + Math.sin(time * 9) * 0.32);
      const airborne = lift > 0.02 ? 1 : 0;
      legL.rotation.x += airborne * 0.5;
      legR.rotation.x -= airborne * 0.3;
      body.position.y = Math.abs(Math.cos(phase)) * 0.05 * stride + (1 - stride) * Math.sin(time * 2.2) * 0.008;
      group.position.set(pos.x, ground + lift, pos.z);
      group.rotation.y = yaw;
      marks.position.set(pos.x, ground + 0.012, pos.z);
      shadow.scale.setScalar(1 - Math.min(0.5, lift * 0.4));
      (ring.material as THREE.MeshBasicMaterial).opacity = marker * 0.9;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.25 + marker * 0.35;
    },
  };
}

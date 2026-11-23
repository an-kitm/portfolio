import * as THREE from 'three';

/**
 * Camera pose, orbit-style around a target. Angles in degrees: `az` is measured from +z towards +x,
 * so az 45° with el 35° is the isometric direction. `sx`/`sy` place the target on screen (0..1 of the
 * canvas), which keeps the focused tower beside the text column instead of behind it.
 */
export type Pose = {
  target: THREE.Vector3;
  az: number;
  el: number;
  dist: number;
  sx: number;
  sy: number;
  /** Radius of the floor grid fade around the target. */
  grid: number;
};

const blank = (): Pose => ({ target: new THREE.Vector3(), az: 45, el: 30, dist: 30, sx: 0.5, sy: 0.5, grid: 16 });

function copyPose(into: Pose, from: Pose): void {
  into.target.copy(from.target);
  into.az = from.az;
  into.el = from.el;
  into.dist = from.dist;
  into.sx = from.sx;
  into.sy = from.sy;
  into.grid = from.grid;
}

export function createRig(camera: THREE.PerspectiveCamera) {
  const current = blank();
  const goal = blank();
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  const deg = THREE.MathUtils.degToRad;

  return {
    setGoal(pose: Pose, snap = false): void {
      copyPose(goal, pose);
      if (snap) copyPose(current, pose);
    },
    /** Pointer position in -1..1 (x right, y down). */
    pointer(nx: number, ny: number): void {
      parallax.tx = nx * 1.6;
      parallax.ty = -ny * 1.0;
    },
    resetPointer(): void {
      parallax.tx = 0;
      parallax.ty = 0;
    },
    /** Damp towards the goal and apply the pose to the camera. Returns the current pose. */
    update(dt: number, width: number, height: number, damp: boolean): Pose {
      const k = damp ? 1 - Math.exp(-dt * 2.6) : 1;
      const kp = damp ? 1 - Math.exp(-dt * 3.5) : 1;
      current.target.lerp(goal.target, k);
      current.az += (goal.az - current.az) * k;
      current.el += (goal.el - current.el) * k;
      current.dist += (goal.dist - current.dist) * k;
      current.sx += (goal.sx - current.sx) * k;
      current.sy += (goal.sy - current.sy) * k;
      current.grid += (goal.grid - current.grid) * k;
      parallax.x += (parallax.tx - parallax.x) * kp;
      parallax.y += (parallax.ty - parallax.y) * kp;

      const az = deg(current.az + parallax.x);
      const el = deg(current.el + parallax.y);
      camera.position.set(
        current.target.x + current.dist * Math.sin(az) * Math.cos(el),
        current.target.y + current.dist * Math.sin(el),
        current.target.z + current.dist * Math.cos(az) * Math.cos(el),
      );
      camera.lookAt(current.target);
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        // Shift the frustum so the target lands at (sx, sy) on screen. This also updates the projection.
        camera.setViewOffset(width, height, (0.5 - current.sx) * width, (0.5 - current.sy) * height, width, height);
      }
      return current;
    },
  };
}

import * as THREE from 'three';

/**
 * The timeline floor: one-pixel grid lines along the world x and z axes (which read as the ±30°
 * isometric grid from the camera), fading out radially around the camera target.
 */
export function createGrid(color = '#7D879B', opacity = 0.13) {
  const geometry = new THREE.PlaneGeometry(240, 240);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: 16 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uCenter;
      uniform float uRadius;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vWorld.xz - uCenter.xz);
        float fade = 1.0 - smoothstep(uRadius * 0.2, uRadius, d);
        gl_FragColor = vec4(uColor, line * uOpacity * fade);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;

  return {
    mesh,
    update(center: THREE.Vector3, radius: number): void {
      uniforms.uCenter.value.copy(center);
      uniforms.uRadius.value = radius;
    },
  };
}

import * as THREE from "three";

import { PALETTE } from "../palette";

/** 성운 구의 반지름 (m). 별보다 뒤에 둔다. */
const NEBULA_RADIUS = 1400;

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * 방향 하나로 옅은 구름을 만드는 셰이더.
 *
 * 값 노이즈를 세 겹 겹쳐(fbm) 뭉게뭉게한 덩어리를 만들고, 차가운 색과 따뜻한
 * 색을 그 값으로 섞는다. 텍스처를 쓰지 않으므로 용량이 들지 않는다.
 */
const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vDirection;

  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    // 부드럽게 보간해야 격자가 눈에 띄지 않는다.
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 3; octave += 1) {
      total += valueNoise(p) * amplitude;
      p *= 2.07;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    float density = fbm(vDirection * 2.6);
    // 아래쪽 값을 잘라내 구름이 하늘 전체를 덮지 않게 한다.
    density = smoothstep(0.42, 0.86, density);

    float blend = fbm(vDirection * 1.3 + 21.7);
    vec3 color = mix(uCoolColor, uWarmColor, blend);

    gl_FragColor = vec4(color * density, density * 0.55);
  }
`;

/**
 * 배경 성운.
 *
 * 순수한 검정 배경은 깊이가 없어 함선이 어디쯤 있는지 감이 오지 않는다. 아주
 * 옅은 구름을 깔면 방향 감각이 생기고, 회전할 때 배경이 흐르는 것이 보인다.
 * 별과 마찬가지로 무한히 멀리 있으므로 함선을 그대로 따라다닌다.
 */
export class Nebula {
  public readonly object3D: THREE.Mesh;

  public constructor() {
    const material: THREE.ShaderMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uCoolColor: { value: new THREE.Color(PALETTE.NebulaCool) },
        uWarmColor: { value: new THREE.Color(PALETTE.NebulaWarm) },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    this.object3D = new THREE.Mesh(
      new THREE.SphereGeometry(NEBULA_RADIUS, 32, 24),
      material,
    );
    this.object3D.name = "Nebula";
    this.object3D.frustumCulled = false;
    // 별보다도 뒤에 그린다.
    this.object3D.renderOrder = -2;
  }

  /** 성운을 함선 위치로 옮긴다. 매 프레임 호출한다. */
  public follow(shipPosition: THREE.Vector3): void {
    this.object3D.position.copy(shipPosition);
  }
}

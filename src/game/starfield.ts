import * as THREE from "three";

import { STARFIELD } from "../constants";

/** 별의 색 편차. 청백색과 옅은 주황색 사이를 오간다. */
const STAR_COLD: THREE.Color = new THREE.Color(0xbcd8ff);
const STAR_WARM: THREE.Color = new THREE.Color(0xffd9a8);

/**
 * 원거리 배경 별.
 *
 * 구면에 균일하게 분포시키고 매 프레임 함선 위치로 통째로 옮긴다. 그 결과
 * 이동해도 별은 흐르지 않고 회전에만 반응한다 — 실제 항성이 그렇게 보인다.
 */
export class Starfield {
  public readonly object3D: THREE.Points;

  public constructor() {
    const positions: Float32Array = new Float32Array(STARFIELD.Count * 3);
    const colors: Float32Array = new Float32Array(STARFIELD.Count * 3);
    const color: THREE.Color = new THREE.Color();

    for (let index = 0; index < STARFIELD.Count; index += 1) {
      // 구면 균일 분포. z 를 균등 샘플링해야 극에 몰리지 않는다.
      const z: number = Math.random() * 2 - 1;
      const azimuth: number = Math.random() * Math.PI * 2;
      const planarRadius: number = Math.sqrt(1 - z * z);

      const offset: number = index * 3;
      positions[offset] = Math.cos(azimuth) * planarRadius * STARFIELD.Radius;
      positions[offset + 1] = z * STARFIELD.Radius;
      positions[offset + 2] = Math.sin(azimuth) * planarRadius * STARFIELD.Radius;

      color.copy(STAR_COLD).lerp(STAR_WARM, Math.random() ** 3);
      const brightness: number = 0.35 + Math.random() ** 2 * 0.65;
      colors[offset] = color.r * brightness;
      colors[offset + 1] = color.g * brightness;
      colors[offset + 2] = color.b * brightness;
    }

    const geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material: THREE.PointsMaterial = new THREE.PointsMaterial({
      size: STARFIELD.PointSize,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });

    this.object3D = new THREE.Points(geometry, material);
    this.object3D.name = "Starfield";
    // 항상 다른 모든 것보다 뒤에 그린다.
    this.object3D.frustumCulled = false;
    this.object3D.renderOrder = -1;
  }

  /** 별 구를 함선 위치로 옮긴다. 매 프레임 호출한다. */
  public follow(shipPosition: THREE.Vector3): void {
    this.object3D.position.copy(shipPosition);
  }
}

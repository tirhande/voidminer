import * as THREE from "three";

import { DUST_FIELD } from "../constants";
import { getDotTexture } from "../rendering/dot-texture";

/**
 * 함선 주변을 감싸는 근거리 부유 입자.
 *
 * 함선 기준 정육면체 밖으로 벗어난 입자를 반대편으로 감아 넣어, 언제나 함선이
 * 입자 구름 한가운데에 있도록 유지한다. 이동에 따라 입자가 흘러가므로 속도가
 * 눈으로 보인다.
 */
export class DustField {
  public readonly object3D: THREE.Points;

  private readonly positions: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;

  public constructor(origin: THREE.Vector3) {
    const half: number = DUST_FIELD.FieldSize / 2;
    this.positions = new Float32Array(DUST_FIELD.Count * 3);

    for (let index = 0; index < DUST_FIELD.Count; index += 1) {
      const offset: number = index * 3;
      this.positions[offset] = origin.x + (Math.random() * 2 - 1) * half;
      this.positions[offset + 1] = origin.y + (Math.random() * 2 - 1) * half;
      this.positions[offset + 2] = origin.z + (Math.random() * 2 - 1) * half;
    }

    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);

    const geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positionAttribute);

    const material: THREE.PointsMaterial = new THREE.PointsMaterial({
      // 그림을 안 씌우면 점이 정사각형으로 그려진다. 이 입자는 카메라 바로
      // 옆을 스쳐 지나가므로 부스트 중에 네모가 그대로 드러난다.
      map: getDotTexture(),
      color: 0x9fc4dd,
      size: DUST_FIELD.PointSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    this.object3D = new THREE.Points(geometry, material);
    this.object3D.name = "DustField";
    this.object3D.frustumCulled = false;
  }

  /** 함선을 벗어난 입자를 반대편으로 감는다. 매 프레임 호출한다. */
  public wrapAround(shipPosition: THREE.Vector3): void {
    const size: number = DUST_FIELD.FieldSize;
    const half: number = size / 2;
    let moved: boolean = false;

    for (let index = 0; index < DUST_FIELD.Count; index += 1) {
      const offset: number = index * 3;

      const dx: number = this.positions[offset] - shipPosition.x;
      if (dx > half) {
        this.positions[offset] -= size;
        moved = true;
      } else if (dx < -half) {
        this.positions[offset] += size;
        moved = true;
      }

      const dy: number = this.positions[offset + 1] - shipPosition.y;
      if (dy > half) {
        this.positions[offset + 1] -= size;
        moved = true;
      } else if (dy < -half) {
        this.positions[offset + 1] += size;
        moved = true;
      }

      const dz: number = this.positions[offset + 2] - shipPosition.z;
      if (dz > half) {
        this.positions[offset + 2] -= size;
        moved = true;
      } else if (dz < -half) {
        this.positions[offset + 2] += size;
        moved = true;
      }
    }

    if (moved) {
      this.positionAttribute.needsUpdate = true;
    }
  }
}

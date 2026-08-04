import * as THREE from "three";

import { TRACTOR_BEAM } from "../constants";
import { PALETTE } from "../palette";

/** 한 번에 그릴 수 있는 견인 줄기의 최대 수. */
const MAX_STRANDS = 64;

/** 함선 아래쪽에서 견인빔이 나가는 지점 (로컬 좌표). */
const EMITTER_OFFSET: THREE.Vector3 = new THREE.Vector3(0, -0.5, 0.4);

const scratchEmitter: THREE.Vector3 = new THREE.Vector3();

/**
 * 견인빔의 시각 표현.
 *
 * 채굴 레이저와 달리 견인빔은 범위 안의 모든 파편에 동시에 작용하므로, 하나의
 * 빔이 아니라 붙잡은 파편마다 줄기를 그린다. 무엇을 끌어당기는 중인지가 그대로
 * 보이면 사거리 밖이라 안 되는 것인지 조작이 안 먹는 것인지를 구분할 수 있다.
 */
export class TractorBeam {
  public readonly object3D: THREE.Group;

  private readonly strands: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly rangeRing: THREE.Mesh;
  private pulseSeconds: number = 0;

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "TractorBeam";

    this.positions = new Float32Array(MAX_STRANDS * 2 * 3);
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);

    const geometry: THREE.BufferGeometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positionAttribute);
    geometry.setDrawRange(0, 0);

    this.strands = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: PALETTE.Signal,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.strands.frustumCulled = false;
    this.object3D.add(this.strands);

    // 사거리를 알려주는 고리. 빔을 켠 동안에만 보인다.
    this.rangeRing = new THREE.Mesh(
      new THREE.TorusGeometry(TRACTOR_BEAM.Range, 0.35, 6, 48),
      new THREE.MeshBasicMaterial({
        color: PALETTE.Signal,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    this.rangeRing.rotation.x = Math.PI / 2;
    this.object3D.add(this.rangeRing);

    this.setVisible(false);
  }

  /**
   * 견인 줄기를 갱신한다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param isActive 견인빔 사용 여부
   * @param shipPosition 함선 위치
   * @param shipQuaternion 함선 회전
   * @param pulledDebris 이번 프레임에 끌려오는 파편 위치들
   */
  public update(
    deltaSeconds: number,
    isActive: boolean,
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion,
    pulledDebris: ReadonlyArray<THREE.Vector3>,
  ): void {
    if (!isActive) {
      this.setVisible(false);
      return;
    }

    this.pulseSeconds += deltaSeconds;
    this.setVisible(true);

    this.rangeRing.position.copy(shipPosition);
    // 고리가 맥동하면 켜져 있다는 것이 파편이 없어도 전달된다.
    const pulse: number = 0.12 + (Math.sin(this.pulseSeconds * 3) + 1) * 0.05;
    (this.rangeRing.material as THREE.MeshBasicMaterial).opacity = pulse;

    scratchEmitter.copy(EMITTER_OFFSET).applyQuaternion(shipQuaternion).add(shipPosition);

    const strandCount: number = Math.min(pulledDebris.length, MAX_STRANDS);
    for (let index = 0; index < strandCount; index += 1) {
      const target: THREE.Vector3 = pulledDebris[index];
      const offset: number = index * 6;
      this.positions[offset] = scratchEmitter.x;
      this.positions[offset + 1] = scratchEmitter.y;
      this.positions[offset + 2] = scratchEmitter.z;
      this.positions[offset + 3] = target.x;
      this.positions[offset + 4] = target.y;
      this.positions[offset + 5] = target.z;
    }

    this.positionAttribute.needsUpdate = true;
    this.strands.geometry.setDrawRange(0, strandCount * 2);
    this.strands.visible = strandCount > 0;
  }

  private setVisible(isVisible: boolean): void {
    this.object3D.visible = isVisible;
    if (!isVisible) {
      this.strands.geometry.setDrawRange(0, 0);
    }
  }
}

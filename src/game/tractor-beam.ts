import * as THREE from "three";

import { PALETTE, POINT_LIGHT } from "../palette";

/** 한 번에 그릴 수 있는 견인 줄기의 최대 수. */
const MAX_STRANDS = 64;

/** 함선 아래쪽에서 견인빔이 나가는 지점 (로컬 좌표). */
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
  /** 줄기가 나가는 지점. 함선 로컬 좌표다 */
  private readonly emitterOffset: THREE.Vector3 = new THREE.Vector3(0, -0.5, 0.4);
  private readonly emitter: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly emitterLight: THREE.PointLight;
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

    // 방출구 발광. 빔을 켠 동안 함선 아래에서 맥동한다.
    //
    // 한때 사거리를 알려주는 90m 고리를 그렸다. 그 고리는 월드 수평면에 누워
    // 있고 카메라도 거의 같은 평면에 있어서, 옆에서 본 고리가 화면을 가로지르는
    // 선 하나로 보였다. 블룸까지 얹히면 흰 줄이 된다. 사거리는 HUD 의 붙잡은
    // 개수로 알리고, 여기서는 켜졌다는 것만 전한다.
    this.emitter = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshBasicMaterial({
        color: PALETTE.Signal,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.object3D.add(this.emitter);

    this.emitterLight = new THREE.PointLight(PALETTE.Signal, 0, 40, 2);
    this.object3D.add(this.emitterLight);

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
  /** 줄기가 나가는 지점을 정한다. 함선이 장착 위치를 알려준다. */
  public setEmitter(offset: THREE.Vector3): void {
    this.emitterOffset.copy(offset);
  }

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

    scratchEmitter.copy(this.emitterOffset).applyQuaternion(shipQuaternion).add(shipPosition);

    // 방출구가 맥동하면 파편이 하나도 없어도 켜진 것이 전달된다.
    const pulse: number = 1 + Math.sin(this.pulseSeconds * 6) * 0.3;
    this.emitter.position.copy(scratchEmitter);
    this.emitter.scale.setScalar(pulse);
    this.emitter.material.opacity = 0.5 + (pulse - 1) * 0.6;
    this.emitterLight.position.copy(scratchEmitter);
    this.emitterLight.intensity = POINT_LIGHT.TractorEmitter * pulse;

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

import * as THREE from "three";

import { BEAM_LOOK, TRACTOR_BEAM } from "../constants";
import { PALETTE, POINT_LIGHT } from "../palette";
import { createBeamShellMaterial } from "../rendering/beam-material";
import { getDotTexture } from "../rendering/dot-texture";

/** 한 번에 그릴 수 있는 견인 줄기의 최대 수. */
const MAX_STRANDS = 24;

/** 원뿔 지오메트리의 기준 축. */
const CONE_AXIS: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

const scratchEmitter: THREE.Vector3 = new THREE.Vector3();
const scratchDirection: THREE.Vector3 = new THREE.Vector3();
const scratchMidpoint: THREE.Vector3 = new THREE.Vector3();

/** 줄기 하나를 이루는 부품 묶음. */
type Strand = {
  /** 방출구에서 파편까지 좁아지는 원뿔. 잡는 힘이 부피로 보인다 */
  readonly cone: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  /** 파편을 감싸는 구. 무엇이 잡혔는지 알린다 */
  readonly grip: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

/**
 * 견인빔의 시각 표현.
 *
 * 채굴 레이저와 달리 견인빔은 범위 안의 여러 파편에 동시에 작용하므로, 하나의
 * 빔이 아니라 붙잡은 파편마다 줄기를 그린다. 무엇을 끌어당기는 중인지가 그대로
 * 보이면 사거리 밖이라 안 되는 것인지 조작이 안 먹는 것인지를 구분할 수 있다.
 *
 * 줄기를 선분으로 그리면 실로 보인다. 견인은 "당긴다"가 아니라 "잡혀 있다"로
 * 읽혀야 하므로 부피가 있어야 한다. 방출구 쪽이 넓고 파편 쪽이 좁은 원뿔로
 * 그리고, 그 안에서 입자가 함선 쪽으로 흐른다. 방향이 보여야 당기는 것이 된다.
 */
export class TractorBeam {
  public readonly object3D: THREE.Group;

  private readonly strands: Strand[] = [];
  /** 원뿔 안을 함선 쪽으로 흐르는 입자. 당기는 방향을 알린다 */
  private readonly flow: THREE.Points;
  private readonly flowPositions: Float32Array;
  private readonly flowAttribute: THREE.BufferAttribute;
  /** 줄기가 나가는 지점. 함선 로컬 좌표다 */
  private readonly emitterOffset: THREE.Vector3 = new THREE.Vector3(0, -0.5, 0.4);
  private readonly emitter: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly emitterLight: THREE.PointLight;
  private pulseSeconds: number = 0;

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "TractorBeam";

    for (let index = 0; index < MAX_STRANDS; index += 1) {
      // 위가 좁고 아래가 넓은 원기둥이 곧 원뿔이다. 파편 쪽을 좁게 둔다.
      const cone: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial> = new THREE.Mesh(
        new THREE.CylinderGeometry(
          BEAM_LOOK.TractorMouthRadius * 0.25,
          BEAM_LOOK.TractorMouthRadius,
          1,
          10,
          1,
          true,
        ),
        createBeamShellMaterial(PALETTE.Signal),
      );
      cone.name = "TractorCone";
      cone.visible = false;
      this.object3D.add(cone);

      const grip: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(
        new THREE.SphereGeometry(BEAM_LOOK.GripRadius, 10, 10),
        new THREE.MeshBasicMaterial({
          color: PALETTE.Signal,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      grip.name = "TractorGrip";
      grip.visible = false;
      this.object3D.add(grip);

      this.strands.push({ cone, grip });
    }

    this.flowPositions = new Float32Array(MAX_STRANDS * BEAM_LOOK.FlowParticles * 3);
    this.flowAttribute = new THREE.BufferAttribute(this.flowPositions, 3);
    this.flowAttribute.setUsage(THREE.DynamicDrawUsage);

    const flowGeometry: THREE.BufferGeometry = new THREE.BufferGeometry();
    flowGeometry.setAttribute("position", this.flowAttribute);
    flowGeometry.setDrawRange(0, 0);

    this.flow = new THREE.Points(
      flowGeometry,
      new THREE.PointsMaterial({
        // 그림을 안 씌우면 점이 정사각형으로 그려진다. 가까이 두는 입자라
        // 흰 네모가 그대로 보인다.
        map: getDotTexture(),
        color: PALETTE.Signal,
        size: 0.9,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flow.frustumCulled = false;
    this.object3D.add(this.flow);

    // 방출구 발광. 빔을 켠 동안 함선 아래에서 맥동한다.
    //
    // 한때 사거리를 알려주는 고리를 그렸다. 그 고리는 월드 수평면에 누워
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
        blending: THREE.AdditiveBlending,
      }),
    );
    this.emitter.name = "TractorEmitter";
    this.object3D.add(this.emitter);

    this.emitterLight = new THREE.PointLight(PALETTE.Signal, 0, 40, 2);
    this.object3D.add(this.emitterLight);

    this.setVisible(false);
  }

  /** 줄기가 나가는 지점을 정한다. 함선이 장착 위치를 알려준다. */
  public setEmitter(offset: THREE.Vector3): void {
    this.emitterOffset.copy(offset);
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

    scratchEmitter.copy(this.emitterOffset).applyQuaternion(shipQuaternion).add(shipPosition);

    // 방출구가 맥동하면 파편이 하나도 없어도 켜진 것이 전달된다.
    const pulse: number = 1 + Math.sin(this.pulseSeconds * 6) * 0.3;
    this.emitter.position.copy(scratchEmitter);
    this.emitter.scale.setScalar(pulse);
    this.emitter.material.opacity = 0.5 + (pulse - 1) * 0.6;
    this.emitterLight.position.copy(scratchEmitter);
    this.emitterLight.intensity = POINT_LIGHT.TractorEmitter * pulse;

    const strandCount: number = Math.min(pulledDebris.length, MAX_STRANDS);
    let flowIndex: number = 0;

    for (let index = 0; index < MAX_STRANDS; index += 1) {
      const strand: Strand = this.strands[index];
      if (index >= strandCount) {
        strand.cone.visible = false;
        strand.grip.visible = false;
        continue;
      }

      const target: THREE.Vector3 = pulledDebris[index];
      scratchDirection.subVectors(target, scratchEmitter);
      const length: number = scratchDirection.length();
      if (length < 1e-3) {
        strand.cone.visible = false;
        strand.grip.visible = false;
        continue;
      }
      scratchDirection.divideScalar(length);

      scratchMidpoint
        .copy(scratchEmitter)
        .addScaledVector(scratchDirection, length * 0.5);

      strand.cone.position.copy(scratchMidpoint);
      strand.cone.quaternion.setFromUnitVectors(CONE_AXIS, scratchDirection);
      strand.cone.scale.set(1, length, 1);
      strand.cone.material.uniforms.elapsed.value = this.pulseSeconds;
      strand.cone.material.uniforms.strength.value = 0.7;
      strand.cone.visible = true;

      // 잡힌 것이 무엇인지 표시한다. 없으면 원뿔이 허공을 가리키는 것으로 보인다.
      strand.grip.position.copy(target);
      strand.grip.scale.setScalar(0.8 + Math.sin(this.pulseSeconds * 9 + index) * 0.12);
      strand.grip.visible = true;

      flowIndex = this.writeFlow(flowIndex, scratchEmitter, target, index);
    }

    this.flowAttribute.needsUpdate = true;
    this.flow.geometry.setDrawRange(0, flowIndex);
    this.flow.visible = flowIndex > 0;
  }

  /**
   * 원뿔 안을 흐르는 입자 자리를 쓴다.
   *
   * 파편에서 함선 쪽으로 흐른다. 흐르는 방향이 보여야 "당기는 중"으로 읽힌다.
   * 반대로 흐르면 밀어내는 것으로 보인다.
   *
   * @returns 다음에 쓸 입자 번호
   */
  private writeFlow(
    startIndex: number,
    emitter: THREE.Vector3,
    target: THREE.Vector3,
    strandIndex: number,
  ): number {
    let cursor: number = startIndex;

    for (let step = 0; step < BEAM_LOOK.FlowParticles; step += 1) {
      // 파편 쪽 1 에서 함선 쪽 0 으로 흐른다. 줄기마다 시작 위상을 어긋나게
      // 두어 여러 줄기가 한 몸처럼 깜빡이지 않게 한다.
      const phase: number =
        (step / BEAM_LOOK.FlowParticles + strandIndex * 0.13 + this.pulseSeconds * 0.8) % 1;
      const ratio: number = 1 - phase;

      const offset: number = cursor * 3;
      this.flowPositions[offset] = emitter.x + (target.x - emitter.x) * ratio;
      this.flowPositions[offset + 1] = emitter.y + (target.y - emitter.y) * ratio;
      this.flowPositions[offset + 2] = emitter.z + (target.z - emitter.z) * ratio;
      cursor += 1;
    }

    return cursor;
  }

  /** 흡인 반경. 사거리 표시가 필요한 곳에서 참조한다. */
  public get range(): number {
    return TRACTOR_BEAM.Range;
  }

  private setVisible(isVisible: boolean): void {
    this.object3D.visible = isVisible;
    if (isVisible) {
      return;
    }

    // 묶음을 감추는 것만으로는 화면에서 안 보일 뿐 상태는 켜진 채로 남는다.
    // 줄기 하나하나를 내려야 다음에 켤 때 지난 자리가 한 프레임 비친다.
    this.flow.geometry.setDrawRange(0, 0);
    this.flow.visible = false;
    for (const strand of this.strands) {
      strand.cone.visible = false;
      strand.grip.visible = false;
    }
  }
}

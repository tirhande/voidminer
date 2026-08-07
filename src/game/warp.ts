import * as THREE from "three";

import { WARP } from "../constants";
import { PALETTE } from "../palette";

/** 워프 진행 단계. */
export const WARP_PHASE = {
  /** 워프 중이 아니다 */
  Idle: "IDLE",
  /** 별이 늘어난다 */
  Accelerate: "ACCELERATE",
  /** 최대 길이로 흐른다 */
  Cruise: "CRUISE",
  /** 다시 점으로 돌아온다 */
  Decelerate: "DECELERATE",
} as const;

export type WarpPhase = (typeof WARP_PHASE)[keyof typeof WARP_PHASE];

const TOTAL_SECONDS: number =
  WARP.AccelerateSeconds + WARP.CruiseSeconds + WARP.DecelerateSeconds;

/** 항성계가 갈리는 시점. 항행 구간 한가운데다. */
const SWITCH_AT: number = WARP.AccelerateSeconds + WARP.CruiseSeconds * 0.5;

/** 0~1 을 부드럽게 만든다. 시작과 끝의 급변을 없앤다. */
function smoothstep(value: number): number {
  const clamped: number = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 워프 연출.
 *
 * 별이 뒤로 쭉 늘어나는 그 장면이다. 배경 별은 점이라 늘일 수 없어서, 워프
 * 동안만 켜지는 선 다발을 따로 둔다. 선은 시선 방향으로 뻗고 길이가 0 에서
 * 최대로 늘었다가 다시 0 으로 줄어든다. 늘어나는 순간이 가속으로 읽히고
 * 줄어드는 순간이 도착으로 읽힌다.
 *
 * GDD 05 는 워프가 죽은 시간이 되면 안 된다고 했다. 거부한 것은 길이이지
 * 연출이 아니므로 전체를 2.4 초로 둔다.
 *
 * 항성계 교체는 항행 구간 한가운데에서 일어난다. 화면이 가장 흐트러져 있을 때
 * 바꿔야 소행성이 사라지고 나타나는 것이 안 보인다.
 */
export class Warp {
  public readonly object3D: THREE.LineSegments;

  private elapsed: number = 0;
  private active: boolean = false;
  private switched: boolean = false;
  /** 도착하면 부를 것. 항성계 교체를 맡긴다 */
  private onSwitch: (() => void) | null = null;
  /** 연출이 다 끝나면 부를 것 */
  private onFinish: (() => void) | null = null;

  private readonly basePositions: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  public constructor() {
    // 선 하나에 정점 둘. 앞쪽 정점은 고정하고 뒤쪽만 늘린다.
    this.basePositions = new Float32Array(WARP.StreakCount * 3);
    const positions: Float32Array = new Float32Array(WARP.StreakCount * 6);

    for (let index = 0; index < WARP.StreakCount; index += 1) {
      // 시선 축 주변에 고리 모양으로 흩는다. 정면 한가운데는 비워야 앞이 보인다.
      const azimuth: number = Math.random() * Math.PI * 2;
      const radius: number =
        WARP.StreakRadius * (0.15 + Math.sqrt(Math.random()) * 0.85);
      const depth: number = (Math.random() * 2 - 1) * WARP.StreakRadius;

      const offset: number = index * 3;
      this.basePositions[offset] = Math.cos(azimuth) * radius;
      this.basePositions[offset + 1] = Math.sin(azimuth) * radius;
      this.basePositions[offset + 2] = depth;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({
      color: PALETTE.Signal,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.object3D = new THREE.LineSegments(this.geometry, material);
    this.object3D.name = "Warp";
    this.object3D.frustumCulled = false;
    this.object3D.visible = false;
  }

  /** 워프 중인지 여부. 이 동안에는 조종을 받지 않는다. */
  public get isActive(): boolean {
    return this.active;
  }

  /** 지금 어느 단계인지. */
  public get phase(): WarpPhase {
    if (!this.active) {
      return WARP_PHASE.Idle;
    }
    if (this.elapsed < WARP.AccelerateSeconds) {
      return WARP_PHASE.Accelerate;
    }
    if (this.elapsed < WARP.AccelerateSeconds + WARP.CruiseSeconds) {
      return WARP_PHASE.Cruise;
    }
    return WARP_PHASE.Decelerate;
  }

  /** 연출의 세기 (0~1). 시야각을 벌리는 데 쓴다. */
  public get intensity(): number {
    if (!this.active) {
      return 0;
    }
    if (this.elapsed < WARP.AccelerateSeconds) {
      return smoothstep(this.elapsed / WARP.AccelerateSeconds);
    }
    if (this.elapsed < WARP.AccelerateSeconds + WARP.CruiseSeconds) {
      return 1;
    }
    const remaining: number = TOTAL_SECONDS - this.elapsed;
    return smoothstep(remaining / WARP.DecelerateSeconds);
  }

  /**
   * 워프를 시작한다.
   *
   * @param onSwitch 항성계를 갈아끼울 때 부를 것. 한가운데에서 한 번 불린다
   * @param onFinish 연출이 다 끝나면 부를 것
   */
  public start(onSwitch: () => void, onFinish: () => void): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.switched = false;
    this.elapsed = 0;
    this.onSwitch = onSwitch;
    this.onFinish = onFinish;
    this.object3D.visible = true;
  }

  /**
   * 한 프레임 진행한다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param camera 선 다발을 붙일 카메라. 시선 방향으로 늘어나야 한다
   */
  public update(deltaSeconds: number, camera: THREE.Camera): void {
    if (!this.active) {
      return;
    }

    this.elapsed += deltaSeconds;

    if (!this.switched && this.elapsed >= SWITCH_AT) {
      this.switched = true;
      this.onSwitch?.();
    }

    if (this.elapsed >= TOTAL_SECONDS) {
      this.finish();
      return;
    }

    // 카메라에 붙여야 시선 축을 따라 흐른다. 함선이 어디를 보든 정면으로 흐른다.
    camera.getWorldPosition(this.object3D.position);
    camera.getWorldQuaternion(this.object3D.quaternion);

    const strength: number = this.intensity;
    const length: number = WARP.StreakLength * strength;
    const positions: THREE.BufferAttribute = this.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    for (let index = 0; index < WARP.StreakCount; index += 1) {
      const source: number = index * 3;
      const x: number = this.basePositions[source];
      const y: number = this.basePositions[source + 1];
      const z: number = this.basePositions[source + 2];

      // 카메라 기준 -z 가 앞이다. 별은 뒤로 흐르므로 +z 방향으로 늘인다.
      positions.setXYZ(index * 2, x, y, z);
      positions.setXYZ(index * 2 + 1, x, y, z + length);
    }
    positions.needsUpdate = true;

    (this.object3D.material as THREE.LineBasicMaterial).opacity = strength;
  }

  /** 정리한다. */
  public dispose(): void {
    this.geometry.dispose();
    (this.object3D.material as THREE.Material).dispose();
  }

  private finish(): void {
    this.active = false;
    this.elapsed = 0;
    this.object3D.visible = false;
    (this.object3D.material as THREE.LineBasicMaterial).opacity = 0;

    const finished: (() => void) | null = this.onFinish;
    this.onSwitch = null;
    this.onFinish = null;
    finished?.();
  }
}

import * as THREE from "three";

import { MINING_LASER } from "../constants";
import { PALETTE, POINT_LIGHT } from "../palette";
import type { Asteroid } from "./asteroid";
import type { AsteroidField } from "./asteroid-field";
import type { DebrisField } from "./debris-field";
import type { MiningEligibility, ShipEquipment } from "./equipment";
import { MINERAL_DEFINITIONS } from "./minerals";

/** 캘 수 있을 때의 빔 색. */
const BEAM_COLOR_ALLOWED = PALETTE.Active;
/** 캘 수 없을 때의 빔 색. 색이 1차 신호이므로 글보다 먼저 읽혀야 한다. */
const BEAM_COLOR_LOCKED = PALETTE.Locked;

/** 함선 코끝에서 빔이 나가는 지점 (로컬 좌표). */
/** 원기둥 지오메트리의 기준 축. */
const CYLINDER_AXIS: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

const scratchMuzzle: THREE.Vector3 = new THREE.Vector3();
const scratchDirection: THREE.Vector3 = new THREE.Vector3();
const scratchMidpoint: THREE.Vector3 = new THREE.Vector3();
const scratchOutward: THREE.Vector3 = new THREE.Vector3();
const screenCenter: THREE.Vector2 = new THREE.Vector2(0, 0);

/** 조준 결과. HUD 가 조준점 아래에 띄울 내용이다. */
export type AimReport = {
  /** 조준 중인 소행성이 있는지 */
  readonly hasTarget: boolean;
  /** 광물 이름. 대상이 없으면 null */
  readonly mineralName: string | null;
  /** 캘 수 있는지 */
  readonly isAllowed: boolean;
  /** 캘 수 없을 때의 사유 한 줄. 캘 수 있으면 null */
  readonly requirementText: string | null;
  /** 남은 매장량. 대상이 없으면 null */
  readonly remaining: number | null;
};

const NO_TARGET: AimReport = {
  hasTarget: false,
  mineralName: null,
  isAllowed: false,
  requirementText: null,
  remaining: null,
};

/**
 * 채굴 레이저.
 *
 * 조준은 화면 중앙 조준점 기준이다. 카메라에서 쏜 광선으로 판정해야 플레이어가
 * 보는 조준점과 실제 명중 지점이 어긋나지 않는다. 빔 자체는 함선 코끝에서
 * 나가도록 그린다.
 */
export class MiningLaser {
  public readonly object3D: THREE.Group;

  private readonly raycaster: THREE.Raycaster = new THREE.Raycaster();
  /**
   * 빔이 나가는 지점. 함선 로컬 좌표다.
   *
   * 선체에 장착 모듈이 붙으면 그 자리에서 나가야 한다. 모델 크기에 따라
   * 자리가 달라지므로 함선이 정해서 알려준다.
   */
  private readonly muzzleOffset: THREE.Vector3 = new THREE.Vector3(0, -0.2, -2.2);
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly impact: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly impactLight: THREE.PointLight;

  /** 파편 하나를 채우기 위해 쌓아둔 광물량. */
  private pendingMineral: number = 0;
  /** 직전 프레임에 조준하던 소행성. 대상이 바뀌면 누적을 버린다 */
  private lastTarget: Asteroid | null = null;
  /** 명중 지점 맥동에 쓰는 누적 시간. */
  private pulseSeconds: number = 0;

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "MiningLaser";

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: BEAM_COLOR_ALLOWED,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.beam.visible = false;
    this.object3D.add(this.beam);

    this.impact = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({
        color: BEAM_COLOR_ALLOWED,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.impact.visible = false;
    this.object3D.add(this.impact);

    this.impactLight = new THREE.PointLight(BEAM_COLOR_ALLOWED, 0, 60, 2);
    this.object3D.add(this.impactLight);

    this.raycaster.far = MINING_LASER.Range;
  }

  /**
   * 한 프레임만큼 조준과 채굴을 처리한다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param camera 조준 판정에 쓸 카메라
   * @param shipPosition 함선 위치
   * @param shipQuaternion 함선 회전. 빔이 나가는 지점을 구하는 데 쓴다
   * @param isFiring 발사 입력 여부
   * @param equipment 장착 장비 상태
   * @param field 소행성 필드
   * @param debris 파편을 만들 대상
   */
  /** 빔이 나가는 지점을 정한다. 함선이 장착 위치를 알려준다. */
  public setMuzzle(offset: THREE.Vector3): void {
    this.muzzleOffset.copy(offset);
  }

  public update(
    deltaSeconds: number,
    camera: THREE.Camera,
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion,
    isFiring: boolean,
    equipment: ShipEquipment,
    field: AsteroidField,
    debris: DebrisField,
  ): AimReport {
    this.pulseSeconds += deltaSeconds;

    const hit: THREE.Intersection | null = this.castAtCenter(camera, field);
    if (hit === null) {
      this.hideBeam();
      this.lastTarget = null;
      this.pendingMineral = 0;
      return NO_TARGET;
    }

    const asteroid: Asteroid | null = field.findByMesh(hit.object);
    if (asteroid === null) {
      this.hideBeam();
      return NO_TARGET;
    }

    if (asteroid !== this.lastTarget) {
      // 대상이 바뀌면 덜 찬 파편은 버린다. 여러 소행성을 훑어 파편을 모으는
      // 편법을 막고, 하나를 끝까지 캐는 쪽이 이득이 되게 한다.
      this.pendingMineral = 0;
      this.lastTarget = asteroid;
    }

    const eligibility: MiningEligibility = equipment.evaluateMining(asteroid.mineral);

    if (isFiring) {
      this.showBeam(shipPosition, shipQuaternion, hit.point, eligibility.isAllowed);
      if (eligibility.isAllowed) {
        this.mine(deltaSeconds, equipment, asteroid, hit.point, debris);
      }
    } else {
      this.hideBeam();
    }

    return {
      hasTarget: true,
      mineralName: asteroid.mineral.displayName,
      isAllowed: eligibility.isAllowed,
      requirementText: eligibility.requirementText,
      remaining: Math.ceil(asteroid.remaining),
    };
  }

  private castAtCenter(
    camera: THREE.Camera,
    field: AsteroidField,
  ): THREE.Intersection | null {
    this.raycaster.setFromCamera(screenCenter, camera);
    // 모델이 여러 메시로 나뉘어 있으므로 하위까지 훑는다.
    const hits: THREE.Intersection[] = this.raycaster.intersectObjects(
      field.raycastTargets,
      true,
    );
    return hits.length > 0 ? hits[0] : null;
  }

  private mine(
    deltaSeconds: number,
    equipment: ShipEquipment,
    asteroid: Asteroid,
    hitPoint: THREE.Vector3,
    debris: DebrisField,
  ): void {
    const requested: number = equipment.laserYieldPerSecond * deltaSeconds;
    this.pendingMineral += asteroid.mine(requested);

    while (this.pendingMineral >= MINING_LASER.MineralPerDebris) {
      this.pendingMineral -= MINING_LASER.MineralPerDebris;

      scratchOutward.subVectors(hitPoint, asteroid.position).normalize();

      // 가끔 짝인 광물이 나온다. 산출이 사라지는 것이 아니라 바뀌는 것이라
      // 바닥이 깎이지 않는다. 짝은 다음 티어 합금의 재료다.
      const yieldsPair: boolean =
        equipment.evaluateMining(MINERAL_DEFINITIONS[asteroid.mineral.pair]).isAllowed &&
        Math.random() < MINING_LASER.PairYieldChance;
      const produced = yieldsPair ? asteroid.mineral.pair : asteroid.mineral.id;

      debris.spawn(hitPoint, scratchOutward, produced, MINING_LASER.MineralPerDebris);
    }
  }

  private showBeam(
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion,
    hitPoint: THREE.Vector3,
    isAllowed: boolean,
  ): void {
    scratchMuzzle.copy(this.muzzleOffset).applyQuaternion(shipQuaternion).add(shipPosition);
    scratchDirection.subVectors(hitPoint, scratchMuzzle);
    const length: number = scratchDirection.length();
    if (length < 1e-3) {
      this.hideBeam();
      return;
    }

    const color: number = isAllowed ? BEAM_COLOR_ALLOWED : BEAM_COLOR_LOCKED;

    scratchMidpoint.copy(scratchMuzzle).addScaledVector(scratchDirection, 0.5);
    this.beam.position.copy(scratchMidpoint);
    this.beam.quaternion.setFromUnitVectors(
      CYLINDER_AXIS,
      scratchDirection.divideScalar(length),
    );
    this.beam.scale.set(1, length, 1);
    this.beam.material.color.setHex(color);
    this.beam.material.opacity = isAllowed ? 0.85 : 0.55;
    this.beam.visible = true;

    this.impact.position.copy(hitPoint);
    this.impact.material.color.setHex(color);
    this.impact.visible = true;

    if (isAllowed) {
      // 맥동하는 빛으로 "먹히고 있다"를 알린다.
      const pulse: number = 1 + Math.sin(this.pulseSeconds * 22) * 0.25;
      this.impact.scale.setScalar(1.5 * pulse);
      this.impact.material.opacity = 0.9;
      this.impactLight.position.copy(hitPoint);
      this.impactLight.color.setHex(color);
      this.impactLight.intensity = POINT_LIGHT.MiningImpact * pulse;
    } else {
      // 튕긴다. 빛 없이 작게 흔들리기만 한다 — 빔이 아예 안 나가면 고장으로 보인다.
      const jitter: number = 0.75 + Math.sin(this.pulseSeconds * 60) * 0.15;
      this.impact.scale.setScalar(jitter);
      this.impact.material.opacity = 0.5;
      this.impactLight.intensity = 0;
    }
  }

  private hideBeam(): void {
    this.beam.visible = false;
    this.impact.visible = false;
    this.impactLight.intensity = 0;
  }
}

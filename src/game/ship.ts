import * as THREE from "three";

import { SHIP_TUNING } from "../constants";
import type { FlightInputState } from "./flight-input";

/** 함선 로컬 좌표계의 기준 축. 함선은 -Z 방향을 바라본다. */
const LOCAL_FORWARD: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
const LOCAL_UP: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

/** 프레임마다 새로 할당하지 않기 위한 계산용 임시 벡터. */
const scratchVector: THREE.Vector3 = new THREE.Vector3();
const scratchAxis: THREE.Vector3 = new THREE.Vector3();
const scratchQuaternion: THREE.Quaternion = new THREE.Quaternion();

/**
 * 플레이어 함선.
 *
 * 비행 모델은 뉴턴식이다. 추력은 속도를 직접 정하지 않고 가속도로만 작용하며,
 * 입력을 놓으면 함선은 마지막 속도를 그대로 유지한 채 계속 나아간다.
 */
export class Ship {
  public readonly object3D: THREE.Group;

  private readonly velocity: THREE.Vector3 = new THREE.Vector3();
  private readonly angularVelocity: THREE.Vector3 = new THREE.Vector3();
  private readonly engineGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly engineLight: THREE.PointLight;

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "PlayerShip";

    // 환경 맵이 없는 장면이므로 금속성을 낮게 잡는다. 금속은 반사로 밝아지는
    // 재질이라, 반사할 것이 없는 우주 공간에서 금속성을 높이면 검게 죽는다.
    // 자체 발광을 약하게 깔아 그림자 쪽도 완전히 어두워지지 않게 한다.
    const hullMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fb2ce,
      metalness: 0.3,
      roughness: 0.55,
      emissive: 0x243a5c,
      emissiveIntensity: 0.45,
      flatShading: true,
    });
    const trimMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: 0x44607a,
      metalness: 0.25,
      roughness: 0.6,
      emissive: 0x2fb0d6,
      emissiveIntensity: 1.3,
      flatShading: true,
    });

    // 선체 — 원뿔을 눕혀 -Z 를 향하게 한다.
    const hullGeometry: THREE.ConeGeometry = new THREE.ConeGeometry(0.85, 4, 6);
    hullGeometry.rotateX(-Math.PI / 2);
    const hull: THREE.Mesh = new THREE.Mesh(hullGeometry, hullMaterial);
    this.object3D.add(hull);

    // 주익 한 쌍.
    const wingGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(3.4, 0.16, 1.1);
    const wing: THREE.Mesh = new THREE.Mesh(wingGeometry, hullMaterial);
    wing.position.set(0, -0.12, 0.5);
    this.object3D.add(wing);

    // 수직 미익.
    const finGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(0.14, 0.9, 1);
    const fin: THREE.Mesh = new THREE.Mesh(finGeometry, trimMaterial);
    fin.position.set(0, 0.45, 1.3);
    this.object3D.add(fin);

    // 엔진 노즐.
    const nozzleGeometry: THREE.CylinderGeometry = new THREE.CylinderGeometry(0.42, 0.5, 0.7, 8);
    nozzleGeometry.rotateX(Math.PI / 2);
    const nozzle: THREE.Mesh = new THREE.Mesh(nozzleGeometry, trimMaterial);
    nozzle.position.set(0, 0, 2.1);
    this.object3D.add(nozzle);

    // 엔진 발광 — 추력에 따라 밝기가 변한다.
    this.engineGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 }),
    );
    this.engineGlow.position.set(0, 0, 2.35);
    this.object3D.add(this.engineGlow);

    this.engineLight = new THREE.PointLight(0x6fd0ff, 0, 26, 2);
    this.engineLight.position.set(0, 0, 2.6);
    this.object3D.add(this.engineLight);
  }

  /** 현재 속력 (m/s). */
  public get speed(): number {
    return this.velocity.length();
  }

  /** 월드 좌표 위치. 카메라와 스타필드가 참조한다. */
  public get position(): THREE.Vector3 {
    return this.object3D.position;
  }

  /** 월드 회전. */
  public get quaternion(): THREE.Quaternion {
    return this.object3D.quaternion;
  }

  /**
   * 한 프레임만큼 비행을 진행시킨다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param input 이번 프레임의 조종 입력
   */
  public update(deltaSeconds: number, input: FlightInputState): void {
    this.integrateRotation(deltaSeconds, input);
    this.integrateVelocity(deltaSeconds, input);
    this.updateEngineVisual(input);
  }

  private integrateRotation(deltaSeconds: number, input: FlightInputState): void {
    // 마우스 이동량은 각속도에 대한 충격량으로 다룬다. 감쇠가 걸려 있으므로
    // 손을 떼면 회전이 서서히 멎고, 계속 움직이면 회전이 누적된다.
    this.angularVelocity.x -= input.pitchDelta * SHIP_TUNING.MouseSensitivity;
    this.angularVelocity.y -= input.yawDelta * SHIP_TUNING.MouseSensitivity;
    this.angularVelocity.z += input.roll * SHIP_TUNING.RollAcceleration * deltaSeconds;

    const angularDecay: number = Math.exp(-SHIP_TUNING.AngularDamping * deltaSeconds);
    this.angularVelocity.multiplyScalar(angularDecay);

    if (this.angularVelocity.length() > SHIP_TUNING.MaxAngularSpeed) {
      this.angularVelocity.setLength(SHIP_TUNING.MaxAngularSpeed);
    }

    const angle: number = this.angularVelocity.length() * deltaSeconds;
    if (angle > 1e-6) {
      scratchAxis.copy(this.angularVelocity).normalize();
      scratchQuaternion.setFromAxisAngle(scratchAxis, angle);
      // 로컬 축 기준 회전이므로 오른쪽에서 곱한다.
      this.object3D.quaternion.multiply(scratchQuaternion).normalize();
    }
  }

  private integrateVelocity(deltaSeconds: number, input: FlightInputState): void {
    const boost: number = input.isBoosting ? SHIP_TUNING.BoostMultiplier : 1;

    scratchVector.set(0, 0, 0);
    scratchVector.addScaledVector(LOCAL_FORWARD, input.thrust * SHIP_TUNING.MainThrust);
    scratchVector.addScaledVector(LOCAL_RIGHT, input.strafe * SHIP_TUNING.StrafeThrust);
    scratchVector.addScaledVector(LOCAL_UP, input.lift * SHIP_TUNING.LiftThrust);
    scratchVector.applyQuaternion(this.object3D.quaternion).multiplyScalar(boost);

    this.velocity.addScaledVector(scratchVector, deltaSeconds);

    if (input.isAssisting) {
      const assistDecay: number = Math.exp(-SHIP_TUNING.AssistDamping * deltaSeconds);
      this.velocity.multiplyScalar(assistDecay);
    }

    const speedLimit: number = SHIP_TUNING.MaxSpeed * boost;
    if (this.velocity.length() > speedLimit) {
      this.velocity.setLength(speedLimit);
    }

    this.object3D.position.addScaledVector(this.velocity, deltaSeconds);
  }

  private updateEngineVisual(input: FlightInputState): void {
    const forwardThrust: number = Math.max(input.thrust, 0);
    const boost: number = input.isBoosting ? 1.7 : 1;
    const intensity: number = forwardThrust * boost;

    this.engineGlow.scale.setScalar(0.55 + intensity * 0.85);
    this.engineGlow.material.opacity = 0.35 + intensity * 0.6;
    this.engineLight.intensity = intensity * 22;
  }
}

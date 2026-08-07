import * as THREE from "three";

import { CAMERA_RIG, SHIP_TUNING } from "../constants";
import type { Ship } from "./ship";

const scratchOffset: THREE.Vector3 = new THREE.Vector3();
const scratchTarget: THREE.Vector3 = new THREE.Vector3();
const scratchUp: THREE.Vector3 = new THREE.Vector3();
const scratchToCamera: THREE.Vector3 = new THREE.Vector3();
const scratchMatrix: THREE.Matrix4 = new THREE.Matrix4();
const scratchQuaternion: THREE.Quaternion = new THREE.Quaternion();

/** 함선 로컬 위쪽. 롤을 따라가게 하는 데 쓴다. */
const LOCAL_UP: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
/** 함선 로컬 정면. */
const LOCAL_FORWARD: THREE.Vector3 = new THREE.Vector3(0, 0, -1);

/**
 * 함선을 뒤에서 따라가는 추격 카메라.
 *
 * 함선에 딱 붙이지 않고 지연을 두어 따라간다. 그래야 급선회할 때 함선이
 * 화면 안에서 미끄러지며 기동이 눈에 보인다.
 *
 * 다만 지연이 그대로면 빠를수록 함선이 화면 밖으로 밀려난다. 지수 추종은
 * 등속에서 `속도 ÷ 추종률` 만큼 뒤처지므로, 최고 속도에서는 20m 넘게 벌어진다.
 * 그래서 세 가지를 함께 건다 — 속도를 미리 반영하고, 최대 거리를 묶고, 시선이
 * 항상 함선을 향하게 한다.
 */
export class ChaseCamera {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly ship: Ship;

  public constructor(ship: Ship, aspect: number) {
    this.ship = ship;
    this.camera = new THREE.PerspectiveCamera(CAMERA_RIG.BaseFov, aspect, 0.1, 4000);
    this.snapToShip();
  }

  /** 지연 없이 목표 위치로 즉시 이동시킨다. 초기화와 리스폰에 쓴다. */
  public snapToShip(): void {
    this.camera.position.copy(this.desiredPosition(0));
    this.aimAtShip(1);
  }

  /** 화면 비율이 바뀌었을 때 호출한다. */
  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 카메라를 한 프레임만큼 함선 쪽으로 따라붙인다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   */
  public update(deltaSeconds: number): void {
    const speedRatio: number = Math.min(this.ship.speed / SHIP_TUNING.MaxSpeed, 1);

    const positionAlpha: number = 1 - Math.exp(-CAMERA_RIG.PositionLerpRate * deltaSeconds);
    const rotationAlpha: number = 1 - Math.exp(-CAMERA_RIG.RotationLerpRate * deltaSeconds);

    this.camera.position.lerp(this.desiredPosition(speedRatio), positionAlpha);
    this.clampDistance();
    this.aimAtShip(rotationAlpha);

    const targetFov: number = CAMERA_RIG.BaseFov + CAMERA_RIG.SpeedFovGain * speedRatio;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * positionAlpha;
      this.camera.updateProjectionMatrix();
    }
  }

  private desiredPosition(speedRatio: number): THREE.Vector3 {
    const distance: number = CAMERA_RIG.Distance + CAMERA_RIG.SpeedPullback * speedRatio;
    scratchOffset.set(0, CAMERA_RIG.Height, distance);
    scratchOffset.applyQuaternion(this.ship.quaternion);
    scratchOffset.add(this.ship.position);

    // 속도를 미리 반영한다. 지수 추종은 등속에서 `속도 ÷ 추종률` 만큼 뒤처지
    // 므로, 그만큼 목표를 앞으로 옮겨두면 지연이 상쇄된다.
    scratchOffset.addScaledVector(
      this.ship.velocity,
      1 / CAMERA_RIG.PositionLerpRate,
    );

    return scratchOffset;
  }

  /**
   * 함선에서 너무 멀어지지 않게 묶는다.
   *
   * 급가속이나 부스트처럼 피드포워드로 다 못 잡는 순간에 대한 안전장치다.
   */
  private clampDistance(): void {
    scratchToCamera.subVectors(this.camera.position, this.ship.position);
    const distance: number = scratchToCamera.length();
    if (distance <= CAMERA_RIG.MaxDistance || distance < 1e-6) {
      return;
    }

    scratchToCamera.multiplyScalar(CAMERA_RIG.MaxDistance / distance);
    this.camera.position.copy(this.ship.position).add(scratchToCamera);
  }

  /**
   * 시선을 함선 쪽으로 돌린다.
   *
   * 함선 자세를 그대로 따라가면 카메라가 옆으로 밀렸을 때 시선이 함선을
   * 벗어난다. 위치가 어떻든 함선이 화면 안에 남으려면 함선을 봐야 한다.
   * 위쪽은 함선 것을 쓰므로 롤은 그대로 따라간다.
   *
   * @param alpha 0 이면 그대로, 1 이면 즉시 맞춘다
   */
  private aimAtShip(alpha: number): void {
    // 함선 자체가 아니라 조금 앞을 본다. 그래야 함선이 화면 중앙보다 살짝
    // 아래에 놓여 진행 방향이 넓게 보인다.
    scratchTarget
      .copy(LOCAL_FORWARD)
      .applyQuaternion(this.ship.quaternion)
      .multiplyScalar(CAMERA_RIG.LookAhead)
      .add(this.ship.position);

    scratchUp.copy(LOCAL_UP).applyQuaternion(this.ship.quaternion);
    scratchMatrix.lookAt(this.camera.position, scratchTarget, scratchUp);
    scratchQuaternion.setFromRotationMatrix(scratchMatrix);

    this.camera.quaternion.slerp(scratchQuaternion, alpha);
  }
}

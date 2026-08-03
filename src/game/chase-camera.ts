import * as THREE from "three";

import { CAMERA_RIG, SHIP_TUNING } from "../constants";
import type { Ship } from "./ship";

const scratchOffset: THREE.Vector3 = new THREE.Vector3();

/**
 * 함선을 뒤에서 따라가는 추격 카메라.
 *
 * 함선에 딱 붙이지 않고 지연을 두어 따라간다. 그래야 급선회할 때 함선이
 * 화면 안에서 미끄러지며 기동이 눈에 보인다.
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
    this.camera.quaternion.copy(this.ship.quaternion);
    this.camera.position.copy(this.desiredPosition(0));
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
    this.camera.quaternion.slerp(this.ship.quaternion, rotationAlpha);

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
    return scratchOffset.add(this.ship.position);
  }
}

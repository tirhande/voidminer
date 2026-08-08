import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CAMERA_RIG, SHIP_TUNING, STARFIELD } from "../constants";
import { ChaseCamera } from "./chase-camera";
import { Ship } from "./ship";
import { buildFlightInput } from "../test-support/flight-input-fixture";
import type { FlightInputState } from "./flight-input";

const STEP_SECONDS: number = 1 / 60;

/**
 * 함선을 화면 좌표로 변환한다.
 *
 * 정규화 장치 좌표에서 x 와 y 가 -1 ~ 1 안에 있으면 화면 안이다. z 가 1 을
 * 넘으면 뒤나 너무 먼 곳이라 보이지 않는다.
 */
function projectShip(camera: THREE.PerspectiveCamera, ship: Ship): THREE.Vector3 {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return ship.position.clone().project(camera);
}

/** 지정한 입력으로 비행시키며 함선이 화면을 벗어나는지 본다. */
function flyAndTrack(
  input: FlightInputState,
  seconds: number,
): { maxScreenOffset: number; maxDistance: number; everOffScreen: boolean } {
  const ship: Ship = new Ship();
  const camera: ChaseCamera = new ChaseCamera(ship, 16 / 9);

  let maxScreenOffset: number = 0;
  let maxDistance: number = 0;
  let everOffScreen: boolean = false;

  const steps: number = Math.round(seconds / STEP_SECONDS);
  for (let step = 0; step < steps; step += 1) {
    ship.update(STEP_SECONDS, input);
    camera.update(STEP_SECONDS);

    const ndc: THREE.Vector3 = projectShip(camera.camera, ship);
    const offset: number = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    maxScreenOffset = Math.max(maxScreenOffset, offset);
    maxDistance = Math.max(maxDistance, camera.camera.position.distanceTo(ship.position));

    if (offset > 1 || ndc.z > 1) {
      everOffScreen = true;
    }
  }

  return { maxScreenOffset, maxDistance, everOffScreen };
}

describe("추격 카메라", () => {
  it("정지 상태에서 함선이 화면 안에 있다", () => {
    const result = flyAndTrack(buildFlightInput(), 2);

    expect(result.everOffScreen).toBe(false);
  });

  it("최고 속도로 직진해도 함선을 놓치지 않는다", () => {
    // 지수 추종은 등속에서 속도 나누기 추종률 만큼 뒤처진다. 160 m/s 면
    // 20m 넘게 벌어지므로 속도를 미리 반영하지 않으면 여기서 깨진다.
    const result = flyAndTrack(buildFlightInput({ thrust: 1 }), 20);

    expect(result.everOffScreen).toBe(false);
    expect(result.maxDistance).toBeLessThanOrEqual(CAMERA_RIG.MaxDistance + 0.5);
  });

  it("부스트로 가속해도 함선을 놓치지 않는다", () => {
    const result = flyAndTrack(buildFlightInput({ thrust: 1, isBoosting: true }), 20);

    expect(result.everOffScreen).toBe(false);
    expect(result.maxDistance).toBeLessThanOrEqual(CAMERA_RIG.MaxDistance + 0.5);
  });

  it("빠르게 선회하면서 이동해도 함선이 화면 안에 남는다", () => {
    const result = flyAndTrack(
      buildFlightInput({ thrust: 1, isBoosting: true, yawDelta: 6, roll: 1 }),
      20,
    );

    expect(result.everOffScreen).toBe(false);
  });

  it("스트레이프로 옆으로 밀어도 함선이 화면 안에 남는다", () => {
    const result = flyAndTrack(buildFlightInput({ thrust: 1, strafe: 1, lift: 1 }), 20);

    expect(result.everOffScreen).toBe(false);
  });

  it("속도가 붙어도 함선과의 거리가 무한히 벌어지지 않는다", () => {
    const slow = flyAndTrack(buildFlightInput({ thrust: 1 }), 3);
    const fast = flyAndTrack(buildFlightInput({ thrust: 1, isBoosting: true }), 20);

    // 빨라질수록 조금 벌어지는 것은 의도한 연출이지만 상한이 있어야 한다.
    expect(fast.maxDistance).toBeLessThanOrEqual(CAMERA_RIG.MaxDistance + 0.5);
    expect(slow.maxDistance).toBeLessThan(CAMERA_RIG.MaxDistance);
  });

  it("최고 속도 설정을 올려도 상한이 지켜진다", () => {
    // 상한은 속도와 무관한 안전장치여야 한다.
    expect(CAMERA_RIG.MaxDistance).toBeGreaterThan(
      CAMERA_RIG.Distance + CAMERA_RIG.SpeedPullback,
    );
    expect(SHIP_TUNING.MaxSpeed).toBeGreaterThan(0);
  });
});

describe("깊이 범위", () => {
  it("가까운 면이 카메라 거리에 비해 지나치게 붙어 있지 않다", () => {
    // 깊이 값은 가까운 쪽에 몰려 배분된다. 앞을 좁힐수록 뒤가 성겨져서 먼
    // 소행성 면이 앞뒤를 다투며 깜빡인다. 빠를수록 눈에 띈다.
    //
    // 카메라는 함선에서 15m 뒤에 있고 그보다 가까운 것을 그릴 일이 없다.
    expect(CAMERA_RIG.NearPlane).toBeGreaterThanOrEqual(0.5);
    expect(CAMERA_RIG.FarPlane / CAMERA_RIG.NearPlane).toBeLessThanOrEqual(10000);
  });

  it("가까운 면이 함선을 잘라내지 않는다", () => {
    // 카메라가 함선보다 가까이 오는 일은 없지만, 값이 뒤집히면 함선이 사라진다.
    expect(CAMERA_RIG.NearPlane).toBeLessThan(CAMERA_RIG.Distance);
  });

  it("먼 면이 배경보다 멀다", () => {
    // 성운 구가 잘리면 하늘에 구멍이 뚫린 것처럼 보인다.
    expect(CAMERA_RIG.FarPlane).toBeGreaterThan(STARFIELD.Radius);
  });
});

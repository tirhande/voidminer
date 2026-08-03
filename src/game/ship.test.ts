import { describe, expect, it } from "vitest";

import { SHIP_TUNING } from "../constants";
import { buildFlightInput } from "../test-support/flight-input-fixture";
import type { FlightInputState } from "./flight-input";
import { Ship } from "./ship";

/** 고정 프레임 간격. 실제 60fps 와 같은 값이다. */
const STEP_SECONDS: number = 1 / 60;

/**
 * 같은 입력을 유지한 채 함선을 여러 프레임 진행시킨다.
 *
 * @param ship 대상 함선
 * @param input 유지할 조종 입력
 * @param frameCount 진행할 프레임 수
 */
function advance(ship: Ship, input: FlightInputState, frameCount: number): void {
  for (let frame = 0; frame < frameCount; frame += 1) {
    ship.update(STEP_SECONDS, input);
  }
}

describe("Ship 비행 모델", () => {
  it("정지 상태에서 입력이 없으면 움직이지 않는다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput(), 60);

    expect(ship.speed).toBe(0);
    expect(ship.position.length()).toBe(0);
  });

  it("주추력은 함선 정면(-Z)으로 가속시킨다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1 }), 60);

    expect(ship.speed).toBeGreaterThan(0);
    expect(ship.position.z).toBeLessThan(0);
    expect(Math.abs(ship.position.x)).toBeLessThan(1e-6);
    expect(Math.abs(ship.position.y)).toBeLessThan(1e-6);
  });

  it("1초간 가속하면 속력이 주추력 값에 근접한다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1 }), 60);

    // v = a * t. 오일러 적분이라 정확히 일치하지는 않으므로 여유를 둔다.
    expect(ship.speed).toBeCloseTo(SHIP_TUNING.MainThrust, 0);
  });

  it("입력을 놓아도 속도가 유지된다 — 뉴턴식 관성", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1 }), 60);
    const speedAfterThrust: number = ship.speed;

    advance(ship, buildFlightInput(), 180);

    expect(ship.speed).toBeCloseTo(speedAfterThrust, 6);
  });

  it("관성 제동을 걸면 속도가 줄어든다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1 }), 60);
    const speedAfterThrust: number = ship.speed;

    advance(ship, buildFlightInput({ isAssisting: true }), 60);

    expect(ship.speed).toBeLessThan(speedAfterThrust);
    // 감쇠 계수 1.6/s 로 1초간 걸었으므로 exp(-1.6) 배가 남는다.
    expect(ship.speed).toBeCloseTo(speedAfterThrust * Math.exp(-SHIP_TUNING.AssistDamping), 1);
  });

  it("속력은 상한을 넘지 않는다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1 }), 60 * 20);

    expect(ship.speed).toBeLessThanOrEqual(SHIP_TUNING.MaxSpeed + 1e-6);
    expect(ship.speed).toBeCloseTo(SHIP_TUNING.MaxSpeed, 3);
  });

  it("부스트는 상한을 배율만큼 끌어올린다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ thrust: 1, isBoosting: true }), 60 * 30);

    const boostedLimit: number = SHIP_TUNING.MaxSpeed * SHIP_TUNING.BoostMultiplier;
    expect(ship.speed).toBeCloseTo(boostedLimit, 3);
  });

  it("스트레이프는 정면이 아닌 축으로 가속시킨다", () => {
    const ship: Ship = new Ship();

    advance(ship, buildFlightInput({ strafe: 1 }), 60);

    expect(ship.position.x).toBeGreaterThan(0);
    expect(Math.abs(ship.position.z)).toBeLessThan(1e-6);
  });

  it("롤 입력은 함선을 회전시키고, 놓으면 회전이 멎는다", () => {
    const ship: Ship = new Ship();
    const initialRotation = ship.quaternion.clone();

    advance(ship, buildFlightInput({ roll: 1 }), 60);
    const rotationAfterRoll = ship.quaternion.clone();

    expect(rotationAfterRoll.angleTo(initialRotation)).toBeGreaterThan(0.1);

    // 각속도 감쇠가 있으므로 입력을 놓으면 회전이 수렴한다.
    advance(ship, buildFlightInput(), 60 * 5);
    const settledRotation = ship.quaternion.clone();

    advance(ship, buildFlightInput(), 60);
    expect(ship.quaternion.angleTo(settledRotation)).toBeLessThan(1e-4);
  });

  it("회전한 뒤 주추력을 주면 바뀐 정면 방향으로 나아간다", () => {
    const ship: Ship = new Ship();

    // 좌현으로 90도 요잉한다. yawDelta 가 양수면 우현이므로 음수를 준다.
    advance(ship, buildFlightInput({ yawDelta: -100 }), 1);
    advance(ship, buildFlightInput(), 60 * 3);
    advance(ship, buildFlightInput({ thrust: 1 }), 60);

    // 정확한 각도까지 검증하지 않는다. 정면이 더 이상 -Z 가 아니라는 것만 본다.
    expect(Math.abs(ship.position.x)).toBeGreaterThan(0.5);
  });
});

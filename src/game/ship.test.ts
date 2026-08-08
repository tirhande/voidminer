import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { SHIP_MODEL, SHIP_TUNING } from "../constants";
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

describe("선체 모델 장착", () => {
  /** 소켓을 가진 가짜 선체. 실제 에셋과 같은 이름을 쓴다. */
  function buildHullStub(): THREE.Object3D {
    const hull: THREE.Group = new THREE.Group();
    const body: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    hull.add(body);

    // 실제 에셋과 같이 기수가 +Z 를 향하는 좌표로 둔다.
    const sockets: Array<[string, THREE.Vector3]> = [
      [SHIP_MODEL.Socket.Laser, new THREE.Vector3(0.5, -0.15, 0.05)],
      [SHIP_MODEL.Socket.Tractor, new THREE.Vector3(-0.5, -0.15, 0.05)],
      [SHIP_MODEL.Socket.Thruster, new THREE.Vector3(0, 0, -0.5)],
    ];
    for (const [name, position] of sockets) {
      const socket: THREE.Object3D = new THREE.Object3D();
      socket.name = name;
      socket.position.copy(position);
      hull.add(socket);
    }

    return hull;
  }

  it("모델이 없어도 장착 자리가 나온다", () => {
    const ship: Ship = new Ship();

    // 좌우로 갈려 있어야 빔 둘이 겹치지 않는다.
    expect(Math.sign(ship.laserHardpoint.x)).not.toBe(
      Math.sign(ship.tractorHardpoint.x),
    );
  });

  it("모델에 소켓이 있으면 그 자리를 쓴다", () => {
    const ship: Ship = new Ship(buildHullStub());

    // 선체를 돌려 붙이므로 소켓의 좌우도 함께 뒤집힌다.
    expect(ship.laserHardpoint.x).toBeCloseTo(-0.5 * SHIP_MODEL.Length, 4);
    expect(ship.tractorHardpoint.x).toBeCloseTo(0.5 * SHIP_MODEL.Length, 4);
  });

  it("기수가 -Z 를 향하도록 돌려 붙인다", () => {
    // 이 모델은 기수가 +Z 다. 돌리지 않으면 배가 뒤로 난다.
    const ship: Ship = new Ship(buildHullStub());
    const hull: THREE.Object3D | undefined = ship.object3D.getObjectByName("Hull");
    const thruster: THREE.Object3D | undefined = hull?.getObjectByName(
      SHIP_MODEL.Socket.Thruster,
    );

    // 분사구는 뒤쪽, 즉 +Z 에 있어야 한다.
    expect(thruster?.getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(0);
  });

  it("모듈 모델을 주면 선체에 붙는다", () => {
    const module: THREE.Group = new THREE.Group();
    module.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));

    const ship: Ship = new Ship(buildHullStub(), module, module);

    expect(ship.object3D.getObjectByName("MiningLaserModule")).toBeDefined();
    expect(ship.object3D.getObjectByName("TractorBeamModule")).toBeDefined();
  });
});

describe("멈춘 동안", () => {
  it("시간을 0 으로 주면 아무것도 변하지 않는다", () => {
    // 조작법을 펼치거나 조종을 놓으면 세계를 세운다. 세계를 세우는 방법이
    // 시간을 0 으로 주는 것이므로, 그때 위치도 속도도 그대로여야 한다.
    const ship: Ship = new Ship();
    const input: FlightInputState = buildFlightInput({ thrust: 1 });

    for (let step = 0; step < 60; step += 1) {
      ship.update(STEP_SECONDS, input);
    }

    const speed: number = ship.speed;
    const position: THREE.Vector3 = ship.position.clone();

    for (let step = 0; step < 60; step += 1) {
      ship.update(0, input);
    }

    expect(ship.speed).toBeCloseTo(speed, 6);
    expect(ship.position.distanceTo(position)).toBeCloseTo(0, 6);
  });

  it("다시 시간을 주면 놓았던 속도로 이어 난다", () => {
    // 속도를 지우면 읽고 돌아올 때마다 다시 가속해야 한다. 관성이 있는
    // 비행에서는 그것이 곧 다른 게임이 된다.
    const ship: Ship = new Ship();
    const thrust: FlightInputState = buildFlightInput({ thrust: 1 });
    const idle: FlightInputState = buildFlightInput();

    for (let step = 0; step < 60; step += 1) {
      ship.update(STEP_SECONDS, thrust);
    }
    const speed: number = ship.speed;

    ship.update(0, idle);
    ship.update(STEP_SECONDS, idle);

    expect(ship.speed).toBeCloseTo(speed, 4);
  });
});

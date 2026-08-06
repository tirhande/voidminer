import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { TRACTOR_BEAM } from "../constants";
import { Cargo } from "./cargo";
import { DebrisField } from "./debris-field";
import { RESOURCE } from "./minerals";

const STEP_SECONDS: number = 1 / 60;
const AT_REST: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
/** 대부분의 시험에서 한도는 병목이 아니어야 한다. */
const CAPACITY: number = 32;

/** 지정한 거리에 파편 하나를 만든다. 초기 속도가 섞이지 않도록 방향을 고정한다. */
function spawnAt(field: DebrisField, distance: number): void {
  field.spawn(
    new THREE.Vector3(0, 0, -distance),
    new THREE.Vector3(0, 0, -1),
    RESOURCE.Copper,
    5,
  );
}

describe("견인빔", () => {
  it("빔을 끄면 파편을 붙잡지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, false, CAPACITY, cargo);

    expect(field.pulledDebris).toHaveLength(0);
  });

  it("사거리 안의 파편을 붙잡는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, CAPACITY, cargo);

    expect(field.pulledDebris).toHaveLength(1);
  });

  it("사거리 밖의 파편은 붙잡지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range + 40);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, CAPACITY, cargo);

    expect(field.pulledDebris).toHaveLength(0);
    expect(field.activeCount).toBe(1);
  });

  it("정지 상태에서 파편이 다가와 적재된다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.4);

    for (let step = 0; step < 60 * 15 && cargo.total === 0; step += 1) {
      field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, CAPACITY, cargo);
    }

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(5);
    expect(field.activeCount).toBe(0);
  });

  it("파편이 함선을 지나쳐 날아가지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    const shipPosition: THREE.Vector3 = new THREE.Vector3();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    let maxDistance: number = 0;
    for (let step = 0; step < 60 * 15 && cargo.total === 0; step += 1) {
      field.update(STEP_SECONDS, shipPosition, AT_REST, true, CAPACITY, cargo);
      for (const position of field.pulledDebris) {
        maxDistance = Math.max(maxDistance, position.distanceTo(shipPosition));
      }
    }

    // 시작 거리를 크게 넘어서면 지나쳐 튕겨나간 것이다.
    expect(maxDistance).toBeLessThan(TRACTOR_BEAM.Range * 0.6);
    expect(cargo.total).toBeGreaterThan(0);
  });

  /**
   * 함선이 파편을 두고 앞으로 나아가는 상황을 돌린다.
   *
   * 이것이 실제로 깨졌던 조건이다. 파편 속도를 절대값으로 묶어두면 함선이 그
   * 상한보다 빠를 때 파편이 구조적으로 따라올 수 없어 뒤에 남는다.
   *
   * @param cruiseSpeed 함선 순항 속도 (m/s)
   */
  function runFlyAway(cruiseSpeed: number): { collected: number; maxDistance: number } {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    const shipPosition: THREE.Vector3 = new THREE.Vector3();
    const shipVelocity: THREE.Vector3 = new THREE.Vector3(0, 0, -cruiseSpeed);

    // 파편은 함선 뒤쪽에 남는다.
    field.spawn(
      new THREE.Vector3(0, 0, TRACTOR_BEAM.Range * 0.5),
      new THREE.Vector3(0.6, 0.3, 0.7),
      RESOURCE.Copper,
      5,
    );

    let maxDistance: number = 0;
    for (let step = 0; step < 60 * 20 && cargo.total === 0; step += 1) {
      shipPosition.addScaledVector(shipVelocity, STEP_SECONDS);
      field.update(STEP_SECONDS, shipPosition, shipVelocity, true, CAPACITY, cargo);
      for (const position of field.pulledDebris) {
        maxDistance = Math.max(maxDistance, position.distanceTo(shipPosition));
      }
    }

    return { collected: cargo.total, maxDistance };
  }

  it("함선이 앞으로 나아가도 파편이 따라와 적재된다", () => {
    const result = runFlyAway(80);

    expect(result.collected).toBe(5);
  });

  it("최고 속도로 순항해도 파편을 놓치지 않는다", () => {
    // 함선 최고 속도는 160 m/s 다. 파편 속도를 절대값으로 묶으면 여기서 깨진다.
    const result = runFlyAway(160);

    expect(result.collected).toBe(5);
    expect(result.maxDistance).toBeLessThan(TRACTOR_BEAM.Range);
  });

  it("파편이 뒤로 밀려 사거리를 벗어나지 않는다", () => {
    const result = runFlyAway(120);

    // 옛 방식에서는 이 값이 수백 미터까지 벌어졌다.
    expect(result.maxDistance).toBeLessThan(TRACTOR_BEAM.Range);
  });

  it("화물칸이 가득 차면 파편이 회수되지 않고 남는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Iron, cargo.capacity);
    spawnAt(field, TRACTOR_BEAM.Range * 0.2);

    for (let step = 0; step < 60 * 10; step += 1) {
      field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, CAPACITY, cargo);
    }

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(0);
    expect(field.activeCount).toBe(1);
  });

  it("동시 견인 한도를 넘겨 붙잡지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    const limit: number = 3;

    for (let index = 0; index < 10; index += 1) {
      spawnAt(field, 20 + index * 5);
    }

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, limit, cargo);

    expect(field.pulledDebris).toHaveLength(limit);
  });

  /**
   * 같은 시간 동안 얼마나 회수되는지 잰다.
   *
   * 한도는 동시 처리 수이지 총량이 아니다. 시간이 지나면 순서대로 다 회수되며,
   * 한도가 하는 일은 **처리량을 묶는 것**이다. 그래서 남은 개수가 아니라
   * 같은 시간에 회수한 양을 비교해야 한다.
   */
  function collectWithin(capacity: number, seconds: number): number {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();

    for (let index = 0; index < 12; index += 1) {
      spawnAt(field, 25 + index * 5);
    }

    const steps: number = Math.round(seconds / STEP_SECONDS);
    for (let step = 0; step < steps; step += 1) {
      field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, capacity, cargo);
    }

    return cargo.total;
  }

  it("한도가 낮으면 같은 시간에 덜 회수된다 — 회수가 병목이 된다", () => {
    const narrow: number = collectWithin(1, 3);
    const wide: number = collectWithin(12, 3);

    expect(wide).toBeGreaterThan(narrow);
  });

  it("한도를 넘은 파편은 사라지지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();

    for (let index = 0; index < 8; index += 1) {
      spawnAt(field, 30 + index * 6);
    }

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, 2, cargo);

    // 두 개만 붙잡히지만 나머지도 그대로 떠 있다.
    expect(field.pulledDebris).toHaveLength(2);
    expect(field.activeCount).toBe(8);
  });

  it("가까운 파편부터 붙잡는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();

    spawnAt(field, 80);
    spawnAt(field, 20);
    spawnAt(field, 50);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, 1, cargo);

    expect(field.pulledDebris).toHaveLength(1);
    // 가장 가까운 것은 20m 짜리다. 초기 속도가 섞이므로 여유를 둔다.
    expect(field.pulledDebris[0].length()).toBeLessThan(35);
  });

  it("한도가 0이면 아무것도 붙잡지 못한다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, 30);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, 0, cargo);

    expect(field.pulledDebris).toHaveLength(0);
  });

  it("붙잡은 목록은 매 프레임 새로 계산된다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, true, CAPACITY, cargo);
    expect(field.pulledDebris).toHaveLength(1);

    field.update(STEP_SECONDS, new THREE.Vector3(), AT_REST, false, CAPACITY, cargo);
    expect(field.pulledDebris).toHaveLength(0);
  });
});

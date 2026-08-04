import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { TRACTOR_BEAM } from "../constants";
import { Cargo } from "./cargo";
import { DebrisField } from "./debris-field";
import { RESOURCE } from "./minerals";

const SHIP_ORIGIN: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
const STEP_SECONDS: number = 1 / 60;

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

    field.update(STEP_SECONDS, SHIP_ORIGIN, false, cargo);

    expect(field.pulledDebris).toHaveLength(0);
  });

  it("사거리 안의 파편을 붙잡는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    field.update(STEP_SECONDS, SHIP_ORIGIN, true, cargo);

    expect(field.pulledDebris).toHaveLength(1);
  });

  it("사거리 밖의 파편은 붙잡지 않는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range + 40);

    field.update(STEP_SECONDS, SHIP_ORIGIN, true, cargo);

    expect(field.pulledDebris).toHaveLength(0);
    expect(field.activeCount).toBe(1);
  });

  it("붙잡은 파편은 함선 쪽으로 다가와 적재된다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.4);

    for (let step = 0; step < 60 * 12; step += 1) {
      field.update(STEP_SECONDS, SHIP_ORIGIN, true, cargo);
      if (cargo.total > 0) {
        break;
      }
    }

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(5);
    expect(field.activeCount).toBe(0);
  });

  it("화물칸이 가득 차면 파편이 회수되지 않고 남는다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Iron, cargo.capacity);
    spawnAt(field, TRACTOR_BEAM.Range * 0.2);

    for (let step = 0; step < 60 * 10; step += 1) {
      field.update(STEP_SECONDS, SHIP_ORIGIN, true, cargo);
    }

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(0);
    expect(field.activeCount).toBe(1);
  });

  it("붙잡은 목록은 매 프레임 새로 계산된다", () => {
    const field: DebrisField = new DebrisField();
    const cargo: Cargo = new Cargo();
    spawnAt(field, TRACTOR_BEAM.Range * 0.5);

    field.update(STEP_SECONDS, SHIP_ORIGIN, true, cargo);
    expect(field.pulledDebris).toHaveLength(1);

    field.update(STEP_SECONDS, SHIP_ORIGIN, false, cargo);
    expect(field.pulledDebris).toHaveLength(0);
  });
});

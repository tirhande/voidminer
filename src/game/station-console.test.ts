import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STATION } from "../constants";
import { Cargo } from "./cargo";
import { ShipEquipment } from "./equipment";
import { RESOURCE } from "./minerals";
import { Station } from "./station";
import {
  StationConsole,
  type StationCell,
  type StationView,
} from "./station-console";
import { StationStock } from "./station-stock";
import { buildFlightInput } from "../test-support/flight-input-fixture";

/** 시험용 한 벌을 만든다. */
function buildSetup(): {
  console: StationConsole;
  station: Station;
  cargo: Cargo;
  stock: StationStock;
  equipment: ShipEquipment;
  docked: THREE.Vector3;
  faraway: THREE.Vector3;
} {
  const station: Station = new Station(new THREE.Vector3());
  return {
    console: new StationConsole(),
    station,
    cargo: new Cargo(),
    stock: new StationStock(),
    equipment: new ShipEquipment(),
    docked: station.position.clone(),
    faraway: station.position.clone().add(new THREE.Vector3(0, 0, STATION.DockRange * 4)),
  };
}

/** 한 프레임 굴린다. */
function step(
  setup: ReturnType<typeof buildSetup>,
  position: THREE.Vector3,
  pressed: string[] = [],
): StationView {
  return setup.console.update(
    buildFlightInput({ pressedOnce: new Set(pressed) }),
    position,
    setup.station,
    setup.cargo,
    setup.stock,
    setup.equipment,
  );
}

describe("도킹", () => {
  it("범위 밖에서는 안내가 뜨지 않는다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.faraway);

    expect(view.isDockPromptVisible).toBe(false);
    expect(view.isDocked).toBe(false);
  });

  it("범위 안에 들어오면 안내가 뜬다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(view.isDockPromptVisible).toBe(true);
    expect(view.isDocked).toBe(false);
  });

  it("F 로 도킹하고 다시 눌러 나온다", () => {
    const setup = buildSetup();

    expect(step(setup, setup.docked, ["KeyF"]).isDocked).toBe(true);
    expect(step(setup, setup.docked, ["KeyF"]).isDocked).toBe(false);
  });

  it("범위 밖에서는 도킹되지 않는다", () => {
    const setup = buildSetup();

    expect(step(setup, setup.faraway, ["KeyF"]).isDocked).toBe(false);
  });

  it("도킹 해제 버튼으로도 나올 수 있다", () => {
    const setup = buildSetup();
    step(setup, setup.docked, ["KeyF"]);

    setup.console.execute({ kind: "UNDOCK" }, setup.cargo, setup.stock, setup.equipment);

    expect(setup.console.isDocked).toBe(false);
  });
});

describe("거점 조작", () => {
  it("하역하면 화물이 저장고로 옮겨진다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);

    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    expect(setup.cargo.total).toBe(0);
    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(40);
  });

  it("광물마다 따로 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.cargo.add(RESOURCE.Tin, 12);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    setup.console.execute(
      { kind: "SELL_ORE", mineral: RESOURCE.Copper },
      setup.cargo,
      setup.stock,
      setup.equipment,
    );

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.oreOf(RESOURCE.Tin)).toBe(12);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("주괴도 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);
    expect(setup.stock.ingotsOf(RESOURCE.Copper)).toBeGreaterThan(0);

    setup.console.execute(
      { kind: "SELL_INGOTS", mineral: RESOURCE.Copper },
      setup.cargo,
      setup.stock,
      setup.equipment,
    );

    expect(setup.stock.ingotsOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("작업 결과가 항상 한 줄로 남는다", () => {
    const setup = buildSetup();

    // 눌렀는데 아무 반응이 없으면 고장으로 보인다.
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    const view = step(setup, setup.docked);

    expect(view.message.length).toBeGreaterThan(0);
  });
});

describe("거점 화면", () => {
  /** 격자에서 칸 하나를 찾는다. */
  function findCell(view: StationView, key: string): StationCell {
    const found: StationCell | undefined = [...view.storage, ...view.equipment].find(
      (cell) => cell.key === key,
    );
    if (found === undefined) {
      throw new Error(`${key} 칸을 찾지 못했다`);
    }
    return found;
  }

  it("칸 수와 자리가 항상 같다", () => {
    // 없는 것을 감추면 남은 칸이 앞으로 밀려 같은 광물이 매번 다른 자리에
    // 놓인다. 그러면 격자가 아니라 목록이다.
    const setup = buildSetup();
    const before = step(setup, setup.docked).storage.map((cell) => cell.key);

    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    const after = step(setup, setup.docked).storage.map((cell) => cell.key);

    expect(after).toEqual(before);
  });

  it("보유량이 칸에 적힌다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);

    expect(cell.badge).toBe("20");
    expect(cell.isEmpty).toBe(false);
  });

  it("빈 칸은 무엇이 필요한지 알려준다", () => {
    // 없는 것을 비워만 두면 왜 없는지 알 길이 없다.
    const setup = buildSetup();

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Iridium}`);

    expect(cell.isEmpty).toBe(true);
    expect(cell.badge).toBe("");
    expect(cell.detail).toContain("T6");
    expect(cell.actions).toHaveLength(0);
  });

  it("광석과 주괴가 같은 격자에 놓인다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);

    // 종류마다 열을 따로 두면 결국 오가야 한다 (GDD 09).
    expect(
      view.storage.some((cell) => cell.kind === "INGOT" && !cell.isEmpty),
    ).toBe(true);
  });

  it("칸을 고르면 거기서 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);
    setup.console.execute(cell.actions[0].action, setup.cargo, setup.stock, setup.equipment);

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("합금은 팔 수 없다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 200);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.cargo.add(RESOURCE.Tin, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "ALLOY_ALL" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);
    const alloys = view.storage.filter(
      (cell) => cell.kind === "ALLOY" && !cell.isEmpty,
    );

    // 제작 재료다. 팔 수 있으면 다음 티어로 가는 길이 끊긴다.
    expect(alloys.length).toBeGreaterThan(0);
    for (const cell of alloys) {
      expect(cell.actions).toHaveLength(0);
    }
  });

  it("장비 칸에 지금 등급이 적힌다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(findCell(view, "equipment:laser").badge).toBe("T1+0");
    expect(findCell(view, "equipment:tractor").badge).toContain("T1");
  });

  it("재료가 모자라면 버튼이 눌리지 않는 상태로 보인다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    // 감추지 않고 흐리게 둔다. 무엇이 필요한지 읽혀야 한다.
    for (const cell of view.equipment) {
      for (const button of cell.actions) {
        expect(button.isAvailable).toBe(false);
        expect(button.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("항성계 목록에 지금 있는 곳이 표시된다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(view.systems.filter((row) => row.isCurrent)).toHaveLength(1);
    expect(view.systemLabel.length).toBeGreaterThan(0);
  });
});

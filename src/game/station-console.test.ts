import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STATION } from "../constants";
import { Cargo } from "./cargo";
import { ShipEquipment } from "./equipment";
import { RESOURCE } from "./minerals";
import { Station } from "./station";
import { StationConsole, type StationView } from "./station-console";
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
  it("보유한 자원만 목록에 나온다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);

    expect(view.stock).toHaveLength(1);
    expect(view.stock[0].name).toBe("구리");
  });

  it("보유량이 있으면 팔기 버튼이 붙는다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);

    expect(view.stock[0].sellOre).not.toBeNull();
    // 아직 제련하지 않았으므로 주괴 팔기는 없다.
    expect(view.stock[0].sellIngots).toBeNull();
  });

  it("재료가 모자라면 버튼이 눌리지 않는 상태로 보인다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    // 감추지 않고 흐리게 둔다. 무엇이 필요한지 읽혀야 한다.
    for (const button of view.equipment) {
      expect(button.isAvailable).toBe(false);
      expect(button.detail.length).toBeGreaterThan(0);
    }
  });

  it("장비 상태가 화면에 적힌다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(view.laserLabel).toContain("T1");
    expect(view.tractorLabel).toContain("동시");
  });
});

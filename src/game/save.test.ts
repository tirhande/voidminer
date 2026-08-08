import { describe, expect, it } from "vitest";

import { Cargo } from "./cargo";
import { ShipEquipment, MAX_UPGRADE_LEVEL } from "./equipment";
import { ALLOY, RESOURCE } from "./minerals";
import { SAVE_VERSION, captureSave, parseSave, restoreSave, type SaveData } from "./save";
import { STAR_SYSTEM, STARTING_SYSTEM } from "./star-systems";
import { StationStock } from "./station-stock";

/** 얼마간 진행한 상태를 만든다. */
function buildProgress(): {
  cargo: Cargo;
  stock: StationStock;
  equipment: ShipEquipment;
} {
  const cargo: Cargo = new Cargo();
  const stock: StationStock = new StationStock();
  const equipment: ShipEquipment = new ShipEquipment();

  cargo.add(RESOURCE.Copper, 40);
  cargo.add(RESOURCE.Tin, 12);
  stock.restoreOre(RESOURCE.Iron, 30);
  stock.restoreIngots(RESOURCE.Copper, 9);
  stock.restoreAlloys(ALLOY.Bronze, 2);
  stock.restoreCredits(750);
  equipment.restore(2, 3, 2);

  return { cargo, stock, equipment };
}

/** 저장했다가 새 판에 되돌린다. */
function roundTrip(data: SaveData): {
  cargo: Cargo;
  stock: StationStock;
  equipment: ShipEquipment;
  system: string;
} {
  const cargo: Cargo = new Cargo();
  const stock: StationStock = new StationStock();
  const equipment: ShipEquipment = new ShipEquipment();
  const system: string = restoreSave(data, cargo, stock, equipment);
  return { cargo, stock, equipment, system };
}

describe("이어하기", () => {
  it("캔 것과 만든 것이 그대로 돌아온다", () => {
    const before = buildProgress();
    const data: SaveData = captureSave(
      before.cargo,
      before.stock,
      before.equipment,
      STAR_SYSTEM.Halvex,
    );

    const after = roundTrip(data);

    expect(after.cargo.amountOf(RESOURCE.Copper)).toBe(40);
    expect(after.cargo.amountOf(RESOURCE.Tin)).toBe(12);
    expect(after.stock.oreOf(RESOURCE.Iron)).toBe(30);
    expect(after.stock.ingotsOf(RESOURCE.Copper)).toBe(9);
    expect(after.stock.alloysOf(ALLOY.Bronze)).toBe(2);
    expect(after.stock.credits).toBe(750);
    expect(after.equipment.laserTier).toBe(2);
    expect(after.equipment.laserUpgrade).toBe(3);
    expect(after.equipment.tractorTier).toBe(2);
    expect(after.system).toBe(STAR_SYSTEM.Halvex);
  });

  it("캐본 광물이 잊히지 않는다", () => {
    // 하역해서 화물이 비어도 목표가 되돌아가면 안 된다.
    const before = buildProgress();
    before.cargo.clear();
    const data: SaveData = captureSave(
      before.cargo,
      before.stock,
      before.equipment,
      STARTING_SYSTEM,
    );

    const after = roundTrip(data);

    expect(after.cargo.seenResources.has(RESOURCE.Tin)).toBe(true);
  });

  it("형식이 다르면 버린다", () => {
    // 옛 저장을 억지로 읽으면 어디가 비었는지 모르는 채로 진행된다.
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1 }))).toBeNull();
    expect(parseSave("망가진 값")).toBeNull();
    expect(parseSave(null)).toBeNull();
  });

  it("값이 망가져 있어도 켜진다", () => {
    // 저장소는 사용자가 고칠 수 있다. 저장 하나가 틀어져서 게임이 안 켜지는
    // 것이 가장 나쁘다.
    const broken = {
      version: SAVE_VERSION,
      cargo: { COPPER: -5, 없는광물: 100 },
      ore: {},
      ingots: {},
      alloys: {},
      credits: Number.NaN,
      laserTier: 0,
      laserUpgrade: 999,
      tractorTier: -3,
      system: "없는항성계",
      seenMinerals: ["없는광물"],
    } as unknown as SaveData;

    const after = roundTrip(broken);

    expect(after.cargo.total).toBe(0);
    expect(after.stock.credits).toBe(0);
    // 티어 0 이면 아무것도 캘 수 없는 장비가 된다.
    expect(after.equipment.laserTier).toBe(1);
    expect(after.equipment.tractorTier).toBe(1);
    expect(after.equipment.laserUpgrade).toBe(MAX_UPGRADE_LEVEL);
    expect(after.system).toBe(STARTING_SYSTEM);
  });

  it("보유량이 0 인 것은 저장하지 않는다", () => {
    // 저장된 것을 눈으로 읽을 수 있어야 한다.
    const data: SaveData = captureSave(
      new Cargo(),
      new StationStock(),
      new ShipEquipment(),
      STARTING_SYSTEM,
    );

    expect(Object.keys(data.cargo)).toHaveLength(0);
    expect(Object.keys(data.ore)).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { SELL_PRICE, SMELTING } from "../constants";
import { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, ShipEquipment } from "./equipment";
import { MINERAL_DEFINITIONS, RESOURCE, type MineralId } from "./minerals";
import { StationStock, upgradeCostFor } from "./station-stock";

/** 저장고에 주괴를 직접 채운다. 하역과 제련을 거치는 경로를 그대로 쓴다. */
function stockIngots(stock: StationStock, mineral: MineralId, ingots: number): void {
  const cargo: Cargo = new Cargo();
  cargo.add(mineral, ingots * SMELTING.OrePerIngot);
  stock.unload(cargo);
  stock.smeltAll();
}

describe("하역", () => {
  it("화물칸을 비워 저장고로 옮긴다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, 30);
    cargo.add(RESOURCE.Gem, 2);

    const moved: number = stock.unload(cargo);

    expect(moved).toBe(32);
    expect(cargo.total).toBe(0);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(30);
    expect(stock.gems).toBe(2);
  });

  it("하역하면 화물칸 압박이 풀린다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, cargo.capacity);
    expect(cargo.isFull).toBe(true);

    stock.unload(cargo);

    expect(cargo.isFull).toBe(false);
  });
});

describe("제련", () => {
  it("광석을 주괴로 바꾸고 부피가 준다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, 20);
    stock.unload(cargo);

    const produced: number = stock.smeltAll();

    expect(produced).toBe(20 / SMELTING.OrePerIngot);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(10);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(0);
  });

  it("주괴 하나에 못 미치는 나머지는 광석으로 남는다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, 5);
    stock.unload(cargo);

    stock.smeltAll();

    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(2);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(1);
  });

  it("제련할 광석이 없으면 아무것도 만들어지지 않는다", () => {
    const stock: StationStock = new StationStock();

    expect(stock.smeltAll()).toBe(0);
  });
});

describe("판매", () => {
  it("보석이 광석보다 훨씬 값이 높다 — 광물 판매를 강요하지 않는다", () => {
    expect(SELL_PRICE.Gem).toBeGreaterThan(SELL_PRICE.Ore * 20);
  });

  it("보석을 팔면 화폐가 된다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Gem, 3);
    stock.unload(cargo);

    const earned: number = stock.sellGems();

    expect(earned).toBe(3 * SELL_PRICE.Gem);
    expect(stock.credits).toBe(earned);
    expect(stock.gems).toBe(0);
  });
});

describe("업그레이드", () => {
  it("재료가 모자라면 아무것도 소비하지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    stockIngots(stock, RESOURCE.Copper, 100);

    // 보석과 크레딧이 없다.
    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(equipment.laserUpgrade).toBe(0);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(100);
  });

  it("재료가 충분하면 강화되고 비용이 빠진다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    const cost = upgradeCostFor(1, 1);

    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, cost.ingots * SMELTING.OrePerIngot);
    cargo.add(RESOURCE.Gem, cost.gems + 2);
    stock.unload(cargo);
    stock.smeltAll();
    stock.sellGems();

    // 보석을 다 팔았으므로 다시 채운다. 크레딧은 그대로 남는다.
    const gemCargo: Cargo = new Cargo();
    gemCargo.add(RESOURCE.Gem, cost.gems);
    stock.unload(gemCargo);

    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(true);
    expect(equipment.laserUpgrade).toBe(1);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(0);
    expect(stock.gems).toBe(0);
  });

  it("단계가 오를수록 비용이 커진다", () => {
    const first = upgradeCostFor(1, 1);
    const second = upgradeCostFor(1, 2);

    expect(second.ingots).toBeGreaterThan(first.ingots);
    expect(second.gems).toBeGreaterThan(first.gems);
    expect(second.credits).toBeGreaterThan(first.credits);
  });

  it("강화 비용은 현재 티어의 광물을 요구한다", () => {
    expect(upgradeCostFor(1, 1).mineral).toBe(RESOURCE.Copper);
    expect(upgradeCostFor(2, 1).mineral).toBe(RESOURCE.Iron);
    expect(upgradeCostFor(3, 1).mineral).toBe(RESOURCE.Titanium);
  });

  it("최대 강화 상태에서는 더 올리지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, MAX_UPGRADE_LEVEL);

    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(result.message).toContain("최대");
  });
});

describe("티어 제작", () => {
  it("주괴가 모자라면 제작되지 않고 소비도 없다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    stockIngots(stock, RESOURCE.Copper, 100);

    const result = stock.craftNextLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(equipment.laserTier).toBe(1);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(100);
  });

  it("주괴가 충분하면 상위 티어로 갈아 끼우고 강화는 초기화된다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 3);
    stockIngots(stock, RESOURCE.Copper, 60);
    stockIngots(stock, RESOURCE.Iron, 40);

    const result = stock.craftNextLaser(equipment);

    expect(result.isSuccess).toBe(true);
    expect(equipment.laserTier).toBe(2);
    expect(equipment.laserUpgrade).toBe(0);
  });

  it("최대 티어에서는 더 제작되지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(3, 0);

    expect(stock.craftNextLaser(equipment).isSuccess).toBe(false);
  });

  it("상위 티어일수록 여러 종의 주괴를 요구한다", () => {
    const stock: StationStock = new StationStock();
    const tierTwo: ShipEquipment = new ShipEquipment(1, 0);
    const tierThree: ShipEquipment = new ShipEquipment(2, 0);

    // 재료가 없을 때의 안내 문구로 요구 종류를 확인한다.
    expect(stock.craftNextLaser(tierTwo).message).toContain(
      MINERAL_DEFINITIONS[RESOURCE.Iron].displayName,
    );
    expect(stock.craftNextLaser(tierThree).message).toContain(
      MINERAL_DEFINITIONS[RESOURCE.Titanium].displayName,
    );
  });
});

describe("진행 순환", () => {
  it("구리만 캐서는 철을 캘 수 없고, 강화를 거쳐야 잠금이 풀린다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    const iron = MINERAL_DEFINITIONS[RESOURCE.Iron];

    expect(equipment.evaluateMining(iron).isAllowed).toBe(false);

    // 구리와 보석을 충분히 모아 강화를 요구 수준까지 올린다.
    for (let level = 1; level <= iron.requiredLaserUpgrade; level += 1) {
      const cost = upgradeCostFor(1, level);
      const cargo: Cargo = new Cargo();
      cargo.add(RESOURCE.Copper, cost.ingots * SMELTING.OrePerIngot);
      stock.unload(cargo);
      stock.smeltAll();

      const gemCargo: Cargo = new Cargo();
      gemCargo.add(RESOURCE.Gem, cost.gems + Math.ceil(cost.credits / SELL_PRICE.Gem));
      stock.unload(gemCargo);
      // 필요한 만큼만 팔아 크레딧을 만들고 나머지는 재료로 남긴다.
      const gemsToKeep: number = cost.gems;
      const gemsHeld: number = stock.gems;
      const cargoBack: Cargo = new Cargo();
      cargoBack.add(RESOURCE.Gem, gemsToKeep);
      stock.sellGems();
      stock.unload(cargoBack);
      expect(gemsHeld).toBeGreaterThanOrEqual(gemsToKeep);

      expect(stock.upgradeLaser(equipment).isSuccess).toBe(true);
    }

    expect(equipment.evaluateMining(iron).isAllowed).toBe(true);
  });
});

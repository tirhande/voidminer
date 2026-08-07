import { describe, expect, it } from "vitest";

import { SELL_PRICE, SMELTING } from "../constants";
import { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, ShipEquipment } from "./equipment";
import {
  ALLOY,
  ALLOY_DEFINITIONS,
  MINERAL_DEFINITIONS,
  RESOURCE,
  type MineralId,
} from "./minerals";
import {
  MAX_LASER_TIER,
  StationStock,
  craftCostFor,
  materialForTier,
  upgradeCostFor,
} from "./station-stock";

/**
 * 저장고에 광석을 넣는다. 화물 하역 경로를 그대로 쓴다.
 *
 * 화물칸에는 상한이 있으므로 한 번에 다 싣지 못한다. 여러 번 왕복한 셈으로
 * 나눠 싣는다.
 */
function stockOre(stock: StationStock, mineral: MineralId, amount: number): void {
  let remaining: number = amount;

  while (remaining > 0) {
    const cargo: Cargo = new Cargo();
    const loaded: number = cargo.add(mineral, remaining);
    stock.unload(cargo);
    remaining -= loaded;
  }
}

/** 저장고에 주괴를 채운다. 광석을 넣고 제련한다. */
function stockIngots(stock: StationStock, mineral: MineralId, ingots: number): void {
  stockOre(stock, mineral, ingots * SMELTING.OrePerIngot);
  stock.smeltAll();
}

/** 지정한 티어의 재료를 필요한 만큼 채운다. 주괴든 합금이든 처리한다. */
function stockMaterial(stock: StationStock, tier: number, amount: number): void {
  const material = materialForTier(tier);

  if (material.kind === "INGOT") {
    stockIngots(stock, material.mineral, amount);
    return;
  }

  // 합금은 주광물 주괴 셋과 짝인 주괴 하나로 만든다.
  const definition = ALLOY_DEFINITIONS[material.alloy];
  stockIngots(stock, definition.primary, amount * SMELTING.PrimaryIngotPerAlloy);
  stockIngots(stock, definition.pair, amount * SMELTING.PairIngotPerAlloy);
  stock.alloyAll();
}

describe("하역", () => {
  it("화물칸을 비워 저장고로 옮긴다", () => {
    const stock: StationStock = new StationStock();
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, 30);
    cargo.add(RESOURCE.Tin, 6);

    const moved: number = stock.unload(cargo);

    expect(moved).toBe(36);
    expect(cargo.total).toBe(0);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(30);
    expect(stock.oreOf(RESOURCE.Tin)).toBe(6);
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
    stockOre(stock, RESOURCE.Copper, 20);

    const produced: number = stock.smeltAll();

    expect(produced).toBe(20 / SMELTING.OrePerIngot);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(5);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(0);
  });

  it("주괴 하나에 못 미치는 나머지는 광석으로 남는다", () => {
    const stock: StationStock = new StationStock();
    stockOre(stock, RESOURCE.Copper, SMELTING.OrePerIngot + 1);

    stock.smeltAll();

    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(1);
    expect(stock.oreOf(RESOURCE.Copper)).toBe(1);
  });

  it("제련할 광석이 없으면 아무것도 만들어지지 않는다", () => {
    expect(new StationStock().smeltAll()).toBe(0);
  });
});

describe("합금", () => {
  it("짝인 주괴를 합쳐 합금이 된다", () => {
    const stock: StationStock = new StationStock();
    stockIngots(stock, RESOURCE.Copper, SMELTING.PrimaryIngotPerAlloy);
    stockIngots(stock, RESOURCE.Tin, SMELTING.PairIngotPerAlloy);

    const produced: number = stock.alloyAll();

    expect(produced).toBe(1);
    expect(stock.alloysOf(ALLOY.Bronze)).toBe(1);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(0);
    expect(stock.ingotsOf(RESOURCE.Tin)).toBe(0);
  });

  it("짝이 없으면 합금이 나오지 않는다 — 주광물만 캐서는 못 만든다", () => {
    const stock: StationStock = new StationStock();
    stockIngots(stock, RESOURCE.Copper, 30);

    expect(stock.alloyAll()).toBe(0);
    expect(stock.alloysOf(ALLOY.Bronze)).toBe(0);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(30);
  });

  it("네 쌍이 각자 자기 합금이 된다", () => {
    const stock: StationStock = new StationStock();
    for (const alloy of Object.values(ALLOY)) {
      const entry = ALLOY_DEFINITIONS[alloy];
      stockIngots(stock, entry.primary, SMELTING.PrimaryIngotPerAlloy);
      stockIngots(stock, entry.pair, SMELTING.PairIngotPerAlloy);
    }

    stock.alloyAll();

    for (const alloy of Object.values(ALLOY)) {
      expect(stock.alloysOf(alloy)).toBe(1);
    }
  });
});

describe("판매", () => {
  it("주괴가 광석보다 비싸다 — 제련한 만큼 값이 붙는다", () => {
    expect(SELL_PRICE.Ingot).toBeGreaterThan(SELL_PRICE.Ore * SMELTING.OrePerIngot);
  });

  it("광석을 팔면 화폐가 된다", () => {
    const stock: StationStock = new StationStock();
    stockOre(stock, RESOURCE.Copper, 10);

    const earned: number = stock.sellOre();

    expect(earned).toBe(10 * SELL_PRICE.Ore);
    expect(stock.credits).toBe(earned);
    expect(stock.totalOre).toBe(0);
  });

  it("주괴를 팔면 화폐가 되고 재고가 빈다", () => {
    const stock: StationStock = new StationStock();
    stockIngots(stock, RESOURCE.Copper, 10);

    const earned: number = stock.sellIngots(RESOURCE.Copper);

    expect(earned).toBe(10 * SELL_PRICE.Ingot);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(0);
    expect(stock.credits).toBe(earned);
  });

  it("광물마다 따로 팔 수 있다", () => {
    const stock: StationStock = new StationStock();
    stockOre(stock, RESOURCE.Copper, 10);
    stockOre(stock, RESOURCE.Tin, 6);

    stock.sellOreOf(RESOURCE.Copper);

    // 무엇을 팔고 무엇을 남길지가 선택이 되어야 한다.
    expect(stock.oreOf(RESOURCE.Copper)).toBe(0);
    expect(stock.oreOf(RESOURCE.Tin)).toBe(6);
  });
});

describe("업그레이드", () => {
  it("재료가 모자라면 아무것도 소비하지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    stockIngots(stock, RESOURCE.Copper, 100);

    // 크레딧이 없다.
    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(equipment.laserUpgrade).toBe(0);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(100);
  });

  it("재료가 충분하면 강화되고 비용이 빠진다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    const cost = upgradeCostFor(1, 1);

    stockIngots(stock, RESOURCE.Copper, cost.amount);
    stockOre(stock, RESOURCE.Iron, Math.ceil(cost.credits / SELL_PRICE.Ore));
    stock.sellOre();

    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(true);
    expect(equipment.laserUpgrade).toBe(1);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(0);
  });

  it("단계가 오를수록 비용이 커진다", () => {
    const first = upgradeCostFor(1, 1);
    const second = upgradeCostFor(1, 2);

    expect(second.amount).toBeGreaterThan(first.amount);
    expect(second.credits).toBeGreaterThan(first.credits);
  });

  it("강화 비용은 현재 티어의 재료를 요구한다", () => {
    expect(upgradeCostFor(1, 1).material).toEqual(materialForTier(1));
    expect(upgradeCostFor(2, 1).material).toEqual(materialForTier(2));
  });

  it("최대 강화 상태에서는 더 올리지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, MAX_UPGRADE_LEVEL);

    const result = stock.upgradeLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(result.message).toContain("최대");
  });
});

describe("티어 체인", () => {
  it("순수 금속과 합금이 번갈아 놓인다", () => {
    for (let tier = 1; tier <= MAX_LASER_TIER; tier += 1) {
      const expected: "INGOT" | "ALLOY" = tier % 2 === 1 ? "INGOT" : "ALLOY";
      expect(materialForTier(tier).kind).toBe(expected);
    }
  });

  it("합금 티어가 다음 광물 쌍을 연다", () => {
    // T2 청동 레이저가 철을 열고, T4 니켈강이 티타늄을, T6 티타늄 합금이
    // 이리듐을 연다. 이 대응이 깨지면 진행이 막힌다.
    expect(MINERAL_DEFINITIONS[RESOURCE.Iron].requiredLaserTier).toBe(2);
    expect(MINERAL_DEFINITIONS[RESOURCE.Titanium].requiredLaserTier).toBe(4);
    expect(MINERAL_DEFINITIONS[RESOURCE.Iridium].requiredLaserTier).toBe(6);
  });

  it("재료가 모자라면 제작되지 않고 소비도 없다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    stockIngots(stock, RESOURCE.Copper, 100);

    const result = stock.craftNextLaser(equipment);

    expect(result.isSuccess).toBe(false);
    expect(equipment.laserTier).toBe(1);
    expect(stock.ingotsOf(RESOURCE.Copper)).toBe(100);
  });

  it("합금이 있으면 다음 티어로 갈아 끼우고 강화는 초기화된다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 3);
    const cost = craftCostFor(2);
    expect(cost).not.toBeNull();

    stockMaterial(stock, 2, cost?.amount ?? 0);

    const result = stock.craftNextLaser(equipment);

    expect(result.isSuccess).toBe(true);
    expect(equipment.laserTier).toBe(2);
    expect(equipment.laserUpgrade).toBe(0);
  });

  it("최대 티어에서는 더 제작되지 않는다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(MAX_LASER_TIER, 0);

    expect(stock.craftNextLaser(equipment).isSuccess).toBe(false);
  });

  it("견인빔도 같은 재료 체계를 쓴다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0, 1);
    const cost = craftCostFor(2);

    stockMaterial(stock, 2, cost?.amount ?? 0);
    const before: number = equipment.tractorCapacity;

    const result = stock.upgradeTractor(equipment);

    expect(result.isSuccess).toBe(true);
    expect(equipment.tractorCapacity).toBeGreaterThan(before);
  });
});

describe("진행 순환", () => {
  it("구리만 캐서는 철을 캘 수 없고, 강화로 주석을 연 뒤 청동을 거쳐야 한다", () => {
    const stock: StationStock = new StationStock();
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    const tin = MINERAL_DEFINITIONS[RESOURCE.Tin];
    const iron = MINERAL_DEFINITIONS[RESOURCE.Iron];

    // 처음에는 구리만 캘 수 있다.
    expect(equipment.evaluateMining(MINERAL_DEFINITIONS[RESOURCE.Copper]).isAllowed).toBe(
      true,
    );
    expect(equipment.evaluateMining(tin).isAllowed).toBe(false);
    expect(equipment.evaluateMining(iron).isAllowed).toBe(false);

    // 구리를 캐서 강화를 올리면 주석이 열린다.
    for (let level = 1; level <= tin.requiredLaserUpgrade; level += 1) {
      const cost = upgradeCostFor(1, level);
      stockIngots(stock, RESOURCE.Copper, cost.amount);
      stockOre(stock, RESOURCE.Copper, Math.ceil(cost.credits / SELL_PRICE.Ore));
      stock.sellOre();
      expect(stock.upgradeLaser(equipment).isSuccess).toBe(true);
    }
    expect(equipment.evaluateMining(tin).isAllowed).toBe(true);

    // 주석까지 캐면 청동을 만들 수 있고, 청동으로 T2 를 제작하면 철이 열린다.
    const craftCost = craftCostFor(2);
    stockMaterial(stock, 2, craftCost?.amount ?? 0);
    expect(stock.craftNextLaser(equipment).isSuccess).toBe(true);
    expect(equipment.evaluateMining(iron).isAllowed).toBe(true);
  });
});

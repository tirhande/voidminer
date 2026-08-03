import { describe, expect, it } from "vitest";

import { MAX_UPGRADE_LEVEL, ShipEquipment } from "./equipment";
import { MINERAL_DEFINITIONS, RESOURCE } from "./minerals";

const COPPER = MINERAL_DEFINITIONS[RESOURCE.Copper];
const IRON = MINERAL_DEFINITIONS[RESOURCE.Iron];
const TITANIUM = MINERAL_DEFINITIONS[RESOURCE.Titanium];

describe("잠금 판정", () => {
  it("기본 장비로 1티어 광물은 캘 수 있다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);

    const result = equipment.evaluateMining(COPPER);

    expect(result.isAllowed).toBe(true);
    expect(result.requirementText).toBeNull();
  });

  it("강화가 모자라면 상위 광물을 캘 수 없다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);

    const result = equipment.evaluateMining(IRON);

    expect(result.isAllowed).toBe(false);
    expect(result.requirementText).toBe(
      `레이저 T${IRON.requiredLaserTier} 강화 ${IRON.requiredLaserUpgrade} 이상 필요`,
    );
  });

  it("강화가 요구치에 도달하면 잠금이 풀린다 — 업그레이드가 다음 티어의 열쇠다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);

    for (let step = 0; step < IRON.requiredLaserUpgrade; step += 1) {
      expect(equipment.evaluateMining(IRON).isAllowed).toBe(false);
      equipment.upgradeLaser();
    }

    expect(equipment.evaluateMining(IRON).isAllowed).toBe(true);
  });

  it("티어가 모자라면 강화를 최대로 해도 캘 수 없고, 사유는 티어를 가리킨다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, MAX_UPGRADE_LEVEL);

    const result = equipment.evaluateMining(TITANIUM);

    expect(result.isAllowed).toBe(false);
    expect(result.requirementText).toBe(`레이저 T${TITANIUM.requiredLaserTier} 이상 필요`);
  });

  it("요구 티어를 넘어서면 강화 수준과 무관하게 캘 수 있다", () => {
    const equipment: ShipEquipment = new ShipEquipment(2, 0);

    expect(equipment.evaluateMining(IRON).isAllowed).toBe(true);
  });

  it("사유 문구에 명령형을 쓰지 않는다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);

    const text: string = equipment.evaluateMining(TITANIUM).requirementText ?? "";

    expect(text).toContain("필요");
    expect(text).not.toContain("하세요");
    expect(text).not.toContain("올리");
  });
});

describe("업그레이드", () => {
  it("한 단계씩 오르고 상한을 넘지 않는다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);

    for (let step = 0; step < MAX_UPGRADE_LEVEL; step += 1) {
      expect(equipment.upgradeLaser()).toBe(true);
    }

    expect(equipment.laserUpgrade).toBe(MAX_UPGRADE_LEVEL);
    expect(equipment.upgradeLaser()).toBe(false);
    expect(equipment.laserUpgrade).toBe(MAX_UPGRADE_LEVEL);
  });

  it("업그레이드는 실패하지 않는다 — 여러 번 반복해도 결과가 같다", () => {
    const first: ShipEquipment = new ShipEquipment(1, 0);
    const second: ShipEquipment = new ShipEquipment(1, 0);

    first.upgradeLaser();
    first.upgradeLaser();
    second.upgradeLaser();
    second.upgradeLaser();

    expect(first.laserUpgrade).toBe(second.laserUpgrade);
  });

  it("강화할수록 채굴 속도가 오른다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    const baseYield: number = equipment.laserYieldPerSecond;

    equipment.upgradeLaser();

    expect(equipment.laserYieldPerSecond).toBeGreaterThan(baseYield);
  });

  it("티어를 갈아 끼우면 강화 이력은 따라오지 않는다", () => {
    const equipment: ShipEquipment = new ShipEquipment(1, 0);
    equipment.upgradeLaser();
    equipment.upgradeLaser();

    equipment.replaceLaser(2);

    expect(equipment.laserTier).toBe(2);
    expect(equipment.laserUpgrade).toBe(0);
  });

  it("상위 티어 기본 성능이 하위 티어 최대 강화보다 높다", () => {
    const maxedLowTier: ShipEquipment = new ShipEquipment(1, MAX_UPGRADE_LEVEL);
    const baseHighTier: ShipEquipment = new ShipEquipment(2, 0);

    // 이 순서가 뒤집히면 상위 티어를 제작할 이유가 사라진다 (GDD 07).
    expect(baseHighTier.laserYieldPerSecond).toBeGreaterThan(
      maxedLowTier.laserYieldPerSecond,
    );
  });
});

describe("광물 정의", () => {
  it("티어가 높을수록 요구 조건이 느슨해지지 않는다", () => {
    const ordered = [COPPER, IRON, TITANIUM];

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousCost: number = previous.requiredLaserTier * 100 + previous.requiredLaserUpgrade;
      const currentCost: number = current.requiredLaserTier * 100 + current.requiredLaserUpgrade;

      expect(currentCost).toBeGreaterThan(previousCost);
    }
  });

  it("보석 확률은 상위 티어일수록 높지만 항상 1 미만이다", () => {
    expect(IRON.gemChance).toBeGreaterThan(COPPER.gemChance);
    expect(TITANIUM.gemChance).toBeGreaterThan(IRON.gemChance);
    expect(TITANIUM.gemChance).toBeLessThan(1);
  });
});

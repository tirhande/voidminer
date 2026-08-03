import { SELL_PRICE, SMELTING, UPGRADE_COST } from "../constants";
import type { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, type ShipEquipment } from "./equipment";
import { MINERAL_DEFINITIONS, RESOURCE, type MineralId } from "./minerals";

/** 레이저 티어에 대응하는 광물. GDD 07 의 티어 대응 표를 그대로 옮겼다. */
const TIER_MINERAL: ReadonlyArray<MineralId> = [
  RESOURCE.Copper,
  RESOURCE.Iron,
  RESOURCE.Titanium,
];

/** 다음 티어 레이저를 만드는 데 드는 주괴. 상위일수록 여러 종을 요구한다. */
const LASER_CRAFT_COST: Readonly<Record<number, ReadonlyArray<[MineralId, number]>>> = {
  2: [
    [RESOURCE.Iron, 10],
    [RESOURCE.Copper, 24],
  ],
  3: [
    [RESOURCE.Titanium, 12],
    [RESOURCE.Iron, 24],
    [RESOURCE.Copper, 36],
  ],
};

/** 최고 레이저 티어. */
export const MAX_LASER_TIER = 3;

/** 업그레이드 한 단계에 드는 비용. */
export type UpgradeCost = {
  readonly mineral: MineralId;
  readonly ingots: number;
  readonly gems: number;
  readonly credits: number;
};

/** 티어 제작에 드는 비용. */
export type CraftCost = {
  readonly tier: number;
  readonly ingots: ReadonlyArray<{ mineral: MineralId; amount: number }>;
};

/** 거점 작업의 결과. 실패한 경우 사유를 담는다. */
export type StationActionResult = {
  readonly isSuccess: boolean;
  readonly message: string;
};

/** 레이저 티어에 대응하는 광물을 얻는다. */
export function mineralForTier(tier: number): MineralId {
  const index: number = Math.min(Math.max(tier, 1), TIER_MINERAL.length) - 1;
  return TIER_MINERAL[index];
}

/** 지정한 강화 단계로 올리는 데 드는 비용을 계산한다. */
export function upgradeCostFor(laserTier: number, nextLevel: number): UpgradeCost {
  const step: number = nextLevel - 1;
  return {
    mineral: mineralForTier(laserTier),
    ingots: UPGRADE_COST.IngotBase + UPGRADE_COST.IngotPerLevel * step,
    gems: UPGRADE_COST.GemBase + UPGRADE_COST.GemPerLevel * step,
    credits: UPGRADE_COST.CreditBase + UPGRADE_COST.CreditPerLevel * step,
  };
}

/** 지정한 티어 레이저를 만드는 데 드는 비용을 얻는다. */
export function craftCostFor(tier: number): CraftCost | null {
  const entries = LASER_CRAFT_COST[tier];
  if (entries === undefined) {
    return null;
  }
  return {
    tier,
    ingots: entries.map(([mineral, amount]) => ({ mineral, amount })),
  };
}

/**
 * 거점 저장고.
 *
 * 업그레이드와 제작은 거점에서만 할 수 있다 (GDD 07). 우주에서 바로 되면
 * 거점으로 돌아갈 이유가 사라지고, 왕복이 성장하는 시간이 되지 못한다.
 */
export class StationStock {
  private readonly ore: Map<MineralId, number> = new Map();
  private readonly ingots: Map<MineralId, number> = new Map();
  private gemCount: number = 0;
  private creditCount: number = 0;

  /** 보유 화폐. */
  public get credits(): number {
    return this.creditCount;
  }

  /** 보유 보석. */
  public get gems(): number {
    return this.gemCount;
  }

  /** 특정 광물의 광석 보유량. */
  public oreOf(mineral: MineralId): number {
    return this.ore.get(mineral) ?? 0;
  }

  /** 특정 광물의 주괴 보유량. */
  public ingotsOf(mineral: MineralId): number {
    return this.ingots.get(mineral) ?? 0;
  }

  /** 저장고에 쌓인 광석 총량. */
  public get totalOre(): number {
    let total: number = 0;
    for (const amount of this.ore.values()) {
      total += amount;
    }
    return total;
  }

  /**
   * 화물칸을 비워 저장고로 옮긴다.
   *
   * @param cargo 비울 화물칸
   * @returns 옮긴 총량
   */
  public unload(cargo: Cargo): number {
    let moved: number = 0;

    for (const entry of cargo.entries()) {
      if (entry.amount <= 0) {
        continue;
      }
      if (entry.resource === RESOURCE.Gem) {
        this.gemCount += entry.amount;
      } else {
        this.ore.set(entry.resource, this.oreOf(entry.resource) + entry.amount);
      }
      moved += entry.amount;
    }

    cargo.clear();
    return moved;
  }

  /**
   * 저장고의 광석을 전부 제련한다. 주괴로 바뀌지 못한 나머지는 광석으로 남는다.
   *
   * @returns 만들어진 주괴 총수
   */
  public smeltAll(): number {
    let produced: number = 0;

    for (const [mineral, amount] of [...this.ore]) {
      const madeIngots: number = Math.floor(amount / SMELTING.OrePerIngot);
      if (madeIngots <= 0) {
        continue;
      }
      this.ore.set(mineral, amount - madeIngots * SMELTING.OrePerIngot);
      this.ingots.set(mineral, this.ingotsOf(mineral) + madeIngots);
      produced += madeIngots;
    }

    return produced;
  }

  /** 보석을 전부 판다. 반환값은 얻은 화폐다. */
  public sellGems(): number {
    const earned: number = this.gemCount * SELL_PRICE.Gem;
    this.gemCount = 0;
    this.creditCount += earned;
    return earned;
  }

  /** 남은 광석을 전부 판다. 반환값은 얻은 화폐다. */
  public sellOre(): number {
    const earned: number = this.totalOre * SELL_PRICE.Ore;
    this.ore.clear();
    this.creditCount += earned;
    return earned;
  }

  /**
   * 채굴 레이저를 한 단계 강화한다.
   *
   * 재료가 모자라면 아무것도 소비하지 않는다. 실패로 재료를 날리는 일은
   * 없다 (GDD 07).
   */
  public upgradeLaser(equipment: ShipEquipment): StationActionResult {
    if (equipment.laserUpgrade >= MAX_UPGRADE_LEVEL) {
      return { isSuccess: false, message: "강화가 이미 최대치다" };
    }

    const cost: UpgradeCost = upgradeCostFor(
      equipment.laserTier,
      equipment.laserUpgrade + 1,
    );
    const mineralName: string = MINERAL_DEFINITIONS[cost.mineral].displayName;

    if (this.ingotsOf(cost.mineral) < cost.ingots) {
      return {
        isSuccess: false,
        message: `${mineralName} 주괴 ${cost.ingots} 필요 (보유 ${this.ingotsOf(cost.mineral)})`,
      };
    }
    if (this.gemCount < cost.gems) {
      return {
        isSuccess: false,
        message: `보석 ${cost.gems} 필요 (보유 ${this.gemCount})`,
      };
    }
    if (this.creditCount < cost.credits) {
      return {
        isSuccess: false,
        message: `크레딧 ${cost.credits} 필요 (보유 ${this.creditCount})`,
      };
    }

    this.ingots.set(cost.mineral, this.ingotsOf(cost.mineral) - cost.ingots);
    this.gemCount -= cost.gems;
    this.creditCount -= cost.credits;
    equipment.upgradeLaser();

    return {
      isSuccess: true,
      message: `채굴 레이저 강화 ${equipment.laserUpgrade}`,
    };
  }

  /** 다음 티어 채굴 레이저를 제작한다. */
  public craftNextLaser(equipment: ShipEquipment): StationActionResult {
    const nextTier: number = equipment.laserTier + 1;
    const cost: CraftCost | null = craftCostFor(nextTier);

    if (cost === null || nextTier > MAX_LASER_TIER) {
      return { isSuccess: false, message: "더 높은 티어가 없다" };
    }

    for (const requirement of cost.ingots) {
      const held: number = this.ingotsOf(requirement.mineral);
      if (held < requirement.amount) {
        const name: string = MINERAL_DEFINITIONS[requirement.mineral].displayName;
        return {
          isSuccess: false,
          message: `${name} 주괴 ${requirement.amount} 필요 (보유 ${held})`,
        };
      }
    }

    for (const requirement of cost.ingots) {
      this.ingots.set(
        requirement.mineral,
        this.ingotsOf(requirement.mineral) - requirement.amount,
      );
    }
    equipment.replaceLaser(nextTier);

    return { isSuccess: true, message: `채굴 레이저 T${nextTier} 장착` };
  }
}

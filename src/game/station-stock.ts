import { SELL_PRICE, SMELTING, UPGRADE_COST } from "../constants";
import type { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, type ShipEquipment } from "./equipment";
import {
  ALLOY,
  ALLOY_DEFINITIONS,
  MINERAL_DEFINITIONS,
  RESOURCE,
  type AlloyId,
  type MineralId,
} from "./minerals";

/** 티어 재료는 순수 주괴이거나 합금이다. */
export type TierMaterial =
  | { readonly kind: "INGOT"; readonly mineral: MineralId }
  | { readonly kind: "ALLOY"; readonly alloy: AlloyId };

/**
 * 티어별 재료.
 *
 * GDD 07 의 티어 대응 표를 그대로 옮겼다. 순수 금속과 합금이 번갈아 놓이고,
 * **합금 티어가 다음 광물 쌍을 연다.**
 *
 * 이것이 순환을 끊는 구조다. 티어만으로 잠그면 T2 광물을 캐려면 T2 레이저가
 * 필요한데 T2 레이저의 재료가 그 광물이라 진행이 막힌다. 강화가 짝인 부광물을
 * 열고, 그 짝으로 합금을 만들어 다음 티어로 넘어간다.
 */
const TIER_MATERIAL: ReadonlyArray<TierMaterial> = [
  { kind: "INGOT", mineral: RESOURCE.Copper }, // T1
  { kind: "ALLOY", alloy: ALLOY.Bronze }, // T2 — 철을 연다
  { kind: "INGOT", mineral: RESOURCE.Iron }, // T3 — 성능만
  { kind: "ALLOY", alloy: ALLOY.NickelSteel }, // T4 — 티타늄을 연다
  { kind: "INGOT", mineral: RESOURCE.Titanium }, // T5 — 성능만
  { kind: "ALLOY", alloy: ALLOY.TitaniumAlloy }, // T6 — 이리듐을 연다
  { kind: "INGOT", mineral: RESOURCE.Iridium }, // T7 — 성능만
  { kind: "ALLOY", alloy: ALLOY.PlatinumIridium }, // T8 — 최종
];

/** 최고 장비 티어. */
export const MAX_LASER_TIER = TIER_MATERIAL.length;

/** 티어를 하나 올리는 데 드는 재료 수. */
const CRAFT_MATERIAL_COUNT = 8;

/** 업그레이드 한 단계에 드는 비용. */
export type UpgradeCost = {
  readonly material: TierMaterial;
  readonly amount: number;
  readonly credits: number;
};

/** 티어 제작에 드는 비용. */
export type CraftCost = {
  readonly tier: number;
  readonly material: TierMaterial;
  readonly amount: number;
};

/** 거점 작업의 결과. 실패한 경우 사유를 담는다. */
export type StationActionResult = {
  readonly isSuccess: boolean;
  readonly message: string;
};

/** 티어에 대응하는 재료를 얻는다. */
export function materialForTier(tier: number): TierMaterial {
  const index: number = Math.min(Math.max(tier, 1), MAX_LASER_TIER) - 1;
  return TIER_MATERIAL[index];
}

/** 재료의 표시 이름을 얻는다. */
export function materialName(material: TierMaterial): string {
  return material.kind === "INGOT"
    ? `${MINERAL_DEFINITIONS[material.mineral].displayName} 주괴`
    : ALLOY_DEFINITIONS[material.alloy].displayName;
}

/** 지정한 강화 단계로 올리는 데 드는 비용을 계산한다. */
export function upgradeCostFor(laserTier: number, nextLevel: number): UpgradeCost {
  const step: number = nextLevel - 1;
  return {
    material: materialForTier(laserTier),
    amount: UPGRADE_COST.MaterialBase + UPGRADE_COST.MaterialPerLevel * step,
    credits: UPGRADE_COST.CreditBase + UPGRADE_COST.CreditPerLevel * step,
  };
}

/** 지정한 티어를 만드는 데 드는 비용을 얻는다. */
export function craftCostFor(tier: number): CraftCost | null {
  if (tier < 2 || tier > MAX_LASER_TIER) {
    return null;
  }
  return { tier, material: materialForTier(tier), amount: CRAFT_MATERIAL_COUNT };
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
  private readonly alloys: Map<AlloyId, number> = new Map();
  private creditCount: number = 0;

  /** 보유 화폐. */
  public get credits(): number {
    return this.creditCount;
  }

  /** 특정 광물의 광석 보유량. */
  public oreOf(mineral: MineralId): number {
    return this.ore.get(mineral) ?? 0;
  }

  /** 특정 광물의 주괴 보유량. */
  public ingotsOf(mineral: MineralId): number {
    return this.ingots.get(mineral) ?? 0;
  }

  /** 특정 합금의 보유량. */
  public alloysOf(alloy: AlloyId): number {
    return this.alloys.get(alloy) ?? 0;
  }

  /** 저장고에 쌓인 광석 총량. */
  public get totalOre(): number {
    let total: number = 0;
    for (const amount of this.ore.values()) {
      total += amount;
    }
    return total;
  }

  /** 저장고에 쌓인 주괴 총수. */
  public get totalIngots(): number {
    let total: number = 0;
    for (const amount of this.ingots.values()) {
      total += amount;
    }
    return total;
  }

  /** 티어 재료의 보유량을 얻는다. 주괴와 합금을 한 자리에서 처리한다. */
  public materialCount(material: TierMaterial): number {
    return material.kind === "INGOT"
      ? this.ingotsOf(material.mineral)
      : this.alloysOf(material.alloy);
  }

  /**
   * 화물칸을 비워 저장고로 옮긴다.
   *
   * @returns 옮긴 총량
   */
  /**
   * 저장된 값을 그대로 되돌린다.
   *
   * 이어하기 전용이다. 일반 경로로는 캐고 제련해야만 늘어나므로, 값을 직접
   * 넣는 문은 여기 하나만 둔다.
   */
  public restoreOre(mineral: MineralId, amount: number): void {
    this.ore.set(mineral, amount);
  }

  /** 저장된 주괴를 되돌린다. */
  public restoreIngots(mineral: MineralId, amount: number): void {
    this.ingots.set(mineral, amount);
  }

  /** 저장된 합금을 되돌린다. */
  public restoreAlloys(alloy: AlloyId, amount: number): void {
    this.alloys.set(alloy, amount);
  }

  /** 저장된 화폐를 되돌린다. */
  public restoreCredits(amount: number): void {
    this.creditCount = amount;
  }

  public unload(cargo: Cargo): number {
    let moved: number = 0;

    for (const entry of cargo.entries()) {
      if (entry.amount <= 0) {
        continue;
      }
      this.ore.set(entry.resource, this.oreOf(entry.resource) + entry.amount);
      moved += entry.amount;
    }

    cargo.clear();
    return moved;
  }

  /**
   * 광석을 전부 제련한다. 주괴가 되지 못한 나머지는 광석으로 남는다.
   *
   * @returns 만들어진 주괴 총수
   */
  public smeltAll(): number {
    let produced: number = 0;
    for (const mineral of [...this.ore.keys()]) {
      produced += this.smelt(mineral);
    }
    return produced;
  }

  /**
   * 만들 수 있는 합금을 전부 만든다.
   *
   * 주광물 주괴 셋과 짝인 부광물 주괴 하나를 합친다. 짝을 캐지 않으면 합금이
   * 나오지 않고, 합금이 없으면 다음 티어로 못 간다.
   *
   * @returns 만들어진 합금 총수
   */
  public alloyAll(): number {
    let produced: number = 0;
    for (const alloy of Object.keys(ALLOY_DEFINITIONS) as AlloyId[]) {
      produced += this.alloy(alloy);
    }
    return produced;
  }


  /** 지정한 광물의 광석을 판다. 반환값은 얻은 화폐다. */
  public sellOreOf(mineral: MineralId, requested: number = Number.POSITIVE_INFINITY): number {
    const count: number = Math.min(this.oreOf(mineral), Math.floor(requested));
    if (count <= 0) {
      return 0;
    }
    const earned: number = count * SELL_PRICE.Ore;
    this.ore.set(mineral, this.oreOf(mineral) - count);
    this.creditCount += earned;
    return earned;
  }

  /**
   * 광석을 녹여 주괴로 만든다.
   *
   * 수량은 **만들 주괴 수**로 받는다. 목적이 "주괴 열 개"이지 "광석 마흔 개"가
   * 아니기 때문이다. 광석이 모자라면 만들 수 있는 만큼만 만든다.
   *
   * @param mineral 녹일 광물
   * @param requestedIngots 만들려는 주괴 수. 생략하면 가능한 만큼 전부
   * @returns 실제로 만든 주괴 수
   */
  public smelt(
    mineral: MineralId,
    requestedIngots: number = Number.POSITIVE_INFINITY,
  ): number {
    const possible: number = Math.floor(this.oreOf(mineral) / SMELTING.OrePerIngot);
    const made: number = Math.min(possible, Math.floor(requestedIngots));
    if (made <= 0) {
      return 0;
    }

    this.ore.set(mineral, this.oreOf(mineral) - made * SMELTING.OrePerIngot);
    this.ingots.set(mineral, this.ingotsOf(mineral) + made);
    return made;
  }

  /**
   * 짝인 주괴를 합쳐 합금을 만든다.
   *
   * @param alloy 만들 합금
   * @param requested 만들려는 개수. 생략하면 가능한 만큼 전부
   * @returns 실제로 만든 개수
   */
  public alloy(alloy: AlloyId, requested: number = Number.POSITIVE_INFINITY): number {
    const definition = ALLOY_DEFINITIONS[alloy];
    const fromPrimary: number = Math.floor(
      this.ingotsOf(definition.primary) / SMELTING.PrimaryIngotPerAlloy,
    );
    const fromPair: number = Math.floor(
      this.ingotsOf(definition.pair) / SMELTING.PairIngotPerAlloy,
    );
    const made: number = Math.min(fromPrimary, fromPair, Math.floor(requested));
    if (made <= 0) {
      return 0;
    }

    this.ingots.set(
      definition.primary,
      this.ingotsOf(definition.primary) - made * SMELTING.PrimaryIngotPerAlloy,
    );
    this.ingots.set(
      definition.pair,
      this.ingotsOf(definition.pair) - made * SMELTING.PairIngotPerAlloy,
    );
    this.alloys.set(alloy, this.alloysOf(alloy) + made);
    return made;
  }

  /** 남은 광석을 전부 판다. 반환값은 얻은 화폐다. */
  public sellOre(): number {
    const earned: number = this.totalOre * SELL_PRICE.Ore;
    this.ore.clear();
    this.creditCount += earned;
    return earned;
  }

  /**
   * 지정한 광물의 주괴를 전부 판다.
   *
   * 제련한 만큼 값이 붙으므로 광석보다 낫다. 다만 주괴는 제작 재료이기도 하니
   * 무엇을 팔지가 선택이 된다.
   */
  public sellIngots(
    mineral: MineralId,
    requested: number = Number.POSITIVE_INFINITY,
  ): number {
    const count: number = Math.min(this.ingotsOf(mineral), Math.floor(requested));
    if (count <= 0) {
      return 0;
    }
    const earned: number = count * SELL_PRICE.Ingot;
    this.ingots.set(mineral, this.ingotsOf(mineral) - count);
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

    const held: number = this.materialCount(cost.material);
    if (held < cost.amount) {
      return {
        isSuccess: false,
        message: `${materialName(cost.material)} ${cost.amount} 필요 (보유 ${held})`,
      };
    }
    if (this.creditCount < cost.credits) {
      return {
        isSuccess: false,
        message: `크레딧 ${cost.credits} 필요 (보유 ${this.creditCount})`,
      };
    }

    this.consumeMaterial(cost.material, cost.amount);
    this.creditCount -= cost.credits;
    equipment.upgradeLaser();

    return { isSuccess: true, message: `채굴 레이저 강화 ${equipment.laserUpgrade}` };
  }

  /** 다음 티어 채굴 레이저를 제작한다. */
  public craftNextLaser(equipment: ShipEquipment): StationActionResult {
    return this.craftTier(equipment.laserTier + 1, (tier) => {
      equipment.replaceLaser(tier);
      return `채굴 레이저 T${tier} 장착`;
    });
  }

  /**
   * 견인빔을 다음 티어로 올린다.
   *
   * 레이저만 올리면 파편이 쏟아져도 회수가 따라가지 못한다. 두 계통이 갈리는
   * 지점이므로 올릴 수단이 있어야 한다 (GDD 02).
   */
  public upgradeTractor(equipment: ShipEquipment): StationActionResult {
    return this.craftTier(equipment.tractorTier + 1, (tier) => {
      equipment.upgradeTractor();
      return `견인빔 T${tier} 장착 (동시 ${equipment.tractorCapacity})`;
    });
  }

  private craftTier(
    nextTier: number,
    apply: (tier: number) => string,
  ): StationActionResult {
    const cost: CraftCost | null = craftCostFor(nextTier);
    if (cost === null) {
      return { isSuccess: false, message: "더 높은 티어가 없다" };
    }

    const held: number = this.materialCount(cost.material);
    if (held < cost.amount) {
      return {
        isSuccess: false,
        message: `${materialName(cost.material)} ${cost.amount} 필요 (보유 ${held})`,
      };
    }

    this.consumeMaterial(cost.material, cost.amount);
    return { isSuccess: true, message: apply(nextTier) };
  }

  private consumeMaterial(material: TierMaterial, amount: number): void {
    if (material.kind === "INGOT") {
      this.ingots.set(material.mineral, this.ingotsOf(material.mineral) - amount);
    } else {
      this.alloys.set(material.alloy, this.alloysOf(material.alloy) - amount);
    }
  }
}

import type * as THREE from "three";

import { SELL_PRICE, SMELTING } from "../constants";
import type { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, type ShipEquipment } from "./equipment";
import type { FlightInputState } from "./flight-input";
import {
  ALLOY_DEFINITIONS,
  ALLOY_ORDER,
  MINERAL_DEFINITIONS,
  MINERAL_ORDER,
  type AlloyId,
  type MineralId,
} from "./minerals";
import type { Station } from "./station";
import {
  MAX_LASER_TIER,
  craftCostFor,
  materialName,
  upgradeCostFor,
  type CraftCost,
  type StationActionResult,
  type StationStock,
  type UpgradeCost,
} from "./station-stock";

/**
 * 거점에서 누를 수 있는 것.
 *
 * 화면이 어떻게 생겼는지와 무관하게 이 목록이 곧 할 수 있는 일의 전부다.
 */
export type StationAction =
  | { readonly kind: "UNLOAD" }
  | { readonly kind: "SMELT_ALL" }
  | { readonly kind: "ALLOY_ALL" }
  | { readonly kind: "SELL_ORE"; readonly mineral: MineralId }
  | { readonly kind: "SELL_INGOTS"; readonly mineral: MineralId }
  | { readonly kind: "UPGRADE_LASER" }
  | { readonly kind: "CRAFT_LASER" }
  | { readonly kind: "CRAFT_TRACTOR" }
  | { readonly kind: "UNDOCK" };

/** 화면에 그릴 버튼 하나. */
export type StationButton = {
  readonly label: string;
  readonly detail: string;
  readonly action: StationAction;
  readonly isAvailable: boolean;
};

/** 저장고 한 줄. 자원마다 팔기 버튼이 붙는다. */
export type StockRow = {
  readonly name: string;
  readonly color: number;
  readonly ore: number;
  readonly ingots: number;
  readonly sellOre: StationButton | null;
  readonly sellIngots: StationButton | null;
};

/** 합금 한 줄. 제작 재료라 팔지 않는다. */
export type AlloyRow = {
  readonly name: string;
  readonly color: number;
  readonly count: number;
};

/** HUD 가 그릴 거점 화면의 내용. */
export type StationView = {
  readonly isDocked: boolean;
  /** 도킹 안내를 띄울지 — 범위 안이지만 아직 도킹하지 않은 상태 */
  readonly isDockPromptVisible: boolean;
  readonly distance: number;
  readonly credits: number;
  readonly stock: ReadonlyArray<StockRow>;
  readonly alloys: ReadonlyArray<AlloyRow>;
  /** 저장고와 무관한 공용 작업 */
  readonly operations: ReadonlyArray<StationButton>;
  /** 장비 관련 작업 */
  readonly equipment: ReadonlyArray<StationButton>;
  readonly laserLabel: string;
  readonly tractorLabel: string;
  readonly message: string;
};

/**
 * 거점 콘솔.
 *
 * 도킹하면 비행이 멈추고 마우스 커서가 돌아온다. 그래서 조종과 클릭이 부딪히지
 * 않고, 화면에서 직접 눌러 처리할 수 있다.
 */
export class StationConsole {
  private docked: boolean = false;
  private lastMessage: string = "";

  /** 도킹 중인지 여부. */
  public get isDocked(): boolean {
    return this.docked;
  }

  /**
   * 한 프레임분의 도킹 상태를 갱신한다.
   *
   * @returns HUD 가 그릴 거점 화면 내용
   */
  public update(
    input: FlightInputState,
    shipPosition: THREE.Vector3,
    station: Station,
    cargo: Cargo,
    stock: StationStock,
    equipment: ShipEquipment,
  ): StationView {
    const distance: number = station.distanceTo(shipPosition);
    const isInRange: boolean = station.isWithinDockRange(shipPosition);

    if (this.docked && !isInRange) {
      // 도킹 중에는 멈춰 있으므로 보통은 벗어나지 않는다. 예외 상황의 방어다.
      this.setDocked(false);
    }

    if (input.pressedOnce.has("KeyE") && isInRange) {
      this.setDocked(!this.docked);
    }

    return {
      isDocked: this.docked,
      isDockPromptVisible: !this.docked && isInRange,
      distance,
      credits: stock.credits,
      stock: describeStock(stock),
      alloys: describeAlloys(stock),
      operations: describeOperations(cargo, stock),
      equipment: describeEquipment(stock, equipment),
      laserLabel: `채굴 레이저 T${equipment.laserTier} +${equipment.laserUpgrade}`,
      tractorLabel: `견인빔 T${equipment.tractorTier} · 동시 ${equipment.tractorCapacity}`,
      message: this.lastMessage,
    };
  }

  /** 도킹 여부를 직접 정한다. 화면의 도킹 해제 버튼이 쓴다. */
  public setDocked(value: boolean): void {
    this.docked = value;
    this.lastMessage = "";
  }

  /**
   * 화면에서 누른 것을 실행한다.
   *
   * 어떤 결과가 나왔는지는 화면 아래 한 줄로 알린다. 눌렀는데 아무 반응이
   * 없으면 고장으로 보인다.
   */
  public execute(
    action: StationAction,
    cargo: Cargo,
    stock: StationStock,
    equipment: ShipEquipment,
  ): void {
    switch (action.kind) {
      case "UNLOAD": {
        const moved: number = stock.unload(cargo);
        this.lastMessage = moved > 0 ? `${moved} 하역` : "화물칸이 비어 있다";
        break;
      }
      case "SMELT_ALL": {
        const produced: number = stock.smeltAll();
        this.lastMessage =
          produced > 0 ? `주괴 ${produced} 제련` : "제련할 광석이 모자라다";
        break;
      }
      case "ALLOY_ALL": {
        const produced: number = stock.alloyAll();
        this.lastMessage =
          produced > 0 ? `합금 ${produced} 생산` : "짝인 주괴가 모자라다";
        break;
      }
      case "SELL_ORE": {
        const earned: number = stock.sellOreOf(action.mineral);
        const name: string = MINERAL_DEFINITIONS[action.mineral].displayName;
        this.lastMessage = `${name} 광석 판매 ${earned} 크레딧`;
        break;
      }
      case "SELL_INGOTS": {
        const earned: number = stock.sellIngots(action.mineral);
        const name: string = MINERAL_DEFINITIONS[action.mineral].displayName;
        this.lastMessage = `${name} 주괴 판매 ${earned} 크레딧`;
        break;
      }
      case "UPGRADE_LASER": {
        const result: StationActionResult = stock.upgradeLaser(equipment);
        this.lastMessage = result.message;
        break;
      }
      case "CRAFT_LASER": {
        const result: StationActionResult = stock.craftNextLaser(equipment);
        this.lastMessage = result.message;
        break;
      }
      case "CRAFT_TRACTOR": {
        const result: StationActionResult = stock.upgradeTractor(equipment);
        this.lastMessage = result.message;
        break;
      }
      case "UNDOCK": {
        this.setDocked(false);
        break;
      }
    }
  }
}

/** 저장고 현황. 보유량이 0인 광물은 감춘다. */
function describeStock(stock: StationStock): StockRow[] {
  const rows: StockRow[] = [];

  for (const mineral of MINERAL_ORDER) {
    const ore: number = stock.oreOf(mineral);
    const ingots: number = stock.ingotsOf(mineral);
    if (ore === 0 && ingots === 0) {
      continue;
    }

    const definition = MINERAL_DEFINITIONS[mineral];
    rows.push({
      name: definition.displayName,
      color: definition.color,
      ore,
      ingots,
      sellOre:
        ore > 0
          ? {
              label: "광석 팔기",
              detail: `${ore * SELL_PRICE.Ore} 크레딧`,
              action: { kind: "SELL_ORE", mineral },
              isAvailable: true,
            }
          : null,
      sellIngots:
        ingots > 0
          ? {
              label: "주괴 팔기",
              detail: `${ingots * SELL_PRICE.Ingot} 크레딧`,
              action: { kind: "SELL_INGOTS", mineral },
              isAvailable: true,
            }
          : null,
    });
  }

  return rows;
}

/** 보유한 합금 목록. */
function describeAlloys(stock: StationStock): AlloyRow[] {
  const rows: AlloyRow[] = [];

  for (const alloy of ALLOY_ORDER) {
    const count: number = stock.alloysOf(alloy);
    if (count === 0) {
      continue;
    }
    const definition = ALLOY_DEFINITIONS[alloy as AlloyId];
    rows.push({ name: definition.displayName, color: definition.color, count });
  }

  return rows;
}

/** 하역·제련·합금처럼 저장고 전체를 다루는 작업. */
function describeOperations(cargo: Cargo, stock: StationStock): StationButton[] {
  return [
    {
      label: "하역",
      detail: `화물 ${Math.floor(cargo.total)}`,
      action: { kind: "UNLOAD" },
      isAvailable: cargo.total > 0,
    },
    {
      label: "제련",
      detail: `광석 ${SMELTING.OrePerIngot} → 주괴 1`,
      action: { kind: "SMELT_ALL" },
      isAvailable: stock.totalOre >= SMELTING.OrePerIngot,
    },
    {
      label: "합금",
      detail: `주괴 ${SMELTING.PrimaryIngotPerAlloy} + 짝 ${SMELTING.PairIngotPerAlloy}`,
      action: { kind: "ALLOY_ALL" },
      isAvailable: stock.totalIngots > 0,
    },
  ];
}

/** 장비 강화와 제작. */
function describeEquipment(
  stock: StationStock,
  equipment: ShipEquipment,
): StationButton[] {
  const isMaxUpgrade: boolean = equipment.laserUpgrade >= MAX_UPGRADE_LEVEL;
  const upgradeCost: UpgradeCost = upgradeCostFor(
    equipment.laserTier,
    Math.min(equipment.laserUpgrade + 1, MAX_UPGRADE_LEVEL),
  );

  const nextLaserTier: number = equipment.laserTier + 1;
  const laserCost: CraftCost | null = craftCostFor(nextLaserTier);
  const nextTractorTier: number = equipment.tractorTier + 1;
  const tractorCost: CraftCost | null = craftCostFor(nextTractorTier);

  /** 제작 비용을 한 줄로 적는다. 보유량을 함께 보여줘야 왜 안 되는지 안다. */
  function craftDetail(cost: CraftCost | null): string {
    return cost === null
      ? "더 높은 티어가 없다"
      : `${materialName(cost.material)} ${cost.amount} (보유 ${stock.materialCount(cost.material)})`;
  }

  function canCraft(cost: CraftCost | null): boolean {
    return cost !== null && stock.materialCount(cost.material) >= cost.amount;
  }

  return [
    {
      label: isMaxUpgrade ? "강화 최대" : `강화 ${equipment.laserUpgrade + 1}`,
      detail: isMaxUpgrade
        ? "다음 티어를 제작해야 한다"
        : `${materialName(upgradeCost.material)} ${upgradeCost.amount} (보유 ${stock.materialCount(upgradeCost.material)}) + ${upgradeCost.credits} 크레딧`,
      action: { kind: "UPGRADE_LASER" },
      isAvailable:
        !isMaxUpgrade &&
        stock.materialCount(upgradeCost.material) >= upgradeCost.amount &&
        stock.credits >= upgradeCost.credits,
    },
    {
      label:
        nextLaserTier > MAX_LASER_TIER ? "레이저 최대 티어" : `레이저 T${nextLaserTier}`,
      detail: craftDetail(laserCost),
      action: { kind: "CRAFT_LASER" },
      isAvailable: canCraft(laserCost),
    },
    {
      label:
        nextTractorTier > MAX_LASER_TIER
          ? "견인빔 최대 티어"
          : `견인빔 T${nextTractorTier}`,
      detail: craftDetail(tractorCost),
      action: { kind: "CRAFT_TRACTOR" },
      isAvailable: canCraft(tractorCost),
    },
  ];
}

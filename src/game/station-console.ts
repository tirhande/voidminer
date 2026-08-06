import type * as THREE from "three";

import { SMELTING } from "../constants";
import type { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, type ShipEquipment } from "./equipment";
import type { FlightInputState } from "./flight-input";
import {
  ALLOY_DEFINITIONS,
  ALLOY_ORDER,
  MINERAL_DEFINITIONS,
  MINERAL_ORDER,
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

/** 거점 메뉴 한 줄. */
export type StationLine = {
  readonly label: string;
  readonly value: string;
};

/** 거점 메뉴에 표시할 행동 하나. */
export type StationAction = {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly isAvailable: boolean;
};

/** HUD 가 그릴 거점 화면의 내용. */
export type StationView = {
  readonly isDocked: boolean;
  /** 도킹 안내를 띄울지 — 범위 안이지만 아직 도킹하지 않은 상태 */
  readonly isDockPromptVisible: boolean;
  readonly distance: number;
  readonly stock: ReadonlyArray<StationLine>;
  readonly actions: ReadonlyArray<StationAction>;
  readonly message: string;
};

/**
 * 거점 콘솔.
 *
 * 도킹 상태와 거점에서의 조작을 담당한다. 조작은 전부 단발 키로 처리한다 —
 * 포인터 락이 걸린 채로 마우스 UI 를 쓰면 조종과 클릭이 계속 충돌한다.
 */
export class StationConsole {
  private docked: boolean = false;
  private lastMessage: string = "";

  /** 도킹 중인지 여부. */
  public get isDocked(): boolean {
    return this.docked;
  }

  /**
   * 한 프레임분의 거점 조작을 처리한다.
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
      // 범위를 벗어나면 자동으로 도킹이 풀린다. 별도 조작을 요구하지 않는다.
      this.docked = false;
      this.lastMessage = "";
    }

    if (input.pressedOnce.has("KeyE") && isInRange) {
      this.docked = !this.docked;
      this.lastMessage = "";
    }

    if (this.docked) {
      this.handleActions(input, cargo, stock, equipment);
    }

    return {
      isDocked: this.docked,
      isDockPromptVisible: !this.docked && isInRange,
      distance,
      stock: describeStock(stock),
      actions: describeActions(cargo, stock, equipment),
      message: this.lastMessage,
    };
  }

  private handleActions(
    input: FlightInputState,
    cargo: Cargo,
    stock: StationStock,
    equipment: ShipEquipment,
  ): void {
    if (input.pressedOnce.has("Digit1")) {
      const moved: number = stock.unload(cargo);
      this.lastMessage = moved > 0 ? `${moved} 하역` : "화물칸이 비어 있다";
    }

    if (input.pressedOnce.has("Digit2")) {
      const produced: number = stock.smeltAll();
      this.lastMessage =
        produced > 0 ? `주괴 ${produced} 제련` : "제련할 광석이 모자라다";
    }

    if (input.pressedOnce.has("Digit3")) {
      const produced: number = stock.alloyAll();
      this.lastMessage =
        produced > 0 ? `합금 ${produced} 생산` : "짝인 주괴가 모자라다";
    }

    if (input.pressedOnce.has("Digit4")) {
      const earned: number = stock.sellOre() + stock.sellSpareIngots(equipment);
      this.lastMessage = earned > 0 ? `판매 ${earned} 크레딧` : "팔 것이 없다";
    }

    if (input.pressedOnce.has("Digit5")) {
      const result: StationActionResult = stock.upgradeLaser(equipment);
      this.lastMessage = result.message;
    }

    if (input.pressedOnce.has("Digit6")) {
      const result: StationActionResult = stock.craftNextLaser(equipment);
      this.lastMessage = result.message;
    }

    if (input.pressedOnce.has("Digit7")) {
      const result: StationActionResult = stock.upgradeTractor(equipment);
      this.lastMessage = result.message;
    }
  }
}

/** 저장고 현황을 줄 단위로 만든다. 보유량이 0인 항목은 감춘다. */
function describeStock(stock: StationStock): StationLine[] {
  const lines: StationLine[] = [];

  for (const mineral of MINERAL_ORDER) {
    const ore: number = stock.oreOf(mineral);
    const ingots: number = stock.ingotsOf(mineral);
    if (ore === 0 && ingots === 0) {
      continue;
    }
    lines.push({
      label: MINERAL_DEFINITIONS[mineral].displayName,
      value: `광석 ${ore} / 주괴 ${ingots}`,
    });
  }

  for (const alloy of ALLOY_ORDER) {
    const count: number = stock.alloysOf(alloy);
    if (count === 0) {
      continue;
    }
    lines.push({ label: ALLOY_DEFINITIONS[alloy].displayName, value: `${count}` });
  }

  lines.push({ label: "크레딧", value: `${stock.credits}` });
  return lines;
}

/** 거점에서 할 수 있는 일과 각각의 비용을 만든다. */
function describeActions(
  cargo: Cargo,
  stock: StationStock,
  equipment: ShipEquipment,
): StationAction[] {
  const isMaxUpgrade: boolean = equipment.laserUpgrade >= MAX_UPGRADE_LEVEL;
  const upgradeCost: UpgradeCost = upgradeCostFor(
    equipment.laserTier,
    Math.min(equipment.laserUpgrade + 1, MAX_UPGRADE_LEVEL),
  );

  const nextLaserTier: number = equipment.laserTier + 1;
  const laserCost: CraftCost | null = craftCostFor(nextLaserTier);
  const nextTractorTier: number = equipment.tractorTier + 1;
  const tractorCost: CraftCost | null = craftCostFor(nextTractorTier);

  /** 제작 비용 한 줄을 만든다. */
  function craftDetail(cost: CraftCost | null): string {
    return cost === null
      ? "더 높은 티어가 없다"
      : `${materialName(cost.material)} ${cost.amount} (보유 ${stock.materialCount(cost.material)})`;
  }

  /** 재료가 충분한지 본다. */
  function canCraft(cost: CraftCost | null): boolean {
    return cost !== null && stock.materialCount(cost.material) >= cost.amount;
  }

  return [
    {
      key: "1",
      label: "하역",
      detail: `화물 ${Math.floor(cargo.total)}`,
      isAvailable: cargo.total > 0,
    },
    {
      key: "2",
      label: "제련",
      detail: `광석 ${stock.totalOre} · ${SMELTING.OrePerIngot}대1`,
      isAvailable: stock.totalOre >= SMELTING.OrePerIngot,
    },
    {
      key: "3",
      label: "합금",
      detail: `주괴 ${stock.totalIngots} · 주 ${SMELTING.PrimaryIngotPerAlloy} + 짝 ${SMELTING.PairIngotPerAlloy}`,
      isAvailable: stock.totalIngots > 0,
    },
    {
      key: "4",
      label: "판매",
      detail: "광석과 안 쓰는 주괴",
      isAvailable: stock.totalOre > 0 || stock.totalIngots > 0,
    },
    {
      key: "5",
      label: isMaxUpgrade ? "강화 (최대)" : `강화 ${equipment.laserUpgrade + 1}`,
      detail: isMaxUpgrade
        ? "다음 티어를 제작해야 한다"
        : `${materialName(upgradeCost.material)} ${upgradeCost.amount} + ${upgradeCost.credits} 크레딧`,
      isAvailable:
        !isMaxUpgrade &&
        stock.materialCount(upgradeCost.material) >= upgradeCost.amount &&
        stock.credits >= upgradeCost.credits,
    },
    {
      key: "6",
      label:
        nextLaserTier > MAX_LASER_TIER
          ? "레이저 (최대 티어)"
          : `레이저 T${nextLaserTier} 제작`,
      detail: craftDetail(laserCost),
      isAvailable: canCraft(laserCost),
    },
    {
      key: "7",
      label:
        nextTractorTier > MAX_LASER_TIER
          ? "견인빔 (최대 티어)"
          : `견인빔 T${nextTractorTier} 제작`,
      detail: craftDetail(tractorCost),
      isAvailable: canCraft(tractorCost),
    },
  ];
}

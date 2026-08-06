import type * as THREE from "three";

import { TRACTOR_BEAM } from "../constants";
import type { Cargo } from "./cargo";
import { MAX_UPGRADE_LEVEL, type ShipEquipment } from "./equipment";
import type { FlightInputState } from "./flight-input";
import { MINERAL_DEFINITIONS, RESOURCE, type MineralId } from "./minerals";
import type { Station } from "./station";
import {
  MAX_LASER_TIER,
  craftCostFor,
  mineralForTier,
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
  /** 도킹 중인지 */
  readonly isDocked: boolean;
  /** 도킹 안내를 띄울지 — 범위 안이지만 아직 도킹하지 않은 상태 */
  readonly isDockPromptVisible: boolean;
  /** 거점까지의 거리 (m) */
  readonly distance: number;
  readonly stock: ReadonlyArray<StationLine>;
  readonly actions: ReadonlyArray<StationAction>;
  /** 마지막 작업 결과 */
  readonly message: string;
};

/** 광물 목록. 표시 순서를 고정하기 위해 배열로 둔다. */
const MINERAL_ORDER: ReadonlyArray<MineralId> = [
  RESOURCE.Copper,
  RESOURCE.Iron,
  RESOURCE.Titanium,
];

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
      stock: this.describeStock(stock),
      actions: this.describeActions(cargo, stock, equipment),
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
      this.lastMessage = produced > 0 ? `주괴 ${produced} 제련` : "제련할 광석이 모자라다";
    }

    if (input.pressedOnce.has("Digit3")) {
      const earned: number = stock.sellGems();
      this.lastMessage = earned > 0 ? `보석 판매 ${earned} 크레딧` : "팔 보석이 없다";
    }

    if (input.pressedOnce.has("Digit4")) {
      const earned: number = stock.sellOre();
      this.lastMessage = earned > 0 ? `광석 판매 ${earned} 크레딧` : "팔 광석이 없다";
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

  private describeStock(stock: StationStock): StationLine[] {
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

    lines.push({ label: "보석", value: `${stock.gems}` });
    lines.push({ label: "크레딧", value: `${stock.credits}` });

    return lines;
  }

  private describeActions(
    cargo: Cargo,
    stock: StationStock,
    equipment: ShipEquipment,
  ): StationAction[] {
    const isMaxUpgrade: boolean = equipment.laserUpgrade >= MAX_UPGRADE_LEVEL;
    const upgradeCost: UpgradeCost = upgradeCostFor(
      equipment.laserTier,
      Math.min(equipment.laserUpgrade + 1, MAX_UPGRADE_LEVEL),
    );
    const upgradeMineralName: string = MINERAL_DEFINITIONS[upgradeCost.mineral].displayName;

    const nextTractorTier: number = equipment.tractorTier + 1;
    const tractorCost: CraftCost | null = craftCostFor(nextTractorTier);

    const nextTier: number = equipment.laserTier + 1;
    const craftCost: CraftCost | null = craftCostFor(nextTier);
    const craftDetail: string =
      craftCost === null || nextTier > MAX_LASER_TIER
        ? "더 높은 티어가 없다"
        : craftCost.ingots
            .map(
              (entry) =>
                `${MINERAL_DEFINITIONS[entry.mineral].displayName} 주괴 ${entry.amount}`,
            )
            .join(" + ");

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
        detail: `광석 ${stock.totalOre}`,
        isAvailable: stock.totalOre > 0,
      },
      {
        key: "3",
        label: "보석 판매",
        detail: `${stock.gems}개`,
        isAvailable: stock.gems > 0,
      },
      {
        key: "4",
        label: "광석 판매",
        detail: `${stock.totalOre}단위`,
        isAvailable: stock.totalOre > 0,
      },
      {
        key: "5",
        label: isMaxUpgrade ? "강화 (최대)" : `강화 ${equipment.laserUpgrade + 1}`,
        detail: isMaxUpgrade
          ? "다음 티어를 제작해야 한다"
          : `${upgradeMineralName} 주괴 ${upgradeCost.ingots} + 보석 ${upgradeCost.gems} + ${upgradeCost.credits} 크레딧`,
        isAvailable:
          !isMaxUpgrade &&
          stock.ingotsOf(upgradeCost.mineral) >= upgradeCost.ingots &&
          stock.gems >= upgradeCost.gems &&
          stock.credits >= upgradeCost.credits,
      },
      {
        key: "6",
        label: nextTier > MAX_LASER_TIER ? "제작 (최대 티어)" : `레이저 T${nextTier} 제작`,
        detail: craftDetail,
        isAvailable:
          craftCost !== null &&
          craftCost.ingots.every(
            (entry) => stock.ingotsOf(entry.mineral) >= entry.amount,
          ),
      },
      {
        key: "7",
        label:
          nextTractorTier > MAX_LASER_TIER
            ? "견인빔 (최대 티어)"
            : `견인빔 T${nextTractorTier} 제작`,
        detail:
          tractorCost === null
            ? "더 높은 티어가 없다"
            : `${tractorCost.ingots
                .map(
                  (entry) =>
                    `${MINERAL_DEFINITIONS[entry.mineral].displayName} 주괴 ${entry.amount}`,
                )
                .join(" + ")} · 동시 ${equipment.tractorCapacity} → ${equipment.tractorCapacity + TRACTOR_BEAM.CapacityPerTier}`,
        isAvailable:
          tractorCost !== null &&
          tractorCost.ingots.every(
            (entry) => stock.ingotsOf(entry.mineral) >= entry.amount,
          ),
      },
    ];
  }
}

/** 현재 레이저 티어에 대응하는 광물 이름. HUD 표시에 쓴다. */
export function currentTierMineralName(equipment: ShipEquipment): string {
  return MINERAL_DEFINITIONS[mineralForTier(equipment.laserTier)].displayName;
}

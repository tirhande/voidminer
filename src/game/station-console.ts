import type * as THREE from "three";

import { SELL_PRICE, SMELTING } from "../constants";
import type { Cargo } from "./cargo";
import { KEY_BINDING } from "./controls";
import {
  MAX_UPGRADE_LEVEL,
  laserYieldOf,
  tractorCapacityOf,
  type ShipEquipment,
} from "./equipment";
import type { FlightInputState } from "./flight-input";
import {
  ALLOY_DEFINITIONS,
  ALLOY_ORDER,
  MINERAL_DEFINITIONS,
  MINERAL_ORDER,
  type AlloyId,
  type MineralId,
} from "./minerals";
import { PALETTE } from "../palette";
import type { Station } from "./station";
import {
  STAR_SYSTEM_DEFINITIONS,
  STAR_SYSTEM_ORDER,
  STARTING_SYSTEM,
  WARP_UNLOCK_TIER,
  hasMinableMineral,
  isWarpUnlocked,
  type StarSystemId,
} from "./star-systems";
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
  | { readonly kind: "SELL_ORE"; readonly mineral: MineralId; readonly amount: number }
  | { readonly kind: "SELL_INGOTS"; readonly mineral: MineralId; readonly amount: number }
  | { readonly kind: "SMELT"; readonly mineral: MineralId; readonly amount: number }
  | { readonly kind: "ALLOY"; readonly alloy: AlloyId; readonly amount: number }
  | { readonly kind: "UPGRADE_LASER" }
  | { readonly kind: "CRAFT_LASER" }
  | { readonly kind: "CRAFT_TRACTOR" }
  | { readonly kind: "WARP"; readonly system: StarSystemId }
  | { readonly kind: "UNDOCK" };

/** 화면에 그릴 버튼 하나. */
export type StationButton = {
  readonly label: string;
  /**
   * 늘 보이는 한 줄.
   *
   * 누를지 말지 정하는 데 필요한 것만 담는다. 재료가 없으면 못 누르므로
   * 비용은 여기 있어야 한다.
   */
  readonly detail: string;
  /**
   * 마우스를 올렸을 때만 보이는 한 줄. 없으면 빈 문자열이다.
   *
   * 얼마나 좋아지는지는 궁금할 때만 본다. 한 번 알면 다시 안 보는 것이라
   * 늘 띄워두면 읽히지도 않으면서 줄만 길어진다.
   */
  readonly hint: string;
  readonly action: StationAction;
  readonly isAvailable: boolean;
};

/** 격자 칸의 종류. */
export const STATION_CELL = {
  Ore: "ORE",
  Ingot: "INGOT",
  Alloy: "ALLOY",
  Equipment: "EQUIPMENT",
} as const;

export type StationCellKind = (typeof STATION_CELL)[keyof typeof STATION_CELL];

/**
 * 격자 칸 하나.
 *
 * 칸을 누르면 아래 한 줄에 상세와 할 수 있는 일이 모인다 (GDD 09). 상세를 따로
 * 띄우지 않는 이유는 창이 하나 더 생기면 그것이 곧 패널이기 때문이다.
 */
export type StationCell = {
  readonly key: string;
  readonly name: string;
  /**
   * 칸 안에 넣을 표기.
   *
   * 광물은 종류가 스물이라 정사각 칸에 늘어놓고 첫 글자만 넣는다. 아이콘 38 종이
   * 나오면 그림으로 바꾼다 (GDD 09).
   *
   * 장비는 둘뿐이라 줄일 이유가 없다. 이름을 그대로 적는다. 한 글자로 줄이면
   * 무엇인지 알아볼 수 없다.
   */
  readonly short: string;
  /**
   * 아이콘을 찾을 열쇠.
   *
   * 칸 열쇠와 같은 값이다. 같은 광물이라도 캐낸 것과 녹인 것이 다르게 생겼으
   * 므로 광석과 주괴가 아이콘을 나눠 갖는다.
   *
   * 아이콘이 없는 칸은 빈 문자열이라 첫 글자로 대신한다.
   */
  readonly iconKey: string;
  readonly color: number;
  /** 칸 구석에 적는 수량이나 등급 */
  readonly badge: string;
  readonly kind: StationCellKind;
  /** 보유량이 0 인지. 자리는 지키되 흐리게 둔다 */
  readonly isEmpty: boolean;
  /**
   * 수량을 고를 수 있는 칸인지.
   *
   * 장비는 한 번에 한 단계씩만 올라간다. 수량을 물으면 무엇에 대한 숫자인지
   * 알 수 없다.
   */
  readonly usesQuantity: boolean;
  /** 아래 상세 줄에 적을 설명 */
  readonly detail: string;
  /** 이 칸을 골랐을 때 할 수 있는 일 */
  readonly actions: ReadonlyArray<StationButton>;
};

/**
 * 항성계 한 줄.
 *
 * 이동에는 비용이 없다. 진행 잠금은 채집 장비 하나뿐이므로 (GDD 05) 어디든
 * 바로 갈 수 있다. 대신 지금 장비로 캘 것이 있는지는 가기 전에 보여준다.
 * 적어두면 헛걸음이 선택이 되고, 안 적어두면 헛걸음이 함정이 된다.
 */
export type SystemRow = {
  readonly name: string;
  readonly summary: string;
  /** 그 항성계에서 나오는 광물 이름 */
  readonly minerals: ReadonlyArray<string>;
  /** 지금 있는 곳인지 */
  readonly isCurrent: boolean;
  /**
   * 갈 수 있는 상태인지.
   *
   * 처음부터 어디든 갈 수 있으면 시작 항성계에서 배울 것을 안 배운 채 나간다.
   * 감추지는 않는다 — 갈 곳이 있다는 것과 무엇이 필요한지는 보여야 한다.
   */
  readonly isUnlocked: boolean;
  /**
   * 갈 수 없을 때 무엇이 필요한지. 갈 수 있으면 빈 문자열이다.
   *
   * 줄마다 적는다. 목록 위에 한 번만 적어두면 흐린 줄을 눌러보고 나서야
   * 위쪽을 읽게 된다. 막힌 것을 누른 자리에 이유가 있어야 한다.
   */
  readonly lockReason: string;
  /** 지금 장비로 캘 것이 있는지 */
  readonly hasMinable: boolean;
  readonly action: StationAction;
};

/** HUD 가 그릴 거점 화면의 내용. */
export type StationView = {
  readonly isDocked: boolean;
  /** 도킹 안내를 띄울지 — 범위 안이지만 아직 도킹하지 않은 상태 */
  readonly isDockPromptVisible: boolean;
  readonly distance: number;
  readonly credits: number;
  /** 화물 열의 격자. 광석·주괴·합금이 한데 놓인다 */
  readonly storage: ReadonlyArray<StationCell>;
  /** 지금 고른 수량. 무한대는 전부다 */
  readonly quantity: number;
  /** 장착 열의 격자 */
  readonly equipment: ReadonlyArray<StationCell>;
  /** 저장고 전체를 다루는 작업. 고른 칸과 무관하므로 늘 보인다 */
  readonly operations: ReadonlyArray<StationButton>;
  /** 갈 수 있는 항성계 목록 */
  readonly systems: ReadonlyArray<SystemRow>;
  readonly systemLabel: string;
  /** 항성계를 옮길 수 없을 때 그 이유. 갈 수 있으면 빈 문자열이다 */
  readonly warpNote: string;
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
  private system: StarSystemId = STARTING_SYSTEM;
  /**
   * 눌러둔 워프 목적지.
   *
   * 콘솔은 필드도 연출도 들고 있지 않으므로 직접 옮기지 못한다. 누른 것만
   * 남겨두고 실제 이동은 바깥에서 가져가 처리한다.
   */
  private pendingWarp: StarSystemId | null = null;
  /**
   * 고른 수량. 한 번 고르면 유지된다.
   *
   * 기본은 전부다. 대개는 다 처리해도 되므로, 조절이 필요한 사람만 바꾸면
   * 된다.
   */
  private quantity: number = Number.POSITIVE_INFINITY;

  /** 도킹 중인지 여부. */
  public get isDocked(): boolean {
    return this.docked;
  }

  /** 지금 있는 항성계. */
  public get currentSystem(): StarSystemId {
    return this.system;
  }

  /** 도착한 항성계를 알린다. */
  public arriveAt(system: StarSystemId): void {
    this.system = system;
    this.lastMessage = `${STAR_SYSTEM_DEFINITIONS[system].displayName} 도착`;
  }

  /** 지금 고른 수량. */
  public get selectedQuantity(): number {
    return this.quantity;
  }

  /** 다룰 수량을 정한다. */
  public setQuantity(value: number): void {
    this.quantity = value;
  }

  /** 눌러둔 워프 목적지를 가져가고 비운다. */
  public takePendingWarp(): StarSystemId | null {
    const target: StarSystemId | null = this.pendingWarp;
    this.pendingWarp = null;
    return target;
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

    if (input.pressedOnce.has(KEY_BINDING.Dock) && isInRange) {
      this.setDocked(!this.docked);
    }

    return {
      isDocked: this.docked,
      isDockPromptVisible: !this.docked && isInRange,
      distance,
      credits: stock.credits,
      storage: describeStorage(stock, equipment, this.quantity),
      quantity: this.quantity,
      equipment: describeEquipment(stock, equipment),
      operations: describeOperations(cargo, stock),
      systems: describeSystems(this.system, equipment),
      systemLabel: STAR_SYSTEM_DEFINITIONS[this.system].displayName,
      warpNote: isWarpUnlocked(equipment.laserTier)
        ? ""
        : `채굴 레이저 T${WARP_UNLOCK_TIER} 를 만들면 다른 항성계로 갈 수 있다`,
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
        const earned: number = stock.sellOreOf(action.mineral, action.amount);
        const name: string = MINERAL_DEFINITIONS[action.mineral].displayName;
        this.lastMessage =
          earned > 0 ? `${name} 광석 판매 ${earned} 크레딧` : "팔 광석이 없다";
        break;
      }
      case "SELL_INGOTS": {
        const earned: number = stock.sellIngots(action.mineral, action.amount);
        const name: string = MINERAL_DEFINITIONS[action.mineral].displayName;
        this.lastMessage =
          earned > 0 ? `${name} 주괴 판매 ${earned} 크레딧` : "팔 주괴가 없다";
        break;
      }
      case "SMELT": {
        const made: number = stock.smelt(action.mineral, action.amount);
        const name: string = MINERAL_DEFINITIONS[action.mineral].displayName;
        this.lastMessage =
          made > 0
            ? `${name} 주괴 ${made} 제련`
            : `${name} 광석이 ${SMELTING.OrePerIngot} 개는 있어야 한다`;
        break;
      }
      case "ALLOY": {
        const made: number = stock.alloy(action.alloy, action.amount);
        const name: string = ALLOY_DEFINITIONS[action.alloy].displayName;
        this.lastMessage = made > 0 ? `${name} ${made} 생산` : "짝인 주괴가 모자라다";
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
      case "WARP": {
        if (!isWarpUnlocked(equipment.laserTier)) {
          this.lastMessage = `채굴 레이저 T${WARP_UNLOCK_TIER} 를 만들어야 항성계를 옮길 수 있다`;
          break;
        }
        if (action.system === this.system) {
          this.lastMessage = "이미 그 항성계에 있다";
          break;
        }
        this.pendingWarp = action.system;
        this.lastMessage = `${STAR_SYSTEM_DEFINITIONS[action.system].displayName} 으로 워프`;
        break;
      }
      case "UNDOCK": {
        this.setDocked(false);
        break;
      }
    }
  }
}

/**
 * 채굴 레이저 칸의 설명.
 *
 * 다음 등급이 얼마나 되는지를 여기 적는다. 올려볼 때만 보이는 자리에 두면
 * 정작 궁금한 값이 숨는다. 이 자리는 칸을 눌러야 나오므로 이미 관심을 보인
 * 뒤이고, 숨지 않는다.
 */
function describeLaserCell(
  equipment: ShipEquipment,
  isMaxUpgrade: boolean,
  nextTier: number,
): string {
  const now: string = `T${equipment.laserTier} 강화 ${equipment.laserUpgrade} · 채굴 ${equipment.laserYieldPerSecond.toFixed(1)}`;
  const next: string[] = [];

  if (!isMaxUpgrade) {
    next.push(
      `강화 ${equipment.laserUpgrade + 1} 은 ${laserYieldOf(equipment.laserTier, equipment.laserUpgrade + 1).toFixed(1)}`,
    );
  }
  if (nextTier <= MAX_LASER_TIER) {
    next.push(`T${nextTier} 는 ${laserYieldOf(nextTier, 0).toFixed(1)}`);
  }

  return next.length > 0 ? `${now}. ${next.join(", ")}` : now;
}

/** 견인빔 칸의 설명. 다음 등급이 몇 개를 끄는지 함께 적는다. */
function describeTractorCell(capacity: number, nextTier: number): string {
  const now: string = `동시에 ${capacity} 개를 끈다. 캐는 속도가 아니라 회수량을 정한다`;
  return nextTier <= MAX_LASER_TIER
    ? `${now}. T${nextTier} 는 ${tractorCapacityOf(nextTier)} 개`
    : now;
}

/**
 * 그 강화 단계에서 열리는 짝 광물.
 *
 * 강화는 곁가지가 아니라 다음 재료를 여는 열쇠다. 몇 단계에서 무엇이 열리는지
 * 모르면 강화를 건너뛰고 티어만 올리려 든다.
 */
function pairUnlockedAt(tier: number, upgrade: number): string {
  const names: string[] = MINERAL_ORDER.filter(
    (mineral) =>
      MINERAL_DEFINITIONS[mineral].requiredLaserTier === tier &&
      MINERAL_DEFINITIONS[mineral].requiredLaserUpgrade === upgrade,
  ).map((mineral) => MINERAL_DEFINITIONS[mineral].displayName);

  return names.length > 0 ? ` · ${names.join(" · ")} 해금` : "";
}

/**
 * 한 번에 다룰 수 있는 수량.
 *
 * 전부만 있으면 조절할 방법이 없다. 크레딧이 조금 모자랄 때 구리를 좀 팔고
 * 싶어도 팔면 전부 나가서, 다음 티어에 쓸 것까지 날아간다.
 *
 * 무한대는 "가진 만큼 전부"를 뜻한다.
 */
export const QUANTITY_CHOICES: ReadonlyArray<number> = [
  1,
  10,
  100,
  Number.POSITIVE_INFINITY,
];

/** 수량을 화면에 적는다. */
export function quantityLabel(quantity: number): string {
  return Number.isFinite(quantity) ? `${quantity}` : "전부";
}

/**
 * 그 광물을 지금 장비로 캘 수 있는지 한 줄로 적는다.
 *
 * 빈 칸에 무엇이 필요한지가 적혀 있어야 격자가 목록 노릇을 한다. 없는 것을
 * 비워만 두면 왜 없는지 알 길이 없다.
 */
function describeRequirement(mineral: MineralId, equipment: ShipEquipment): string {
  const definition = MINERAL_DEFINITIONS[mineral];
  const isUnlocked: boolean =
    equipment.laserTier > definition.requiredLaserTier ||
    (equipment.laserTier === definition.requiredLaserTier &&
      equipment.laserUpgrade >= definition.requiredLaserUpgrade);

  if (isUnlocked) {
    return "캘 수 있다. 이 광물이 나오는 항성계로 가면 된다";
  }
  return definition.requiredLaserUpgrade > 0
    ? `레이저 T${definition.requiredLaserTier} 강화 ${definition.requiredLaserUpgrade} 이상이 필요하다`
    : `레이저 T${definition.requiredLaserTier} 이상이 필요하다`;
}

/**
 * 화물 열의 격자.
 *
 * 광석·주괴·합금을 한 격자에 늘어놓는다. 종류마다 열을 따로 두면 결국 오가야
 * 하고, 그것이 GDD 09 가 거부한 구조다.
 *
 * 칸은 항상 스물이고 자리가 바뀌지 않는다. 없는 것을 감추면 남은 칸이 앞으로
 * 밀려 같은 광물이 매번 다른 자리에 놓인다. 그러면 격자가 아니라 목록이다.
 * 빈 칸도 자리를 지켜야 눈이 위치를 외운다.
 */
function describeStorage(
  stock: StationStock,
  equipment: ShipEquipment,
  quantity: number,
): StationCell[] {
  const cells: StationCell[] = [];

  for (const mineral of MINERAL_ORDER) {
    const definition = MINERAL_DEFINITIONS[mineral];
    const ore: number = stock.oreOf(mineral);
    cells.push({
      key: `ore:${mineral}`,
      iconKey: `ore:${mineral}`,
      name: `${definition.displayName} 광석`,
      short: definition.displayName.charAt(0),
      color: definition.color,
      badge: ore > 0 ? `${ore}` : "",
      kind: STATION_CELL.Ore,
      isEmpty: ore === 0,
      detail:
        ore > 0
          ? `제련하면 주괴가 된다. 파는 값은 개당 ${SELL_PRICE.Ore} 크레딧`
          : describeRequirement(mineral, equipment),
      usesQuantity: true,
      actions:
        ore > 0
          ? [
              {
                label: "팔기",
                detail: `${Math.min(ore, quantity)} 개 · ${Math.min(ore, quantity) * SELL_PRICE.Ore} 크레딧`,
                hint: "",
                action: { kind: "SELL_ORE", mineral, amount: quantity },
                isAvailable: true,
              },
            ]
          : [],
    });
  }

  for (const mineral of MINERAL_ORDER) {
    const definition = MINERAL_DEFINITIONS[mineral];
    const ingots: number = stock.ingotsOf(mineral);
    cells.push({
      key: `ingot:${mineral}`,
      iconKey: `ingot:${mineral}`,
      name: `${definition.displayName} 주괴`,
      short: definition.displayName.charAt(0),
      color: definition.color,
      badge: ingots > 0 ? `${ingots}` : "",
      kind: STATION_CELL.Ingot,
      isEmpty: ingots === 0,
      detail:
        ingots > 0
          ? `장비 강화와 합금에 쓴다. 파는 값은 개당 ${SELL_PRICE.Ingot} 크레딧`
          : `${definition.displayName} 광석 ${SMELTING.OrePerIngot} 개를 제련하면 하나가 된다`,
      usesQuantity: true,
      actions: describeIngotActions(mineral, stock, ingots, quantity),
    });
  }

  for (const alloy of ALLOY_ORDER) {
    const definition = ALLOY_DEFINITIONS[alloy as AlloyId];
    const count: number = stock.alloysOf(alloy);
    const primary: string = MINERAL_DEFINITIONS[definition.primary].displayName;
    const pair: string = MINERAL_DEFINITIONS[definition.pair].displayName;

    cells.push({
      key: `alloy:${alloy}`,
      iconKey: `alloy:${alloy}`,
      name: definition.displayName,
      short: definition.displayName.charAt(0),
      color: definition.color,
      badge: count > 0 ? `${count}` : "",
      kind: STATION_CELL.Alloy,
      isEmpty: count === 0,
      detail:
        count > 0
          ? "다음 티어 장비를 제작하는 재료다. 팔지 않는다"
          : `${primary} 주괴 ${SMELTING.PrimaryIngotPerAlloy} 과 ${pair} 주괴 ${SMELTING.PairIngotPerAlloy} 로 만든다`,
      usesQuantity: true,
      actions: describeAlloyActions(alloy, stock, quantity),
    });
  }

  return cells;
}

/**
 * 주괴 칸에서 할 수 있는 일.
 *
 * 만드는 일은 **만들어지는 것의 칸**에 둔다. 합금은 합금 칸에서 만들므로
 * 주괴도 주괴 칸에서 만드는 것이 맞다. 광석 칸에 제련을 두면 같은 격자에서
 * 규칙이 둘이 된다.
 *
 * 수량은 만들 주괴 수로 센다. 목적이 "주괴 열 개" 이지 "광석 마흔 개" 가
 * 아니다. 드는 광석은 설명에 함께 적는다.
 */
function describeIngotActions(
  mineral: MineralId,
  stock: StationStock,
  ingots: number,
  quantity: number,
): StationButton[] {
  const ore: number = stock.oreOf(mineral);
  const possible: number = Math.floor(ore / SMELTING.OrePerIngot);
  const made: number = Math.min(possible, quantity);
  const sellCount: number = Math.min(ingots, quantity);

  const actions: StationButton[] = [
    {
      label: "제련",
      detail:
        possible > 0
          ? `${made} 개 · 광석 ${made * SMELTING.OrePerIngot} 소모`
          : `광석이 ${SMELTING.OrePerIngot} 개는 있어야 한다`,
      hint: "",
      action: { kind: "SMELT", mineral, amount: quantity },
      isAvailable: possible > 0,
    },
  ];

  if (ingots > 0) {
    actions.push({
      label: "팔기",
      detail: `${sellCount} 개 · ${sellCount * SELL_PRICE.Ingot} 크레딧`,
      hint: "",
      action: { kind: "SELL_INGOTS", mineral, amount: quantity },
      isAvailable: true,
    });
  }

  return actions;
}

/** 합금 칸에서 할 수 있는 일. 재료라 팔지는 않는다. */
function describeAlloyActions(
  alloy: AlloyId,
  stock: StationStock,
  quantity: number,
): StationButton[] {
  const definition = ALLOY_DEFINITIONS[alloy];
  const fromPrimary: number = Math.floor(
    stock.ingotsOf(definition.primary) / SMELTING.PrimaryIngotPerAlloy,
  );
  const fromPair: number = Math.floor(
    stock.ingotsOf(definition.pair) / SMELTING.PairIngotPerAlloy,
  );
  const possible: number = Math.min(fromPrimary, fromPair);
  const made: number = Math.min(possible, quantity);

  return [
    {
      label: "합금",
      detail:
        possible > 0
          ? `${made} 개 · ${MINERAL_DEFINITIONS[definition.primary].displayName} 주괴 ${made * SMELTING.PrimaryIngotPerAlloy} + ${MINERAL_DEFINITIONS[definition.pair].displayName} 주괴 ${made * SMELTING.PairIngotPerAlloy} 소모`
          : `${MINERAL_DEFINITIONS[definition.primary].displayName} 주괴 ${SMELTING.PrimaryIngotPerAlloy} 과 ${MINERAL_DEFINITIONS[definition.pair].displayName} 주괴 ${SMELTING.PairIngotPerAlloy} 이 있어야 한다`,
      hint: "",
      action: { kind: "ALLOY", alloy, amount: quantity },
      isAvailable: possible > 0,
    },
  ];
}

/**
 * 갈 수 있는 항성계 목록.
 *
 * 전부 보여준다. 못 가게 막지 않는 것이 GDD 05 의 확정이다. 들어갈 수는 있고
 * 캐지 못할 뿐이다. 다만 무엇이 나오는지와 지금 장비로 캘 것이 있는지는 적어
 * 둔다. 가서야 알게 되면 헛걸음이 함정이 된다.
 */
function describeSystems(
  current: StarSystemId,
  equipment: ShipEquipment,
): SystemRow[] {
  const unlocked: boolean = isWarpUnlocked(equipment.laserTier);

  return STAR_SYSTEM_ORDER.map((id): SystemRow => {
    const definition = STAR_SYSTEM_DEFINITIONS[id];
    return {
      name: definition.displayName,
      summary: definition.summary,
      minerals: definition.minerals.map(
        (mineral) => MINERAL_DEFINITIONS[mineral].displayName,
      ),
      isCurrent: id === current,
      isUnlocked: unlocked,
      lockReason: unlocked ? "" : `채굴 레이저 T${WARP_UNLOCK_TIER} 필요`,
      hasMinable: hasMinableMineral(
        definition,
        equipment.laserTier,
        equipment.laserUpgrade,
      ),
      action: { kind: "WARP", system: id },
    };
  });
}

/** 하역·제련·합금처럼 저장고 전체를 다루는 작업. */
function describeOperations(cargo: Cargo, stock: StationStock): StationButton[] {
  return [
    {
      label: "하역",
      detail: `화물 ${Math.floor(cargo.total)}`,
      hint: "",
      action: { kind: "UNLOAD" },
      isAvailable: cargo.total > 0,
    },
    // 골라서 하는 것은 칸 쪽에 있다. 여기는 다 처리해도 되는 상황을 위한
    // 지름길이라 수량을 받지 않는다. 대개는 이쪽이면 충분하다.
    {
      label: "전부 제련",
      detail:
        stock.smeltableIngots > 0
          ? `주괴 ${stock.smeltableIngots} 개가 나온다`
          : `광석이 한 종류에 ${SMELTING.OrePerIngot} 개는 모여야 한다`,
      hint: "",
      action: { kind: "SMELT_ALL" },
      isAvailable: stock.smeltableIngots > 0,
    },
    {
      label: "전부 합금",
      detail:
        stock.alloyableCount > 0
          ? `합금 ${stock.alloyableCount} 개가 나온다`
          : `주광물 주괴 ${SMELTING.PrimaryIngotPerAlloy} 과 짝 주괴 ${SMELTING.PairIngotPerAlloy} 이 맞아야 한다`,
      hint: "",
      action: { kind: "ALLOY_ALL" },
      isAvailable: stock.alloyableCount > 0,
    },
  ];
}

/**
 * 장착 열의 격자.
 *
 * 칸이 곧 장비이고, 고르면 아래에 강화와 제작이 붙는다. 지금 무엇을 달고 있는
 * 지와 다음에 무엇을 할 수 있는지가 한자리에 모인다.
 */
function describeEquipment(
  stock: StationStock,
  equipment: ShipEquipment,
): StationCell[] {
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
      : `${materialName(cost.material)} ${cost.amount}/${stock.materialCount(cost.material)}`;
  }

  /**
   * 그 티어를 만들면 처음 캘 수 있게 되는 광물.
   *
   * 티어를 올리는 진짜 이유가 속도가 아니라 새 광물이다. 숫자만 적으면
   * "두 배쯤 빨라지네" 로 읽히고 정작 중요한 것을 놓친다.
   */
  function unlockedAt(tier: number): string {
    const names: string[] = MINERAL_ORDER.filter(
      (mineral) =>
        MINERAL_DEFINITIONS[mineral].requiredLaserTier === tier &&
        MINERAL_DEFINITIONS[mineral].requiredLaserUpgrade === 0,
    ).map((mineral) => MINERAL_DEFINITIONS[mineral].displayName);

    return names.length > 0 ? ` · ${names.join(" · ")} 해금` : "";
  }

  function canCraft(cost: CraftCost | null): boolean {
    return cost !== null && stock.materialCount(cost.material) >= cost.amount;
  }

  return [
    {
      key: "equipment:laser",
      iconKey: "",
      usesQuantity: false,
      isEmpty: false,
      name: "채굴 레이저",
      short: "채굴 레이저",
      color: PALETTE.Active,
      badge: `T${equipment.laserTier}+${equipment.laserUpgrade}`,
      kind: STATION_CELL.Equipment,
      detail: describeLaserCell(equipment, isMaxUpgrade, nextLaserTier),
      actions: [
        {
          label: isMaxUpgrade ? "강화 최대" : `강화 ${equipment.laserUpgrade + 1}`,
          detail: isMaxUpgrade
            ? "다음 티어를 제작해야 한다"
            : `${materialName(upgradeCost.material)} ${upgradeCost.amount}/${stock.materialCount(upgradeCost.material)}\n${upgradeCost.credits} 크레딧`,
          hint: isMaxUpgrade
            ? ""
            : `채굴 ${laserYieldOf(equipment.laserTier, equipment.laserUpgrade).toFixed(1)} → ${laserYieldOf(equipment.laserTier, equipment.laserUpgrade + 1).toFixed(1)}${pairUnlockedAt(equipment.laserTier, equipment.laserUpgrade + 1)}`,
          action: { kind: "UPGRADE_LASER" },
          isAvailable:
            !isMaxUpgrade &&
            stock.materialCount(upgradeCost.material) >= upgradeCost.amount &&
            stock.credits >= upgradeCost.credits,
        },
        {
          label:
            nextLaserTier > MAX_LASER_TIER ? "최대 티어" : `T${nextLaserTier} 제작`,
          detail: craftDetail(laserCost),
          hint:
            laserCost === null
              ? ""
              : `채굴 ${laserYieldOf(equipment.laserTier, equipment.laserUpgrade).toFixed(1)} → ${laserYieldOf(nextLaserTier, 0).toFixed(1)}${unlockedAt(nextLaserTier)}`,
          action: { kind: "CRAFT_LASER" },
          isAvailable: canCraft(laserCost),
        },
      ],
    },
    {
      key: "equipment:tractor",
      iconKey: "",
      usesQuantity: false,
      isEmpty: false,
      name: "견인빔",
      short: "견인빔",
      color: PALETTE.Signal,
      badge: `T${equipment.tractorTier}`,
      kind: STATION_CELL.Equipment,
      detail: describeTractorCell(equipment.tractorCapacity, nextTractorTier),
      actions: [
        {
          label:
            nextTractorTier > MAX_LASER_TIER ? "최대 티어" : `T${nextTractorTier} 제작`,
          detail: craftDetail(tractorCost),
          hint:
            tractorCost === null
              ? ""
              : `동시 ${equipment.tractorCapacity} → ${tractorCapacityOf(nextTractorTier)}`,
          action: { kind: "CRAFT_TRACTOR" },
          isAvailable: canCraft(tractorCost),
        },
      ],
    },
  ];
}

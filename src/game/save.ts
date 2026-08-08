import { Cargo } from "./cargo";
import { ShipEquipment } from "./equipment";
import { ObjectiveTracker } from "./objectives";
import { ALLOY_ORDER, MINERAL_ORDER, type AlloyId, type MineralId } from "./minerals";
import { STAR_SYSTEM_DEFINITIONS, STARTING_SYSTEM, type StarSystemId } from "./star-systems";
import { StationStock } from "./station-stock";

/** 저장 형식 번호. 형식을 바꿀 때마다 올린다. */
export const SAVE_VERSION = 1;

/** 브라우저 저장소에 쓰는 열쇠. */
export const SAVE_KEY = "voidminer.save";

/**
 * 주기 저장 간격 (ms).
 *
 * 거점 조작이나 창 닫기 같은 시점만으로는 캐는 동안이 통째로 빈다. 브라우저가
 * 죽으면 그때까지 캔 것을 다 잃으므로 주기적으로도 쓴다. 짧게 잡을 이유는
 * 없다 — 잃는 것이 30 초어치면 다시 캐면 그만이다.
 */
export const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * 저장하는 것.
 *
 * 다시 만들 수 있는 것은 담지 않는다. 소행성 배치는 항성계와 시드에서 다시
 * 나오고, 떠 있는 파편은 잃어도 그만이다. 담는 것은 **되돌릴 수 없는 것**
 * 뿐이다 — 캔 것, 만든 것, 어디까지 왔는지.
 */
export type SaveData = {
  readonly version: number;
  readonly cargo: Readonly<Record<string, number>>;
  readonly ore: Readonly<Record<string, number>>;
  readonly ingots: Readonly<Record<string, number>>;
  readonly alloys: Readonly<Record<string, number>>;
  readonly credits: number;
  readonly laserTier: number;
  readonly laserUpgrade: number;
  readonly tractorTier: number;
  readonly system: string;
  /** 한 번이라도 캐본 광물. 목표 진행 판정에 쓴다 */
  readonly seenMinerals: ReadonlyArray<string>;
  /** 끝낸 목표 단계 수. 다시 계산으로는 알아낼 수 없다 */
  readonly objectiveStep: number;
};

/** 0 인 항목을 뺀 기록을 만든다. 저장된 것을 눈으로 읽을 수 있어야 한다. */
function packCounts(
  keys: ReadonlyArray<string>,
  read: (key: string) => number,
): Record<string, number> {
  const packed: Record<string, number> = {};
  for (const key of keys) {
    const amount: number = read(key);
    if (amount > 0) {
      packed[key] = amount;
    }
  }
  return packed;
}

/** 지금 상태를 저장 형태로 만든다. */
export function captureSave(
  cargo: Cargo,
  stock: StationStock,
  equipment: ShipEquipment,
  system: StarSystemId,
  objectiveStep: number,
): SaveData {
  return {
    version: SAVE_VERSION,
    cargo: packCounts(MINERAL_ORDER, (id) => cargo.amountOf(id as MineralId)),
    ore: packCounts(MINERAL_ORDER, (id) => stock.oreOf(id as MineralId)),
    ingots: packCounts(MINERAL_ORDER, (id) => stock.ingotsOf(id as MineralId)),
    alloys: packCounts(ALLOY_ORDER, (id) => stock.alloysOf(id as AlloyId)),
    credits: stock.credits,
    laserTier: equipment.laserTier,
    laserUpgrade: equipment.laserUpgrade,
    tractorTier: equipment.tractorTier,
    system,
    seenMinerals: [...cargo.seenResources],
    objectiveStep,
  };
}

/**
 * 저장된 것을 지금 상태에 되돌린다.
 *
 * 읽은 값을 그대로 믿지 않는다. 저장소는 사용자가 고칠 수 있고 형식이 바뀌기도
 * 한다. 이상한 값이 들어오면 그 항목만 버리고 나머지를 살린다 — 저장 하나가
 * 틀어져서 게임이 안 켜지는 것이 가장 나쁘다.
 *
 * @returns 어느 항성계에서 이어갈지
 */
export function restoreSave(
  data: SaveData,
  cargo: Cargo,
  stock: StationStock,
  equipment: ShipEquipment,
  objectives: ObjectiveTracker,
): StarSystemId {
  for (const mineral of MINERAL_ORDER) {
    const amount: number = numberOf(data.cargo, mineral);
    if (amount > 0) {
      cargo.add(mineral, amount);
    }
    stock.restoreOre(mineral, numberOf(data.ore, mineral));
    stock.restoreIngots(mineral, numberOf(data.ingots, mineral));
  }

  for (const alloy of ALLOY_ORDER) {
    stock.restoreAlloys(alloy, numberOf(data.alloys, alloy));
  }

  stock.restoreCredits(
    typeof data.credits === "number" && data.credits > 0 ? data.credits : 0,
  );

  equipment.restore(data.laserTier, data.laserUpgrade, data.tractorTier);

  // 화물을 거쳐가지 않은 광물도 본 것으로 친다. 목표가 되돌아가면 안 된다.
  for (const mineral of data.seenMinerals ?? []) {
    if (MINERAL_ORDER.includes(mineral as MineralId)) {
      cargo.markSeen(mineral as MineralId);
    }
  }

  objectives.restore(data.objectiveStep);

  return data.system in STAR_SYSTEM_DEFINITIONS
    ? (data.system as StarSystemId)
    : STARTING_SYSTEM;
}

/** 기록에서 숫자를 꺼낸다. 숫자가 아니거나 음수면 0 이다. */
function numberOf(record: Readonly<Record<string, number>>, key: string): number {
  const value: unknown = record?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 저장된 것이 지금 형식으로 읽을 수 있는지 본다.
 *
 * 형식 번호가 다르면 버린다. 옛 저장을 억지로 읽으면 어디가 비었는지 모르는
 * 채로 진행되어 더 나쁜 상태가 된다.
 */
export function parseSave(raw: string | null): SaveData | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as SaveData).version !== SAVE_VERSION
    ) {
      return null;
    }
    return parsed as SaveData;
  } catch {
    return null;
  }
}

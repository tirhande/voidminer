import { MINERAL_DEFINITIONS, RESOURCE, type MineralId } from "./minerals";

/** 항성계 식별자. */
export const STAR_SYSTEM = {
  Kestrel: "KESTREL",
  Vantorn: "VANTORN",
  Halvex: "HALVEX",
  Ossuary: "OSSUARY",
  Meridian: "MERIDIAN",
} as const;

export type StarSystemId = (typeof STAR_SYSTEM)[keyof typeof STAR_SYSTEM];

export type StarSystemDefinition = {
  readonly id: StarSystemId;
  readonly displayName: string;
  /** 이 항성계에서 나오는 광물 */
  readonly minerals: ReadonlyArray<MineralId>;
  /** 필드 생성 시드. 항성계마다 달라야 배치가 겹치지 않는다 */
  readonly seed: number;
  /** 목록에 붙는 한 줄 설명 */
  readonly summary: string;
};

/**
 * 항성계 목록.
 *
 * GDD 05 는 광물을 항성계 단위로 나눈다. 광물 쌍 4개가 뼈대이고, 겹치되 분포가
 * 다른 항성계를 더 둔다. 항성계를 쌍 수에 딱 맞추면 "이 항성계 = 이 광물" 이
 * 되어 지도가 목록이 되기 때문이다. 겹쳐야 어디로 갈지 고를 여지가 생긴다.
 *
 * 이동에는 비용이 없다. 진행 잠금은 채집 장비 하나뿐이다 (GDD 05). 워프
 * 사거리나 연료까지 잠금이 되면 올려야 할 것이 둘이 되고, 둘 다 막히면 진행이
 * 멎는다. 그래서 어디든 바로 갈 수 있고, 가서 캐지 못하면 그것이 답이다.
 */
export const STAR_SYSTEM_DEFINITIONS: Readonly<
  Record<StarSystemId, StarSystemDefinition>
> = {
  [STAR_SYSTEM.Kestrel]: {
    id: STAR_SYSTEM.Kestrel,
    displayName: "케스트렐",
    minerals: [RESOURCE.Copper, RESOURCE.Tin],
    seed: 20260804,
    summary: "시작 항성계. 구리가 흔하다",
  },
  [STAR_SYSTEM.Vantorn]: {
    id: STAR_SYSTEM.Vantorn,
    displayName: "반토른",
    minerals: [RESOURCE.Copper, RESOURCE.Iron, RESOURCE.Nickel],
    seed: 31415926,
    summary: "구리가 남아 있고 철이 나온다",
  },
  [STAR_SYSTEM.Halvex]: {
    id: STAR_SYSTEM.Halvex,
    displayName: "할벡스",
    minerals: [RESOURCE.Iron, RESOURCE.Titanium, RESOURCE.Aluminum],
    seed: 27182818,
    summary: "철이 가장 많다. 티타늄이 섞인다",
  },
  [STAR_SYSTEM.Ossuary]: {
    id: STAR_SYSTEM.Ossuary,
    displayName: "오슈어리",
    minerals: [RESOURCE.Titanium, RESOURCE.Iridium, RESOURCE.Platinum],
    seed: 16180339,
    summary: "이리듐이 나오는 유일한 곳",
  },
  [STAR_SYSTEM.Meridian]: {
    id: STAR_SYSTEM.Meridian,
    displayName: "메리디안",
    minerals: [RESOURCE.Nickel, RESOURCE.Aluminum, RESOURCE.Platinum],
    seed: 14142135,
    summary: "쌍 광물만 모인 곳. 분포가 다르다",
  },
};

/** 표시 순서를 고정하기 위한 목록. */
export const STAR_SYSTEM_ORDER: ReadonlyArray<StarSystemId> = [
  STAR_SYSTEM.Kestrel,
  STAR_SYSTEM.Vantorn,
  STAR_SYSTEM.Halvex,
  STAR_SYSTEM.Ossuary,
  STAR_SYSTEM.Meridian,
];

/** 게임을 시작하는 항성계. */
export const STARTING_SYSTEM: StarSystemId = STAR_SYSTEM.Kestrel;

/**
 * 항성계 이동이 열리는 채굴 레이저 티어.
 *
 * 처음부터 어디든 갈 수 있으면 시작 항성계에서 배울 것을 안 배운 채 나간다.
 * 캐고 줍고 제련하고 강화하는 한 바퀴를 여기서 다 돌게 되어 있다.
 *
 * T2 를 만들면 철이 필요해지는데 시작 항성계에는 철이 없다. 그때가 나갈 이유가
 * 처음 생기는 시점이므로 거기에 맞춘다.
 */
export const WARP_UNLOCK_TIER = 2;

/** 항성계 이동이 열렸는지. */
export function isWarpUnlocked(laserTier: number): boolean {
  return laserTier >= WARP_UNLOCK_TIER;
}

/**
 * 그 장비로 이 항성계에서 캘 것이 있는지.
 *
 * 못 가게 막지는 않는다. 다만 가기 전에 알 수는 있어야 한다. 목록에 적어두면
 * 헛걸음이 선택이 되고, 안 적어두면 헛걸음이 함정이 된다.
 */
export function hasMinableMineral(
  system: StarSystemDefinition,
  laserTier: number,
  laserUpgrade: number,
): boolean {
  return system.minerals.some((mineral) => {
    const definition = MINERAL_DEFINITIONS[mineral];
    return (
      laserTier > definition.requiredLaserTier ||
      (laserTier === definition.requiredLaserTier &&
        laserUpgrade >= definition.requiredLaserUpgrade)
    );
  });
}

import { PALETTE } from "../palette";

/**
 * 광물 8종.
 *
 * 주광물 4종에 각각 짝인 부광물이 하나씩 붙는다. 짝을 함께 제련하면 합금이
 * 되고, 그 합금이 다음 티어 장비의 재료가 된다 (GDD 02).
 *
 * 보석은 없앴다. 확률 산출 자리를 부광물이 대신한다 — 구리를 캐다 가끔 주석이
 * 나온다. 산출이 사라지는 것이 아니라 짝으로 바뀌는 것이라, 바닥이 깎이지
 * 않는다는 원칙이 그대로 지켜진다.
 */
export const RESOURCE = {
  Copper: "COPPER",
  Tin: "TIN",
  Iron: "IRON",
  Nickel: "NICKEL",
  Titanium: "TITANIUM",
  Aluminum: "ALUMINUM",
  Iridium: "IRIDIUM",
  Platinum: "PLATINUM",
} as const;

export type ResourceId = (typeof RESOURCE)[keyof typeof RESOURCE];

/** 광물은 전부 캘 수 있다. 부산물 전용 자원은 없다. */
export type MineralId = ResourceId;

/** 합금 4종. 짝인 두 주괴를 합쳐 만든다. */
export const ALLOY = {
  Bronze: "BRONZE",
  NickelSteel: "NICKEL_STEEL",
  TitaniumAlloy: "TITANIUM_ALLOY",
  PlatinumIridium: "PLATINUM_IRIDIUM",
} as const;

export type AlloyId = (typeof ALLOY)[keyof typeof ALLOY];

/** 광물 하나의 정의. */
export type MineralDefinition = {
  readonly id: MineralId;
  readonly displayName: string;
  /** 짝인 광물. 함께 제련하면 합금이 된다 */
  readonly pair: MineralId;
  /** 주광물인지 여부. 짝 쪽이 부광물이다 */
  readonly isPrimary: boolean;
  /** 소행성과 파편에 쓰이는 색 */
  readonly color: number;
  /** 캐는 데 필요한 레이저 티어 */
  readonly requiredLaserTier: number;
  /**
   * 캐는 데 필요한 레이저 업그레이드 수준.
   *
   * 부광물은 같은 티어에서 강화 3을 요구한다. 이것이 티어 순환을 끊는 장치다
   * (GDD 07) — 강화가 짝을 열고, 그 짝으로 합금을 만들어 다음 티어로 간다.
   */
  readonly requiredLaserUpgrade: number;
  /**
   * 분포 가중치.
   *
   * 티어와 분포는 별개 속성이다 (GDD 02). 철은 상위 티어인데 가장 흔하다.
   * 흔한 것과 나중에 쓰는 것은 다른 이야기이므로 모순이 아니다.
   */
  readonly abundance: number;
  /**
   * 다 캔 뒤 새 소행성이 들어서기까지 걸리는 시간 (s).
   *
   * `scripts/measure-balance.mjs` 로 잰 한 사이클(약 37초)을 기준으로 잡았다.
   * 구리는 사이클의 1.2 배라 돌아오면 이미 차 있고, 이리듐은 16 배라 기다리는
   * 것보다 새 지역으로 가는 편이 빠르다. GDD 02 가 요구한 "시간 차이로 만드는
   * 진행 동기"가 이 비율에서 나온다.
   */
  readonly respawnSeconds: number;
};

export const MINERAL_DEFINITIONS: Readonly<Record<MineralId, MineralDefinition>> = {
  [RESOURCE.Copper]: {
    id: RESOURCE.Copper,
    displayName: "구리",
    pair: RESOURCE.Tin,
    isPrimary: true,
    color: PALETTE.Copper,
    requiredLaserTier: 1,
    requiredLaserUpgrade: 0,
    abundance: 18,
    respawnSeconds: 45,
  },
  [RESOURCE.Tin]: {
    id: RESOURCE.Tin,
    displayName: "주석",
    pair: RESOURCE.Copper,
    isPrimary: false,
    color: PALETTE.Tin,
    requiredLaserTier: 1,
    requiredLaserUpgrade: 3,
    abundance: 7,
    respawnSeconds: 60,
  },
  [RESOURCE.Iron]: {
    id: RESOURCE.Iron,
    displayName: "철",
    pair: RESOURCE.Nickel,
    isPrimary: true,
    color: PALETTE.Iron,
    requiredLaserTier: 2,
    requiredLaserUpgrade: 0,
    abundance: 26,
    respawnSeconds: 150,
  },
  [RESOURCE.Nickel]: {
    id: RESOURCE.Nickel,
    displayName: "니켈",
    pair: RESOURCE.Iron,
    isPrimary: false,
    color: PALETTE.Nickel,
    requiredLaserTier: 2,
    requiredLaserUpgrade: 3,
    abundance: 10,
    respawnSeconds: 180,
  },
  [RESOURCE.Titanium]: {
    id: RESOURCE.Titanium,
    displayName: "티타늄",
    pair: RESOURCE.Aluminum,
    isPrimary: true,
    color: PALETTE.Titanium,
    requiredLaserTier: 4,
    requiredLaserUpgrade: 0,
    abundance: 10,
    respawnSeconds: 300,
  },
  [RESOURCE.Aluminum]: {
    id: RESOURCE.Aluminum,
    displayName: "알루미늄",
    pair: RESOURCE.Titanium,
    isPrimary: false,
    color: PALETTE.Aluminum,
    requiredLaserTier: 4,
    requiredLaserUpgrade: 3,
    abundance: 5,
    respawnSeconds: 330,
  },
  [RESOURCE.Iridium]: {
    id: RESOURCE.Iridium,
    displayName: "이리듐",
    pair: RESOURCE.Platinum,
    isPrimary: true,
    color: PALETTE.Iridium,
    requiredLaserTier: 6,
    requiredLaserUpgrade: 0,
    abundance: 3,
    respawnSeconds: 600,
  },
  [RESOURCE.Platinum]: {
    id: RESOURCE.Platinum,
    displayName: "백금",
    pair: RESOURCE.Iridium,
    isPrimary: false,
    color: PALETTE.Platinum,
    requiredLaserTier: 6,
    requiredLaserUpgrade: 3,
    abundance: 2,
    respawnSeconds: 660,
  },
};

/** 합금 하나의 정의. */
export type AlloyDefinition = {
  readonly id: AlloyId;
  readonly displayName: string;
  readonly color: number;
  /** 주광물 주괴 */
  readonly primary: MineralId;
  /** 짝인 부광물 주괴 */
  readonly pair: MineralId;
};

export const ALLOY_DEFINITIONS: Readonly<Record<AlloyId, AlloyDefinition>> = {
  [ALLOY.Bronze]: {
    id: ALLOY.Bronze,
    displayName: "청동",
    color: PALETTE.Bronze,
    primary: RESOURCE.Copper,
    pair: RESOURCE.Tin,
  },
  [ALLOY.NickelSteel]: {
    id: ALLOY.NickelSteel,
    displayName: "니켈강",
    color: PALETTE.NickelSteel,
    primary: RESOURCE.Iron,
    pair: RESOURCE.Nickel,
  },
  [ALLOY.TitaniumAlloy]: {
    id: ALLOY.TitaniumAlloy,
    displayName: "티타늄 합금",
    color: PALETTE.TitaniumAlloy,
    primary: RESOURCE.Titanium,
    pair: RESOURCE.Aluminum,
  },
  [ALLOY.PlatinumIridium]: {
    id: ALLOY.PlatinumIridium,
    displayName: "백금이리듐",
    color: PALETTE.PlatinumIridium,
    primary: RESOURCE.Iridium,
    pair: RESOURCE.Platinum,
  },
};

/** 표시 순서를 고정하기 위한 목록. */
export const MINERAL_ORDER: ReadonlyArray<MineralId> = [
  RESOURCE.Copper,
  RESOURCE.Tin,
  RESOURCE.Iron,
  RESOURCE.Nickel,
  RESOURCE.Titanium,
  RESOURCE.Aluminum,
  RESOURCE.Iridium,
  RESOURCE.Platinum,
];

export const ALLOY_ORDER: ReadonlyArray<AlloyId> = [
  ALLOY.Bronze,
  ALLOY.NickelSteel,
  ALLOY.TitaniumAlloy,
  ALLOY.PlatinumIridium,
];

/**
 * 소행성 크기 등급.
 *
 * 크기가 곧 광물 티어의 단서다 (GDD 02). 크기만 보고도 무엇이 나올지 짐작할
 * 수 있어야 한다. 광물 쌍 하나가 크기 등급 하나에 대응한다.
 */
export const ASTEROID_SIZE = {
  Small: "SMALL",
  Medium: "MEDIUM",
  Large: "LARGE",
  Huge: "HUGE",
} as const;

export type AsteroidSize = (typeof ASTEROID_SIZE)[keyof typeof ASTEROID_SIZE];

/** 크기 등급별 형상과 매장량. */
export type AsteroidSizeDefinition = {
  readonly size: AsteroidSize;
  /** 기준 반지름 (m) */
  readonly radius: number;
  /** 총 매장량 (광물 단위) */
  readonly mineralAmount: number;
};

export const ASTEROID_SIZE_DEFINITIONS: Readonly<
  Record<AsteroidSize, AsteroidSizeDefinition>
> = {
  [ASTEROID_SIZE.Small]: { size: ASTEROID_SIZE.Small, radius: 11, mineralAmount: 45 },
  [ASTEROID_SIZE.Medium]: { size: ASTEROID_SIZE.Medium, radius: 19, mineralAmount: 95 },
  [ASTEROID_SIZE.Large]: { size: ASTEROID_SIZE.Large, radius: 30, mineralAmount: 170 },
  [ASTEROID_SIZE.Huge]: { size: ASTEROID_SIZE.Huge, radius: 42, mineralAmount: 260 },
};

/** 광물이 묻혀 있는 소행성의 크기 등급. 광물 쌍마다 하나씩 대응한다. */
const MINERAL_SIZE: Readonly<Record<MineralId, AsteroidSize>> = {
  [RESOURCE.Copper]: ASTEROID_SIZE.Small,
  [RESOURCE.Tin]: ASTEROID_SIZE.Small,
  [RESOURCE.Iron]: ASTEROID_SIZE.Medium,
  [RESOURCE.Nickel]: ASTEROID_SIZE.Medium,
  [RESOURCE.Titanium]: ASTEROID_SIZE.Large,
  [RESOURCE.Aluminum]: ASTEROID_SIZE.Large,
  [RESOURCE.Iridium]: ASTEROID_SIZE.Huge,
  [RESOURCE.Platinum]: ASTEROID_SIZE.Huge,
};

/** 광물에 대응하는 소행성 크기 등급을 얻는다. */
export function sizeForMineral(mineral: MineralId): AsteroidSizeDefinition {
  return ASTEROID_SIZE_DEFINITIONS[MINERAL_SIZE[mineral]];
}

/** 표시용 이름을 얻는다. */
export function resourceDisplayName(id: ResourceId): string {
  return MINERAL_DEFINITIONS[id].displayName;
}

/** 표시용 색을 얻는다. */
export function resourceColor(id: ResourceId): number {
  return MINERAL_DEFINITIONS[id].color;
}

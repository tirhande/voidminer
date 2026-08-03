/**
 * 자원 종류.
 *
 * 광물 셋은 티어를 이루고, 보석은 티어에 속하지 않는 부산물이다. 보석은 채굴
 * 시 확률로 "추가" 산출된다 — 기본 광물의 산출을 깎지 않으므로 도박이 아니라
 * 보너스다. GDD 01 의 "확률은 바닥을 깎지 말고 천장을 올린다" 원칙이다.
 */
export const RESOURCE = {
  Copper: "COPPER",
  Iron: "IRON",
  Titanium: "TITANIUM",
  Gem: "GEM",
} as const;

export type ResourceId = (typeof RESOURCE)[keyof typeof RESOURCE];

/** 소행성에서 캐낼 수 있는 광물. 보석은 부산물이므로 제외된다. */
export type MineralId = Exclude<ResourceId, typeof RESOURCE.Gem>;

/** 광물 하나의 정의. */
export type MineralDefinition = {
  readonly id: MineralId;
  /** 화면에 표시할 이름 */
  readonly displayName: string;
  /** 광물 티어. 장비 티어와 1:1 로 대응한다 */
  readonly tier: number;
  /** 소행성과 파편에 쓰이는 색 */
  readonly color: number;
  /** 캐는 데 필요한 레이저 티어 */
  readonly requiredLaserTier: number;
  /**
   * 캐는 데 필요한 레이저 업그레이드 수준.
   *
   * GDD 07 에서 잠금 조건은 티어와 업그레이드 둘 다로 확정됐다. 업그레이드는
   * 곁가지가 아니라 다음 티어를 여는 열쇠다.
   */
  readonly requiredLaserUpgrade: number;
  /** 파편 하나가 떨어질 때 보석이 함께 나올 확률 (0~1) */
  readonly gemChance: number;
};

export const MINERAL_DEFINITIONS: Readonly<Record<MineralId, MineralDefinition>> = {
  [RESOURCE.Copper]: {
    id: RESOURCE.Copper,
    displayName: "구리",
    tier: 1,
    color: 0xc87b4a,
    requiredLaserTier: 1,
    requiredLaserUpgrade: 0,
    gemChance: 0.04,
  },
  [RESOURCE.Iron]: {
    id: RESOURCE.Iron,
    displayName: "철",
    tier: 2,
    color: 0x9aa7b8,
    requiredLaserTier: 1,
    requiredLaserUpgrade: 3,
    gemChance: 0.07,
  },
  [RESOURCE.Titanium]: {
    id: RESOURCE.Titanium,
    displayName: "티타늄",
    tier: 3,
    color: 0x8fd8ef,
    requiredLaserTier: 2,
    requiredLaserUpgrade: 3,
    gemChance: 0.11,
  },
};

/** 보석의 표시 정보. 광물이 아니므로 티어와 잠금이 없다. */
export const GEM_DISPLAY = {
  displayName: "보석",
  color: 0xc07de8,
} as const;

/**
 * 소행성 크기 등급.
 *
 * GDD 02 의 "소행성 크기가 곧 광물 티어의 단서"를 그대로 옮긴 것이다. 크기만
 * 보고도 무엇이 나올지 짐작할 수 있어야 한다.
 */
export const ASTEROID_SIZE = {
  Small: "SMALL",
  Medium: "MEDIUM",
  Large: "LARGE",
} as const;

export type AsteroidSize = (typeof ASTEROID_SIZE)[keyof typeof ASTEROID_SIZE];

/** 크기 등급별 형상과 매장량. */
export type AsteroidSizeDefinition = {
  readonly size: AsteroidSize;
  /** 기준 반지름 (m) */
  readonly radius: number;
  /** 이 크기에 묻혀 있는 광물 */
  readonly mineral: MineralId;
  /** 총 매장량 (광물 단위) */
  readonly mineralAmount: number;
};

export const ASTEROID_SIZE_DEFINITIONS: Readonly<
  Record<AsteroidSize, AsteroidSizeDefinition>
> = {
  [ASTEROID_SIZE.Small]: {
    size: ASTEROID_SIZE.Small,
    radius: 6,
    mineral: RESOURCE.Copper,
    mineralAmount: 45,
  },
  [ASTEROID_SIZE.Medium]: {
    size: ASTEROID_SIZE.Medium,
    radius: 11,
    mineral: RESOURCE.Iron,
    mineralAmount: 95,
  },
  [ASTEROID_SIZE.Large]: {
    size: ASTEROID_SIZE.Large,
    radius: 17,
    mineral: RESOURCE.Titanium,
    mineralAmount: 170,
  },
};

/** 표시용 이름을 얻는다. 보석과 광물을 한 자리에서 처리한다. */
export function resourceDisplayName(id: ResourceId): string {
  if (id === RESOURCE.Gem) {
    return GEM_DISPLAY.displayName;
  }
  return MINERAL_DEFINITIONS[id].displayName;
}

/** 표시용 색을 얻는다. */
export function resourceColor(id: ResourceId): number {
  if (id === RESOURCE.Gem) {
    return GEM_DISPLAY.color;
  }
  return MINERAL_DEFINITIONS[id].color;
}

import { MINING_LASER, TRACTOR_BEAM } from "../constants";
import type { MineralDefinition } from "./minerals";

/** 티어당 업그레이드 상한. */
export const MAX_UPGRADE_LEVEL = 5;

/**
 * 그 등급에서 나오는 채굴 속도.
 *
 * 지금 값뿐 아니라 올린 뒤의 값도 물어야 해서 등급을 밖에서 받는다. 계산이
 * 한 곳에만 있어야 화면에 적는 값과 실제로 캐는 값이 갈리지 않는다.
 */
export function laserYieldOf(tier: number, upgrade: number): number {
  return (
    MINING_LASER.BaseYieldPerSecond +
    (tier - 1) * MINING_LASER.YieldPerTier +
    upgrade * MINING_LASER.YieldPerUpgrade
  );
}

/** 그 등급에서 동시에 끌 수 있는 파편 수. */
export function tractorCapacityOf(tier: number): number {
  return TRACTOR_BEAM.BaseCapacity + (tier - 1) * TRACTOR_BEAM.CapacityPerTier;
}

/** 값을 범위 안으로 넣는다. 숫자가 아니면 하한을 준다. */
function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(Math.max(Math.floor(value), low), high);
}

/** 티어는 1 이상이어야 한다. 0 이면 아무것도 캘 수 없는 장비가 된다. */
function sanitizeTier(tier: number): number {
  return clamp(tier, 1, 8);
}

/** 채굴 가능 여부와, 불가한 경우의 사유. */
export type MiningEligibility = {
  readonly isAllowed: boolean;
  /**
   * 불가한 경우 화면에 띄울 한 줄. 가능한 경우 null.
   *
   * GDD 07 의 문구 원칙을 따른다 — 명령형을 쓰지 않고 무엇이 모자란지만 적는다.
   * "레이저를 올리세요"가 아니라 "레이저 T2 이상 필요".
   */
  readonly requirementText: string | null;
};

/**
 * 함선에 장착된 채집 장비의 상태.
 *
 * GDD 07 에서 채굴 스킬이라는 축은 삭제됐다. 무엇을 캘 수 있는지는 전적으로
 * 장비가 정한다 — 티어와 업그레이드 수준 둘 다가 잠금 조건이다.
 */
export class ShipEquipment {
  private laserTierValue: number;
  private laserUpgradeValue: number;
  private tractorTierValue: number;

  public constructor(
    laserTier: number = 1,
    laserUpgrade: number = 0,
    tractorTier: number = 1,
  ) {
    this.laserTierValue = laserTier;
    this.laserUpgradeValue = laserUpgrade;
    this.tractorTierValue = tractorTier;
  }

  /** 현재 견인빔 티어. */
  public get tractorTier(): number {
    return this.tractorTierValue;
  }

  /**
   * 동시에 끌 수 있는 파편 수.
   *
   * 레이저를 올릴수록 파편이 쏟아지므로, 회수 계통에 투자하지 않으면 여기가
   * 병목이 된다. 두 계통이 갈리는 지점이다 (GDD 02).
   */
  public get tractorCapacity(): number {
    return tractorCapacityOf(this.tractorTierValue);
  }

  /** 견인빔 티어를 올린다. */
  /**
   * 저장된 장비 상태를 되돌린다.
   *
   * 이어하기 전용이다. 값이 이상하면 시작 상태로 둔다 — 저장이 틀어져서 캘 수
   * 없는 장비를 들고 시작하는 것이 가장 나쁘다.
   */
  public restore(laserTier: number, laserUpgrade: number, tractorTier: number): void {
    this.laserTierValue = sanitizeTier(laserTier);
    this.laserUpgradeValue = clamp(laserUpgrade, 0, MAX_UPGRADE_LEVEL);
    this.tractorTierValue = sanitizeTier(tractorTier);
  }

  public upgradeTractor(): void {
    this.tractorTierValue += 1;
  }

  /** 현재 채굴 레이저 티어. */
  public get laserTier(): number {
    return this.laserTierValue;
  }

  /** 현재 채굴 레이저 업그레이드 수준. */
  public get laserUpgrade(): number {
    return this.laserUpgradeValue;
  }

  /** 초당 채굴량 (광물 단위/s). 티어와 업그레이드가 함께 반영된다. */
  public get laserYieldPerSecond(): number {
    return laserYieldOf(this.laserTierValue, this.laserUpgradeValue);
  }

  /**
   * 업그레이드를 한 단계 올린다.
   *
   * GDD 07 에서 업그레이드에는 실패 확률을 두지 않기로 확정됐다. 재료를 날리고
   * 실패하는 것은 "하한이 0인 확률" 금지에 정면으로 걸린다.
   *
   * @returns 실제로 올랐으면 true, 이미 상한이면 false
   */
  public upgradeLaser(): boolean {
    if (this.laserUpgradeValue >= MAX_UPGRADE_LEVEL) {
      return false;
    }
    this.laserUpgradeValue += 1;
    return true;
  }

  /**
   * 레이저 티어를 올리고 업그레이드 수준을 초기화한다.
   * 다른 장비로 갈아 끼우는 것이므로 강화 이력은 따라오지 않는다.
   */
  public replaceLaser(tier: number): void {
    this.laserTierValue = tier;
    this.laserUpgradeValue = 0;
  }

  /** 해당 광물을 캘 수 있는지 판정한다. */
  public evaluateMining(mineral: MineralDefinition): MiningEligibility {
    if (this.laserTierValue < mineral.requiredLaserTier) {
      return {
        isAllowed: false,
        requirementText: `레이저 T${mineral.requiredLaserTier} 이상 필요`,
      };
    }

    if (
      this.laserTierValue === mineral.requiredLaserTier &&
      this.laserUpgradeValue < mineral.requiredLaserUpgrade
    ) {
      return {
        isAllowed: false,
        requirementText: `레이저 T${mineral.requiredLaserTier} 강화 ${mineral.requiredLaserUpgrade} 이상 필요`,
      };
    }

    return { isAllowed: true, requirementText: null };
  }
}

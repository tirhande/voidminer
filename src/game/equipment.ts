import { MINING_LASER } from "../constants";
import type { MineralDefinition } from "./minerals";

/** 티어당 업그레이드 상한. */
export const MAX_UPGRADE_LEVEL = 5;

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

  public constructor(laserTier: number = 1, laserUpgrade: number = 0) {
    this.laserTierValue = laserTier;
    this.laserUpgradeValue = laserUpgrade;
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
    const tierBonus: number = (this.laserTierValue - 1) * MINING_LASER.YieldPerTier;
    const upgradeBonus: number = this.laserUpgradeValue * MINING_LASER.YieldPerUpgrade;
    return MINING_LASER.BaseYieldPerSecond + tierBonus + upgradeBonus;
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

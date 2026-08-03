import { CARGO } from "../constants";
import type { ResourceId } from "./minerals";

/** 화물칸에 담긴 자원 한 줄. */
export type CargoEntry = {
  readonly resource: ResourceId;
  readonly amount: number;
};

/**
 * 함선 화물칸.
 *
 * GDD 08 에서 창고는 채집 사이클의 길이를 정하는 모듈로 정의돼 있다. 용량이
 * 차면 더 캘 수 없으므로 거점으로 돌아갈 이유가 생긴다. 다만 같은 문서가
 * "용량만 늘리는 것은 답이 아니다"라고 경고하고 있으므로, 이 프로토에서는
 * 상한이 실제로 압박이 되는지를 재는 것이 목적이다.
 */
export class Cargo {
  private readonly amounts: Map<ResourceId, number> = new Map();
  private totalAmount: number = 0;

  /** 현재 적재량 합계. */
  public get total(): number {
    return this.totalAmount;
  }

  /** 적재 상한. */
  public get capacity(): number {
    return CARGO.Capacity;
  }

  /** 화물칸이 가득 찼는지 여부. */
  public get isFull(): boolean {
    return this.totalAmount >= CARGO.Capacity;
  }

  /** 담긴 자원을 담은 순서대로 반환한다. */
  public entries(): CargoEntry[] {
    const result: CargoEntry[] = [];
    for (const [resource, amount] of this.amounts) {
      result.push({ resource, amount });
    }
    return result;
  }

  /** 특정 자원의 보유량. */
  public amountOf(resource: ResourceId): number {
    return this.amounts.get(resource) ?? 0;
  }

  /**
   * 자원을 적재한다. 상한을 넘는 만큼은 담기지 않는다.
   *
   * @param resource 자원 종류
   * @param amount 담으려는 양
   * @returns 실제로 담긴 양
   */
  public add(resource: ResourceId, amount: number): number {
    const room: number = CARGO.Capacity - this.totalAmount;
    const stored: number = Math.min(amount, room);
    if (stored <= 0) {
      return 0;
    }

    this.amounts.set(resource, this.amountOf(resource) + stored);
    this.totalAmount += stored;
    return stored;
  }

  /** 화물칸을 비운다. 거점에 하역할 때 쓴다. */
  public clear(): void {
    this.amounts.clear();
    this.totalAmount = 0;
  }
}

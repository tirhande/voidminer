import { CARGO } from "../constants";
import type { ResourceId } from "./minerals";

/** 화물칸에 담긴 자원 한 줄. */
export type CargoEntry = {
  readonly resource: ResourceId;
  readonly amount: number;
};

/**
 * 화물칸 한 칸.
 *
 * 같은 광물이라도 StackSize 를 넘으면 칸이 나뉜다. 화면에 칸 그대로 보여주기
 * 위한 형태다.
 */
export type CargoSlot = {
  readonly resource: ResourceId;
  readonly amount: number;
};

/** 그 수량이 몇 칸을 차지하는지. */
export function slotsNeeded(amount: number): number {
  return Math.ceil(amount / CARGO.StackSize);
}

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
  private readonly everSeen: Set<ResourceId> = new Set();
  private totalAmount: number = 0;

  /** 현재 적재량 합계. */
  public get total(): number {
    return this.totalAmount;
  }

  /**
   * 적재 상한.
   *
   * 한 종류만 실었을 때의 최대치다. 여러 광물을 나눠 담으면 칸이 먼저
   * 떨어지므로 실제로 실리는 양은 이보다 적다.
   */
  public get capacity(): number {
    return CARGO.Slots * CARGO.StackSize;
  }

  /** 전체 칸 수. */
  public get slotCount(): number {
    return CARGO.Slots;
  }

  /** 지금 쓰고 있는 칸 수. */
  public get usedSlots(): number {
    let used: number = 0;
    for (const amount of this.amounts.values()) {
      used += slotsNeeded(amount);
    }
    return used;
  }

  /**
   * 화면에 그릴 칸 목록.
   *
   * 넘치는 만큼 칸을 나눈다. 200 개를 실었으면 100 짜리 두 칸이다. 빈 칸은
   * 목록에 넣지 않는다 — 몇 칸이 비었는지는 slotCount 로 알 수 있다.
   */
  public slots(): CargoSlot[] {
    const result: CargoSlot[] = [];
    for (const [resource, amount] of this.amounts) {
      let left: number = amount;
      while (left > 0) {
        const stack: number = Math.min(left, CARGO.StackSize);
        result.push({ resource, amount: stack });
        left -= stack;
      }
    }
    return result;
  }

  /** 화물칸이 가득 찼는지 여부. 칸이 떨어져도 가득 찬 것이다. */
  public get isFull(): boolean {
    return this.freeRoomFor(null) <= 0;
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
    const stored: number = Math.min(amount, this.freeRoomFor(resource));
    if (stored <= 0) {
      return 0;
    }

    this.amounts.set(resource, this.amountOf(resource) + stored);
    this.everSeen.add(resource);
    this.totalAmount += stored;
    return stored;
  }

  /**
   * 지금까지 한 번이라도 담긴 적 있는 자원.
   *
   * 하역해서 비워도 남는다. "주석을 캤다" 같은 목표를 판정하는 데 쓴다.
   */
  public get seenResources(): ReadonlySet<ResourceId> {
    return this.everSeen;
  }

  /**
   * 그 광물을 몇 개까지 더 실을 수 있는지.
   *
   * 이미 쓰고 있는 칸의 남은 자리와, 아직 안 쓴 빈 칸을 합친 값이다. 같은
   * 광물이면 쓰던 칸의 빈자리를 이어서 쓰므로 더 많이 들어간다.
   *
   * @param resource 담으려는 광물. null 이면 가장 유리한 경우를 본다
   */
  private freeRoomFor(resource: ResourceId | null): number {
    const emptySlots: number = CARGO.Slots - this.usedSlots;
    const roomInEmpty: number = emptySlots * CARGO.StackSize;

    if (resource === null) {
      // 어느 광물이든 더 실을 수 있는지만 본다.
      let bestPartial: number = 0;
      for (const amount of this.amounts.values()) {
        const partial: number = (CARGO.StackSize - (amount % CARGO.StackSize)) % CARGO.StackSize;
        bestPartial = Math.max(bestPartial, partial);
      }
      return roomInEmpty + bestPartial;
    }

    const held: number = this.amountOf(resource);
    const partial: number = (CARGO.StackSize - (held % CARGO.StackSize)) % CARGO.StackSize;
    return roomInEmpty + partial;
  }

  /**
   * 그 자원을 본 적 있는 것으로 기록한다.
   *
   * 이어하기 전용이다. 저장에서 되돌릴 때 화물이 비어 있어도 이미 캐본 광물은
   * 캐본 것으로 남아야 목표가 되돌아가지 않는다.
   */
  public markSeen(resource: ResourceId): void {
    this.everSeen.add(resource);
  }

  /** 화물칸을 비운다. 거점에 하역할 때 쓴다. */
  public clear(): void {
    this.amounts.clear();
    this.totalAmount = 0;
  }
}

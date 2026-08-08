import { describe, expect, it } from "vitest";

import { CARGO } from "../constants";

/** 한 종류만 실었을 때의 최대치. */
const MAX_CAPACITY: number = CARGO.Slots * CARGO.StackSize;
import { Cargo } from "./cargo";
import { RESOURCE } from "./minerals";

describe("화물칸", () => {
  it("담은 만큼 합계가 오른다", () => {
    const cargo: Cargo = new Cargo();

    cargo.add(RESOURCE.Copper, 12);
    cargo.add(RESOURCE.Iron, 8);

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(12);
    expect(cargo.amountOf(RESOURCE.Iron)).toBe(8);
    expect(cargo.total).toBe(20);
  });

  it("같은 자원은 누적된다", () => {
    const cargo: Cargo = new Cargo();

    cargo.add(RESOURCE.Copper, 5);
    cargo.add(RESOURCE.Copper, 7);

    expect(cargo.amountOf(RESOURCE.Copper)).toBe(12);
    expect(cargo.entries()).toHaveLength(1);
  });

  it("상한을 넘겨 담으면 남은 공간만큼만 들어간다", () => {
    const cargo: Cargo = new Cargo();

    const stored: number = cargo.add(RESOURCE.Copper, MAX_CAPACITY + 100);

    expect(stored).toBe(MAX_CAPACITY);
    expect(cargo.total).toBe(MAX_CAPACITY);
    expect(cargo.isFull).toBe(true);
  });

  it("가득 찬 뒤에는 아무것도 담기지 않는다", () => {
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, MAX_CAPACITY);

    expect(cargo.add(RESOURCE.Iron, 10)).toBe(0);
    expect(cargo.amountOf(RESOURCE.Iron)).toBe(0);
  });

  it("부광물도 화물 용량을 차지한다", () => {
    const cargo: Cargo = new Cargo();

    cargo.add(RESOURCE.Tin, 3);

    expect(cargo.total).toBe(3);
    expect(cargo.amountOf(RESOURCE.Tin)).toBe(3);
  });

  it("빈 화물칸의 합계는 0이다", () => {
    const cargo: Cargo = new Cargo();

    expect(cargo.total).toBe(0);
    expect(cargo.isFull).toBe(false);
    expect(cargo.entries()).toHaveLength(0);
  });
});

describe("칸", () => {
  it("스택을 넘으면 칸이 나뉜다", () => {
    const cargo: Cargo = new Cargo();

    cargo.add(RESOURCE.Copper, CARGO.StackSize + 20);

    // 화면에는 100 짜리 한 칸과 20 짜리 한 칸으로 보여야 한다.
    expect(cargo.slots()).toHaveLength(2);
    expect(cargo.slots()[0].amount).toBe(CARGO.StackSize);
    expect(cargo.slots()[1].amount).toBe(20);
    expect(cargo.usedSlots).toBe(2);
  });

  it("종류가 많으면 칸이 먼저 떨어진다", () => {
    const cargo: Cargo = new Cargo();

    // 칸마다 하나씩만 넣어도 칸은 다 쓴 것이다.
    for (const mineral of [RESOURCE.Copper, RESOURCE.Tin, RESOURCE.Iron]) {
      cargo.add(mineral, 1);
    }

    expect(cargo.usedSlots).toBe(CARGO.Slots);
    expect(cargo.add(RESOURCE.Nickel, 1)).toBe(0);
  });

  it("쓰던 칸의 빈자리는 같은 광물이 이어서 쓴다", () => {
    const cargo: Cargo = new Cargo();
    for (const mineral of [RESOURCE.Copper, RESOURCE.Tin, RESOURCE.Iron]) {
      cargo.add(mineral, 1);
    }

    // 칸은 다 찼지만 구리 칸에 99 자리가 남아 있다.
    expect(cargo.add(RESOURCE.Copper, 200)).toBe(CARGO.StackSize - 1);
  });

  it("한 종류만 실으면 상한까지 들어간다", () => {
    const cargo: Cargo = new Cargo();

    expect(cargo.add(RESOURCE.Copper, 9999)).toBe(MAX_CAPACITY);
    expect(cargo.isFull).toBe(true);
  });
});

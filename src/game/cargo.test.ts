import { describe, expect, it } from "vitest";

import { CARGO } from "../constants";
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

    const stored: number = cargo.add(RESOURCE.Copper, CARGO.Capacity + 100);

    expect(stored).toBe(CARGO.Capacity);
    expect(cargo.total).toBe(CARGO.Capacity);
    expect(cargo.isFull).toBe(true);
  });

  it("가득 찬 뒤에는 아무것도 담기지 않는다", () => {
    const cargo: Cargo = new Cargo();
    cargo.add(RESOURCE.Copper, CARGO.Capacity);

    expect(cargo.add(RESOURCE.Iron, 10)).toBe(0);
    expect(cargo.amountOf(RESOURCE.Iron)).toBe(0);
  });

  it("보석도 화물 용량을 차지한다", () => {
    const cargo: Cargo = new Cargo();

    cargo.add(RESOURCE.Gem, 3);

    expect(cargo.total).toBe(3);
    expect(cargo.amountOf(RESOURCE.Gem)).toBe(3);
  });

  it("빈 화물칸의 합계는 0이다", () => {
    const cargo: Cargo = new Cargo();

    expect(cargo.total).toBe(0);
    expect(cargo.isFull).toBe(false);
    expect(cargo.entries()).toHaveLength(0);
  });
});

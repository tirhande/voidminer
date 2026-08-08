import { describe, expect, it } from "vitest";

import { ALLOY, RESOURCE, type AlloyId, type MineralId } from "./minerals";
import { OBJECTIVES, ObjectiveTracker, type ObjectiveSnapshot } from "./objectives";

/** 아무것도 하지 않은 시작 상태. */
function initialSnapshot(overrides: Partial<ObjectiveSnapshot> = {}): ObjectiveSnapshot {
  return {
    debrisSpawned: 0,
    cargoTotal: 0,
    cargoCapacity: 260,
    isDocked: false,
    stockOre: 0,
    stockIngots: 0,
    alloyOf: () => 0,
    seenMinerals: new Set<MineralId>(),
    laserTier: 1,
    laserUpgrade: 0,
    systemHasIron: false,
    ...overrides,
  };
}

/** 첫 사이클을 순서대로 밟아 나가는 상태들. */
function progressSnapshots(): ObjectiveSnapshot[] {
  const withTin: Set<MineralId> = new Set([RESOURCE.Copper, RESOURCE.Tin]);
  const withIron: Set<MineralId> = new Set([...withTin, RESOURCE.Iron]);
  const bronze = (alloy: AlloyId): number => (alloy === ALLOY.Bronze ? 1 : 0);

  return [
    initialSnapshot({ debrisSpawned: 1 }),
    initialSnapshot({ debrisSpawned: 3, cargoTotal: 5 }),
    initialSnapshot({ debrisSpawned: 30, cargoTotal: 200 }),
    initialSnapshot({ debrisSpawned: 30, cargoTotal: 200, isDocked: true }),
    initialSnapshot({ isDocked: true, stockIngots: 12 }),
    initialSnapshot({ isDocked: true, stockIngots: 12, laserUpgrade: 3 }),
    initialSnapshot({
      isDocked: true,
      stockIngots: 12,
      laserUpgrade: 3,
      seenMinerals: withTin,
    }),
    initialSnapshot({
      isDocked: true,
      laserUpgrade: 3,
      seenMinerals: withTin,
      alloyOf: bronze,
    }),
    initialSnapshot({ laserTier: 2, seenMinerals: withTin, alloyOf: bronze }),
    // 시작 항성계에는 철이 없다. 워프해야 다음 단계가 열린다.
    initialSnapshot({
      laserTier: 2,
      seenMinerals: withTin,
      alloyOf: bronze,
      systemHasIron: true,
    }),
    initialSnapshot({
      laserTier: 2,
      seenMinerals: withIron,
      alloyOf: bronze,
      systemHasIron: true,
    }),
  ];
}

describe("목표 진행", () => {
  it("시작하면 첫 목표가 채굴이다", () => {
    const tracker: ObjectiveTracker = new ObjectiveTracker();

    const view = tracker.update(initialSnapshot());

    expect(view.isComplete).toBe(false);
    expect(view.completedCount).toBe(0);
    expect(view.text).toBe(OBJECTIVES[0].text);
  });

  it("모든 목표에 조작 안내가 붙어 있다", () => {
    // 조작을 모르는 상태를 전제해야 첫 화면에서 막히지 않는다.
    for (const objective of OBJECTIVES) {
      expect(objective.hint.length).toBeGreaterThan(0);
      expect(objective.text.length).toBeGreaterThan(0);
    }
  });

  it("순서대로 밟으면 끝까지 진행된다", () => {
    const tracker: ObjectiveTracker = new ObjectiveTracker();
    const snapshots: ObjectiveSnapshot[] = progressSnapshots();

    let view = tracker.update(initialSnapshot());
    expect(view.completedCount).toBe(0);

    for (let step = 0; step < snapshots.length; step += 1) {
      view = tracker.update(snapshots[step]);
      expect(view.completedCount).toBeGreaterThanOrEqual(step + 1);
    }

    expect(view.isComplete).toBe(true);
    expect(view.completedCount).toBe(OBJECTIVES.length);
  });

  it("한 번 끝낸 목표로 되돌아가지 않는다", () => {
    const tracker: ObjectiveTracker = new ObjectiveTracker();

    tracker.update(initialSnapshot({ debrisSpawned: 5, cargoTotal: 200 }));
    const advanced = tracker.update(initialSnapshot({ debrisSpawned: 5, cargoTotal: 200 }));

    // 하역해서 화물이 비어도 진행이 되돌아가면 안내가 아니라 방해가 된다.
    const afterUnload = tracker.update(initialSnapshot({ debrisSpawned: 5, cargoTotal: 0 }));

    expect(afterUnload.completedCount).toBe(advanced.completedCount);
  });

  it("여러 목표를 한 번에 만족시키면 한 프레임에 다 넘어간다", () => {
    const tracker: ObjectiveTracker = new ObjectiveTracker();

    const view = tracker.update(
      initialSnapshot({ debrisSpawned: 10, cargoTotal: 200, isDocked: true }),
    );

    // 채굴·회수·적재·도킹이 한꺼번에 충족된 경우다.
    expect(view.completedCount).toBe(4);
  });

  it("티어를 올렸으면 강화 목표를 건너뛴다", () => {
    const tracker: ObjectiveTracker = new ObjectiveTracker();

    const view = tracker.update(
      initialSnapshot({
        debrisSpawned: 10,
        cargoTotal: 200,
        isDocked: true,
        stockIngots: 5,
        laserTier: 2,
      }),
    );

    // T2 를 이미 만들었다면 강화 3 을 다시 요구하는 것은 뒤로 가는 안내다.
    expect(view.text).not.toBe("채굴 레이저를 강화 3 까지 올린다");
  });
});

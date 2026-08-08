import { ALLOY, RESOURCE, type AlloyId, type MineralId } from "./minerals";

/**
 * 목표 판정에 쓰는 게임 상태 요약.
 *
 * 목표 로직이 게임 객체를 직접 붙들지 않게 하려고 값만 추린다. 이러면 판정을
 * 화면 없이 그대로 시험할 수 있다.
 */
export type ObjectiveSnapshot = {
  /** 지금까지 만든 파편 총수 */
  readonly debrisSpawned: number;
  /** 화물칸 적재량 */
  readonly cargoTotal: number;
  /** 화물칸 상한 */
  readonly cargoCapacity: number;
  /** 거점 도킹 중인지 */
  readonly isDocked: boolean;
  /** 거점 저장고의 광석 총량 */
  readonly stockOre: number;
  /** 거점 저장고의 주괴 총수 */
  readonly stockIngots: number;
  /** 특정 합금 보유량 */
  readonly alloyOf: (alloy: AlloyId) => number;
  /** 지금까지 한 번이라도 손에 넣은 광물 */
  readonly seenMinerals: ReadonlySet<MineralId>;
  readonly laserTier: number;
  readonly laserUpgrade: number;
  /**
   * 지금 있는 항성계에서 철이 나오는지.
   *
   * 광물은 항성계마다 다르므로 (GDD 05) 시작 항성계에서는 아무리 캐도 철이
   * 안 나온다. 목록을 열어볼 이유가 안내에 없으면 여기서 막힌다.
   */
  readonly systemHasIron: boolean;
};

/** 목표 하나. */
export type Objective = {
  readonly id: string;
  /** 무엇을 하라는 한 줄 */
  readonly text: string;
  /** 어떻게 하는지 한 줄. 조작을 모르는 상태를 전제한다 */
  readonly hint: string;
  readonly isComplete: (snapshot: ObjectiveSnapshot) => boolean;
};

/**
 * 첫 사이클을 안내하는 목표 목록.
 *
 * 별도의 연습 구간을 만들지 않는다. 이 순서가 곧 게임의 핵심 루프이므로,
 * 따라오다 보면 캐고 만들어 더 좋은 것을 캐는 한 바퀴를 그대로 돈다.
 *
 * 특히 잠금은 설명하지 않으면 고장으로 읽힌다. 빔이 붉게 튕기는 것을 미리
 * 알려주는 것이 아니라, 강화를 목표로 제시해 자연스럽게 겪게 한다.
 */
export const OBJECTIVES: ReadonlyArray<Objective> = [
  {
    id: "MINE",
    text: "소행성을 채굴한다",
    hint: "작은 소행성에 조준점을 맞추고 좌클릭을 유지한다",
    isComplete: (snapshot) => snapshot.debrisSpawned > 0,
  },
  {
    id: "COLLECT",
    text: "떨어진 파편을 회수한다",
    hint: "파편 가까이에서 우클릭을 유지한다",
    isComplete: (snapshot) => snapshot.cargoTotal > 0,
  },
  {
    id: "FILL",
    text: "화물칸을 채운다",
    hint: "한 소행성을 끝까지 캐면 사라진다",
    isComplete: (snapshot) => snapshot.cargoTotal >= snapshot.cargoCapacity * 0.5,
  },
  {
    id: "DOCK",
    text: "거점으로 돌아가 도킹한다",
    hint: "좌측 상단 STATION 거리를 보고 접근한 뒤 F 를 누른다",
    isComplete: (snapshot) => snapshot.isDocked,
  },
  {
    id: "UNLOAD",
    text: "화물을 하역하고 제련한다",
    hint: "거점 화면에서 하역을 누르고 전부 제련을 누른다",
    isComplete: (snapshot) => snapshot.stockIngots > 0,
  },
  {
    id: "UPGRADE",
    text: "채굴 레이저를 강화 3 까지 올린다",
    hint: "남은 광석을 팔아 크레딧을 만들고 레이저 강화를 누른다",
    isComplete: (snapshot) => snapshot.laserTier > 1 || snapshot.laserUpgrade >= 3,
  },
  {
    id: "PAIR",
    text: "주석을 캔다",
    hint: "강화 3 이 주석 잠금을 풀었다. 구리 소행성에서도 가끔 섞여 나온다",
    isComplete: (snapshot) => snapshot.seenMinerals.has(RESOURCE.Tin),
  },
  {
    id: "ALLOY",
    text: "청동을 만든다",
    hint: "구리 주괴 3 과 주석 주괴 1 을 모아 거점에서 전부 합금을 누른다",
    isComplete: (snapshot) => snapshot.alloyOf(ALLOY.Bronze) > 0 || snapshot.laserTier > 1,
  },
  {
    id: "TIER",
    text: "청동으로 T2 레이저를 제작한다",
    hint: "거점에서 레이저 제작을 누른다. 철을 캘 수 있게 된다",
    isComplete: (snapshot) => snapshot.laserTier >= 2,
  },
  {
    id: "WARP",
    text: "철이 나오는 항성계로 워프한다",
    hint: "시작 항성계에는 철이 없다. 거점 화면 아래 항성계 목록에서 고른다",
    isComplete: (snapshot) => snapshot.systemHasIron,
  },
  {
    id: "IRON",
    text: "철을 캔다",
    hint: "중간 크기 소행성이 철이다. 크기가 곧 광물의 단서다",
    isComplete: (snapshot) => snapshot.seenMinerals.has(RESOURCE.Iron),
  },
];

/** HUD 에 띄울 목표 상태. */
export type ObjectiveView = {
  /** 모든 목표를 끝냈는지 */
  readonly isComplete: boolean;
  /** 현재 목표. 다 끝냈으면 null */
  readonly text: string | null;
  readonly hint: string | null;
  /** 지금까지 끝낸 수 */
  readonly completedCount: number;
  readonly totalCount: number;
};

/**
 * 목표 진행을 추적한다.
 *
 * 한 번 끝낸 목표로는 돌아가지 않는다. 화물을 비운다고 "화물칸을 채운다"가
 * 다시 살아나면 안내가 아니라 방해가 된다.
 */
export class ObjectiveTracker {
  private index: number = 0;

  /** 한 프레임분 진행을 판정한다. */
  public update(snapshot: ObjectiveSnapshot): ObjectiveView {
    // 여러 목표를 한 번에 만족시켰을 수 있으므로 더 나아갈 수 없을 때까지 민다.
    while (this.index < OBJECTIVES.length && OBJECTIVES[this.index].isComplete(snapshot)) {
      this.index += 1;
    }

    const current: Objective | undefined = OBJECTIVES[this.index];
    return {
      isComplete: current === undefined,
      text: current?.text ?? null,
      hint: current?.hint ?? null,
      completedCount: this.index,
      totalCount: OBJECTIVES.length,
    };
  }
}

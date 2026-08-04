import { describe, expect, it } from "vitest";

import { MINERAL_DEFINITIONS, RESOURCE, resourceColor } from "./game/minerals";
import { PALETTE, POST_PROCESSING } from "./palette";

/** 두 색의 채널별 차이를 합한다. 값이 작을수록 눈으로 구분하기 어렵다. */
function channelDistance(first: number, second: number): number {
  const firstChannels: number[] = [
    (first >> 16) & 0xff,
    (first >> 8) & 0xff,
    first & 0xff,
  ];
  const secondChannels: number[] = [
    (second >> 16) & 0xff,
    (second >> 8) & 0xff,
    second & 0xff,
  ];

  return firstChannels.reduce(
    (total, value, index) => total + Math.abs(value - secondChannels[index]),
    0,
  );
}

describe("팔레트", () => {
  it("자원색은 서로 구분된다", () => {
    const resources = [RESOURCE.Copper, RESOURCE.Iron, RESOURCE.Titanium, RESOURCE.Gem];

    for (let first = 0; first < resources.length; first += 1) {
      for (let second = first + 1; second < resources.length; second += 1) {
        const distance: number = channelDistance(
          resourceColor(resources[first]),
          resourceColor(resources[second]),
        );
        // 정보색이므로 한눈에 갈려야 한다.
        expect(distance).toBeGreaterThan(60);
      }
    }
  });

  it("작동색과 막힘색이 충분히 다르다", () => {
    // 색이 1차 신호이므로 이 둘이 비슷하면 잠금 표시가 무너진다 (GDD 07).
    expect(channelDistance(PALETTE.Active, PALETTE.Locked)).toBeGreaterThan(80);
  });

  it("배경은 완전한 검정이 아니다", () => {
    expect(PALETTE.Void).toBeGreaterThan(0);
  });

  it("광물 정의가 팔레트 색을 그대로 쓴다", () => {
    expect(MINERAL_DEFINITIONS[RESOURCE.Copper].color).toBe(PALETTE.Copper);
    expect(MINERAL_DEFINITIONS[RESOURCE.Iron].color).toBe(PALETTE.Iron);
    expect(MINERAL_DEFINITIONS[RESOURCE.Titanium].color).toBe(PALETTE.Titanium);
  });
});

describe("후처리 설정", () => {
  it("블룸 임계값이 0과 1 사이다", () => {
    // 0 에 가까우면 화면 전체가 번져 흐려진다.
    expect(POST_PROCESSING.BloomThreshold).toBeGreaterThan(0);
    expect(POST_PROCESSING.BloomThreshold).toBeLessThan(1);
  });

  it("톤 매핑 노출이 1 이상이다", () => {
    // ACES 톤 매핑은 전체를 어둡게 만들므로 노출로 되돌려야 한다.
    expect(POST_PROCESSING.ToneMappingExposure).toBeGreaterThanOrEqual(1);
  });
});

import { describe, expect, it } from "vitest";

import { MINERAL_DEFINITIONS, RESOURCE, resourceColor } from "./game/minerals";
import { EMISSION, PALETTE, POST_PROCESSING, SURFACE } from "./palette";

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
  it("주광물 넷은 서로 구분된다", () => {
    const primaries = [
      RESOURCE.Copper,
      RESOURCE.Iron,
      RESOURCE.Titanium,
      RESOURCE.Iridium,
    ];

    for (let first = 0; first < primaries.length; first += 1) {
      for (let second = first + 1; second < primaries.length; second += 1) {
        const distance: number = channelDistance(
          resourceColor(primaries[first]),
          resourceColor(primaries[second]),
        );
        // 어느 집안인지가 한눈에 갈려야 한다.
        expect(distance).toBeGreaterThan(60);
      }
    }
  });

  it("짝인 광물은 주광물과 구분된다", () => {
    for (const mineral of Object.values(MINERAL_DEFINITIONS)) {
      const distance: number = channelDistance(
        mineral.color,
        MINERAL_DEFINITIONS[mineral.pair].color,
      );
      // 같은 계열이되 주광물인지 부광물인지는 갈려야 한다.
      expect(distance).toBeGreaterThan(60);
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

  it("톤 매핑 노출이 어두운 화면 범위 안에 있다", () => {
    // 우주는 어두운 것이 기본이다. 1 을 넘기면 발광체가 아닌 표면까지 밝아져
    // 반사 하이라이트가 눈에 부담이 된다.
    expect(POST_PROCESSING.ToneMappingExposure).toBeGreaterThan(0);
    expect(POST_PROCESSING.ToneMappingExposure).toBeLessThanOrEqual(1);
  });
});

describe("재질과 발광", () => {
  it("금속성이 낮게 유지된다", () => {
    // 환경 맵이 없는 장면에서 금속성을 올리면 반사 하이라이트가 좁고 강해져
    // 점처럼 탄다. 여기에 블룸이 얹히면 눈이 아프다.
    expect(SURFACE.HullMetalness).toBeLessThan(0.3);
    expect(SURFACE.RockMetalness).toBeLessThan(0.3);
  });

  it("거칠기가 높아 하이라이트가 넓게 퍼진다", () => {
    expect(SURFACE.HullRoughness).toBeGreaterThan(0.6);
    expect(SURFACE.RockRoughness).toBeGreaterThan(0.6);
  });

  it("자체 발광이 과하지 않다", () => {
    // 블룸이 이 값을 그대로 증폭하므로 조금만 올려도 크게 번진다.
    for (const value of Object.values(EMISSION)) {
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

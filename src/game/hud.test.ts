import { describe, expect, it } from "vitest";

import { buildFlightInput } from "../test-support/flight-input-fixture";
import { describeThrottle } from "./hud";

describe("describeThrottle", () => {
  it("입력이 없으면 IDLE 이다", () => {
    expect(describeThrottle(buildFlightInput())).toBe("IDLE");
  });

  it("전진 추력은 FWD 다", () => {
    expect(describeThrottle(buildFlightInput({ thrust: 1 }))).toBe("FWD");
  });

  it("부스트를 함께 쓰면 BOOST 다", () => {
    expect(describeThrottle(buildFlightInput({ thrust: 1, isBoosting: true }))).toBe("BOOST");
  });

  it("후진 추력은 REV 다", () => {
    expect(describeThrottle(buildFlightInput({ thrust: -1 }))).toBe("REV");
  });

  it("후진 중에는 부스트 여부와 무관하게 REV 다", () => {
    expect(describeThrottle(buildFlightInput({ thrust: -1, isBoosting: true }))).toBe("REV");
  });

  it("주추력 없이 스트레이프만 쓰면 RCS 다", () => {
    expect(describeThrottle(buildFlightInput({ strafe: 1 }))).toBe("RCS");
    expect(describeThrottle(buildFlightInput({ lift: -1 }))).toBe("RCS");
  });

  it("주추력이 있으면 스트레이프보다 주추력 표시가 우선한다", () => {
    expect(describeThrottle(buildFlightInput({ thrust: 1, strafe: 1 }))).toBe("FWD");
  });
});

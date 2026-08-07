import { describe, expect, it } from "vitest";

import { FLIGHT_KEYS, KEY_BINDING } from "./controls";

describe("조작 키 배치", () => {
  it("도킹 키가 비행 키와 겹치지 않는다", () => {
    // 한때 E 가 롤과 도킹에 동시에 걸려 있어서 거점 근처에서 롤을 넣으면
    // 도킹까지 됐다. 같은 일이 다시 생기면 여기서 걸린다.
    expect(FLIGHT_KEYS).not.toContain(KEY_BINDING.Dock);
  });

  it("같은 키가 두 조작에 걸려 있지 않다", () => {
    const assigned: string[] = Object.values(KEY_BINDING);

    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("GDD 09 가 정한 배치를 따른다", () => {
    expect(KEY_BINDING.LiftUp).toBe("Space");
    expect(KEY_BINDING.LiftDown).toBe("KeyC");
    expect(KEY_BINDING.RollLeft).toBe("KeyQ");
    expect(KEY_BINDING.RollRight).toBe("KeyE");
    expect(KEY_BINDING.Dock).toBe("KeyF");
  });
});

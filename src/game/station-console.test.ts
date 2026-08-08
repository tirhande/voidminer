import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STATION } from "../constants";
import { Cargo } from "./cargo";
import { ShipEquipment } from "./equipment";
import { RESOURCE } from "./minerals";
import { Station } from "./station";
import {
  StationConsole,
  type StationCell,
  type StationView,
} from "./station-console";
import { StationStock } from "./station-stock";
import { buildFlightInput } from "../test-support/flight-input-fixture";

/** 시험용 한 벌을 만든다. */
function buildSetup(): {
  console: StationConsole;
  station: Station;
  cargo: Cargo;
  stock: StationStock;
  equipment: ShipEquipment;
  docked: THREE.Vector3;
  faraway: THREE.Vector3;
} {
  const station: Station = new Station(new THREE.Vector3());
  return {
    console: new StationConsole(),
    station,
    cargo: new Cargo(),
    stock: new StationStock(),
    equipment: new ShipEquipment(),
    // 도킹 판정은 구조물 중심이 아니라 계류 팔 끝에서 잰다.
    docked: station.dockPoint.clone(),
    faraway: station.dockPoint.clone().add(new THREE.Vector3(0, 0, STATION.DockRange * 4)),
  };
}

/** 한 프레임 굴린다. */
function step(
  setup: ReturnType<typeof buildSetup>,
  position: THREE.Vector3,
  pressed: string[] = [],
): StationView {
  return setup.console.update(
    buildFlightInput({ pressedOnce: new Set(pressed) }),
    position,
    setup.station,
    setup.cargo,
    setup.stock,
    setup.equipment,
  );
}

/** 격자에서 칸 하나를 찾는다. */
function findCell(view: StationView, key: string): StationCell {
  const found: StationCell | undefined = [...view.storage, ...view.equipment].find(
    (cell) => cell.key === key,
  );
  if (found === undefined) {
    throw new Error(`${key} 칸을 찾지 못했다`);
  }
  return found;
}

describe("도킹", () => {
  it("범위 밖에서는 안내가 뜨지 않는다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.faraway);

    expect(view.isDockPromptVisible).toBe(false);
    expect(view.isDocked).toBe(false);
  });

  it("범위 안에 들어오면 안내가 뜬다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(view.isDockPromptVisible).toBe(true);
    expect(view.isDocked).toBe(false);
  });

  it("F 로 도킹하고 다시 눌러 나온다", () => {
    const setup = buildSetup();

    expect(step(setup, setup.docked, ["KeyF"]).isDocked).toBe(true);
    expect(step(setup, setup.docked, ["KeyF"]).isDocked).toBe(false);
  });

  it("범위 밖에서는 도킹되지 않는다", () => {
    const setup = buildSetup();

    expect(step(setup, setup.faraway, ["KeyF"]).isDocked).toBe(false);
  });

  it("도킹 해제 버튼으로도 나올 수 있다", () => {
    const setup = buildSetup();
    step(setup, setup.docked, ["KeyF"]);

    setup.console.execute({ kind: "UNDOCK" }, setup.cargo, setup.stock, setup.equipment);

    expect(setup.console.isDocked).toBe(false);
  });
});

describe("거점 조작", () => {
  it("하역하면 화물이 저장고로 옮겨진다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);

    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    expect(setup.cargo.total).toBe(0);
    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(40);
  });

  it("광물마다 따로 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.cargo.add(RESOURCE.Tin, 12);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    setup.console.execute(
      { kind: "SELL_ORE", mineral: RESOURCE.Copper, amount: Number.POSITIVE_INFINITY },
      setup.cargo,
      setup.stock,
      setup.equipment,
    );

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.oreOf(RESOURCE.Tin)).toBe(12);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("주괴도 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);
    expect(setup.stock.ingotsOf(RESOURCE.Copper)).toBeGreaterThan(0);

    setup.console.execute(
      { kind: "SELL_INGOTS", mineral: RESOURCE.Copper, amount: Number.POSITIVE_INFINITY },
      setup.cargo,
      setup.stock,
      setup.equipment,
    );

    expect(setup.stock.ingotsOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("작업 결과가 항상 한 줄로 남는다", () => {
    const setup = buildSetup();

    // 눌렀는데 아무 반응이 없으면 고장으로 보인다.
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    const view = step(setup, setup.docked);

    expect(view.message.length).toBeGreaterThan(0);
  });
});

describe("거점 화면", () => {
  it("칸 수와 자리가 항상 같다", () => {
    // 없는 것을 감추면 남은 칸이 앞으로 밀려 같은 광물이 매번 다른 자리에
    // 놓인다. 그러면 격자가 아니라 목록이다.
    const setup = buildSetup();
    const before = step(setup, setup.docked).storage.map((cell) => cell.key);

    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    const after = step(setup, setup.docked).storage.map((cell) => cell.key);

    expect(after).toEqual(before);
  });

  it("보유량이 칸에 적힌다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);

    expect(cell.badge).toBe("20");
    expect(cell.isEmpty).toBe(false);
  });

  it("빈 칸은 무엇이 필요한지 알려준다", () => {
    // 없는 것을 비워만 두면 왜 없는지 알 길이 없다.
    const setup = buildSetup();

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Iridium}`);

    expect(cell.isEmpty).toBe(true);
    expect(cell.badge).toBe("");
    expect(cell.detail).toContain("T6");
    expect(cell.actions).toHaveLength(0);
  });

  it("광석과 주괴가 같은 격자에 놓인다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);

    // 종류마다 열을 따로 두면 결국 오가야 한다 (GDD 09).
    expect(
      view.storage.some((cell) => cell.kind === "INGOT" && !cell.isEmpty),
    ).toBe(true);
  });

  it("칸을 고르면 거기서 팔 수 있다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 20);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);
    const sell = cell.actions.find((button) => button.action.kind === "SELL_ORE");
    expect(sell).toBeDefined();
    setup.console.execute(sell!.action, setup.cargo, setup.stock, setup.equipment);

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(0);
    expect(setup.stock.credits).toBeGreaterThan(0);
  });

  it("합금은 팔 수 없다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 200);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.cargo.add(RESOURCE.Tin, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "SMELT_ALL" }, setup.cargo, setup.stock, setup.equipment);
    setup.console.execute({ kind: "ALLOY_ALL" }, setup.cargo, setup.stock, setup.equipment);

    const view = step(setup, setup.docked);
    const alloys = view.storage.filter(
      (cell) => cell.kind === "ALLOY" && !cell.isEmpty,
    );

    // 제작 재료다. 팔 수 있으면 다음 티어로 가는 길이 끊긴다.
    expect(alloys.length).toBeGreaterThan(0);
    for (const cell of alloys) {
      expect(cell.actions.some((button) => button.action.kind.startsWith("SELL"))).toBe(
        false,
      );
    }
  });

  it("장비 칸은 이름을 줄이지 않는다", () => {
    // 광물은 스무 개를 정사각 칸에 늘어놓느라 첫 글자만 쓴다. 장비는 둘뿐이라
    // 줄이면 무엇인지 알아볼 수 없다.
    const setup = buildSetup();
    const view = step(setup, setup.docked);

    for (const cell of view.equipment) {
      expect(cell.short).toBe(cell.name);
    }
  });

  it("장비 칸에 지금 등급이 적힌다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(findCell(view, "equipment:laser").badge).toBe("T1+0");
    expect(findCell(view, "equipment:tractor").badge).toContain("T1");
  });

  it("재료가 모자라면 버튼이 눌리지 않는 상태로 보인다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    // 감추지 않고 흐리게 둔다. 무엇이 필요한지 읽혀야 한다.
    for (const cell of view.equipment) {
      for (const button of cell.actions) {
        expect(button.isAvailable).toBe(false);
        expect(button.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("항성계 목록에 지금 있는 곳이 표시된다", () => {
    const setup = buildSetup();

    const view = step(setup, setup.docked);

    expect(view.systems.filter((row) => row.isCurrent)).toHaveLength(1);
    expect(view.systemLabel.length).toBeGreaterThan(0);
  });

  it("고른 수량만큼만 판다", () => {
    // 전부만 있으면 조절할 방법이 없다. 크레딧이 조금 모자랄 때 구리를 좀
    // 팔고 싶어도 팔면 다음 티어에 쓸 것까지 날아간다.
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 100);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    setup.console.setQuantity(10);
    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);
    const sell = cell.actions.find((button) => button.action.kind === "SELL_ORE");
    setup.console.execute(sell!.action, setup.cargo, setup.stock, setup.equipment);

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(90);
  });

  it("제련 수량은 만들 주괴 수로 센다", () => {
    // 목적이 "주괴 열 개" 이지 "광석 마흔 개" 가 아니다.
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 100);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    setup.console.setQuantity(5);
    const cell = findCell(step(setup, setup.docked), `ingot:${RESOURCE.Copper}`);
    const smelt = cell.actions.find((button) => button.action.kind === "SMELT");
    setup.console.execute(smelt!.action, setup.cargo, setup.stock, setup.equipment);

    expect(setup.stock.ingotsOf(RESOURCE.Copper)).toBe(5);
    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(100 - 5 * 4);
  });

  it("가진 것보다 많이 고르면 있는 만큼만 처리한다", () => {
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 12);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);

    setup.console.setQuantity(100);
    const cell = findCell(step(setup, setup.docked), `ore:${RESOURCE.Copper}`);
    const sell = cell.actions.find((button) => button.action.kind === "SELL_ORE");
    setup.console.execute(sell!.action, setup.cargo, setup.stock, setup.equipment);

    expect(setup.stock.oreOf(RESOURCE.Copper)).toBe(0);
  });

  it("수량은 한 번 고르면 유지된다", () => {
    const setup = buildSetup();

    setup.console.setQuantity(10);

    expect(step(setup, setup.docked).quantity).toBe(10);
    expect(step(setup, setup.docked).quantity).toBe(10);
  });
});

describe("칸 아이콘", () => {
  it("광석과 주괴가 아이콘을 나눠 갖는다", () => {
    // 같은 광물이라도 캐낸 것과 녹인 것이 다르게 생겼다. 같은 열쇠를 쓰면
    // 저장고에서 광석과 주괴가 같은 그림으로 보인다.
    const setup = buildSetup();
    const view = step(setup, setup.docked);

    const ore = view.storage.find((cell) => cell.key === `ore:${RESOURCE.Copper}`);
    const ingot = view.storage.find((cell) => cell.key === `ingot:${RESOURCE.Copper}`);

    expect(ore?.iconKey).not.toBe(ingot?.iconKey);
  });

  it("모든 저장고 칸에 아이콘 열쇠가 있다", () => {
    const setup = buildSetup();

    for (const cell of step(setup, setup.docked).storage) {
      expect(cell.iconKey.length).toBeGreaterThan(0);
    }
  });

  it("만드는 일은 만들어지는 것의 칸에 있다", () => {
    // 합금은 합금 칸에서 만든다. 주괴도 주괴 칸에서 만드는 것이 맞다.
    // 광석 칸에 제련을 두면 같은 격자에서 규칙이 둘이 된다.
    const setup = buildSetup();
    setup.cargo.add(RESOURCE.Copper, 40);
    setup.console.execute({ kind: "UNLOAD" }, setup.cargo, setup.stock, setup.equipment);
    const view = step(setup, setup.docked);

    const ore = findCell(view, `ore:${RESOURCE.Copper}`);
    const ingot = findCell(view, `ingot:${RESOURCE.Copper}`);

    expect(ore.actions.some((button) => button.action.kind === "SMELT")).toBe(false);
    expect(ingot.actions.some((button) => button.action.kind === "SMELT")).toBe(true);
  });

  it("장비 칸은 수량을 묻지 않는다", () => {
    // 장비는 한 번에 한 단계씩만 올라간다. 수량을 물으면 무엇에 대한 숫자인지
    // 알 수 없다.
    const setup = buildSetup();
    const view = step(setup, setup.docked);

    for (const cell of view.equipment) {
      expect(cell.usesQuantity).toBe(false);
    }
    for (const cell of view.storage) {
      expect(cell.usesQuantity).toBe(true);
    }
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import * as THREE_NS from "three";

import { Asteroid } from "./asteroid";
import {
  MINERAL_DEFINITIONS,
  RESOURCE,
  sizeForMineral,
  type MineralId,
} from "./minerals";

/** 시험용 소행성 하나를 만든다. */
function buildAsteroid(mineral: MineralId = RESOURCE.Copper): Asteroid {
  return new Asteroid(MINERAL_DEFINITIONS[mineral], new THREE.Vector3(0, 0, -50), 1234);
}

describe("소행성 채굴", () => {
  it("요청한 만큼 캐지고 매장량이 그만큼 준다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const before: number = asteroid.remaining;

    const mined: number = asteroid.mine(10);

    expect(mined).toBe(10);
    expect(asteroid.remaining).toBe(before - 10);
  });

  it("캔 만큼은 반드시 나온다 — 헛수고가 없다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const total: number = sizeForMineral(RESOURCE.Copper).mineralAmount;

    let totalMined: number = 0;
    for (let step = 0; step < total + 50; step += 1) {
      totalMined += asteroid.mine(1);
    }

    expect(totalMined).toBe(total);
  });

  it("남은 양보다 많이 요청하면 남은 만큼만 준다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const total: number = asteroid.remaining;

    const mined: number = asteroid.mine(total + 500);

    expect(mined).toBe(total);
    expect(asteroid.remaining).toBe(0);
  });

  it("다 캐면 고갈 상태가 되고 더 나오지 않는다", () => {
    const asteroid: Asteroid = buildAsteroid();

    expect(asteroid.isDepleted).toBe(false);
    asteroid.mine(asteroid.remaining);

    expect(asteroid.isDepleted).toBe(true);
    expect(asteroid.mine(50)).toBe(0);
  });

  it("캘수록 눈에 띄게 작아진다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const initialScale: number = asteroid.object3D.scale.x;

    asteroid.mine(asteroid.remaining * 0.5);

    expect(asteroid.object3D.scale.x).toBeLessThan(initialScale);
  });

  it("상위 광물일수록 소행성이 크고 매장량이 많다 — 크기가 티어의 단서다", () => {
    const ordered: MineralId[] = [
      RESOURCE.Copper,
      RESOURCE.Iron,
      RESOURCE.Titanium,
      RESOURCE.Iridium,
    ];

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = sizeForMineral(ordered[index - 1]);
      const current = sizeForMineral(ordered[index]);
      expect(current.radius).toBeGreaterThan(previous.radius);
      expect(current.mineralAmount).toBeGreaterThan(previous.mineralAmount);
    }
  });

  it("외부 모델이 있으면 그것으로 만들고 개체마다 모양이 다르다", () => {
    // 모델을 하나만 받아도 소행성이 전부 같아 보이면 안 된다.
    const source: THREE_NS.BufferGeometry = new THREE_NS.IcosahedronGeometry(1, 1);
    const first = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      11,
      source,
    );
    const second = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      99,
      source,
    );

    const firstPositions = first.object3D.geometry.getAttribute("position").array;
    const secondPositions = second.object3D.geometry.getAttribute("position").array;

    expect(firstPositions.length).toBe(secondPositions.length);
    let differs = false;
    for (let index = 0; index < firstPositions.length; index += 1) {
      if (Math.abs(firstPositions[index] - secondPositions[index]) > 1e-4) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("모델이 없으면 절차 생성으로 만들어진다", () => {
    const asteroid = buildAsteroid();

    // 파일이 없는 상태에서도 게임이 돌아가야 한다.
    expect(asteroid.object3D.geometry.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("짝인 광물은 주광물과 같은 크기 등급에 놓인다", () => {
    expect(sizeForMineral(RESOURCE.Tin).size).toBe(sizeForMineral(RESOURCE.Copper).size);
    expect(sizeForMineral(RESOURCE.Nickel).size).toBe(sizeForMineral(RESOURCE.Iron).size);
    expect(sizeForMineral(RESOURCE.Aluminum).size).toBe(
      sizeForMineral(RESOURCE.Titanium).size,
    );
    expect(sizeForMineral(RESOURCE.Platinum).size).toBe(
      sizeForMineral(RESOURCE.Iridium).size,
    );
  });
});

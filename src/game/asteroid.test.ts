import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { Asteroid } from "./asteroid";
import {
  ASTEROID_SIZE,
  ASTEROID_SIZE_DEFINITIONS,
  MINERAL_DEFINITIONS,
  RESOURCE,
  type AsteroidSize,
} from "./minerals";

/** 시험용 소행성 하나를 만든다. */
function buildAsteroid(size: AsteroidSize = ASTEROID_SIZE.Small): Asteroid {
  const definition = ASTEROID_SIZE_DEFINITIONS[size];
  return new Asteroid(
    definition,
    MINERAL_DEFINITIONS[definition.mineral],
    new THREE.Vector3(0, 0, -50),
    1234,
  );
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

    let totalMined: number = 0;
    for (let step = 0; step < 200; step += 1) {
      totalMined += asteroid.mine(1);
    }

    // 매장량 전부가 손실 없이 산출된다.
    expect(totalMined).toBe(ASTEROID_SIZE_DEFINITIONS[ASTEROID_SIZE.Small].mineralAmount);
  });

  it("남은 양보다 많이 요청하면 남은 만큼만 준다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const total: number = asteroid.remaining;

    const mined: number = asteroid.mine(total + 500);

    expect(mined).toBe(total);
    expect(asteroid.remaining).toBe(0);
  });

  it("다 캐면 고갈 상태가 된다", () => {
    const asteroid: Asteroid = buildAsteroid();

    expect(asteroid.isDepleted).toBe(false);
    asteroid.mine(asteroid.remaining);
    expect(asteroid.isDepleted).toBe(true);
  });

  it("고갈된 뒤에는 아무것도 나오지 않는다", () => {
    const asteroid: Asteroid = buildAsteroid();
    asteroid.mine(asteroid.remaining);

    expect(asteroid.mine(50)).toBe(0);
  });

  it("캘수록 눈에 띄게 작아진다", () => {
    const asteroid: Asteroid = buildAsteroid();
    const initialScale: number = asteroid.object3D.scale.x;

    asteroid.mine(asteroid.remaining * 0.5);

    expect(asteroid.object3D.scale.x).toBeLessThan(initialScale);
  });

  it("크기 등급이 클수록 상위 광물과 더 많은 매장량을 가진다", () => {
    const small: Asteroid = buildAsteroid(ASTEROID_SIZE.Small);
    const large: Asteroid = buildAsteroid(ASTEROID_SIZE.Large);

    expect(large.remaining).toBeGreaterThan(small.remaining);
    expect(large.mineral.tier).toBeGreaterThan(small.mineral.tier);
    expect(large.radius).toBeGreaterThan(small.radius);
  });

  it("크기 등급과 광물이 문서대로 대응한다", () => {
    expect(ASTEROID_SIZE_DEFINITIONS[ASTEROID_SIZE.Small].mineral).toBe(RESOURCE.Copper);
    expect(ASTEROID_SIZE_DEFINITIONS[ASTEROID_SIZE.Medium].mineral).toBe(RESOURCE.Iron);
    expect(ASTEROID_SIZE_DEFINITIONS[ASTEROID_SIZE.Large].mineral).toBe(RESOURCE.Titanium);
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { Asteroid } from "./asteroid";
import {
  MINERAL_DEFINITIONS,
  RESOURCE,
  sizeForMineral,
  type MineralId,
} from "./minerals";

/** 소행성의 모든 정점을 한 배열로 모은다. */
function collectVertices(asteroid: Asteroid): number[] {
  const values: number[] = [];
  asteroid.object3D.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const position = child.geometry.getAttribute("position");
      for (let index = 0; index < position.array.length; index += 1) {
        values.push(Number(position.array[index].toFixed(4)));
      }
    }
  });
  return values;
}

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
    // 광물마다 모델이 하나뿐이라 그대로 쓰면 같은 광물이 전부 같아 보인다.
    const model: THREE.Object3D = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2));
    const first = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      11,
      model,
    );
    const second = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      99,
      model,
    );

    expect(collectVertices(first).length).toBe(collectVertices(second).length);
    expect(collectVertices(first)).not.toEqual(collectVertices(second));
  });

  it("모델을 쓰면 원본 재질을 그대로 유지한다", () => {
    // 만든 대로 보여야 한다. 색을 덮으면 광맥과 바위 대비가 죽는다.
    const material: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: 0x123456,
      metalness: 0.9,
    });
    const model: THREE.Object3D = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      material,
    );

    const asteroid = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      5,
      model,
    );

    const found: THREE.MeshStandardMaterial[] = [];
    asteroid.object3D.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        found.push(child.material as THREE.MeshStandardMaterial);
      }
    });

    expect(found).toHaveLength(1);
    expect(found[0].color.getHex()).toBe(0x123456);
    expect(found[0].metalness).toBe(0.9);
  });

  it("모델을 써도 크기 등급에 맞춰 커진다", () => {
    const model: THREE.Object3D = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1));

    const small = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      1,
      model,
    );
    const huge = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Iridium],
      new THREE.Vector3(),
      1,
      model,
    );

    expect(huge.object3D.scale.x).toBeGreaterThan(small.object3D.scale.x);
  });

  it("모델을 써도 캘수록 작아진다", () => {
    const model: THREE.Object3D = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1));
    const asteroid = new Asteroid(
      MINERAL_DEFINITIONS[RESOURCE.Copper],
      new THREE.Vector3(),
      1,
      model,
    );
    const before: number = asteroid.object3D.scale.x;

    asteroid.mine(asteroid.remaining * 0.5);

    expect(asteroid.object3D.scale.x).toBeLessThan(before);
  });

  it("모델이 없으면 절차 생성으로 만들어진다", () => {
    const asteroid = buildAsteroid();

    // 파일이 없는 상태에서도 게임이 돌아가야 한다.
    expect(collectVertices(asteroid).length).toBeGreaterThan(0);
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

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ASTEROID_FIELD } from "../constants";
import { AsteroidField } from "./asteroid-field";
import type { Asteroid } from "./asteroid";
import { MINERAL_DEFINITIONS, MINERAL_ORDER, RESOURCE } from "./minerals";
import {
  STAR_SYSTEM_DEFINITIONS,
  STAR_SYSTEM_ORDER,
  STARTING_SYSTEM,
  hasMinableMineral,
} from "./star-systems";

/** 필드에서 지정한 광물의 소행성을 하나 찾는다. */
function findAsteroidOf(field: AsteroidField, mineralId: string): Asteroid {
  for (const mesh of field.raycastTargets) {
    const asteroid: Asteroid | null = field.findByMesh(mesh);
    if (asteroid !== null && asteroid.mineral.id === mineralId) {
      return asteroid;
    }
  }
  throw new Error(`${mineralId} 소행성을 찾지 못했다`);
}

/** 함선이 멀리 떨어진 상태로 시간을 흘려보낸다. */
function advanceFar(field: AsteroidField, seconds: number): void {
  const farAway: THREE.Vector3 = new THREE.Vector3(0, 0, 100000);
  const step: number = 1;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    field.update(step, farAway);
  }
}

describe("소행성 필드", () => {
  it("설정한 개수만큼 생성된다", () => {
    const field: AsteroidField = new AsteroidField(new THREE.Vector3());

    expect(field.activeCount).toBe(ASTEROID_FIELD.Count);
  });

  it("같은 시드에서는 같은 배치가 나온다", () => {
    const first: AsteroidField = new AsteroidField(new THREE.Vector3());
    const second: AsteroidField = new AsteroidField(new THREE.Vector3());

    const firstPosition = first.findByMesh(first.raycastTargets[0])?.position;
    const secondPosition = second.findByMesh(second.raycastTargets[0])?.position;

    expect(firstPosition?.toArray()).toEqual(secondPosition?.toArray());
  });

  it("시작 지점 주변은 비워둔다", () => {
    const origin: THREE.Vector3 = new THREE.Vector3();
    const field: AsteroidField = new AsteroidField(origin);

    for (const mesh of field.raycastTargets) {
      const asteroid: Asteroid | null = field.findByMesh(mesh);
      if (asteroid === null) {
        continue;
      }
      expect(asteroid.position.distanceTo(origin)).toBeGreaterThan(
        ASTEROID_FIELD.SpawnClearance,
      );
    }
  });
});

describe("소행성 재생", () => {
  it("다 캔 소행성은 즉시 사라지고 재생 대기에 들어간다", () => {
    const field: AsteroidField = new AsteroidField(new THREE.Vector3());
    const asteroid: Asteroid = findAsteroidOf(field, RESOURCE.Copper);
    const countBefore: number = field.activeCount;

    asteroid.mine(asteroid.remaining);
    field.update(0.016, new THREE.Vector3(0, 0, 100000));

    expect(field.activeCount).toBe(countBefore - 1);
    expect(field.pendingRespawnCount).toBe(1);
  });

  it("재생 시간이 지나면 같은 등급으로 돌아온다", () => {
    const field: AsteroidField = new AsteroidField(new THREE.Vector3());
    const asteroid: Asteroid = findAsteroidOf(field, RESOURCE.Copper);
    const countBefore: number = field.activeCount;

    asteroid.mine(asteroid.remaining);
    advanceFar(field, MINERAL_DEFINITIONS[RESOURCE.Copper].respawnSeconds + 2);

    expect(field.pendingRespawnCount).toBe(0);
    expect(field.activeCount).toBe(countBefore);
  });

  it("하위 광물이 상위 광물보다 빨리 돌아온다", () => {
    const copperSeconds: number = MINERAL_DEFINITIONS[RESOURCE.Copper].respawnSeconds;
    const ironSeconds: number = MINERAL_DEFINITIONS[RESOURCE.Iron].respawnSeconds;
    const titaniumSeconds: number = MINERAL_DEFINITIONS[RESOURCE.Titanium].respawnSeconds;

    expect(copperSeconds).toBeLessThan(ironSeconds);
    expect(ironSeconds).toBeLessThan(titaniumSeconds);
  });

  it("재생 시간이 지나도 함선이 가까이 있으면 나타나지 않는다", () => {
    const field: AsteroidField = new AsteroidField(new THREE.Vector3());
    const asteroid: Asteroid = findAsteroidOf(field, RESOURCE.Copper);
    const spot: THREE.Vector3 = asteroid.position.clone();

    asteroid.mine(asteroid.remaining);

    // 자리 바로 옆에서 지켜본다.
    const respawnSeconds: number = MINERAL_DEFINITIONS[RESOURCE.Copper].respawnSeconds;
    for (let elapsed = 0; elapsed < respawnSeconds + 30; elapsed += 1) {
      field.update(1, spot);
    }

    expect(field.pendingRespawnCount).toBe(1);
  });

  it("멀어지면 그제서야 나타난다", () => {
    const field: AsteroidField = new AsteroidField(new THREE.Vector3());
    const asteroid: Asteroid = findAsteroidOf(field, RESOURCE.Copper);
    const spot: THREE.Vector3 = asteroid.position.clone();

    asteroid.mine(asteroid.remaining);

    const respawnSeconds: number = MINERAL_DEFINITIONS[RESOURCE.Copper].respawnSeconds;
    for (let elapsed = 0; elapsed < respawnSeconds + 30; elapsed += 1) {
      field.update(1, spot);
    }
    expect(field.pendingRespawnCount).toBe(1);

    field.update(1, spot.clone().add(new THREE.Vector3(0, 0, ASTEROID_FIELD.RespawnMinDistance + 10)));

    expect(field.pendingRespawnCount).toBe(0);
  });
});

describe("항성계", () => {
  /** 필드의 모든 소행성을 훑는다. */
  function eachAsteroid(field: AsteroidField): Asteroid[] {
    const found: Asteroid[] = [];
    for (const mesh of field.raycastTargets) {
      const asteroid: Asteroid | null = field.findByMesh(mesh);
      if (asteroid !== null) {
        found.push(asteroid);
      }
    }
    return found;
  }

  const origin: THREE.Vector3 = new THREE.Vector3();

  it("그 항성계에 없는 광물은 나오지 않는다", () => {
    for (const id of STAR_SYSTEM_ORDER) {
      const definition = STAR_SYSTEM_DEFINITIONS[id];
      const field: AsteroidField = new AsteroidField(origin, new Map(), definition);

      for (const asteroid of eachAsteroid(field)) {
        expect(definition.minerals).toContain(asteroid.mineral.id);
      }
    }
  });

  it("적어둔 광물은 실제로 하나씩 다 있다", () => {
    // 목록에 적힌 광물이 판에 없으면 목록이 거짓말이 된다.
    for (const id of STAR_SYSTEM_ORDER) {
      const definition = STAR_SYSTEM_DEFINITIONS[id];
      const field: AsteroidField = new AsteroidField(origin, new Map(), definition);
      const present: Set<string> = new Set(
        eachAsteroid(field).map((asteroid) => asteroid.mineral.id),
      );

      for (const mineral of definition.minerals) {
        expect(present).toContain(mineral);
      }
    }
  });

  it("모든 광물이 어느 항성계에선가는 나온다", () => {
    // 한 광물이라도 빠지면 그 광물로 만드는 장비 티어가 통째로 막힌다.
    const covered: Set<string> = new Set(
      STAR_SYSTEM_ORDER.flatMap((id) => [...STAR_SYSTEM_DEFINITIONS[id].minerals]),
    );

    for (const mineral of MINERAL_ORDER) {
      expect(covered).toContain(mineral);
    }
  });

  it("시작 항성계는 T1 장비로 캘 수 있다", () => {
    // 시작하자마자 캘 것이 없으면 게임이 시작되지 않는다.
    const start = STAR_SYSTEM_DEFINITIONS[STARTING_SYSTEM];

    expect(hasMinableMineral(start, 1, 0)).toBe(true);
  });

  it("항성계마다 배치가 다르다", () => {
    const first: AsteroidField = new AsteroidField(
      origin,
      new Map(),
      STAR_SYSTEM_DEFINITIONS[STAR_SYSTEM_ORDER[0]],
    );
    const second: AsteroidField = new AsteroidField(
      origin,
      new Map(),
      STAR_SYSTEM_DEFINITIONS[STAR_SYSTEM_ORDER[1]],
    );

    expect(eachAsteroid(first)[0].position.x).not.toBe(eachAsteroid(second)[0].position.x);
  });
});

describe("비워둘 자리", () => {
  it("거점 안에는 소행성이 생기지 않는다", () => {
    // 구조물 안에 생기면 캐러 들어갈 수도 없고 보기도 이상하다.
    const origin: THREE.Vector3 = new THREE.Vector3();
    const keepOut: THREE.Vector3 = new THREE.Vector3(0, 0, -240);
    const radius: number = 90;

    const field: AsteroidField = new AsteroidField(
      origin,
      new Map(),
      STAR_SYSTEM_DEFINITIONS[STAR_SYSTEM_ORDER[0]],
      [{ position: keepOut, radius }],
    );

    for (const mesh of field.raycastTargets) {
      const asteroid: Asteroid | null = field.findByMesh(mesh);
      if (asteroid !== null) {
        expect(asteroid.position.distanceTo(keepOut)).toBeGreaterThanOrEqual(radius);
      }
    }
  });
});

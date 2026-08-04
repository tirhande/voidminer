import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ASTEROID_FIELD } from "../constants";
import { AsteroidField } from "./asteroid-field";
import type { Asteroid } from "./asteroid";
import { MINERAL_DEFINITIONS, RESOURCE } from "./minerals";

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

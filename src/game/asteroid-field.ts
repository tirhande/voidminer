import * as THREE from "three";

import { ASTEROID_FIELD } from "../constants";
import { Asteroid } from "./asteroid";
import {
  ASTEROID_SIZE,
  ASTEROID_SIZE_DEFINITIONS,
  MINERAL_DEFINITIONS,
  type AsteroidSize,
} from "./minerals";
import { createSeededRandom, randomInRange, type RandomSource } from "./seeded-random";

/**
 * 크기 등급의 출현 비중.
 *
 * 낮은 티어는 흔하고 높은 티어는 드물다 (GDD 02). 큰 소행성이 귀해야 발견에
 * 의미가 생긴다.
 */
const SIZE_WEIGHTS: ReadonlyArray<{ size: AsteroidSize; weight: number }> = [
  { size: ASTEROID_SIZE.Small, weight: 0.55 },
  { size: ASTEROID_SIZE.Medium, weight: 0.3 },
  { size: ASTEROID_SIZE.Large, weight: 0.15 },
];

/** 가중치에 따라 크기 등급을 하나 고른다. */
function pickSize(random: RandomSource): AsteroidSize {
  const roll: number = random();
  let cumulative: number = 0;
  for (const entry of SIZE_WEIGHTS) {
    cumulative += entry.weight;
    if (roll < cumulative) {
      return entry.size;
    }
  }
  return ASTEROID_SIZE.Small;
}

/**
 * 소행성 필드.
 *
 * 배치는 절차 생성이다. 본 프로젝트의 GDD 는 손 디자인을 [확정]으로 두고
 * 있으나, 이 프로토는 일주일 안에 형태를 확인하는 것이 목적이므로 타협했다.
 */
export class AsteroidField {
  public readonly object3D: THREE.Group;

  private readonly asteroids: Asteroid[] = [];
  private readonly byMesh: Map<THREE.Object3D, Asteroid> = new Map();

  public constructor(origin: THREE.Vector3) {
    this.object3D = new THREE.Group();
    this.object3D.name = "AsteroidField";

    const random: RandomSource = createSeededRandom(ASTEROID_FIELD.Seed);
    const half: number = ASTEROID_FIELD.FieldSize / 2;
    const position: THREE.Vector3 = new THREE.Vector3();

    for (let index = 0; index < ASTEROID_FIELD.Count; index += 1) {
      const size: AsteroidSize = pickSize(random);
      const sizeDefinition = ASTEROID_SIZE_DEFINITIONS[size];

      // 시작 지점 주변은 비워둔다. 스폰하자마자 소행성에 파묻히면 안 된다.
      let attempts: number = 0;
      do {
        position.set(
          origin.x + randomInRange(random, -half, half),
          origin.y + randomInRange(random, -half * 0.45, half * 0.45),
          origin.z + randomInRange(random, -half, half),
        );
        attempts += 1;
      } while (
        position.distanceTo(origin) < ASTEROID_FIELD.SpawnClearance + sizeDefinition.radius &&
        attempts < 12
      );

      const asteroid: Asteroid = new Asteroid(
        sizeDefinition,
        MINERAL_DEFINITIONS[sizeDefinition.mineral],
        position,
        Math.floor(random() * 100000),
      );

      this.asteroids.push(asteroid);
      this.byMesh.set(asteroid.object3D, asteroid);
      this.object3D.add(asteroid.object3D);
    }
  }

  /** 레이캐스트 대상이 되는 메시 목록. */
  public get raycastTargets(): THREE.Object3D[] {
    return this.object3D.children;
  }

  /** 남아 있는 소행성 수. */
  public get activeCount(): number {
    return this.asteroids.length;
  }

  /** 메시로부터 소행성을 찾는다. 레이캐스트 결과를 해석할 때 쓴다. */
  public findByMesh(mesh: THREE.Object3D): Asteroid | null {
    return this.byMesh.get(mesh) ?? null;
  }

  /** 다 캐진 소행성을 장면에서 제거한다. 매 프레임 호출한다. */
  public removeDepleted(): void {
    for (let index = this.asteroids.length - 1; index >= 0; index -= 1) {
      const asteroid: Asteroid = this.asteroids[index];
      if (!asteroid.isDepleted) {
        continue;
      }

      this.object3D.remove(asteroid.object3D);
      this.byMesh.delete(asteroid.object3D);
      asteroid.dispose();
      this.asteroids.splice(index, 1);
    }
  }
}

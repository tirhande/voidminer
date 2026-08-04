import * as THREE from "three";

import { ASTEROID_FIELD } from "../constants";
import { Asteroid } from "./asteroid";
import {
  ASTEROID_SIZE,
  ASTEROID_SIZE_DEFINITIONS,
  MINERAL_DEFINITIONS,
  type AsteroidSize,
  type AsteroidSizeDefinition,
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

/** 재생을 기다리는 자리 하나. */
type PendingRespawn = {
  readonly sizeDefinition: AsteroidSizeDefinition;
  readonly position: THREE.Vector3;
  remainingSeconds: number;
};

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
  private readonly pending: PendingRespawn[] = [];
  private readonly random: RandomSource;

  public constructor(origin: THREE.Vector3) {
    this.object3D = new THREE.Group();
    this.object3D.name = "AsteroidField";
    this.random = createSeededRandom(ASTEROID_FIELD.Seed);

    const half: number = ASTEROID_FIELD.FieldSize / 2;
    const position: THREE.Vector3 = new THREE.Vector3();

    for (let index = 0; index < ASTEROID_FIELD.Count; index += 1) {
      const size: AsteroidSize = pickSize(this.random);
      const sizeDefinition: AsteroidSizeDefinition = ASTEROID_SIZE_DEFINITIONS[size];

      // 시작 지점 주변은 비워둔다. 스폰하자마자 소행성에 파묻히면 안 된다.
      let attempts: number = 0;
      do {
        position.set(
          origin.x + randomInRange(this.random, -half, half),
          origin.y + randomInRange(this.random, -half * 0.45, half * 0.45),
          origin.z + randomInRange(this.random, -half, half),
        );
        attempts += 1;
      } while (
        position.distanceTo(origin) <
          ASTEROID_FIELD.SpawnClearance + sizeDefinition.radius &&
        attempts < 12
      );

      this.spawn(sizeDefinition, position);
    }
  }

  /** 레이캐스트 대상이 되는 메시 목록. */
  public get raycastTargets(): THREE.Object3D[] {
    return this.object3D.children;
  }

  /** 지금 떠 있는 소행성 수. */
  public get activeCount(): number {
    return this.asteroids.length;
  }

  /** 재생을 기다리는 자리 수. */
  public get pendingRespawnCount(): number {
    return this.pending.length;
  }

  /** 메시로부터 소행성을 찾는다. 레이캐스트 결과를 해석할 때 쓴다. */
  public findByMesh(mesh: THREE.Object3D): Asteroid | null {
    return this.byMesh.get(mesh) ?? null;
  }

  /**
   * 다 캐진 소행성을 치우고, 시간이 찬 자리에 새 소행성을 들인다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param shipPosition 함선 위치. 가까이 있으면 재생을 미룬다
   */
  public update(deltaSeconds: number, shipPosition: THREE.Vector3): void {
    this.removeDepleted();
    this.advanceRespawns(deltaSeconds, shipPosition);
  }

  private removeDepleted(): void {
    for (let index = this.asteroids.length - 1; index >= 0; index -= 1) {
      const asteroid: Asteroid = this.asteroids[index];
      if (!asteroid.isDepleted) {
        continue;
      }

      // 광물마다 재생 시간이 다르다. 하위는 금방 돌아오고 상위는 오래 걸린다.
      this.pending.push({
        sizeDefinition: ASTEROID_SIZE_DEFINITIONS[asteroid.sizeName],
        position: asteroid.position.clone(),
        remainingSeconds: asteroid.mineral.respawnSeconds,
      });

      this.object3D.remove(asteroid.object3D);
      this.byMesh.delete(asteroid.object3D);
      asteroid.dispose();
      this.asteroids.splice(index, 1);
    }
  }

  private advanceRespawns(deltaSeconds: number, shipPosition: THREE.Vector3): void {
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const entry: PendingRespawn = this.pending[index];
      entry.remainingSeconds -= deltaSeconds;

      if (entry.remainingSeconds > 0) {
        continue;
      }

      // 시간이 찼어도 함선이 지켜보고 있으면 미룬다. 눈앞에서 솟으면 어색하다.
      if (entry.position.distanceTo(shipPosition) < ASTEROID_FIELD.RespawnMinDistance) {
        continue;
      }

      const scattered: THREE.Vector3 = entry.position
        .clone()
        .add(
          new THREE.Vector3(
            randomInRange(this.random, -1, 1),
            randomInRange(this.random, -1, 1),
            randomInRange(this.random, -1, 1),
          ).multiplyScalar(ASTEROID_FIELD.RespawnScatter),
        );

      this.spawn(entry.sizeDefinition, scattered);
      this.pending.splice(index, 1);
    }
  }

  private spawn(sizeDefinition: AsteroidSizeDefinition, position: THREE.Vector3): void {
    const asteroid: Asteroid = new Asteroid(
      sizeDefinition,
      MINERAL_DEFINITIONS[sizeDefinition.mineral],
      position,
      Math.floor(this.random() * 100000),
    );

    this.asteroids.push(asteroid);
    this.byMesh.set(asteroid.object3D, asteroid);
    this.object3D.add(asteroid.object3D);
  }
}

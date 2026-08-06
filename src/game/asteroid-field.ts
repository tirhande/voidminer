import * as THREE from "three";

import { ASTEROID_FIELD } from "../constants";
import { Asteroid } from "./asteroid";
import {
  MINERAL_DEFINITIONS,
  MINERAL_ORDER,
  sizeForMineral,
  type MineralId,
} from "./minerals";
import { createSeededRandom, randomInRange, type RandomSource } from "./seeded-random";

/** 재생을 기다리는 자리 하나. */
type PendingRespawn = {
  readonly mineral: MineralId;
  readonly position: THREE.Vector3;
  remainingSeconds: number;
};

/** 분포 가중치의 합. 광물 하나를 고를 때 쓴다. */
const TOTAL_ABUNDANCE: number = MINERAL_ORDER.reduce(
  (total, mineral) => total + MINERAL_DEFINITIONS[mineral].abundance,
  0,
);

/**
 * 분포에 따라 광물을 하나 고른다.
 *
 * 티어와 분포는 별개 속성이다 (GDD 02). 철은 상위 티어인데 가장 흔하다.
 */
function pickMineral(random: RandomSource): MineralId {
  let roll: number = random() * TOTAL_ABUNDANCE;
  for (const mineral of MINERAL_ORDER) {
    roll -= MINERAL_DEFINITIONS[mineral].abundance;
    if (roll <= 0) {
      return mineral;
    }
  }
  return MINERAL_ORDER[0];
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
      const mineral: MineralId = pickMineral(this.random);
      const radius: number = sizeForMineral(mineral).radius;

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
        position.distanceTo(origin) < ASTEROID_FIELD.SpawnClearance + radius &&
        attempts < 12
      );

      this.spawn(mineral, position);
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
        mineral: asteroid.mineral.id,
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

      this.spawn(entry.mineral, scattered);
      this.pending.splice(index, 1);
    }
  }

  private spawn(mineral: MineralId, position: THREE.Vector3): void {
    const asteroid: Asteroid = new Asteroid(
      MINERAL_DEFINITIONS[mineral],
      position,
      Math.floor(this.random() * 100000),
    );

    this.asteroids.push(asteroid);
    this.byMesh.set(asteroid.object3D, asteroid);
    this.object3D.add(asteroid.object3D);
  }
}

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
import {
  STAR_SYSTEM_DEFINITIONS,
  STARTING_SYSTEM,
  type StarSystemDefinition,
} from "./star-systems";

/** 재생을 기다리는 자리 하나. */
type PendingRespawn = {
  readonly mineral: MineralId;
  readonly position: THREE.Vector3;
  remainingSeconds: number;
};

/** 가장 큰 소행성의 반지름. 자리를 먼저 정하므로 여유를 최대치로 잡는다. */
const LARGEST_RADIUS: number = Math.max(
  ...MINERAL_ORDER.map((mineral) => sizeForMineral(mineral).radius),
);

/**
 * 그 항성계에 있는 광물 중 하나를 분포에 따라 고른다.
 *
 * 티어와 분포는 별개 속성이다 (GDD 02). 철은 상위 티어인데 가장 흔하다.
 * 항성계마다 나오는 광물이 다르므로 분포도 그 안에서만 견준다.
 */
function pickMineral(random: RandomSource, minerals: ReadonlyArray<MineralId>): MineralId {
  const total: number = minerals.reduce(
    (sum, mineral) => sum + MINERAL_DEFINITIONS[mineral].abundance,
    0,
  );

  let roll: number = random() * total;
  for (const mineral of minerals) {
    roll -= MINERAL_DEFINITIONS[mineral].abundance;
    if (roll <= 0) {
      return mineral;
    }
  }
  return minerals[minerals.length - 1];
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
  /** 필드 중심. 배치 거리를 재는 기준이다 */
  private readonly origin: THREE.Vector3;
  /** 광물별 외부 모델. 없는 광물은 절차 생성으로 만든다 */
  private readonly models: ReadonlyMap<MineralId, THREE.Object3D>;
  /** 이 필드가 속한 항성계 */
  public readonly system: StarSystemDefinition;

  public constructor(
    origin: THREE.Vector3,
    models: ReadonlyMap<MineralId, THREE.Object3D> = new Map(),
    system: StarSystemDefinition = STAR_SYSTEM_DEFINITIONS[STARTING_SYSTEM],
  ) {
    this.object3D = new THREE.Group();
    this.object3D.name = `AsteroidField_${system.id}`;
    this.random = createSeededRandom(system.seed);
    this.models = models;
    this.origin = origin.clone();
    this.system = system;

    const half: number = ASTEROID_FIELD.FieldSize / 2;
    const position: THREE.Vector3 = new THREE.Vector3();

    // 시작 지점 주변은 비워둔다. 스폰하자마자 소행성에 파묻히면 안 된다.
    const minRatio: number = (ASTEROID_FIELD.SpawnClearance + LARGEST_RADIUS) / half;

    for (let index = 0; index < ASTEROID_FIELD.Count; index += 1) {
      this.placeAt(position, randomInRange(this.random, minRatio, 1));
      this.spawn(pickMineral(this.random, system.minerals), position);
    }

    // 분포가 낮은 광물은 한 개도 안 나오는 판이 생긴다. 그 항성계에 있다고
    // 적어둔 광물이 실제로는 없으면 목록이 거짓말이 되므로 하나는 보장한다.
    for (const mineral of system.minerals) {
      if (this.asteroids.some((asteroid) => asteroid.mineral.id === mineral)) {
        continue;
      }
      this.placeAt(position, randomInRange(this.random, minRatio, 1));
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

  /**
   * 맞은 물체로부터 소행성을 찾는다.
   *
   * 모델은 여러 메시로 나뉘어 있어 레이캐스트가 하위 메시를 맞힌다. 등록된
   * 뿌리를 만날 때까지 부모를 거슬러 올라간다.
   */
  public findByMesh(mesh: THREE.Object3D): Asteroid | null {
    let current: THREE.Object3D | null = mesh;
    while (current !== null) {
      const found: Asteroid | undefined = this.byMesh.get(current);
      if (found !== undefined) {
        return found;
      }
      current = current.parent;
    }
    return null;
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

  /**
   * 필드를 통째로 치운다. 항성계를 옮길 때 쓴다.
   *
   * 소행성마다 지오메트리를 따로 갖고 있어서 (개체마다 다르게 일그러뜨리므로)
   * 놔두면 GPU 쪽에 그대로 남는다.
   */
  public dispose(): void {
    for (const asteroid of this.asteroids) {
      this.object3D.remove(asteroid.object3D);
      asteroid.dispose();
    }
    this.asteroids.length = 0;
    this.byMesh.clear();
    this.pending.length = 0;
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

  /**
   * 중심에서 그 비율만큼 떨어진 자리를 하나 정한다.
   *
   * 상자 안에서 균일하게 뽑으면 부피가 거리 세제곱으로 늘어 대부분이 최외곽에
   * 몰리고 시작 지점 근처가 빈다. 거리를 직접 균일하게 뽑아야 고르게 퍼진다.
   *
   * 방향만 세로로 눌러 원반에 가깝게 만든다. 소행성대는 띠로 보여야 한다.
   */
  private placeAt(target: THREE.Vector3, distanceRatio: number): void {
    const cosine: number = randomInRange(this.random, -1, 1);
    const azimuth: number = this.random() * Math.PI * 2;
    const sine: number = Math.sqrt(Math.max(0, 1 - cosine * cosine));

    target
      .set(sine * Math.cos(azimuth), cosine * ASTEROID_FIELD.Flatten, sine * Math.sin(azimuth))
      .normalize()
      .multiplyScalar((ASTEROID_FIELD.FieldSize / 2) * distanceRatio)
      .add(this.origin);
  }

  private spawn(mineral: MineralId, position: THREE.Vector3): void {
    const asteroid: Asteroid = new Asteroid(
      MINERAL_DEFINITIONS[mineral],
      position,
      Math.floor(this.random() * 100000),
      this.models.get(mineral) ?? null,
    );

    this.asteroids.push(asteroid);
    this.byMesh.set(asteroid.object3D, asteroid);
    this.object3D.add(asteroid.object3D);
  }
}

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

/** 가장 큰 소행성의 반지름. 자리를 먼저 정하므로 여유를 최대치로 잡는다. */
const LARGEST_RADIUS: number = Math.max(
  ...MINERAL_ORDER.map((mineral) => sizeForMineral(mineral).radius),
);

/** 대역 문턱을 가까운 것부터 늘어놓는다. */
const BAND_STARTS: readonly number[] = [
  ...new Set(Object.values(ASTEROID_FIELD.TierBandStart)),
].sort((a, b) => a - b);

/** 그 거리가 몇 번째 대역인지. */
function bandIndexOfRatio(distanceRatio: number): number {
  let index: number = 0;
  for (let candidate = 0; candidate < BAND_STARTS.length; candidate += 1) {
    if (distanceRatio >= BAND_STARTS[candidate]) {
      index = candidate;
    }
  }
  return index;
}

/** 그 광물이 속한 대역 번호. */
function bandIndexOfMineral(mineral: MineralId): number {
  const start: number =
    ASTEROID_FIELD.TierBandStart[MINERAL_DEFINITIONS[mineral].requiredLaserTier] ?? 0;
  return BAND_STARTS.indexOf(start);
}

/**
 * 그 거리에서 나올 수 있는 광물인지 본다.
 *
 * @param distanceRatio 필드 반지름에 대한 비율 (0 이 시작 지점)
 */
export function isMineralAllowedAt(mineral: MineralId, distanceRatio: number): boolean {
  return bandIndexOfMineral(mineral) <= bandIndexOfRatio(distanceRatio);
}

/**
 * 그 거리에서 나올 수 있는 광물 중 하나를 분포에 따라 고른다.
 *
 * 티어와 분포는 별개 속성이다 (GDD 02). 철은 상위 티어인데 가장 흔하다. 다만
 * 멀리 나갈수록 그 자리의 광물이 주류가 돼야 한다. 흔한 하위 광물을 그대로
 * 두면 바깥에서도 철이 대부분을 차지해 멀리 갈 이유가 사라진다.
 */
function pickMineral(random: RandomSource, distanceRatio: number): MineralId {
  const here: number = bandIndexOfRatio(distanceRatio);
  const weights: Array<{ mineral: MineralId; weight: number }> = [];
  let total: number = 0;

  for (const mineral of MINERAL_ORDER) {
    const band: number = bandIndexOfMineral(mineral);
    if (band > here) {
      continue;
    }
    const weight: number =
      MINERAL_DEFINITIONS[mineral].abundance *
      Math.pow(ASTEROID_FIELD.LowerTierDamping, here - band);
    weights.push({ mineral, weight });
    total += weight;
  }

  let roll: number = random() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.mineral;
    }
  }
  return weights[weights.length - 1]?.mineral ?? MINERAL_ORDER[0];
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
  /** 필드 중심. 대역 거리를 재는 기준이다 */
  private readonly origin: THREE.Vector3;
  /** 광물별 외부 모델. 없는 광물은 절차 생성으로 만든다 */
  private readonly models: ReadonlyMap<MineralId, THREE.Object3D>;

  public constructor(
    origin: THREE.Vector3,
    models: ReadonlyMap<MineralId, THREE.Object3D> = new Map(),
  ) {
    this.object3D = new THREE.Group();
    this.object3D.name = "AsteroidField";
    this.random = createSeededRandom(ASTEROID_FIELD.Seed);
    this.models = models;
    this.origin = origin.clone();

    const half: number = ASTEROID_FIELD.FieldSize / 2;
    const position: THREE.Vector3 = new THREE.Vector3();

    // 시작 지점 주변은 비워둔다. 스폰하자마자 소행성에 파묻히면 안 된다.
    const minRatio: number = (ASTEROID_FIELD.SpawnClearance + LARGEST_RADIUS) / half;

    for (let index = 0; index < ASTEROID_FIELD.Count; index += 1) {
      const ratio: number = randomInRange(this.random, minRatio, 1);
      this.placeAt(position, ratio);
      this.spawn(pickMineral(this.random, ratio), position);
    }

    // 대역만 나눠두면 가장 바깥 광물은 한 개도 안 나오는 판이 생긴다. 백금이
    // 없으면 마지막 합금을 만들 길이 사라지므로 광물마다 하나는 보장한다.
    for (const mineral of MINERAL_ORDER) {
      if (this.asteroids.some((asteroid) => asteroid.mineral.id === mineral)) {
        continue;
      }
      const bandStart: number = BAND_STARTS[bandIndexOfMineral(mineral)];
      const ratio: number = randomInRange(this.random, Math.max(bandStart, minRatio), 1);
      this.placeAt(position, ratio);
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

      // 흩뿌리다가 자기 대역 안쪽으로 들어갈 수 있다. 그러면 원래 자리에 둔다.
      // 원래 자리는 배치할 때 대역을 지킨 곳이므로 되돌리면 항상 맞는다.
      const isValid: boolean = isMineralAllowedAt(
        entry.mineral,
        scattered.distanceTo(this.origin) / (ASTEROID_FIELD.FieldSize / 2),
      );

      this.spawn(entry.mineral, isValid ? scattered : entry.position);
      this.pending.splice(index, 1);
    }
  }

  /**
   * 중심에서 그 비율만큼 떨어진 자리를 하나 정한다.
   *
   * 상자 안에서 균일하게 뽑으면 부피가 거리 세제곱으로 늘어 대부분이 최외곽에
   * 몰린다. 거리를 직접 균일하게 뽑아야 대역마다 비슷한 수가 들어간다.
   *
   * 방향만 세로로 눌러 원반에 가깝게 만든다. 거리는 그대로이므로 대역은
   * 흐트러지지 않는다.
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

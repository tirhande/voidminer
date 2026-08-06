import * as THREE from "three";

import { DEBRIS, TRACTOR_BEAM } from "../constants";
import type { Cargo } from "./cargo";
import { EMISSION, SURFACE } from "../palette";
import { MINERAL_DEFINITIONS, resourceColor, type ResourceId } from "./minerals";

/** 부유 중인 파편 하나. */
type DebrisItem = {
  readonly mesh: THREE.Mesh;
  readonly resource: ResourceId;
  readonly amount: number;
  readonly velocity: THREE.Vector3;
  age: number;
};

const scratchDirection: THREE.Vector3 = new THREE.Vector3();
const scratchDesired: THREE.Vector3 = new THREE.Vector3();

/** 견인빔이 꺼져 있을 때 쓰는 빈 선택. 프레임마다 새로 만들지 않는다. */
const EMPTY_SELECTION: ReadonlySet<unknown> = new Set<unknown>();

/**
 * 파편 무리와 견인빔 회수를 담당한다.
 *
 * GDD 02 의 2층 모델에서 채굴은 파편을 만들고 회수는 파편을 가져온다. 두 층이
 * 분리돼 있으므로 캐놓고 못 줍는 상황이 정상적으로 성립한다.
 */
export class DebrisField {
  public readonly object3D: THREE.Group;

  private readonly geometry: THREE.IcosahedronGeometry;
  private readonly materials: Map<ResourceId, THREE.MeshStandardMaterial> = new Map();
  private readonly items: DebrisItem[] = [];
  /** 이번 프레임에 견인빔이 실제로 끌어당긴 파편의 위치. 빔 표시에 쓴다 */
  private readonly pulledPositions: THREE.Vector3[] = [];

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "DebrisField";
    this.geometry = new THREE.IcosahedronGeometry(DEBRIS.Radius, 0);
  }

  /** 현재 떠 있는 파편 수. */
  public get activeCount(): number {
    return this.items.length;
  }

  /** 이번 프레임에 견인빔이 붙잡은 파편의 위치. */
  public get pulledDebris(): ReadonlyArray<THREE.Vector3> {
    return this.pulledPositions;
  }

  /**
   * 파편을 하나 만든다.
   *
   * @param position 생성 위치 (보통 레이저 명중 지점)
   * @param outward 소행성 바깥을 향하는 방향
   * @param resource 자원 종류
   * @param amount 파편이 담은 양
   */
  public spawn(
    position: THREE.Vector3,
    outward: THREE.Vector3,
    resource: ResourceId,
    amount: number,
  ): void {
    if (this.items.length >= DEBRIS.MaxCount) {
      return;
    }

    const mesh: THREE.Mesh = new THREE.Mesh(this.geometry, this.materialFor(resource));
    mesh.position.copy(position);
    mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    // 부광물은 드물게 나오므로 조금 크게 만들어 눈에 띄게 한다.
    mesh.scale.setScalar(MINERAL_DEFINITIONS[resource].isPrimary ? 1 : 1.3);

    const velocity: THREE.Vector3 = outward
      .clone()
      .normalize()
      .multiplyScalar(DEBRIS.EjectSpeed * (0.6 + Math.random() * 0.8));

    this.object3D.add(mesh);
    this.items.push({ mesh, resource, amount, velocity, age: 0 });
  }

  /**
   * 파편을 한 프레임 진행시킨다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param shipPosition 함선 위치
   * @param shipVelocity 함선 속도. 끌어당길 목표 속도의 기준이 된다
   * @param isTractorActive 견인빔 사용 여부
   * @param tractorCapacity 동시에 끌 수 있는 파편 수
   * @param cargo 회수한 자원을 담을 화물칸
   * @returns 이번 프레임에 회수된 자원 목록
   */
  public update(
    deltaSeconds: number,
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3,
    isTractorActive: boolean,
    tractorCapacity: number,
    cargo: Cargo,
  ): ResourceId[] {
    const collected: ResourceId[] = [];
    this.pulledPositions.length = 0;

    // 한도가 있으므로 아무거나 잡으면 안 된다. 가까운 것부터 채운다.
    const grabbed: ReadonlySet<unknown> = isTractorActive
      ? this.selectNearest(shipPosition, tractorCapacity)
      : EMPTY_SELECTION;

    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item: DebrisItem = this.items[index];
      item.age += deltaSeconds;

      scratchDirection.subVectors(shipPosition, item.mesh.position);
      const distance: number = scratchDirection.length();

      if (grabbed.has(item) && distance > 1e-4) {
        scratchDirection.divideScalar(distance);

        // 목표 속도 = 함선 속도 + 접근 속도. 접근 속도는 거리에 비례하므로
        // 가까워질수록 느려져 지나치지 않고, 함선 속도가 더해져 있으므로
        // 움직이는 함선을 그대로 따라온다.
        const approachSpeed: number = Math.min(
          distance * TRACTOR_BEAM.ApproachRate,
          TRACTOR_BEAM.MaxPullSpeed,
        );
        scratchDesired
          .copy(shipVelocity)
          .addScaledVector(scratchDirection, approachSpeed);

        const response: number = 1 - Math.exp(-TRACTOR_BEAM.ResponseRate * deltaSeconds);
        item.velocity.lerp(scratchDesired, response);

        this.pulledPositions.push(item.mesh.position);
      }

      item.mesh.position.addScaledVector(item.velocity, deltaSeconds);
      item.mesh.rotation.x += deltaSeconds * 1.1;
      item.mesh.rotation.y += deltaSeconds * 0.7;

      if (distance < TRACTOR_BEAM.CollectDistance) {
        const stored: number = cargo.add(item.resource, item.amount);
        if (stored > 0) {
          collected.push(item.resource);
          this.remove(index);
        }
        // 화물이 가득 차 담기지 않으면 파편은 그대로 남는다.
        continue;
      }

      if (item.age > DEBRIS.LifetimeSeconds) {
        this.remove(index);
      }
    }

    return collected;
  }

  /**
   * 사거리 안에서 가까운 순으로 한도만큼 고른다.
   *
   * 한도를 넘은 파편은 사라지지 않고 그 자리에 남는다 (GDD 02). 레이저를
   * 올려 파편이 쏟아지면 회수가 병목이 되고, 그제야 회수 계통에 투자할 이유가
   * 생긴다.
   */
  private selectNearest(shipPosition: THREE.Vector3, capacity: number): Set<DebrisItem> {
    if (capacity <= 0) {
      return new Set<DebrisItem>();
    }

    const candidates: Array<{ item: DebrisItem; distance: number }> = [];
    for (const item of this.items) {
      const distance: number = item.mesh.position.distanceTo(shipPosition);
      if (distance < TRACTOR_BEAM.Range) {
        candidates.push({ item, distance });
      }
    }

    candidates.sort((first, second) => first.distance - second.distance);
    return new Set(candidates.slice(0, capacity).map((entry) => entry.item));
  }

  private remove(index: number): void {
    const item: DebrisItem = this.items[index];
    this.object3D.remove(item.mesh);
    this.items.splice(index, 1);
  }

  private materialFor(resource: ResourceId): THREE.MeshStandardMaterial {
    const existing: THREE.MeshStandardMaterial | undefined = this.materials.get(resource);
    if (existing !== undefined) {
      return existing;
    }

    const color: number = resourceColor(resource);
    const material: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: MINERAL_DEFINITIONS[resource].isPrimary
        ? EMISSION.Debris
        : EMISSION.Secondary,
      metalness: SURFACE.RockMetalness,
      roughness: SURFACE.RockRoughness,
      flatShading: true,
    });
    this.materials.set(resource, material);
    return material;
  }
}

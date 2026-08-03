import * as THREE from "three";

import { DEBRIS, TRACTOR_BEAM } from "../constants";
import type { Cargo } from "./cargo";
import { RESOURCE, resourceColor, type ResourceId } from "./minerals";

/** 부유 중인 파편 하나. */
type DebrisItem = {
  readonly mesh: THREE.Mesh;
  readonly resource: ResourceId;
  readonly amount: number;
  readonly velocity: THREE.Vector3;
  age: number;
};

const scratchDirection: THREE.Vector3 = new THREE.Vector3();

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

  public constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = "DebrisField";
    this.geometry = new THREE.IcosahedronGeometry(DEBRIS.Radius, 0);
  }

  /** 현재 떠 있는 파편 수. */
  public get activeCount(): number {
    return this.items.length;
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
    // 보석은 눈에 띄어야 한다. 광물 파편보다 조금 크게 만든다.
    mesh.scale.setScalar(resource === RESOURCE.Gem ? 1.35 : 1);

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
   * @param isTractorActive 견인빔 사용 여부
   * @param cargo 회수한 자원을 담을 화물칸
   * @returns 이번 프레임에 회수된 자원 목록
   */
  public update(
    deltaSeconds: number,
    shipPosition: THREE.Vector3,
    isTractorActive: boolean,
    cargo: Cargo,
  ): ResourceId[] {
    const collected: ResourceId[] = [];

    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item: DebrisItem = this.items[index];
      item.age += deltaSeconds;

      scratchDirection.subVectors(shipPosition, item.mesh.position);
      const distance: number = scratchDirection.length();

      if (isTractorActive && distance < TRACTOR_BEAM.Range && distance > 1e-4) {
        scratchDirection.divideScalar(distance);
        item.velocity.addScaledVector(
          scratchDirection,
          TRACTOR_BEAM.PullAcceleration * deltaSeconds,
        );
        if (item.velocity.length() > TRACTOR_BEAM.MaxPullSpeed) {
          item.velocity.setLength(TRACTOR_BEAM.MaxPullSpeed);
        }
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
      emissiveIntensity: resource === RESOURCE.Gem ? 1.1 : 0.55,
      metalness: 0.2,
      roughness: 0.6,
      flatShading: true,
    });
    this.materials.set(resource, material);
    return material;
  }
}

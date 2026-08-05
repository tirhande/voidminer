import * as THREE from "three";

import { EMISSION, SURFACE } from "../palette";
import type { AsteroidSize, AsteroidSizeDefinition, MineralDefinition } from "./minerals";

/** 표면 요철의 세기. 반지름에 대한 비율이다. */
const SURFACE_ROUGHNESS = 0.28;

/** 다 캐가는 소행성이 줄어드는 하한 배율. */
const MIN_DEPLETION_SCALE = 0.5;

/**
 * 위치에서 결정론적인 0~1 값을 만든다.
 *
 * IcosahedronGeometry 는 인덱스가 없어 같은 좌표의 정점이 여러 번 등장한다.
 * 정점 순번이 아니라 좌표로 변위를 정해야 면 사이가 갈라지지 않는다.
 */
function hashPosition(x: number, y: number, z: number, seed: number): number {
  const dot: number = x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.137;
  const value: number = Math.sin(dot) * 43758.5453;
  return value - Math.floor(value);
}

/** 울퉁불퉁한 소행성 형상을 만든다. */
function createAsteroidGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geometry: THREE.IcosahedronGeometry = new THREE.IcosahedronGeometry(radius, 2);
  const position: THREE.BufferAttribute = geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;

  const vertex: THREE.Vector3 = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const direction: THREE.Vector3 = vertex.clone().normalize();
    // 좌표를 성기게 만들어 넓은 덩어리 단위로 울퉁불퉁해지게 한다.
    const noise: number = hashPosition(
      Math.round(direction.x * 6),
      Math.round(direction.y * 6),
      Math.round(direction.z * 6),
      seed,
    );
    const scale: number = 1 + (noise - 0.5) * SURFACE_ROUGHNESS;
    vertex.copy(direction).multiplyScalar(radius * scale);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 소행성 하나.
 *
 * 크기가 곧 광물 티어의 단서다 (GDD 02). 큰 소행성일수록 좋은 광물이 나오므로
 * 플레이어는 형태만 보고 접근할지 판단할 수 있어야 한다.
 */
export class Asteroid {
  public readonly object3D: THREE.Mesh;
  public readonly mineral: MineralDefinition;
  public readonly radius: number;
  /** 크기 등급. 재생할 때 같은 등급으로 되돌리는 데 쓴다 */
  public readonly sizeName: AsteroidSize;

  private readonly totalMineral: number;
  private remainingMineral: number;

  public constructor(
    sizeDefinition: AsteroidSizeDefinition,
    mineral: MineralDefinition,
    position: THREE.Vector3,
    seed: number,
  ) {
    this.mineral = mineral;
    this.radius = sizeDefinition.radius;
    this.sizeName = sizeDefinition.size;
    this.totalMineral = sizeDefinition.mineralAmount;
    this.remainingMineral = sizeDefinition.mineralAmount;

    const material: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: mineral.color,
      metalness: SURFACE.RockMetalness,
      roughness: SURFACE.RockRoughness,
      emissive: mineral.color,
      emissiveIntensity: EMISSION.Rock,
      flatShading: true,
    });

    this.object3D = new THREE.Mesh(createAsteroidGeometry(this.radius, seed), material);
    this.object3D.name = `Asteroid_${mineral.id}`;
    this.object3D.position.copy(position);
    this.object3D.rotation.set(
      hashPosition(position.x, position.y, position.z, seed) * Math.PI * 2,
      hashPosition(position.y, position.z, position.x, seed) * Math.PI * 2,
      hashPosition(position.z, position.x, position.y, seed) * Math.PI * 2,
    );
  }

  /** 월드 좌표 위치. */
  public get position(): THREE.Vector3 {
    return this.object3D.position;
  }

  /** 남은 매장량 (광물 단위). */
  public get remaining(): number {
    return this.remainingMineral;
  }

  /** 총 매장량 대비 남은 비율 (0~1). */
  public get remainingRatio(): number {
    return this.remainingMineral / this.totalMineral;
  }

  /** 다 캤는지 여부. GDD 02 에 따라 다 캔 소행성은 껍데기를 남기지 않고 사라진다. */
  public get isDepleted(): boolean {
    return this.remainingMineral <= 0;
  }

  /**
   * 광물을 캔다.
   *
   * 요청한 만큼 남아 있지 않으면 남은 만큼만 준다. 캔 만큼은 반드시 나오므로
   * 헛수고가 생기지 않는다 (GDD 02 의 전제).
   *
   * @param requestedAmount 캐려는 양 (광물 단위)
   * @returns 실제로 캔 양
   */
  public mine(requestedAmount: number): number {
    const minedAmount: number = Math.min(requestedAmount, this.remainingMineral);
    this.remainingMineral -= minedAmount;

    // 캔 만큼 눈에 띄게 줄어든다. 진척이 형태로 보여야 한다.
    const scale: number =
      MIN_DEPLETION_SCALE + (1 - MIN_DEPLETION_SCALE) * this.remainingRatio;
    this.object3D.scale.setScalar(scale);

    return minedAmount;
  }

  /** 지오메트리와 재질을 해제한다. */
  public dispose(): void {
    this.object3D.geometry.dispose();
    const material: THREE.Material | THREE.Material[] = this.object3D.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
    } else {
      material.dispose();
    }
  }
}

import * as THREE from "three";

import { EMISSION, SURFACE } from "../palette";
import { sizeForMineral } from "./minerals";
import type { AsteroidSize, AsteroidSizeDefinition, MineralDefinition } from "./minerals";

/** 표면 요철의 세기. 반지름에 대한 비율이다. */
const SURFACE_ROUGHNESS = 0.28;

/** 다 캐가는 소행성이 줄어드는 하한 배율. */
const MIN_DEPLETION_SCALE = 0.5;

/**
 * 위치에서 결정론적인 0~1 값을 만든다.
 *
 * 정점 순번이 아니라 좌표로 변위를 정해야 면 사이가 갈라지지 않는다. 인덱스가
 * 없는 지오메트리는 같은 좌표의 정점이 여러 번 등장하기 때문이다.
 */
function hashPosition(x: number, y: number, z: number, seed: number): number {
  const dot: number = x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.137;
  const value: number = Math.sin(dot) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * 정점을 바깥쪽으로 밀어 표면을 흩는다.
 *
 * 광물마다 모델이 하나뿐이므로 그대로 쓰면 같은 광물 소행성이 전부 같아 보인다.
 * 좌표 기반 해시라 시드가 다르면 다른 모양이 되고, 같은 시드면 항상 같은 모양이
 * 나온다. 여러 메시로 나뉜 모델에서도 좌표 기준이라 함께 일그러진다.
 */
function displaceVertices(geometry: THREE.BufferGeometry, seed: number): void {
  const position: THREE.BufferAttribute = geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;

  const vertex: THREE.Vector3 = new THREE.Vector3();
  const direction: THREE.Vector3 = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const length: number = vertex.length();
    if (length < 1e-6) {
      continue;
    }

    direction.copy(vertex).divideScalar(length);
    const noise: number = hashPosition(
      Math.round(direction.x * 6),
      Math.round(direction.y * 6),
      Math.round(direction.z * 6),
      seed,
    );
    const scale: number = 1 + (noise - 0.5) * SURFACE_ROUGHNESS;
    vertex.copy(direction).multiplyScalar(length * scale);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** 절차 생성 형상. 모델이 없을 때 쓴다. */
function createProceduralGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geometry: THREE.IcosahedronGeometry = new THREE.IcosahedronGeometry(radius, 2);
  displaceVertices(geometry, seed);
  return geometry;
}

/**
 * 외부 모델을 복제해 개체 하나로 만든다.
 *
 * 재질은 원본 그대로 둔다. 만든 대로 보여야 하기 때문이다. 지오메트리만 복제해
 * 개체마다 다르게 일그러뜨린다.
 */
function instantiateModel(source: THREE.Object3D, seed: number): THREE.Object3D {
  const clone: THREE.Object3D = source.clone(true);

  clone.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry = child.geometry.clone();
      displaceVertices(child.geometry, seed);
    }
  });

  return clone;
}

/**
 * 소행성 하나.
 *
 * 크기가 곧 광물 티어의 단서다 (GDD 02). 큰 소행성일수록 좋은 광물이 나오므로
 * 플레이어는 형태만 보고 접근할지 판단할 수 있어야 한다.
 */
export class Asteroid {
  public readonly object3D: THREE.Object3D;
  public readonly mineral: MineralDefinition;
  public readonly radius: number;
  /** 크기 등급. 재생할 때 같은 등급으로 되돌리는 데 쓴다 */
  public readonly sizeName: AsteroidSize;

  private readonly totalMineral: number;
  /**
   * 고갈 표현을 얹기 전의 기준 배율.
   *
   * 모델은 반지름 1 로 정규화돼 있어 등급 크기를 배율로 준다. 절차 생성은
   * 지오메트리 자체가 등급 크기라 배율이 1 이다.
   */
  private readonly baseScale: number;
  private remainingMineral: number;

  public constructor(
    mineral: MineralDefinition,
    position: THREE.Vector3,
    seed: number,
    model: THREE.Object3D | null = null,
  ) {
    // 크기는 광물이 정한다. 크기가 곧 티어의 단서이므로 따로 받지 않는다.
    const sizeDefinition: AsteroidSizeDefinition = sizeForMineral(mineral.id);
    this.mineral = mineral;
    this.radius = sizeDefinition.radius;
    this.sizeName = sizeDefinition.size;
    this.totalMineral = sizeDefinition.mineralAmount;
    this.remainingMineral = sizeDefinition.mineralAmount;

    if (model !== null) {
      const holder: THREE.Group = new THREE.Group();
      holder.add(instantiateModel(model, seed));
      this.baseScale = this.radius;
      this.object3D = holder;
    } else {
      const material: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
        color: mineral.color,
        metalness: SURFACE.RockMetalness,
        roughness: SURFACE.RockRoughness,
        emissive: mineral.color,
        emissiveIntensity: EMISSION.Rock,
        flatShading: true,
      });
      this.baseScale = 1;
      this.object3D = new THREE.Mesh(
        createProceduralGeometry(this.radius, seed),
        material,
      );
    }

    this.object3D.name = `Asteroid_${mineral.id}`;
    this.object3D.position.copy(position);
    this.object3D.scale.setScalar(this.baseScale);
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
    const depletion: number =
      MIN_DEPLETION_SCALE + (1 - MIN_DEPLETION_SCALE) * this.remainingRatio;
    this.object3D.scale.setScalar(this.baseScale * depletion);

    return minedAmount;
  }

  /** 지오메트리와 재질을 해제한다. */
  public dispose(): void {
    this.object3D.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      child.geometry.dispose();
      const material: THREE.Material | THREE.Material[] = child.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material.dispose();
      }
    });
  }
}

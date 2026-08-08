import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 모델 안의 메시를 재질별로 하나씩 합친다.
 *
 * 조각이 잘게 나뉘어 있으면 그 수만큼 그리기 호출이 든다. 거점 모델은 조각이
 * 236 개라 그것만으로 소행성 76 개 몫을 먹는다. 정점 수는 얼마 안 되므로
 * 병목은 정점이 아니라 호출 횟수다.
 *
 * **재질은 손대지 않는다.** 재질이 같은 것끼리만 합치므로 보이는 것은 그대로다.
 * 빈 노드는 남긴다 — 장착 소켓과 도킹 지점이 그 노드들이라 지우면 자리를 잃는다.
 *
 * 합칠 수 없는 조각은 그대로 둔다. 속성 구성이 다르면 합쳐지지 않는데, 그때
 * 억지로 맞추면 형상이 깨진다. 조금 느린 편이 깨지는 것보다 낫다.
 *
 * @param root 합칠 모델. 이 자리에서 바로 고친다
 * @returns 줄어든 그리기 호출 수
 */
export function mergeByMaterial(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const rootInverse: THREE.Matrix4 = new THREE.Matrix4()
    .copy(root.matrixWorld)
    .invert();

  const groups: Map<THREE.Material, THREE.Mesh[]> = new Map();

  root.traverse((child: THREE.Object3D) => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) {
      return;
    }
    const existing: THREE.Mesh[] | undefined = groups.get(child.material);
    if (existing === undefined) {
      groups.set(child.material, [child]);
    } else {
      existing.push(child);
    }
  });

  let saved: number = 0;

  for (const [material, meshes] of groups) {
    if (meshes.length < 2) {
      continue;
    }

    // 각 조각을 모델 기준 좌표로 옮겨놓고 합친다. 노드마다 자기 변환이 있으므로
    // 그대로 합치면 전부 원점에 겹쳐 쌓인다.
    const geometries: THREE.BufferGeometry[] = meshes.map((mesh) => {
      const geometry: THREE.BufferGeometry = mesh.geometry.clone();
      geometry.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld),
      );
      return geometry;
    });

    const merged: THREE.BufferGeometry | null = mergeGeometries(geometries, false);
    for (const geometry of geometries) {
      geometry.dispose();
    }

    if (merged === null) {
      continue;
    }

    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }

    const combined: THREE.Mesh = new THREE.Mesh(merged, material);
    combined.name = `Merged_${material.name || "material"}`;
    root.add(combined);

    saved += meshes.length - 1;
  }

  return saved;
}

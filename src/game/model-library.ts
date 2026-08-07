import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MINERAL_ORDER, type MineralId } from "./minerals";

/** 광물 id 를 파일 이름으로 바꾼다. `COPPER` → `ore_copper.glb` */
function modelUrlFor(mineral: MineralId): string {
  return `models/ore_${mineral.toLowerCase()}.glb`;
}

/**
 * 모델 하나를 읽어 반지름 1 로 정규화한다.
 *
 * 재질은 그대로 둔다. 만든 대로 보여야 하기 때문이다. 대신 장면에 환경 맵을
 * 깔아 금속 재질이 반사할 대상을 마련한다.
 */
async function loadModel(url: string): Promise<THREE.Object3D | null> {
  try {
    const loader: GLTFLoader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root: THREE.Object3D = gltf.scene;

    // 원점과 크기를 코드가 기대하는 기준으로 맞춘다. 반지름 1 이 기준이다.
    const box: THREE.Box3 = new THREE.Box3().setFromObject(root);
    const center: THREE.Vector3 = box.getCenter(new THREE.Vector3());
    const sphere: THREE.Sphere = box.getBoundingSphere(new THREE.Sphere());

    root.position.sub(center);

    const wrapper: THREE.Group = new THREE.Group();
    wrapper.add(root);
    if (sphere.radius > 1e-6) {
      wrapper.scale.setScalar(1 / sphere.radius);
    }

    return wrapper;
  } catch {
    // 파일이 없거나 읽지 못하면 절차 생성으로 간다. 게임이 멈추면 안 된다.
    return null;
  }
}

/**
 * 게임이 쓰는 외부 모델 묶음.
 *
 * 모델이 없어도 게임은 그대로 돌아간다. 없는 것이 정상 경로여야 파일이 들어오는
 * 대로 붙일 수 있다.
 */
export type ModelLibrary = {
  /** 광물별 소행성 모델. 없는 광물은 항목이 비어 있다 */
  readonly asteroids: ReadonlyMap<MineralId, THREE.Object3D>;
};

/** 모델을 모두 읽는다. 실패한 것은 목록에서 빠진다. */
export async function loadModels(): Promise<ModelLibrary> {
  const entries: Array<[MineralId, THREE.Object3D | null]> = await Promise.all(
    MINERAL_ORDER.map(async (mineral): Promise<[MineralId, THREE.Object3D | null]> => {
      return [mineral, await loadModel(modelUrlFor(mineral))];
    }),
  );

  const asteroids: Map<MineralId, THREE.Object3D> = new Map();
  const missing: MineralId[] = [];

  for (const [mineral, model] of entries) {
    if (model === null) {
      missing.push(mineral);
      continue;
    }
    asteroids.set(mineral, model);
  }

  if (missing.length > 0) {
    console.info("모델이 없어 절차 생성으로 진행하는 광물:", missing.join(", "));
  }

  return { asteroids };
}

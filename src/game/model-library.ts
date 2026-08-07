import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MINERAL_ORDER, type MineralId } from "./minerals";

/** 광물 id 를 파일 이름으로 바꾼다. `COPPER` → `ore_copper.glb` */
function modelUrlFor(mineral: MineralId): string {
  return `models/ore_${mineral.toLowerCase()}.glb`;
}

/** 정규화 기준. */
const NORMALIZE = {
  /** 경계구 반지름을 1 로 맞춘다. 크기가 등급으로 정해지는 소행성용 */
  Radius: "RADIUS",
  /** 앞뒤 길이를 1 로 맞춘다. 길이가 곧 크기 감각인 함선용 */
  Length: "LENGTH",
} as const;

type NormalizeMode = (typeof NORMALIZE)[keyof typeof NORMALIZE];

/**
 * 모델 하나를 읽어 크기 1 로 정규화한다.
 *
 * 재질은 그대로 둔다. 만든 대로 보여야 하기 때문이다. 대신 장면에 환경 맵을
 * 깔아 금속 재질이 반사할 대상을 마련한다.
 *
 * 정규화해두면 만들어 온 크기와 무관하게 코드가 정한 크기로 나온다. 에셋이
 * 갱신돼도 배치 값을 다시 맞출 일이 없다.
 */
async function loadModel(
  url: string,
  mode: NormalizeMode = NORMALIZE.Radius,
): Promise<THREE.Object3D | null> {
  try {
    const loader: GLTFLoader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root: THREE.Object3D = gltf.scene;

    const box: THREE.Box3 = new THREE.Box3().setFromObject(root);
    const center: THREE.Vector3 = box.getCenter(new THREE.Vector3());
    root.position.sub(center);

    const size: number =
      mode === NORMALIZE.Length
        ? box.getSize(new THREE.Vector3()).z
        : box.getBoundingSphere(new THREE.Sphere()).radius;

    const wrapper: THREE.Group = new THREE.Group();
    wrapper.add(root);
    if (size > 1e-6) {
      wrapper.scale.setScalar(1 / size);
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
  /** 함선 선체. 앞뒤 길이가 1 로 맞춰져 있다 */
  readonly ship: THREE.Object3D | null;
  /** 함선에 다는 채굴 레이저 */
  readonly miningLaser: THREE.Object3D | null;
  /** 함선에 다는 견인빔 */
  readonly tractorBeam: THREE.Object3D | null;
};

/** 모델을 모두 읽는다. 실패한 것은 목록에서 빠진다. */
export async function loadModels(): Promise<ModelLibrary> {
  const [entries, ship, miningLaser, tractorBeam] = await Promise.all([
    Promise.all(
      MINERAL_ORDER.map(async (mineral): Promise<[MineralId, THREE.Object3D | null]> => {
        return [mineral, await loadModel(modelUrlFor(mineral))];
      }),
    ),
    loadModel("models/ship_standard.glb", NORMALIZE.Length),
    loadModel("models/mod_mining_laser_t1.glb"),
    loadModel("models/mod_tractor_beam_t1.glb"),
  ]);

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

  return { asteroids, ship, miningLaser, tractorBeam };
}

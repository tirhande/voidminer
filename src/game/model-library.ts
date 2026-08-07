import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** 소행성 모델 파일 경로. 없으면 절차 생성으로 되돌아간다. */
const ASTEROID_MODEL_URL = "models/asteroid.glb";

/**
 * 외부 모델을 읽어 지오메트리로 바꾼다.
 *
 * 모델의 재질은 쓰지 않는다. 광물색을 코드에서 입혀야 어느 광물인지가 색으로
 * 읽히기 때문이다. 그래서 필요한 것은 형태뿐이다.
 */
async function loadGeometry(url: string): Promise<THREE.BufferGeometry | null> {
  try {
    const loader: GLTFLoader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);

    let found: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((child: THREE.Object3D) => {
      if (found === null && child instanceof THREE.Mesh) {
        found = child.geometry.clone();
      }
    });

    if (found === null) {
      return null;
    }

    const geometry: THREE.BufferGeometry = found;
    // 원점과 크기를 코드가 기대하는 기준으로 맞춘다. 반지름 1 의 구가 기준이다.
    geometry.center();
    geometry.computeBoundingSphere();
    const radius: number = geometry.boundingSphere?.radius ?? 1;
    if (radius > 1e-6) {
      geometry.scale(1 / radius, 1 / radius, 1 / radius);
    }

    return geometry;
  } catch {
    // 파일이 없거나 읽지 못하면 절차 생성으로 간다. 게임이 멈추면 안 된다.
    return null;
  }
}

/**
 * 게임이 쓰는 외부 모델 묶음.
 *
 * 모델이 없어도 게임은 그대로 돌아간다. 에셋 교체를 마지막으로 미뤄둔 상태에서
 * 파일이 들어오는 대로 붙이려면 없는 경우가 정상 경로여야 한다.
 */
export type ModelLibrary = {
  /** 소행성 형태. 없으면 null */
  readonly asteroid: THREE.BufferGeometry | null;
};

/** 모델을 모두 읽는다. 실패한 것은 null 로 남는다. */
export async function loadModels(): Promise<ModelLibrary> {
  const asteroid: THREE.BufferGeometry | null = await loadGeometry(ASTEROID_MODEL_URL);

  if (asteroid === null) {
    console.info("소행성 모델이 없어 절차 생성으로 진행한다:", ASTEROID_MODEL_URL);
  }

  return { asteroid };
}

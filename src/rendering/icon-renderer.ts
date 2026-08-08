import * as THREE from "three";

import { LIGHTING } from "../palette";

/** 아이콘 한 변의 픽셀 수. 격자 칸이 작아 이 이상은 티가 안 난다. */
const SIZE = 96;

/** 모델을 담을 화면 비율. 1 보다 작게 잡아 가장자리에 여백을 둔다. */
const FIT = 0.78;

/**
 * 모델을 그림 한 장으로 굽는다.
 *
 * 격자 칸마다 3D 장면을 따로 돌리면 칸 수만큼 렌더러가 필요하다. 칸은 스물이고
 * 내용이 바뀌지도 않으므로, 시작할 때 한 번 구워서 그림으로 쓰는 편이 맞다.
 *
 * 굽고 나면 렌더러와 장면을 즉시 버린다. 게임 렌더러와 따로 두는 이유는 장면
 * 구성과 카메라를 통째로 바꿔야 하기 때문이다.
 */
export function renderModelIcons(
  models: ReadonlyMap<string, THREE.Object3D>,
): Map<string, string> {
  const icons: Map<string, string> = new Map();
  if (models.size === 0) {
    return icons;
  }

  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene: THREE.Scene = new THREE.Scene();

  // 아이콘은 형태만 읽히면 된다. 게임 장면보다 밝게, 그림자면도 살려서 굽는다.
  scene.add(new THREE.AmbientLight(0xffffff, LIGHTING.AmbientIntensity * 1.6));
  const key: THREE.DirectionalLight = new THREE.DirectionalLight(0xfff2e0, 3.4);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim: THREE.DirectionalLight = new THREE.DirectionalLight(0x6fb6e8, 1.8);
  rim.position.set(3, -1, -2);
  scene.add(rim);

  // 모델은 반지름 1 로 정규화돼 있다. 정투영이라 원근 왜곡 없이 꽉 차게 담긴다.
  const camera: THREE.OrthographicCamera = new THREE.OrthographicCamera(
    -1 / FIT,
    1 / FIT,
    1 / FIT,
    -1 / FIT,
    0.1,
    100,
  );
  camera.position.set(2.2, 1.8, 3);
  camera.lookAt(0, 0, 0);

  for (const [key_, model] of models) {
    const subject: THREE.Object3D = model.clone(true);
    // 정면으로 두면 실루엣이 밋밋하다. 살짝 돌려 면이 갈리게 한다.
    subject.rotation.set(0.3, 0.7, 0.1);
    scene.add(subject);

    renderer.render(scene, camera);
    icons.set(key_, canvas.toDataURL("image/png"));

    scene.remove(subject);
  }

  renderer.dispose();
  return icons;
}

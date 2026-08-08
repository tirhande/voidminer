import * as THREE from "three";

/** 그려 넣을 정사각 크기. 작은 점이라 이 이상은 티가 안 난다. */
const SIZE = 32;

let cached: THREE.Texture | null = null;

/**
 * 가운데가 밝고 가장자리로 갈수록 사라지는 둥근 점.
 *
 * 점을 그냥 그리면 정사각형이 나온다. 멀리 있는 별은 작아서 티가 안 나지만,
 * 가까이 두는 입자는 흰 네모로 보인다. 둥글게 깎은 그림을 씌워야 빛 알갱이로
 * 읽힌다.
 *
 * 파일로 두지 않고 그려서 만든다. 32 픽셀짜리 한 장이라 받을 것을 늘릴 이유가
 * 없다. 한 번 만들어 두고 돌려 쓴다.
 */
export function getDotTexture(): THREE.Texture {
  if (cached !== null) {
    return cached;
  }

  // 화면 없이 도는 곳에서도 불린다. 규칙만 시험할 때는 그림이 필요 없다.
  if (typeof document === "undefined") {
    cached = new THREE.Texture();
    return cached;
  }

  const canvas: HTMLCanvasElement = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const context: CanvasRenderingContext2D | null = canvas.getContext("2d");
  if (context === null) {
    // 2D 판을 못 얻는 환경이면 빈 그림이라도 돌려준다. 게임이 멈추면 안 된다.
    cached = new THREE.Texture();
    return cached;
  }

  const half: number = SIZE / 2;
  const gradient: CanvasGradient = context.createRadialGradient(
    half,
    half,
    0,
    half,
    half,
    half,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.55)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, SIZE, SIZE);

  const texture: THREE.CanvasTexture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}

import * as THREE from "three";

import { PALETTE } from "../palette";

/** 환경 맵 해상도. 거친 반사에만 쓰이므로 작아도 된다. */
const WIDTH = 64;
const HEIGHT = 32;

/** 0~1 로 정규화된 색 성분을 꺼낸다. */
function toRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/**
 * 우주 배경을 흉내 낸 환경 맵을 만든다.
 *
 * 모델에 금속성이 높은 재질이 섞여 있는데, 금속은 주변을 반사해서 형태가
 * 드러나는 재질이다. 반사할 것이 없으면 검게 죽어 만든 대로 보이지 않는다.
 * 재질을 고치는 대신 반사할 대상을 마련해 원본 재질을 그대로 살린다.
 *
 * 성운과 같은 색을 쓰므로 화면에 보이는 배경과 반사가 어긋나지 않는다.
 */
export function createSpaceEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const data: Uint8Array = new Uint8Array(WIDTH * HEIGHT * 4);

  const [voidR, voidG, voidB] = toRgb(PALETTE.Void);
  const [coolR, coolG, coolB] = toRgb(PALETTE.NebulaCool);
  const [warmR, warmG, warmB] = toRgb(PALETTE.NebulaWarm);

  for (let y = 0; y < HEIGHT; y += 1) {
    // 위쪽은 차갑고 아래쪽은 어둡다. 주광이 오는 한쪽만 따뜻하게 둔다.
    const verticalRatio: number = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const horizontalRatio: number = x / (WIDTH - 1);
      const keyLightFalloff: number = Math.max(
        0,
        1 - Math.abs(horizontalRatio - 0.25) * 4,
      );

      const coolMix: number = (1 - verticalRatio) * 0.55;
      const warmMix: number = keyLightFalloff * (1 - verticalRatio * 0.5) * 0.45;

      const offset: number = (y * WIDTH + x) * 4;
      data[offset] = voidR + coolR * coolMix + warmR * warmMix;
      data[offset + 1] = voidG + coolG * coolMix + warmG * warmMix;
      data[offset + 2] = voidB + coolB * coolMix + warmB * warmMix;
      data[offset + 3] = 255;
    }
  }

  const source: THREE.DataTexture = new THREE.DataTexture(data, WIDTH, HEIGHT);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;

  const generator: THREE.PMREMGenerator = new THREE.PMREMGenerator(renderer);
  const target: THREE.WebGLRenderTarget = generator.fromEquirectangular(source);

  source.dispose();
  generator.dispose();

  return target.texture;
}

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { POST_PROCESSING } from "../palette";

/**
 * 후처리 파이프라인.
 *
 * 이 화면에서 블룸은 장식이 아니라 정보다. 채굴 레이저, 명중 지점, 보석 파편,
 * 거점 유도등이 전부 발광체이고, 번짐이 있어야 어둠 속에서 무엇이 작동 중인지가
 * 먼저 읽힌다.
 *
 * 순서는 렌더 → 블룸 → 출력이다. OutputPass 가 톤 매핑과 색 공간 변환을
 * 맡으므로, 이것이 빠지면 화면이 씻긴 것처럼 밝아진다.
 */
/**
 * 블룸을 그리는 해상도 비율.
 *
 * 블룸은 번지게 하는 효과라 절반 해상도로 그려도 눈에 띄지 않는다. 대신 픽셀
 * 수가 넉 배로 줄어든다. 이 통과가 화면 크기에 그대로 비례해 무거워지는 쪽이라
 * 여기서 아끼는 것이 가장 크다.
 */
const BLOOM_SCALE = 0.5;

export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  public constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = POST_PROCESSING.ToneMappingExposure;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        window.innerWidth * BLOOM_SCALE,
        window.innerHeight * BLOOM_SCALE,
      ),
      POST_PROCESSING.BloomStrength,
      POST_PROCESSING.BloomRadius,
      POST_PROCESSING.BloomThreshold,
    );
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new OutputPass());
    this.setSize(window.innerWidth, window.innerHeight);
  }

  /** 화면 크기가 바뀌었을 때 호출한다. */
  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width * BLOOM_SCALE, height * BLOOM_SCALE);
  }

  /** 한 프레임을 그린다. renderer.render 대신 호출한다. */
  public render(): void {
    this.composer.render();
  }
}

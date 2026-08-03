import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "./constants";
import { ChaseCamera } from "./game/chase-camera";
import { DustField } from "./game/dust-field";
import { FlightInput } from "./game/flight-input";
import type { FlightInputState } from "./game/flight-input";
import { Hud } from "./game/hud";
import { Ship } from "./game/ship";
import { Starfield } from "./game/starfield";

/** 렌더 대상 캔버스를 가져온다. */
function requireCanvas(id: string): HTMLCanvasElement {
  const element: HTMLElement | null = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(`캔버스를 찾을 수 없다: #${id}`);
  }
  return element;
}

/**
 * 우주 공간의 조명을 구성한다.
 *
 * 먼 항성이 주광이고, 반대편에서 푸른 반사광이 윤곽을 잡는다. 여기에 위아래로
 * 색이 갈리는 반구광을 더해 그림자면이 완전히 검게 죽지 않도록 받쳐준다.
 */
function createLighting(): THREE.Object3D[] {
  const hemisphere: THREE.HemisphereLight = new THREE.HemisphereLight(
    0x9dc6ec,
    0x263148,
    1.5,
  );

  const ambient: THREE.AmbientLight = new THREE.AmbientLight(0x4b6a91, 1.2);

  const keyLight: THREE.DirectionalLight = new THREE.DirectionalLight(0xfff2e0, 3.4);
  keyLight.position.set(-120, 90, -60);

  const rimLight: THREE.DirectionalLight = new THREE.DirectionalLight(0x6fb6e8, 1.8);
  rimLight.position.set(80, -40, 110);

  return [hemisphere, ambient, keyLight, rimLight];
}

function bootstrap(): void {
  const canvas: HTMLCanvasElement = requireCanvas("viewport");

  const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x04060d, 1);

  const scene: THREE.Scene = new THREE.Scene();
  for (const light of createLighting()) {
    scene.add(light);
  }

  const ship: Ship = new Ship();
  scene.add(ship.object3D);

  const starfield: Starfield = new Starfield();
  scene.add(starfield.object3D);

  const dustField: DustField = new DustField(ship.position);
  scene.add(dustField.object3D);

  const chaseCamera: ChaseCamera = new ChaseCamera(
    ship,
    window.innerWidth / window.innerHeight,
  );

  const input: FlightInput = new FlightInput(canvas);
  const hud: Hud = new Hud();
  hud.onEngageRequested(() => {
    input.requestControl();
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    chaseCamera.setAspect(window.innerWidth / window.innerHeight);
  });

  const clock: THREE.Clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    // 탭이 백그라운드에 있다가 돌아오면 델타가 크게 튄다. 상한을 둔다.
    const deltaSeconds: number = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
    const flightInput: FlightInputState = input.sample();

    ship.update(deltaSeconds, flightInput);
    chaseCamera.update(deltaSeconds);
    starfield.follow(ship.position);
    dustField.wrapAround(ship.position);
    hud.update(ship.speed, flightInput, input.isEngaged);

    renderer.render(scene, chaseCamera.camera);
  });
}

bootstrap();

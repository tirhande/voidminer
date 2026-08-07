import * as THREE from "three";

import { MAX_DELTA_SECONDS, WARP } from "./constants";
import { AsteroidField } from "./game/asteroid-field";
import { Cargo } from "./game/cargo";
import { ChaseCamera } from "./game/chase-camera";
import { DebrisField } from "./game/debris-field";
import { DustField } from "./game/dust-field";
import { ShipEquipment } from "./game/equipment";
import { FlightInput } from "./game/flight-input";
import type { FlightInputState } from "./game/flight-input";
import { Hud } from "./game/hud";
import { MiningLaser } from "./game/mining-laser";
import { loadModels, type ModelLibrary } from "./game/model-library";
import type { AimReport } from "./game/mining-laser";
import { Ship } from "./game/ship";
import { Nebula } from "./game/nebula";
import { ObjectiveTracker } from "./game/objectives";
import type { ObjectiveSnapshot, ObjectiveView } from "./game/objectives";
import { Starfield } from "./game/starfield";
import { Station } from "./game/station";
import { StationConsole } from "./game/station-console";
import type { StationView } from "./game/station-console";
import {
  STAR_SYSTEM_DEFINITIONS,
  STARTING_SYSTEM,
  type StarSystemId,
} from "./game/star-systems";
import { StationStock } from "./game/station-stock";
import { TractorBeam } from "./game/tractor-beam";
import { Warp } from "./game/warp";
import { LIGHTING, PALETTE } from "./palette";
import { createSpaceEnvironment } from "./rendering/environment";
import { PostProcessing } from "./rendering/post-processing";

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
 *
 * 세기는 ACES 톤 매핑을 전제로 잡았다. 톤 매핑은 하이라이트를 눌러 색이 타는
 * 것을 막는 대신 전체를 어둡게 만들므로, 톤 매핑을 끄면 과하게 밝아진다.
 */
function createLighting(): THREE.Object3D[] {
  const hemisphere: THREE.HemisphereLight = new THREE.HemisphereLight(
    0x9dc6ec,
    0x263148,
    LIGHTING.HemisphereIntensity,
  );

  const ambient: THREE.AmbientLight = new THREE.AmbientLight(
    0x4b6a91,
    LIGHTING.AmbientIntensity,
  );

  const keyLight: THREE.DirectionalLight = new THREE.DirectionalLight(
    0xfff2e0,
    LIGHTING.KeyIntensity,
  );
  keyLight.position.set(-120, 90, -60);

  const rimLight: THREE.DirectionalLight = new THREE.DirectionalLight(
    0x6fb6e8,
    LIGHTING.RimIntensity,
  );
  rimLight.position.set(80, -40, 110);

  return [hemisphere, ambient, keyLight, rimLight];
}

async function bootstrap(): Promise<void> {
  const canvas: HTMLCanvasElement = requireCanvas("viewport");

  const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(PALETTE.Void, 1);

  const scene: THREE.Scene = new THREE.Scene();
  // 모델에 금속성이 높은 재질이 섞여 있다. 금속은 주변을 반사해서 형태가
  // 드러나므로 반사할 것이 없으면 검게 죽는다. 재질을 고치는 대신 반사할
  // 대상을 마련해 원본 재질을 그대로 살린다.
  scene.environment = createSpaceEnvironment(renderer);
  for (const light of createLighting()) {
    scene.add(light);
  }

  // 모델이 없으면 null 이 오고 절차 생성으로 진행한다. 없는 것이 정상 경로다.
  const models: ModelLibrary = await loadModels();

  const ship: Ship = new Ship(models.ship, models.miningLaser, models.tractorBeam);
  scene.add(ship.object3D);

  const nebula: Nebula = new Nebula();
  scene.add(nebula.object3D);

  const starfield: Starfield = new Starfield();
  scene.add(starfield.object3D);

  const dustField: DustField = new DustField(ship.position);
  scene.add(dustField.object3D);

  // 필드 중심은 함선 시작 지점에 고정한다. 항성계를 갈아도 거점과 필드의
  // 위치 관계가 유지돼야 도착하자마자 헤매지 않는다.
  const fieldOrigin: THREE.Vector3 = ship.position.clone();
  let asteroidField: AsteroidField = new AsteroidField(
    fieldOrigin,
    models.asteroids,
    STAR_SYSTEM_DEFINITIONS[STARTING_SYSTEM],
  );
  scene.add(asteroidField.object3D);

  const warp: Warp = new Warp();
  scene.add(warp.object3D);

  const debrisField: DebrisField = new DebrisField();
  scene.add(debrisField.object3D);

  // 빔은 선체에 붙은 모듈에서 나가야 한다. 자리는 함선이 정해서 알려준다.
  const miningLaser: MiningLaser = new MiningLaser();
  miningLaser.setMuzzle(ship.laserHardpoint);
  scene.add(miningLaser.object3D);

  const tractorBeam: TractorBeam = new TractorBeam();
  tractorBeam.setEmitter(ship.tractorHardpoint);
  scene.add(tractorBeam.object3D);

  const station: Station = new Station(ship.position);
  scene.add(station.object3D);

  const equipment: ShipEquipment = new ShipEquipment();
  const cargo: Cargo = new Cargo();
  const stationStock: StationStock = new StationStock();
  const stationConsole: StationConsole = new StationConsole();
  const objectives: ObjectiveTracker = new ObjectiveTracker();

  const chaseCamera: ChaseCamera = new ChaseCamera(
    ship,
    window.innerWidth / window.innerHeight,
  );

  const postProcessing: PostProcessing = new PostProcessing(
    renderer,
    scene,
    chaseCamera.camera,
  );

  const input: FlightInput = new FlightInput(canvas);
  const hud: Hud = new Hud();
  hud.onEngageRequested(() => {
    input.requestControl();
  });
  hud.onStationAction((action) => {
    stationConsole.execute(action, cargo, stationStock, equipment);
  });

  /**
   * 항성계를 갈아끼운다. 워프 연출 한가운데에서 불린다.
   *
   * 화면이 가장 흐트러져 있을 때 바꿔야 소행성이 사라지고 나타나는 것이 눈에
   * 띄지 않는다. 화물과 저장고는 그대로 따라간다.
   */
  function switchSystem(target: StarSystemId): void {
    scene.remove(asteroidField.object3D);
    asteroidField.dispose();

    asteroidField = new AsteroidField(
      fieldOrigin,
      models.asteroids,
      STAR_SYSTEM_DEFINITIONS[target],
    );
    scene.add(asteroidField.object3D);

    // 이전 항성계에서 캐던 파편이 따라오면 안 된다.
    debrisField.clear();
    stationConsole.arriveAt(target);
  }

  /**
   * 도킹 상태가 바뀌면 조종과 커서를 함께 전환한다.
   *
   * 도킹 중에는 비행이 멈추고 커서가 돌아온다. 그래야 화면을 마우스로 누를 수
   * 있고, 조종과 클릭이 부딪히지 않는다.
   */
  let wasDocked: boolean = false;
  function syncDockingMode(isDocked: boolean): void {
    if (isDocked === wasDocked) {
      return;
    }
    wasDocked = isDocked;
    document.body.classList.toggle("docked", isDocked);

    input.setDocked(isDocked);

    if (isDocked) {
      ship.halt();
    } else {
      input.requestControl();
    }
  }

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    chaseCamera.setAspect(window.innerWidth / window.innerHeight);
    postProcessing.setSize(window.innerWidth, window.innerHeight);
  });

  const clock: THREE.Clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    // 탭이 백그라운드에 있다가 돌아오면 델타가 크게 튄다. 상한을 둔다.
    const deltaSeconds: number = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
    const flightInput: FlightInputState = input.sample();

    // 거점에서 누른 워프를 집어간다. 도킹을 풀어야 연출이 보인다.
    const warpTarget: StarSystemId | null = stationConsole.takePendingWarp();
    if (warpTarget !== null && !warp.isActive) {
      stationConsole.setDocked(false);
      ship.halt();
      warp.start(
        () => switchSystem(warpTarget),
        () => undefined,
      );
    }

    // 도킹 중과 워프 중에는 비행 입력을 무시한다. 관성으로 흘러가면 안 된다.
    if (!stationConsole.isDocked && !warp.isActive) {
      ship.update(deltaSeconds, flightInput);
    }
    warp.update(deltaSeconds, chaseCamera.camera);
    chaseCamera.update(deltaSeconds, WARP.FovGain * warp.intensity);
    nebula.follow(ship.position);
    starfield.follow(ship.position);
    dustField.wrapAround(ship.position);

    // 조준은 카메라 기준으로 판정해야 화면 중앙 조준점과 명중 지점이 일치한다.
    const aimReport: AimReport = miningLaser.update(
      deltaSeconds,
      chaseCamera.camera,
      ship.position,
      ship.quaternion,
      flightInput.isFiring && !warp.isActive,
      equipment,
      asteroidField,
      debrisField,
    );
    asteroidField.update(deltaSeconds, ship.position);
    debrisField.update(
      deltaSeconds,
      ship.position,
      ship.velocity,
      flightInput.isTractorActive && !warp.isActive,
      equipment.tractorCapacity,
      cargo,
    );
    tractorBeam.update(
      deltaSeconds,
      flightInput.isTractorActive && !warp.isActive,
      ship.position,
      ship.quaternion,
      debrisField.pulledDebris,
    );

    station.update(deltaSeconds);
    const stationView: StationView = stationConsole.update(
      flightInput,
      ship.position,
      station,
      cargo,
      stationStock,
      equipment,
    );

    hud.updateFlight(
      ship.speed,
      flightInput,
      input.isEngaged,
      debrisField.pulledDebris.length,
      equipment.tractorCapacity,
    );
    // 목표는 화물과 저장고 양쪽을 본다. 하역해서 화물을 비워도 진행이
    // 되돌아가지 않아야 하기 때문이다.
    const snapshot: ObjectiveSnapshot = {
      debrisSpawned: debrisField.totalSpawned,
      cargoTotal: cargo.total,
      cargoCapacity: cargo.capacity,
      isDocked: stationConsole.isDocked,
      stockOre: stationStock.totalOre,
      stockIngots: stationStock.totalIngots,
      alloyOf: (alloy) => stationStock.alloysOf(alloy),
      seenMinerals: cargo.seenResources,
      laserTier: equipment.laserTier,
      laserUpgrade: equipment.laserUpgrade,
    };
    const objectiveView: ObjectiveView = objectives.update(snapshot);

    hud.updateAim(aimReport);
    hud.updateObjective(objectiveView);
    hud.updateCargo(cargo);
    hud.updateEquipment(equipment, station.distanceTo(ship.position));
    hud.updateStation(stationView);
    syncDockingMode(stationView.isDocked);

    postProcessing.render();
  });
}

void bootstrap();

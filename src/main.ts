import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "./constants";
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
import { StationStock } from "./game/station-stock";
import { TractorBeam } from "./game/tractor-beam";
import { LIGHTING, PALETTE } from "./palette";
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
  for (const light of createLighting()) {
    scene.add(light);
  }

  const ship: Ship = new Ship();
  scene.add(ship.object3D);

  const nebula: Nebula = new Nebula();
  scene.add(nebula.object3D);

  const starfield: Starfield = new Starfield();
  scene.add(starfield.object3D);

  const dustField: DustField = new DustField(ship.position);
  scene.add(dustField.object3D);

  // 모델이 없으면 null 이 오고 절차 생성으로 진행한다. 없는 것이 정상 경로다.
  const models: ModelLibrary = await loadModels();

  const asteroidField: AsteroidField = new AsteroidField(ship.position, models.asteroid);
  scene.add(asteroidField.object3D);

  const debrisField: DebrisField = new DebrisField();
  scene.add(debrisField.object3D);

  const miningLaser: MiningLaser = new MiningLaser();
  scene.add(miningLaser.object3D);

  const tractorBeam: TractorBeam = new TractorBeam();
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

    // 도킹 중에는 비행 입력을 무시한다. 관성으로 흘러가면 안 된다.
    if (!stationConsole.isDocked) {
      ship.update(deltaSeconds, flightInput);
    }
    chaseCamera.update(deltaSeconds);
    nebula.follow(ship.position);
    starfield.follow(ship.position);
    dustField.wrapAround(ship.position);

    // 조준은 카메라 기준으로 판정해야 화면 중앙 조준점과 명중 지점이 일치한다.
    const aimReport: AimReport = miningLaser.update(
      deltaSeconds,
      chaseCamera.camera,
      ship.position,
      ship.quaternion,
      flightInput.isFiring,
      equipment,
      asteroidField,
      debrisField,
    );
    asteroidField.update(deltaSeconds, ship.position);
    debrisField.update(
      deltaSeconds,
      ship.position,
      ship.velocity,
      flightInput.isTractorActive,
      equipment.tractorCapacity,
      cargo,
    );
    tractorBeam.update(
      deltaSeconds,
      flightInput.isTractorActive,
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

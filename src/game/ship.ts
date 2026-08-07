import * as THREE from "three";

import { SHIP_MODEL, SHIP_TUNING } from "../constants";
import { EMISSION, PALETTE, POINT_LIGHT, SURFACE } from "../palette";
import type { FlightInputState } from "./flight-input";

/** 함선 로컬 좌표계의 기준 축. 함선은 -Z 방향을 바라본다. */
const LOCAL_FORWARD: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
const LOCAL_UP: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

/** 프레임마다 새로 할당하지 않기 위한 계산용 임시 벡터. */
const scratchVector: THREE.Vector3 = new THREE.Vector3();
const scratchAxis: THREE.Vector3 = new THREE.Vector3();
const scratchQuaternion: THREE.Quaternion = new THREE.Quaternion();

/**
 * 플레이어 함선.
 *
 * 비행 모델은 뉴턴식이다. 추력은 속도를 직접 정하지 않고 가속도로만 작용하며,
 * 입력을 놓으면 함선은 마지막 속도를 그대로 유지한 채 계속 나아간다.
 */
export class Ship {
  public readonly object3D: THREE.Group;
  /** 채굴 레이저가 붙은 자리. 함선 로컬 좌표다 */
  public readonly laserHardpoint: THREE.Vector3;
  /** 견인빔이 붙은 자리. 함선 로컬 좌표다 */
  public readonly tractorHardpoint: THREE.Vector3;

  private readonly velocityVector: THREE.Vector3 = new THREE.Vector3();
  private readonly angularVelocity: THREE.Vector3 = new THREE.Vector3();
  private readonly engineGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly engineLight: THREE.PointLight;

  /**
   * @param hullModel 선체 모델. 없으면 절차 생성으로 만든다
   * @param laserModel 채굴 레이저 모듈 모델
   * @param tractorModel 견인빔 모듈 모델
   */
  public constructor(
    hullModel: THREE.Object3D | null = null,
    laserModel: THREE.Object3D | null = null,
    tractorModel: THREE.Object3D | null = null,
  ) {
    this.object3D = new THREE.Group();
    this.object3D.name = "PlayerShip";

    const hull: THREE.Object3D | null =
      hullModel !== null ? this.attachHull(hullModel) : null;
    const hullSize: THREE.Vector3 =
      hull !== null
        ? new THREE.Box3().setFromObject(hull).getSize(new THREE.Vector3())
        : this.buildProceduralHull();

    this.laserHardpoint = this.resolveHardpoint(
      hull,
      SHIP_MODEL.Socket.Laser,
      hullSize,
      1,
    );
    this.tractorHardpoint = this.resolveHardpoint(
      hull,
      SHIP_MODEL.Socket.Tractor,
      hullSize,
      -1,
    );

    this.attachModule(laserModel, this.laserHardpoint, "MiningLaserModule");
    this.attachModule(tractorModel, this.tractorHardpoint, "TractorBeamModule");

    // 엔진 발광 — 추력에 따라 밝기가 변한다. 분사구 자리에 붙인다.
    const thruster: THREE.Vector3 =
      this.socketPosition(hull, SHIP_MODEL.Socket.Thruster) ??
      new THREE.Vector3(0, 0, hullSize.z / 2);

    this.engineGlow = new THREE.Mesh(
      new THREE.SphereGeometry(hullSize.y * 0.22, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 }),
    );
    this.engineGlow.position.copy(thruster);
    this.object3D.add(this.engineGlow);

    this.engineLight = new THREE.PointLight(0x6fd0ff, 0, 26, 2);
    // 빛은 분사구보다 조금 더 뒤에 둔다. 선체 안에서 새어 나오면 안 된다.
    this.engineLight.position.set(thruster.x, thruster.y, thruster.z + 0.4);
    this.object3D.add(this.engineLight);
  }

  /**
   * 선체 모델을 붙인다.
   *
   * 모델은 앞뒤 길이 1 로 정규화돼 들어온다. 재질은 손대지 않는다. 만든 대로
   * 보여야 하고, 장면에 환경 맵이 깔려 있어 금속 재질도 형태가 드러난다.
   *
   * 이 모델은 기수가 +Z 를 향한다. 비행 코드는 -Z 를 앞으로 보므로 돌려서
   * 붙인다. 돌리지 않으면 배가 뒤로 난다.
   */
  private attachHull(model: THREE.Object3D): THREE.Object3D {
    const hull: THREE.Object3D = model.clone(true);
    hull.scale.multiplyScalar(SHIP_MODEL.Length);
    hull.rotateY(Math.PI);
    hull.name = "Hull";
    this.object3D.add(hull);
    hull.updateMatrixWorld(true);

    return hull;
  }

  /**
   * 모델 안의 장착 소켓 자리를 함선 로컬 좌표로 읽는다.
   *
   * 소켓은 빈 노드라 위치만 갖고 있다. 선체에 건 회전과 배율을 그대로 타므로
   * 기수를 돌린 것도 자동으로 반영된다.
   */
  private socketPosition(hull: THREE.Object3D | null, name: string): THREE.Vector3 | null {
    const socket: THREE.Object3D | undefined = hull?.getObjectByName(name);
    if (socket === undefined) {
      return null;
    }
    return this.object3D.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
  }

  /**
   * 장착 자리를 정한다. 소켓이 있으면 그것을 쓰고, 없으면 선체 크기로 잡는다.
   *
   * @param side 좌우 방향. 1 이 우현이다
   */
  private resolveHardpoint(
    hull: THREE.Object3D | null,
    socketName: string,
    hullSize: THREE.Vector3,
    side: number,
  ): THREE.Vector3 {
    const socket: THREE.Vector3 | null = this.socketPosition(hull, socketName);
    if (socket !== null) {
      return socket;
    }

    const fallback = SHIP_MODEL.FallbackHardpoint;
    return new THREE.Vector3(
      (hullSize.x / 2) * fallback.LateralRatio * side,
      (hullSize.y / 2) * fallback.VerticalRatio,
      (hullSize.z / 2) * fallback.ForwardRatio,
    );
  }

  /** 모듈 하나를 장착 위치에 붙인다. 모델이 없으면 아무것도 달지 않는다. */
  private attachModule(
    model: THREE.Object3D | null,
    position: THREE.Vector3,
    name: string,
  ): void {
    if (model === null) {
      return;
    }

    const module: THREE.Object3D = model.clone(true);
    // 모델은 반지름 1 로 정규화돼 있으므로 지름의 절반이 배율이다.
    module.scale.multiplyScalar(SHIP_MODEL.ModuleSize / 2);
    module.position.copy(position);
    module.name = name;
    this.object3D.add(module);
  }

  /**
   * 절차 생성 선체. 모델이 없을 때 쓴다.
   *
   * @returns 선체 크기 (m)
   */
  private buildProceduralHull(): THREE.Vector3 {
    // 환경 맵이 없는 장면이므로 금속성을 낮게 잡는다. 금속은 반사로 밝아지는
    // 재질이라, 반사할 것이 없는 우주 공간에서 금속성을 높이면 검게 죽는다.
    // 자체 발광을 약하게 깔아 그림자 쪽도 완전히 어두워지지 않게 한다.
    const hullMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.Hull,
      metalness: SURFACE.HullMetalness,
      roughness: SURFACE.HullRoughness,
      emissive: 0x243a5c,
      emissiveIntensity: EMISSION.Hull,
      flatShading: true,
    });
    const trimMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.Trim,
      metalness: SURFACE.HullMetalness,
      roughness: SURFACE.HullRoughness,
      emissive: PALETTE.Signal,
      emissiveIntensity: EMISSION.Trim,
      flatShading: true,
    });

    // 선체 — 원뿔을 눕혀 -Z 를 향하게 한다.
    const hullGeometry: THREE.ConeGeometry = new THREE.ConeGeometry(0.85, 4, 6);
    hullGeometry.rotateX(-Math.PI / 2);
    const hull: THREE.Mesh = new THREE.Mesh(hullGeometry, hullMaterial);
    this.object3D.add(hull);

    // 주익 한 쌍.
    const wingGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(3.4, 0.16, 1.1);
    const wing: THREE.Mesh = new THREE.Mesh(wingGeometry, hullMaterial);
    wing.position.set(0, -0.12, 0.5);
    this.object3D.add(wing);

    // 수직 미익.
    const finGeometry: THREE.BoxGeometry = new THREE.BoxGeometry(0.14, 0.9, 1);
    const fin: THREE.Mesh = new THREE.Mesh(finGeometry, trimMaterial);
    fin.position.set(0, 0.45, 1.3);
    this.object3D.add(fin);

    // 엔진 노즐.
    const nozzleGeometry: THREE.CylinderGeometry = new THREE.CylinderGeometry(0.42, 0.5, 0.7, 8);
    nozzleGeometry.rotateX(Math.PI / 2);
    const nozzle: THREE.Mesh = new THREE.Mesh(nozzleGeometry, trimMaterial);
    nozzle.position.set(0, 0, 2.1);
    this.object3D.add(nozzle);

    return new THREE.Vector3(3.4, 1.6, 4.6);
  }

  /** 현재 속력 (m/s). */
  public get speed(): number {
    return this.velocityVector.length();
  }

  /**
   * 현재 속도 벡터 (m/s).
   *
   * 견인빔이 참조한다. 파편을 끌어당길 때 함선의 속도를 기준으로 삼아야
   * 움직이는 함선을 따라올 수 있다.
   */
  public get velocity(): THREE.Vector3 {
    return this.velocityVector;
  }

  /** 월드 좌표 위치. 카메라와 스타필드가 참조한다. */
  public get position(): THREE.Vector3 {
    return this.object3D.position;
  }

  /** 월드 회전. */
  public get quaternion(): THREE.Quaternion {
    return this.object3D.quaternion;
  }

  /**
   * 함선을 즉시 멈춘다.
   *
   * 도킹하면 조종이 끊기므로 관성으로 계속 흘러가면 안 된다. 도크에 물린
   * 상태라고 보면 된다.
   */
  public halt(): void {
    this.velocityVector.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  /**
   * 한 프레임만큼 비행을 진행시킨다.
   *
   * @param deltaSeconds 프레임 델타 타임 (s)
   * @param input 이번 프레임의 조종 입력
   */
  public update(deltaSeconds: number, input: FlightInputState): void {
    this.integrateRotation(deltaSeconds, input);
    this.integrateVelocity(deltaSeconds, input);
    this.updateEngineVisual(input);
  }

  private integrateRotation(deltaSeconds: number, input: FlightInputState): void {
    // 마우스 이동량은 각속도에 대한 충격량으로 다룬다. 감쇠가 걸려 있으므로
    // 손을 떼면 회전이 서서히 멎고, 계속 움직이면 회전이 누적된다.
    this.angularVelocity.x -= input.pitchDelta * SHIP_TUNING.MouseSensitivity;
    this.angularVelocity.y -= input.yawDelta * SHIP_TUNING.MouseSensitivity;
    this.angularVelocity.z += input.roll * SHIP_TUNING.RollAcceleration * deltaSeconds;

    const angularDecay: number = Math.exp(-SHIP_TUNING.AngularDamping * deltaSeconds);
    this.angularVelocity.multiplyScalar(angularDecay);

    if (this.angularVelocity.length() > SHIP_TUNING.MaxAngularSpeed) {
      this.angularVelocity.setLength(SHIP_TUNING.MaxAngularSpeed);
    }

    const angle: number = this.angularVelocity.length() * deltaSeconds;
    if (angle > 1e-6) {
      scratchAxis.copy(this.angularVelocity).normalize();
      scratchQuaternion.setFromAxisAngle(scratchAxis, angle);
      // 로컬 축 기준 회전이므로 오른쪽에서 곱한다.
      this.object3D.quaternion.multiply(scratchQuaternion).normalize();
    }
  }

  private integrateVelocity(deltaSeconds: number, input: FlightInputState): void {
    const boost: number = input.isBoosting ? SHIP_TUNING.BoostMultiplier : 1;

    scratchVector.set(0, 0, 0);
    scratchVector.addScaledVector(LOCAL_FORWARD, input.thrust * SHIP_TUNING.MainThrust);
    scratchVector.addScaledVector(LOCAL_RIGHT, input.strafe * SHIP_TUNING.StrafeThrust);
    scratchVector.addScaledVector(LOCAL_UP, input.lift * SHIP_TUNING.LiftThrust);
    scratchVector.applyQuaternion(this.object3D.quaternion).multiplyScalar(boost);

    this.velocityVector.addScaledVector(scratchVector, deltaSeconds);

    if (input.isAssisting) {
      const assistDecay: number = Math.exp(-SHIP_TUNING.AssistDamping * deltaSeconds);
      this.velocityVector.multiplyScalar(assistDecay);
    }

    const speedLimit: number = SHIP_TUNING.MaxSpeed * boost;
    if (this.velocityVector.length() > speedLimit) {
      this.velocityVector.setLength(speedLimit);
    }

    this.object3D.position.addScaledVector(this.velocity, deltaSeconds);
  }

  private updateEngineVisual(input: FlightInputState): void {
    const forwardThrust: number = Math.max(input.thrust, 0);
    const boost: number = input.isBoosting ? 1.7 : 1;
    const intensity: number = forwardThrust * boost;

    this.engineGlow.scale.setScalar(0.55 + intensity * 0.85);
    this.engineGlow.material.opacity = 0.35 + intensity * 0.6;
    this.engineLight.intensity = intensity * POINT_LIGHT.Engine;
  }
}

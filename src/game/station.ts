import * as THREE from "three";

import { STATION, STATION_MODEL } from "../constants";
import { EMISSION, PALETTE, POINT_LIGHT, SURFACE } from "../palette";

/** 거점 구조물의 강조색. */
const STATION_ACCENT = PALETTE.Signal;

/** 밀어낼 방향을 담는 계산용 임시 벡터. */
const scratchOutward: THREE.Vector3 = new THREE.Vector3();
const scratchStationQuaternion: THREE.Quaternion = new THREE.Quaternion();

/**
 * 물려 있는 동안 유지할 상대 자세.
 *
 * 구조물 기준 좌표라, 구조물이 돌면 세계 좌표가 따라 돈다. 도킹한 순간의
 * 관계를 그대로 붙들어 두는 것이 목적이다.
 */
export type DockAnchor = {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
};

/**
 * 거점.
 *
 * 업그레이드와 제작은 여기서만 할 수 있다 (GDD 07). 왕복이 죽은 시간이 아니라
 * 성장하는 시간이 되게 하려는 결정이다.
 */
export class Station {
  public readonly object3D: THREE.Group;
  /**
   * 도킹 지점. 월드 좌표다.
   *
   * 구조물 한가운데가 아니라 계류 팔 끝이다. 모델이 그 자리를 소켓으로 들고
   * 있어서 그대로 읽는다. 덕분에 도킹에 방향이 생긴다 — 반대편으로 다가가면
   * 닿지 않으므로 돌아 들어와야 한다.
   */
  public readonly dockPoint: THREE.Vector3;
  /** 함선이 더 다가갈 수 없는 거리 (m). 구조물 크기에서 나온다 */
  public readonly collisionRadius: number;

  private readonly ring: THREE.Mesh | null;
  /**
   * 도킹 소켓 노드.
   *
   * 구조물이 돌면 도킹 지점도 같이 돈다. 붙일 때 잰 자리를 그대로 들고 있으면
   * 팔은 옆으로 가 있는데 도킹은 허공에서 되는 상태가 된다. 노드를 들고 있다가
   * 매 프레임 다시 읽는다.
   */
  private dockSocket: THREE.Object3D | null = null;

  public constructor(origin: THREE.Vector3, model: THREE.Object3D | null = null) {
    this.object3D = new THREE.Group();
    this.object3D.name = "Station";
    this.object3D.position.set(
      origin.x,
      origin.y + 12,
      origin.z - STATION.DistanceFromOrigin,
    );

    this.collisionRadius = STATION.Radius * STATION.CollisionRadiusRatio;

    if (model !== null) {
      this.ring = null;
      const structure: THREE.Object3D = this.attachModel(model);
      this.dockSocket = structure.getObjectByName(STATION_MODEL.DockSocket) ?? null;
      this.dockPoint = this.readDockPoint();
      return;
    }

    // 모델이 없으면 절차 생성으로 만든다. 없는 것이 정상 경로여야 한다.
    //
    // 도킹 지점을 좌표로 들고 있지 않고 노드로 둔다. 모델 쪽과 같은 길을 타야
    // 구조물이 돌 때 도킹 지점도 같이 도는 동작이 양쪽에서 같아진다.
    const fallbackSocket: THREE.Object3D = new THREE.Object3D();
    fallbackSocket.name = STATION_MODEL.DockSocket;
    fallbackSocket.position.set(STATION.Radius * 1.33, 0, 0);
    this.object3D.add(fallbackSocket);
    this.dockSocket = fallbackSocket;
    this.dockPoint = this.readDockPoint();

    const hullMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.Hull,
      metalness: SURFACE.HullMetalness,
      roughness: SURFACE.HullRoughness,
      emissive: 0x1c3348,
      emissiveIntensity: EMISSION.Hull,
      flatShading: true,
    });
    const accentMaterial: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({
      color: STATION_ACCENT,
    });

    const core: THREE.Mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(STATION.Radius * 0.32, STATION.Radius * 0.32, STATION.Radius * 1.5, 8),
      hullMaterial,
    );
    this.object3D.add(core);

    // 회전하는 거주 링. 멀리서도 인공 구조물임이 실루엣으로 읽힌다.
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(STATION.Radius, STATION.Radius * 0.11, 8, 24),
      hullMaterial,
    );
    this.ring.rotation.x = Math.PI / 2;
    this.object3D.add(this.ring);

    // 링과 코어를 잇는 스포크.
    for (let index = 0; index < 4; index += 1) {
      const spoke: THREE.Mesh = new THREE.Mesh(
        new THREE.BoxGeometry(STATION.Radius * 0.9, STATION.Radius * 0.09, STATION.Radius * 0.09),
        hullMaterial,
      );
      spoke.position.x = STATION.Radius * 0.5;
      const pivot: THREE.Group = new THREE.Group();
      pivot.rotation.y = (index / 4) * Math.PI * 2;
      pivot.add(spoke);
      this.object3D.add(pivot);
    }

    // 도킹 유도등. 접근할 방향을 알려준다.
    for (let index = 0; index < 6; index += 1) {
      const angle: number = (index / 6) * Math.PI * 2;
      const beacon: THREE.Mesh = new THREE.Mesh(
        new THREE.SphereGeometry(STATION.Radius * 0.05, 8, 8),
        accentMaterial,
      );
      beacon.position.set(
        Math.cos(angle) * STATION.Radius,
        0,
        Math.sin(angle) * STATION.Radius,
      );
      this.object3D.add(beacon);
    }

    const beaconLight: THREE.PointLight = new THREE.PointLight(STATION_ACCENT, POINT_LIGHT.StationBeacon, 260, 2);
    this.object3D.add(beaconLight);
  }

  /**
   * 구조물 모델을 붙이고 도킹 지점을 읽는다.
   *
   * 모델은 가장 긴 축의 절반이 설정한 반지름이 되도록 배율을 잡는다. 경계구로
   * 맞추면 모서리까지 재게 되어 실제보다 작아 보인다.
   *
   * 재질은 손대지 않는다. 대신 유도등 자리에 빛을 둔다. 발광 재질만으로는 주변이
   * 밝아지지 않아서 접근할 때 구조물이 어디까지인지 안 읽힌다.
   *
   * @returns 붙인 구조물
   */
  private attachModel(model: THREE.Object3D): THREE.Object3D {
    const structure: THREE.Object3D = model.clone(true);
    this.object3D.add(structure);

    const size: THREE.Vector3 = new THREE.Box3()
      .setFromObject(structure)
      .getSize(new THREE.Vector3());
    const longestHalf: number = Math.max(size.x, size.y, size.z) / 2;
    if (longestHalf > 1e-6) {
      structure.scale.multiplyScalar(STATION.Radius / longestHalf);
    }
    this.object3D.updateMatrixWorld(true);

    for (const name of STATION_MODEL.BeaconSockets) {
      const socket: THREE.Object3D | undefined = structure.getObjectByName(name);
      if (socket === undefined) {
        continue;
      }
      const light: THREE.PointLight = new THREE.PointLight(
        STATION_ACCENT,
        POINT_LIGHT.StationBeacon,
        STATION.Radius * 3,
        2,
      );
      light.position.copy(
        this.object3D.worldToLocal(socket.getWorldPosition(new THREE.Vector3())),
      );
      this.object3D.add(light);
    }

    return structure;
  }

  /**
   * 도킹 지점을 지금 자세 기준으로 읽는다.
   *
   * 소켓이 없는 모델이면 한쪽 바깥을 도킹 지점으로 잡는다.
   */
  private readDockPoint(): THREE.Vector3 {
    if (this.dockSocket === null) {
      return this.object3D.position
        .clone()
        .add(new THREE.Vector3(STATION.Radius * 1.33, 0, 0));
    }

    this.object3D.updateMatrixWorld(true);
    return this.dockSocket.getWorldPosition(new THREE.Vector3());
  }

  /** 월드 좌표 위치. */
  public get position(): THREE.Vector3 {
    return this.object3D.position;
  }

  /**
   * 함선이 도킹 가능 범위 안에 있는지.
   *
   * 구조물 중심이 아니라 도킹 지점에서 잰다. 반대편에서는 닿지 않으므로 돌아
   * 들어와야 한다.
   */
  public isWithinDockRange(shipPosition: THREE.Vector3): boolean {
    return this.dockPoint.distanceTo(shipPosition) <= STATION.DockRange;
  }

  /**
   * 함선까지의 거리 (m).
   *
   * 화면에 띄우는 값이므로 도킹 지점까지로 잰다. 중심까지 재면 다 왔는데도
   * 숫자가 남아 있어 얼마나 더 가야 하는지가 안 읽힌다.
   */
  public distanceTo(shipPosition: THREE.Vector3): number {
    return this.dockPoint.distanceTo(shipPosition);
  }

  /**
   * 지금 함선 자세를 구조물 기준으로 적어둔다. 도킹하는 순간에 한 번 부른다.
   *
   * 세계 좌표로 들고 있으면 구조물이 돌 때 관계가 끊긴다. 구조물 기준으로
   * 바꿔두면 도는 것을 따로 계산하지 않아도 된다.
   */
  public anchorShip(
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion,
  ): DockAnchor {
    this.object3D.updateMatrixWorld(true);
    this.object3D.getWorldQuaternion(scratchStationQuaternion);

    return {
      position: this.object3D.worldToLocal(shipPosition.clone()),
      quaternion: scratchStationQuaternion.invert().multiply(shipQuaternion),
    };
  }

  /**
   * 물려 있는 함선을 구조물에 붙여둔다. 도킹 중 매 프레임 부른다.
   *
   * 도킹은 물리적으로 물린 상태다. 구조물이 도는데 함선만 제자리에 있으면
   * 계류 팔이 함선을 두고 떠나고, 거리가 벌어지다 도킹이 저절로 풀린다.
   *
   * 회전까지 따라간다. 위치만 옮기면 함선이 미끄러지듯 평행 이동해서 물려
   * 있는 것으로 안 보인다. 도는 속도가 느려 어지럽지 않고, 도킹 중에는 어차피
   * 조종하지 않는다.
   */
  public holdShip(
    anchor: DockAnchor,
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion,
  ): void {
    this.object3D.updateMatrixWorld(true);
    this.object3D.getWorldQuaternion(scratchStationQuaternion);

    shipPosition.copy(anchor.position);
    this.object3D.localToWorld(shipPosition);
    shipQuaternion.copy(scratchStationQuaternion).multiply(anchor.quaternion);
  }

  /**
   * 함선이 구조물을 뚫고 지나가지 못하게 막는다.
   *
   * 거점은 도킹하는 곳이지 통과하는 곳이 아니다. 그냥 지나가지면 부피가 있는
   * 물건으로 안 보이고, 도킹이라는 조작도 무의미해진다.
   *
   * 막는 방법은 밀어내기다. 안쪽으로 들어온 만큼 표면으로 되돌리고, 속도에서
   * 파고드는 성분만 덜어낸다. 표면을 따라 미끄러지는 성분은 남겨야 벽에
   * 달라붙지 않고 스쳐 지나갈 수 있다.
   *
   * @param shipPosition 함선 위치. 파고들었으면 제자리에서 밀려난다
   * @param shipVelocity 함선 속도. 파고드는 성분이 깎인다
   * @returns 부딪혔는지 여부
   */
  public resolveCollision(
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3,
  ): boolean {
    scratchOutward.subVectors(shipPosition, this.position);
    const distance: number = scratchOutward.length();

    if (distance >= this.collisionRadius) {
      return false;
    }

    // 정확히 중심에 있으면 밀어낼 방향이 없다. 아무 쪽이나 잡는다.
    if (distance < 1e-4) {
      scratchOutward.set(0, 0, 1);
    } else {
      scratchOutward.divideScalar(distance);
    }

    shipPosition
      .copy(this.position)
      .addScaledVector(scratchOutward, this.collisionRadius);

    const inward: number = shipVelocity.dot(scratchOutward);
    if (inward < 0) {
      shipVelocity.addScaledVector(
        scratchOutward,
        -inward * (1 + STATION.CollisionBounce),
      );
    }

    return true;
  }

  /**
   * 구조물을 천천히 돌린다. 매 프레임 호출한다.
   *
   * 모델이 있든 없든 같은 속도로 돈다. 한쪽만 돌면 모델이 없는 환경에서
   * 도킹이 다르게 움직여서, 시험으로 잡히는 것과 실제로 보이는 것이 갈린다.
   *
   * 도는 동안 도킹 지점도 함께 움직이므로 자리를 다시 읽는다. 안 읽으면 팔은
   * 옆으로 가 있는데 도킹은 처음 자리에서 되는 상태가 된다.
   */
  public update(deltaSeconds: number): void {
    this.object3D.rotation.y += STATION.RotationSpeed * deltaSeconds;
    this.dockPoint.copy(this.readDockPoint());

    // 절차 생성 쪽에는 따로 도는 거주 링이 있다.
    if (this.ring !== null) {
      this.ring.rotation.z += deltaSeconds * 0.25;
    }
  }
}

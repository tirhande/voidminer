import * as THREE from "three";

import { STATION } from "../constants";

/** 거점 구조물의 강조색. */
const STATION_ACCENT = 0x7fe3ff;

/**
 * 거점.
 *
 * 업그레이드와 제작은 여기서만 할 수 있다 (GDD 07). 왕복이 죽은 시간이 아니라
 * 성장하는 시간이 되게 하려는 결정이다.
 */
export class Station {
  public readonly object3D: THREE.Group;

  private readonly ring: THREE.Mesh;

  public constructor(origin: THREE.Vector3) {
    this.object3D = new THREE.Group();
    this.object3D.name = "Station";
    this.object3D.position.set(
      origin.x,
      origin.y + 12,
      origin.z - STATION.DistanceFromOrigin,
    );

    const hullMaterial: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
      color: 0x8496b0,
      metalness: 0.35,
      roughness: 0.5,
      emissive: 0x1c3348,
      emissiveIntensity: 0.5,
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

    const beaconLight: THREE.PointLight = new THREE.PointLight(STATION_ACCENT, 40, 260, 2);
    this.object3D.add(beaconLight);
  }

  /** 월드 좌표 위치. */
  public get position(): THREE.Vector3 {
    return this.object3D.position;
  }

  /** 함선이 도킹 가능 범위 안에 있는지. */
  public isWithinDockRange(shipPosition: THREE.Vector3): boolean {
    return this.object3D.position.distanceTo(shipPosition) <= STATION.DockRange;
  }

  /** 함선까지의 거리 (m). */
  public distanceTo(shipPosition: THREE.Vector3): number {
    return this.object3D.position.distanceTo(shipPosition);
  }

  /** 링을 천천히 돌린다. 매 프레임 호출한다. */
  public update(deltaSeconds: number): void {
    this.ring.rotation.z += deltaSeconds * 0.25;
  }
}

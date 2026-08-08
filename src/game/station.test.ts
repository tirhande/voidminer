import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { STATION } from "../constants";
import { Station } from "./station";

describe("거점 충돌", () => {
  const origin: THREE.Vector3 = new THREE.Vector3();

  it("멀리 있으면 아무 일도 없다", () => {
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position
      .clone()
      .add(new THREE.Vector3(0, 0, station.collisionRadius * 3));
    const before: THREE.Vector3 = position.clone();

    expect(station.resolveCollision(position, new THREE.Vector3())).toBe(false);
    expect(position.equals(before)).toBe(true);
  });

  it("파고들면 표면으로 밀려난다", () => {
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position.clone();
    position.z += 4;

    expect(station.resolveCollision(position, new THREE.Vector3())).toBe(true);
    expect(position.distanceTo(station.position)).toBeCloseTo(
      station.collisionRadius,
      4,
    );
  });

  it("빠르게 지나가려 해도 뚫리지 않는다", () => {
    // 최고 속도로 정면으로 들이받아도 프레임마다 밀려나므로 안쪽에 남지 않는다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position
      .clone()
      .add(new THREE.Vector3(0, 0, station.collisionRadius * 2));
    const velocity: THREE.Vector3 = new THREE.Vector3(0, 0, -160);

    for (let step = 0; step < 60; step += 1) {
      position.addScaledVector(velocity, 1 / 60);
      station.resolveCollision(position, velocity);

      expect(position.distanceTo(station.position)).toBeGreaterThanOrEqual(
        station.collisionRadius - 1e-3,
      );
    }
  });

  it("표면을 따라 흐르는 속도는 남는다", () => {
    // 파고드는 성분만 덜어낸다. 다 없애면 벽에 달라붙어 못 빠져나온다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position
      .clone()
      .add(new THREE.Vector3(0, 0, station.collisionRadius - 2));
    const velocity: THREE.Vector3 = new THREE.Vector3(40, 0, -10);

    station.resolveCollision(position, velocity);

    expect(velocity.x).toBeCloseTo(40, 4);
    expect(velocity.z).toBeGreaterThan(-10);
  });

  it("중심에 정확히 있어도 밀려난다", () => {
    // 밀어낼 방향을 구할 수 없는 경우다. 0 으로 나누면 좌표가 깨진다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position.clone();

    station.resolveCollision(position, new THREE.Vector3());

    expect(Number.isFinite(position.x)).toBe(true);
    expect(position.distanceTo(station.position)).toBeCloseTo(
      station.collisionRadius,
      4,
    );
  });

  it("도킹 지점이 막는 거리 바깥에 있다", () => {
    // 도킹 지점이 막히는 안쪽에 있으면 영영 닿지 못한다.
    const station: Station = new Station(origin);

    expect(station.dockPoint.distanceTo(station.position)).toBeGreaterThan(
      station.collisionRadius,
    );
  });

  it("반대편에서는 도킹되지 않는다", () => {
    // 도킹 지점이 계류 팔 끝이라 방향이 생긴다. 돌아 들어와야 한다.
    const station: Station = new Station(origin);
    const away: THREE.Vector3 = station.position
      .clone()
      .sub(station.dockPoint.clone().sub(station.position).setLength(station.collisionRadius));

    expect(station.isWithinDockRange(station.dockPoint)).toBe(true);
    expect(station.isWithinDockRange(away)).toBe(false);
  });
});

describe("도킹 유지", () => {
  const origin: THREE.Vector3 = new THREE.Vector3();

  /** 정거장을 그만큼 돌린다. */
  function rotate(station: Station, seconds: number): void {
    const step: number = 1 / 60;
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      station.update(step);
    }
  }

  it("정거장이 돌아도 도킹이 풀리지 않는다", () => {
    // 붙들지 않으면 계류 팔이 함선을 두고 떠난다. 거리가 벌어지다 도킹 범위를
    // 넘는 순간 저절로 풀린다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.dockPoint.clone();
    const rotation: THREE.Quaternion = new THREE.Quaternion();
    const anchor = station.anchorShip(position, rotation);

    for (let round = 0; round < 60; round += 1) {
      rotate(station, 1);
      station.holdShip(anchor, position, rotation);
      expect(station.isWithinDockRange(position)).toBe(true);
    }
  });

  it("붙들지 않으면 실제로 풀린다", () => {
    // 위 시험이 무엇을 막고 있는지 확인한다. 이것이 통과하지 않으면 위 시험은
    // 아무것도 지키지 않는 셈이다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.dockPoint.clone();

    rotate(station, 180);

    expect(station.isWithinDockRange(position)).toBe(false);
  });

  it("자리와 방향이 함께 돈다", () => {
    // 물린 물체는 궤도를 따라 옮겨지면서 같은 각만큼 방향도 돌아간다. 방향을
    // 고정한 채 자리만 옮기면 원 궤도를 따라 옆으로 미끄러진다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.dockPoint.clone();
    const rotation: THREE.Quaternion = new THREE.Quaternion();
    const startPosition: THREE.Vector3 = position.clone();
    const startRotation: THREE.Quaternion = rotation.clone();
    const anchor = station.anchorShip(position, rotation);

    rotate(station, 30);
    station.holdShip(anchor, position, rotation);

    expect(position.equals(startPosition)).toBe(false);
    expect(rotation.angleTo(startRotation)).toBeGreaterThan(0.1);
  });

  it("도는 각이 구조물과 같다", () => {
    // 함선만 더 돌거나 덜 돌면 물려 있는 것으로 보이지 않는다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.dockPoint.clone();
    const rotation: THREE.Quaternion = new THREE.Quaternion();
    const anchor = station.anchorShip(position, rotation);

    const seconds: number = 30;
    rotate(station, seconds);
    station.holdShip(anchor, position, rotation);

    expect(rotation.angleTo(new THREE.Quaternion())).toBeCloseTo(
      STATION.RotationSpeed * seconds,
      1,
    );
  });

  it("물린 자리가 도킹 지점에서 벗어나지 않는다", () => {
    // 도킹한 자리를 그대로 유지해야 한다. 조금씩 밀리면 결국 벗어난다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.dockPoint.clone().add(
      new THREE.Vector3(3, -2, 1),
    );
    const rotation: THREE.Quaternion = new THREE.Quaternion();
    const anchor = station.anchorShip(position, rotation);
    const gap: number = position.distanceTo(station.dockPoint);

    rotate(station, 120);
    station.holdShip(anchor, position, rotation);

    expect(position.distanceTo(station.dockPoint)).toBeCloseTo(gap, 3);
  });
});

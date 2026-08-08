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
      .add(new THREE.Vector3(0, 0, STATION.CollisionRadius * 3));
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
      STATION.CollisionRadius,
      4,
    );
  });

  it("빠르게 지나가려 해도 뚫리지 않는다", () => {
    // 최고 속도로 정면으로 들이받아도 프레임마다 밀려나므로 안쪽에 남지 않는다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position
      .clone()
      .add(new THREE.Vector3(0, 0, STATION.CollisionRadius * 2));
    const velocity: THREE.Vector3 = new THREE.Vector3(0, 0, -160);

    for (let step = 0; step < 60; step += 1) {
      position.addScaledVector(velocity, 1 / 60);
      station.resolveCollision(position, velocity);

      expect(position.distanceTo(station.position)).toBeGreaterThanOrEqual(
        STATION.CollisionRadius - 1e-3,
      );
    }
  });

  it("표면을 따라 흐르는 속도는 남는다", () => {
    // 파고드는 성분만 덜어낸다. 다 없애면 벽에 달라붙어 못 빠져나온다.
    const station: Station = new Station(origin);
    const position: THREE.Vector3 = station.position
      .clone()
      .add(new THREE.Vector3(0, 0, STATION.CollisionRadius - 2));
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
      STATION.CollisionRadius,
      4,
    );
  });

  it("도킹 범위 안에서 막힌다", () => {
    // 막는 거리가 도킹 거리보다 멀면 도킹을 할 수 없게 된다.
    expect(STATION.CollisionRadius).toBeLessThan(STATION.DockRange);
  });
});

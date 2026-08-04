import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CAMERA_RIG } from "../constants";
import { TractorBeam } from "./tractor-beam";

const AT_ORIGIN: THREE.Vector3 = new THREE.Vector3();
const NO_ROTATION: THREE.Quaternion = new THREE.Quaternion();
const STEP_SECONDS: number = 1 / 60;

/** 그려지는 줄기 수를 센다. LineSegments 는 정점 두 개가 줄기 하나다. */
function strandCount(beam: TractorBeam): number {
  for (const child of beam.object3D.children) {
    if (child instanceof THREE.LineSegments) {
      return child.visible ? child.geometry.drawRange.count / 2 : 0;
    }
  }
  return 0;
}

/** 자식 도형 중 가장 큰 것의 반지름을 구한다. */
function largestGeometryRadius(beam: TractorBeam): number {
  let largest: number = 0;

  for (const child of beam.object3D.children) {
    if (!(child instanceof THREE.Mesh)) {
      continue;
    }
    child.geometry.computeBoundingSphere();
    const sphere: THREE.Sphere | null = child.geometry.boundingSphere;
    if (sphere !== null) {
      largest = Math.max(largest, sphere.radius);
    }
  }

  return largest;
}

describe("견인빔 표현", () => {
  it("꺼져 있으면 아무것도 보이지 않는다", () => {
    const beam: TractorBeam = new TractorBeam();

    beam.update(STEP_SECONDS, false, AT_ORIGIN, NO_ROTATION, []);

    expect(beam.object3D.visible).toBe(false);
  });

  it("파편이 없어도 켜지면 보인다", () => {
    const beam: TractorBeam = new TractorBeam();

    beam.update(STEP_SECONDS, true, AT_ORIGIN, NO_ROTATION, []);

    // 아무것도 못 잡았어도 켜졌다는 것은 전달돼야 한다.
    expect(beam.object3D.visible).toBe(true);
    expect(strandCount(beam)).toBe(0);
  });

  it("붙잡은 파편 수만큼 줄기를 그린다", () => {
    const beam: TractorBeam = new TractorBeam();
    const debris: THREE.Vector3[] = [
      new THREE.Vector3(10, 0, -20),
      new THREE.Vector3(-15, 5, -30),
      new THREE.Vector3(0, -8, -12),
    ];

    beam.update(STEP_SECONDS, true, AT_ORIGIN, NO_ROTATION, debris);

    expect(strandCount(beam)).toBe(debris.length);
  });

  it("파편이 사라지면 줄기도 사라진다", () => {
    const beam: TractorBeam = new TractorBeam();

    beam.update(STEP_SECONDS, true, AT_ORIGIN, NO_ROTATION, [new THREE.Vector3(5, 0, -10)]);
    expect(strandCount(beam)).toBe(1);

    beam.update(STEP_SECONDS, true, AT_ORIGIN, NO_ROTATION, []);
    expect(strandCount(beam)).toBe(0);
  });

  it("빔을 끄면 줄기가 남지 않는다", () => {
    const beam: TractorBeam = new TractorBeam();

    beam.update(STEP_SECONDS, true, AT_ORIGIN, NO_ROTATION, [new THREE.Vector3(5, 0, -10)]);
    beam.update(STEP_SECONDS, false, AT_ORIGIN, NO_ROTATION, []);

    expect(strandCount(beam)).toBe(0);
  });

  it("방출구가 함선을 따라 움직인다", () => {
    const beam: TractorBeam = new TractorBeam();
    const farAway: THREE.Vector3 = new THREE.Vector3(500, -120, 800);

    beam.update(STEP_SECONDS, true, farAway, NO_ROTATION, []);

    const emitter = beam.object3D.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh,
    );
    expect(emitter).toBeDefined();
    // 함선에서 몇 미터 안쪽에 붙어 있어야 한다.
    expect(emitter?.position.distanceTo(farAway)).toBeLessThan(5);
  });

  it("화면을 가로지를 만큼 큰 도형을 만들지 않는다", () => {
    const beam: TractorBeam = new TractorBeam();

    // 추격 카메라는 함선 뒤 15m, 위 4m 에 있어 함선 평면 안에 거의 놓인다.
    // 함선 주위에 카메라 거리에 맞먹는 도형을 두면 옆에서 본 단면이 화면을
    // 가로지르는 선으로 보인다. 사거리 고리가 정확히 그렇게 깨졌다.
    expect(largestGeometryRadius(beam)).toBeLessThan(CAMERA_RIG.Distance);
  });
});

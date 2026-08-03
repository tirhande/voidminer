import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { DUST_FIELD } from "../constants";
import { DustField } from "./dust-field";

/** 입자 좌표 버퍼를 읽는다. */
function readPositions(field: DustField): Float32Array {
  const attribute = field.object3D.geometry.getAttribute("position");
  return attribute.array as Float32Array;
}

/** 모든 입자가 함선 중심 정육면체 안에 있는지 확인한다. */
function maxAxisDistance(positions: Float32Array, center: THREE.Vector3): number {
  let maxDistance: number = 0;
  for (let index = 0; index < positions.length; index += 3) {
    maxDistance = Math.max(
      maxDistance,
      Math.abs(positions[index] - center.x),
      Math.abs(positions[index + 1] - center.y),
      Math.abs(positions[index + 2] - center.z),
    );
  }
  return maxDistance;
}

describe("DustField 감김 처리", () => {
  const half: number = DUST_FIELD.FieldSize / 2;

  it("생성 직후 모든 입자가 원점 주변 정육면체 안에 있다", () => {
    const origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    const field: DustField = new DustField(origin);

    expect(maxAxisDistance(readPositions(field), origin)).toBeLessThanOrEqual(half);
  });

  it("함선이 한 변만큼 이동하면 입자가 반대편으로 감겨 따라온다", () => {
    const origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    const field: DustField = new DustField(origin);

    const movedPosition: THREE.Vector3 = new THREE.Vector3(DUST_FIELD.FieldSize, 0, 0);
    field.wrapAround(movedPosition);

    expect(maxAxisDistance(readPositions(field), movedPosition)).toBeLessThanOrEqual(half);
  });

  it("여러 축으로 크게 이동해도 입자가 함선을 감싼다", () => {
    const origin: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    const field: DustField = new DustField(origin);

    const target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    const stepCount: number = 40;

    for (let step = 1; step <= stepCount; step += 1) {
      target.set(step * 37, step * -21, step * 64);
      field.wrapAround(target);
    }

    expect(maxAxisDistance(readPositions(field), target)).toBeLessThanOrEqual(half);
  });

  it("입자 개수는 설정값과 일치한다", () => {
    const field: DustField = new DustField(new THREE.Vector3());

    expect(readPositions(field).length).toBe(DUST_FIELD.Count * 3);
  });
});

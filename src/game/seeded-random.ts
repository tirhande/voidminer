/** 0 이상 1 미만의 난수를 반환하는 함수. */
export type RandomSource = () => number;

/**
 * 시드로 초기화되는 난수 생성기(mulberry32).
 *
 * 소행성 배치와 형태에 쓴다. 시드를 고정하면 매번 같은 필드가 나오므로,
 * 밸런싱을 볼 때 조건을 같게 유지할 수 있다.
 *
 * @param seed 32비트 정수 시드
 */
export function createSeededRandom(seed: number): RandomSource {
  let state: number = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value: number = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 지정한 범위의 난수를 반환한다.
 *
 * @param random 난수 원본
 * @param min 하한 (포함)
 * @param max 상한 (미포함)
 */
export function randomInRange(random: RandomSource, min: number, max: number): number {
  return min + random() * (max - min);
}

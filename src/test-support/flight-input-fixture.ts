import type { FlightInputState } from "../game/flight-input";

const NEUTRAL_INPUT: FlightInputState = {
  thrust: 0,
  strafe: 0,
  lift: 0,
  roll: 0,
  yawDelta: 0,
  pitchDelta: 0,
  isBoosting: false,
  isAssisting: false,
  isFiring: false,
  isTractorActive: false,
};

/**
 * 테스트용 조종 입력을 만든다. 지정하지 않은 축은 모두 중립이다.
 *
 * @param overrides 덮어쓸 축과 플래그
 */
export function buildFlightInput(
  overrides: Partial<FlightInputState> = {},
): FlightInputState {
  return { ...NEUTRAL_INPUT, ...overrides };
}

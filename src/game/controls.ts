/**
 * 조작 키 배치. GDD 09 의 확정안을 따른다.
 *
 * 한곳에 모으는 이유는 겹침을 막기 위해서다. 한때 E 가 롤과 도킹에 동시에 걸려
 * 있어서 거점 근처에서 롤을 넣으면 도킹까지 됐다. 배치가 흩어져 있으면 같은 일이
 * 다시 생겨도 알아채지 못한다.
 *
 * 롤이 Q/E 를 쓰므로 도킹은 F 다. 롤은 비행 중 계속 쓰고 도킹은 가끔 쓰므로
 * 밀리는 쪽이 도킹이다. 관성 제동만 GDD 에 없어 남는 키인 X 로 뒀다.
 */
export const KEY_BINDING = {
  /** 전진 */
  ThrustForward: "KeyW",
  /** 후진 */
  ThrustBackward: "KeyS",
  /** 우 스트레이프 */
  StrafeRight: "KeyD",
  /** 좌 스트레이프 */
  StrafeLeft: "KeyA",
  /** 상승 */
  LiftUp: "Space",
  /** 하강 */
  LiftDown: "KeyC",
  /** 좌 롤 */
  RollLeft: "KeyQ",
  /** 우 롤 */
  RollRight: "KeyE",
  /** 부스트 */
  Boost: "ShiftLeft",
  /** 부스트 (오른쪽 Shift) */
  BoostAlternate: "ShiftRight",
  /** 관성 제동 */
  InertialAssist: "KeyX",
  /** 거점 도킹 및 해제 */
  Dock: "KeyF",
} as const;

/** 비행 중 계속 눌리는 키. 도킹 같은 단발 조작과 겹치면 안 된다. */
export const FLIGHT_KEYS: readonly string[] = [
  KEY_BINDING.ThrustForward,
  KEY_BINDING.ThrustBackward,
  KEY_BINDING.StrafeRight,
  KEY_BINDING.StrafeLeft,
  KEY_BINDING.LiftUp,
  KEY_BINDING.LiftDown,
  KEY_BINDING.RollLeft,
  KEY_BINDING.RollRight,
  KEY_BINDING.Boost,
  KEY_BINDING.BoostAlternate,
  KEY_BINDING.InertialAssist,
];

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
  /**
   * 조작법 보기.
   *
   * F1 을 쓰지 않는다. 브라우저가 자기 도움말을 여는 키라 눌러도 게임에
   * 닿지 않는 경우가 있다. 비행에 쓰지 않는 키 중에서 뜻이 통하는 것을 골랐다.
   */
  Help: "KeyH",
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

/** 조작법 한 줄. */
export type ControlEntry = {
  /** 화면에 적을 키 표기 */
  readonly keys: string;
  readonly label: string;
  /**
   * 이 줄이 설명하는 키 코드.
   *
   * 표기와 따로 두는 이유는 검증 때문이다. 배치를 바꿨는데 조작법을 안 고치면
   * 화면이 거짓말을 한다. 마우스처럼 코드가 없는 것은 빈 배열이다.
   */
  readonly codes: ReadonlyArray<string>;
};

/** 조작법 묶음 하나. */
export type ControlGroup = {
  readonly title: string;
  readonly entries: ReadonlyArray<ControlEntry>;
};

/**
 * 조작법 목록.
 *
 * 키 배치와 같은 파일에 둔다. 떨어져 있으면 배치를 바꿀 때 한쪽만 고치게 되고,
 * 그러면 화면이 거짓말을 한다.
 */
export const CONTROL_HELP: ReadonlyArray<ControlGroup> = [
  {
    title: "비행",
    entries: [
      {
        keys: "W / S",
        label: "전진 · 후진",
        codes: [KEY_BINDING.ThrustForward, KEY_BINDING.ThrustBackward],
      },
      {
        keys: "A / D",
        label: "좌우 이동",
        codes: [KEY_BINDING.StrafeLeft, KEY_BINDING.StrafeRight],
      },
      {
        keys: "Space / C",
        label: "상승 · 하강",
        codes: [KEY_BINDING.LiftUp, KEY_BINDING.LiftDown],
      },
      {
        keys: "Q / E",
        label: "좌우 회전",
        codes: [KEY_BINDING.RollLeft, KEY_BINDING.RollRight],
      },
      { keys: "마우스", label: "기수 방향", codes: [] },
      {
        keys: "Shift",
        label: "부스트",
        codes: [KEY_BINDING.Boost, KEY_BINDING.BoostAlternate],
      },
      {
        keys: "X",
        label: "관성 제동 — 누르는 동안 속도가 줄어든다",
        codes: [KEY_BINDING.InertialAssist],
      },
    ],
  },
  {
    title: "채집",
    entries: [
      { keys: "좌클릭", label: "채굴 레이저 — 조준점을 소행성에 맞추고 누른다", codes: [] },
      { keys: "우클릭", label: "견인빔 — 떨어진 파편을 끌어온다", codes: [] },
    ],
  },
  {
    title: "거점",
    entries: [
      {
        keys: "F",
        label: "도킹 · 도킹 해제 — 거점에 가까이 가면 안내가 뜬다",
        codes: [KEY_BINDING.Dock],
      },
      { keys: "마우스", label: "도킹 중에는 화면을 직접 누른다", codes: [] },
    ],
  },
  {
    title: "그 밖",
    entries: [
      { keys: "H", label: "이 화면 열고 닫기", codes: [KEY_BINDING.Help] },
      { keys: "Esc", label: "조종 해제", codes: [] },
    ],
  },
];

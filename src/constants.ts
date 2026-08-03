/**
 * 비행 모델 튜닝 값.
 *
 * 비행은 뉴턴식이다. 추력을 놓아도 속도가 유지되며, 감속은 역추력이나
 * 관성 제동(inertial assist)으로만 이루어진다.
 */
export const SHIP_TUNING = {
  /** 전/후 주추력 (m/s^2) */
  MainThrust: 30,
  /** 좌/우 스트레이프 추력 (m/s^2) */
  StrafeThrust: 18,
  /** 상/하 스트레이프 추력 (m/s^2) */
  LiftThrust: 18,
  /** 부스트 시 추력 배율 */
  BoostMultiplier: 2.8,
  /** 속도 상한 (m/s). 부스트 중에는 BoostMultiplier 만큼 완화된다 */
  MaxSpeed: 160,
  /** 관성 제동 감쇠 계수 (1/s) */
  AssistDamping: 1.6,

  /** 키보드 롤 각가속도 (rad/s^2) */
  RollAcceleration: 5.2,
  /** 마우스 이동량을 각속도로 바꾸는 계수 (rad/px) */
  MouseSensitivity: 0.0016,
  /** 각속도 감쇠 계수 (1/s). 조작을 놓으면 회전이 서서히 멎는다 */
  AngularDamping: 3.4,
  /** 각속도 상한 (rad/s) */
  MaxAngularSpeed: 2.6,
} as const;

/** 추격 카메라 배치. 값은 함선 로컬 좌표 기준이다. */
export const CAMERA_RIG = {
  /** 함선 뒤쪽 거리 (m) */
  Distance: 15,
  /** 함선 위쪽 높이 (m) */
  Height: 4.2,
  /** 위치 추종 응답 속도 (1/s). 클수록 함선에 밀착한다 */
  PositionLerpRate: 7,
  /** 회전 추종 응답 속도 (1/s) */
  RotationLerpRate: 9,
  /** 속도에 비례해 벌어지는 최대 추가 거리 (m) */
  SpeedPullback: 6,
  /** 시야각 기본값 (deg) */
  BaseFov: 68,
  /** 최대 속도에서 더해지는 시야각 (deg) */
  SpeedFovGain: 12,
} as const;

/**
 * 원거리 스타필드 설정.
 *
 * 별은 사실상 무한히 멀리 있으므로 함선을 그대로 따라다닌다. 이동으로는
 * 시차가 생기지 않고 회전으로만 흐른다.
 */
export const STARFIELD = {
  /** 별 개수 */
  Count: 5200,
  /** 별이 배치되는 구의 반지름 (m) */
  Radius: 900,
  /** 별 점 크기 (m) */
  PointSize: 2.4,
} as const;

/**
 * 근거리 부유 입자 설정.
 *
 * 원거리 별만으로는 속도가 체감되지 않는다. 함선 주변을 감싸고 도는 이 입자층이
 * 시차를 만들어 속도감을 담당한다.
 */
export const DUST_FIELD = {
  /** 입자 개수 */
  Count: 900,
  /** 함선을 중심으로 입자가 채워지는 정육면체의 한 변 (m) */
  FieldSize: 260,
  /** 입자 점 크기 (m) */
  PointSize: 0.5,
} as const;

/**
 * 소행성 필드 설정.
 *
 * 본 프로젝트의 GDD 는 손으로 디자인된 세계를 [확정]으로 두고 있으나, 이 웹
 * 프로토는 배치를 절차 생성으로 대신한다. 프로토 한정 타협이다.
 */
export const ASTEROID_FIELD = {
  /** 소행성 개수 */
  Count: 64,
  /** 소행성이 배치되는 정육면체의 한 변 (m) */
  FieldSize: 900,
  /** 함선 시작 지점 주변에 소행성을 두지 않는 반경 (m) */
  SpawnClearance: 70,
  /** 절차 생성 시드. 고정해 두면 매번 같은 필드가 나온다 */
  Seed: 20260804,
} as const;

/** 채굴 레이저 설정. */
export const MINING_LASER = {
  /** 사거리 (m) */
  Range: 240,
  /** T1 기본 채굴 속도 (광물 단위/s) */
  BaseYieldPerSecond: 7,
  /**
   * 티어가 하나 오를 때 더해지는 채굴 속도.
   *
   * GDD 07 의 "업그레이드 최대치 < 다음 티어 기본치"를 지키려면 이 값이
   * `MAX_UPGRADE_LEVEL × YieldPerUpgrade` 보다 커야 한다. 이 순서가 뒤집히면
   * 하위 티어를 끝까지 강화하는 쪽이 이득이라 상위 티어를 만들 이유가 없어진다.
   */
  YieldPerTier: 9,
  /** 업그레이드 한 단계당 더해지는 채굴 속도 */
  YieldPerUpgrade: 1.4,
  /** 파편 하나가 담는 광물 양. 이만큼 캐면 파편이 하나 떨어진다 */
  MineralPerDebris: 5,
} as const;

/** 견인빔 설정. */
export const TRACTOR_BEAM = {
  /** 흡인 반경 (m) */
  Range: 90,
  /** 파편을 함선 쪽으로 당기는 가속도 (m/s^2) */
  PullAcceleration: 60,
  /** 파편 속도 상한 (m/s) */
  MaxPullSpeed: 90,
  /** 이 거리 안에 들어오면 적재된다 (m) */
  CollectDistance: 6,
} as const;

/** 파편 설정. */
export const DEBRIS = {
  /** 소행성에서 튀어나오는 초기 속도 (m/s) */
  EjectSpeed: 9,
  /** 파편 반지름 (m) */
  Radius: 0.8,
  /** 회수되지 않은 파편이 사라지기까지의 시간 (s) */
  LifetimeSeconds: 90,
  /** 동시에 존재할 수 있는 파편 수 상한 */
  MaxCount: 220,
} as const;

/** 화물칸 설정. */
export const CARGO = {
  /** 적재 상한 (광물 단위). 차면 더 담기지 않는다 */
  Capacity: 260,
} as const;

/** 한 프레임의 최대 델타 타임 (s). 탭 전환 후 물리가 튀는 것을 막는다. */
export const MAX_DELTA_SECONDS = 0.05;

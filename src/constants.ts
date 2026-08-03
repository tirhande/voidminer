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

/** 한 프레임의 최대 델타 타임 (s). 탭 전환 후 물리가 튀는 것을 막는다. */
export const MAX_DELTA_SECONDS = 0.05;

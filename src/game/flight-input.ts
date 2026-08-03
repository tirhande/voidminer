/** 한 프레임분의 조종 입력. 축 값은 모두 -1 ~ 1 범위로 정규화된다. */
export type FlightInputState = {
  /** 전(+1) / 후(-1) 주추력 */
  readonly thrust: number;
  /** 우(+1) / 좌(-1) 스트레이프 */
  readonly strafe: number;
  /** 상(+1) / 하(-1) 스트레이프 */
  readonly lift: number;
  /** 좌(+1) / 우(-1) 롤 */
  readonly roll: number;
  /** 이번 프레임에 누적된 마우스 X 이동량 (px) */
  readonly yawDelta: number;
  /** 이번 프레임에 누적된 마우스 Y 이동량 (px) */
  readonly pitchDelta: number;
  /** 부스트 사용 여부 */
  readonly isBoosting: boolean;
  /** 관성 제동 사용 여부 */
  readonly isAssisting: boolean;
  /** 채굴 레이저 발사 여부 (마우스 왼쪽) */
  readonly isFiring: boolean;
  /** 견인빔 사용 여부 (마우스 오른쪽) */
  readonly isTractorActive: boolean;
};

const IDLE_INPUT: FlightInputState = {
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

/** 마우스 버튼 번호. */
const MOUSE_BUTTON = {
  Left: 0,
  Right: 2,
} as const;

/**
 * 키보드와 마우스로 조종 입력을 수집한다.
 *
 * 조종은 사용자가 화면을 클릭해 교전 상태(engaged)에 들어가야 시작된다. 이때
 * 포인터 락을 함께 요청하지만, 락이 걸리지 않아도 조종은 가능하다. iframe 등
 * 포인터 락이 차단되는 환경에서도 게임이 돌아가야 하기 때문이다. 락이 걸린
 * 경우에는 커서가 화면 밖으로 나가지 않으므로 조작감이 더 낫다.
 */
export class FlightInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly pressedKeys: Set<string> = new Set();
  private accumulatedYaw: number = 0;
  private accumulatedPitch: number = 0;
  private pointerLocked: boolean = false;
  private engaged: boolean = false;
  private firing: boolean = false;
  private tractorActive: boolean = false;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mouseup", this.handleMouseUp);
    // 오른쪽 버튼을 견인빔에 쓰므로 컨텍스트 메뉴가 뜨면 안 된다.
    canvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  /** 조종이 활성화돼 있는지 여부. HUD 오버레이 표시에 사용한다. */
  public get isEngaged(): boolean {
    return this.engaged;
  }

  /**
   * 조종을 활성화한다. 사용자 제스처 안에서만 호출해야 한다.
   * 포인터 락은 함께 시도하되, 실패해도 조종은 그대로 시작된다.
   */
  public requestControl(): void {
    this.engaged = true;
    const lockResult: unknown = this.canvas.requestPointerLock();
    if (lockResult instanceof Promise) {
      // 브라우저나 iframe 정책으로 거부될 수 있다. 거부돼도 조종은 유지한다.
      lockResult.catch(() => undefined);
    }
  }

  /** 조종을 해제한다. Esc 로 포인터 락이 풀릴 때도 함께 호출된다. */
  public releaseControl(): void {
    this.engaged = false;
    this.pressedKeys.clear();
    this.accumulatedYaw = 0;
    this.accumulatedPitch = 0;
    this.firing = false;
    this.tractorActive = false;
  }

  /**
   * 이번 프레임의 입력을 읽고 마우스 누적량을 비운다.
   * 프레임당 정확히 한 번만 호출해야 한다.
   */
  public sample(): FlightInputState {
    if (!this.engaged) {
      this.accumulatedYaw = 0;
      this.accumulatedPitch = 0;
      return IDLE_INPUT;
    }

    const state: FlightInputState = {
      thrust: this.axis("KeyW", "KeyS"),
      strafe: this.axis("KeyD", "KeyA"),
      lift: this.axis("KeyR", "KeyF"),
      roll: this.axis("KeyQ", "KeyE"),
      yawDelta: this.accumulatedYaw,
      pitchDelta: this.accumulatedPitch,
      isBoosting: this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight"),
      isAssisting: this.pressedKeys.has("Space"),
      isFiring: this.firing,
      isTractorActive: this.tractorActive,
    };

    this.accumulatedYaw = 0;
    this.accumulatedPitch = 0;

    return state;
  }

  /** 이벤트 리스너를 해제한다. */
  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
  }

  private axis(positiveCode: string, negativeCode: string): number {
    const positive: number = this.pressedKeys.has(positiveCode) ? 1 : 0;
    const negative: number = this.pressedKeys.has(negativeCode) ? 1 : 0;
    return positive - negative;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape") {
      this.releaseControl();
      return;
    }
    if (!this.engaged) {
      return;
    }
    this.pressedKeys.add(event.code);
    // 스페이스로 페이지가 스크롤되거나 버튼이 눌리는 것을 막는다.
    if (event.code === "Space") {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.releaseControl();
  };

  private readonly handlePointerLockChange = (): void => {
    const nowLocked: boolean = document.pointerLockElement === this.canvas;
    // 락이 걸려 있다가 풀린 경우는 사용자가 Esc 로 빠져나온 것으로 본다.
    // 애초에 락이 걸리지 않은 환경(iframe 등)에서는 조종을 끊지 않는다.
    if (this.pointerLocked && !nowLocked) {
      this.releaseControl();
    }
    this.pointerLocked = nowLocked;
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.engaged) {
      return;
    }
    this.accumulatedYaw += event.movementX;
    this.accumulatedPitch += event.movementY;
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.engaged) {
      return;
    }
    if (event.button === MOUSE_BUTTON.Left) {
      this.firing = true;
    } else if (event.button === MOUSE_BUTTON.Right) {
      this.tractorActive = true;
      event.preventDefault();
    }
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    if (event.button === MOUSE_BUTTON.Left) {
      this.firing = false;
    } else if (event.button === MOUSE_BUTTON.Right) {
      this.tractorActive = false;
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}

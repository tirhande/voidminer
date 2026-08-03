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
};

/**
 * 키보드와 포인터 락 마우스로 조종 입력을 수집한다.
 *
 * 포인터가 잠기지 않은 동안에는 모든 입력이 0으로 유지된다. 조준을 마우스로
 * 처리하는 이상, 커서가 살아 있는 상태에서 함선이 움직이면 안 되기 때문이다.
 */
export class FlightInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly pressedKeys: Set<string> = new Set();
  private accumulatedYaw: number = 0;
  private accumulatedPitch: number = 0;
  private pointerLocked: boolean = false;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("mousemove", this.handleMouseMove);
  }

  /** 포인터 락이 걸려 있는지 여부. HUD 오버레이 표시에 사용한다. */
  public get isEngaged(): boolean {
    return this.pointerLocked;
  }

  /** 캔버스에 포인터 락을 요청한다. 사용자 제스처 안에서만 호출해야 한다. */
  public requestControl(): void {
    void this.canvas.requestPointerLock();
  }

  /**
   * 이번 프레임의 입력을 읽고 마우스 누적량을 비운다.
   * 프레임당 정확히 한 번만 호출해야 한다.
   */
  public sample(): FlightInputState {
    if (!this.pointerLocked) {
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
  }

  private axis(positiveCode: string, negativeCode: string): number {
    const positive = this.pressedKeys.has(positiveCode) ? 1 : 0;
    const negative = this.pressedKeys.has(negativeCode) ? 1 : 0;
    return positive - negative;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
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
    this.pressedKeys.clear();
    this.accumulatedYaw = 0;
    this.accumulatedPitch = 0;
  };

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (!this.pointerLocked) {
      this.pressedKeys.clear();
    }
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }
    this.accumulatedYaw += event.movementX;
    this.accumulatedPitch += event.movementY;
  };
}

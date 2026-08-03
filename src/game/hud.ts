import type { FlightInputState } from "./flight-input";

/** HUD 가 참조하는 DOM 요소 묶음. */
type HudElements = {
  readonly speed: HTMLElement;
  readonly throttle: HTMLElement;
  readonly assist: HTMLElement;
  readonly overlay: HTMLElement;
};

/**
 * 지정한 id 의 요소를 가져온다. 없으면 즉시 실패시킨다.
 * HUD 요소는 index.html 에 정적으로 존재하므로 없다면 마크업이 깨진 것이다.
 */
function requireElement(id: string): HTMLElement {
  const element: HTMLElement | null = document.getElementById(id);
  if (element === null) {
    throw new Error(`HUD 요소를 찾을 수 없다: #${id}`);
  }
  return element;
}

/** 화면 좌하단 계기와 시작 오버레이를 담당한다. */
export class Hud {
  private readonly elements: HudElements;
  private lastSpeedText: string = "";
  private lastThrottleText: string = "";
  private lastAssistText: string = "";
  private lastEngaged: boolean | null = null;

  public constructor() {
    this.elements = {
      speed: requireElement("readout-speed"),
      throttle: requireElement("readout-throttle"),
      assist: requireElement("readout-assist"),
      overlay: requireElement("overlay"),
    };
  }

  /** 시작 오버레이가 클릭되면 콜백을 호출한다. */
  public onEngageRequested(callback: () => void): void {
    this.elements.overlay.addEventListener("click", callback);
  }

  /**
   * 계기 표시를 갱신한다.
   *
   * @param speed 현재 속력 (m/s)
   * @param input 이번 프레임의 조종 입력
   * @param isEngaged 포인터 락이 걸려 있는지 여부
   */
  public update(speed: number, input: FlightInputState, isEngaged: boolean): void {
    const speedText: string = speed.toFixed(0).padStart(3, "0");
    if (speedText !== this.lastSpeedText) {
      this.elements.speed.textContent = speedText;
      this.lastSpeedText = speedText;
    }

    const throttleText: string = describeThrottle(input);
    if (throttleText !== this.lastThrottleText) {
      this.elements.throttle.textContent = throttleText;
      this.lastThrottleText = throttleText;
    }

    const assistText: string = input.isAssisting ? "ON" : "OFF";
    if (assistText !== this.lastAssistText) {
      this.elements.assist.textContent = assistText;
      this.lastAssistText = assistText;
    }

    if (isEngaged !== this.lastEngaged) {
      this.elements.overlay.classList.toggle("hidden", isEngaged);
      this.lastEngaged = isEngaged;
    }
  }
}

/** 추력 상태를 짧은 문자열로 요약한다. */
export function describeThrottle(input: FlightInputState): string {
  if (input.thrust > 0) {
    return input.isBoosting ? "BOOST" : "FWD";
  }
  if (input.thrust < 0) {
    return "REV";
  }
  if (input.strafe !== 0 || input.lift !== 0) {
    return "RCS";
  }
  return "IDLE";
}

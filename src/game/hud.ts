import type { Cargo, CargoEntry } from "./cargo";
import type { FlightInputState } from "./flight-input";
import { resourceColor, resourceDisplayName } from "./minerals";
import type { AimReport } from "./mining-laser";

/** HUD 가 참조하는 DOM 요소 묶음. */
type HudElements = {
  readonly speed: HTMLElement;
  readonly throttle: HTMLElement;
  readonly assist: HTMLElement;
  readonly overlay: HTMLElement;
  readonly aimContainer: HTMLElement;
  readonly aimMineral: HTMLElement;
  readonly aimRemaining: HTMLElement;
  readonly aimRequirement: HTMLElement;
  readonly cargoContainer: HTMLElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoCapacity: HTMLElement;
  readonly cargoRows: HTMLElement;
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

/** 16진수 색을 CSS 문자열로 바꾼다. */
function toCssColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/** 화면의 모든 계기를 담당한다. */
export class Hud {
  private readonly elements: HudElements;
  private lastSpeedText: string = "";
  private lastThrottleText: string = "";
  private lastAssistText: string = "";
  private lastEngaged: boolean | null = null;
  private lastAimSignature: string = "";
  private lastCargoSignature: string = "";

  public constructor() {
    this.elements = {
      speed: requireElement("readout-speed"),
      throttle: requireElement("readout-throttle"),
      assist: requireElement("readout-assist"),
      overlay: requireElement("overlay"),
      aimContainer: requireElement("hud-aim"),
      aimMineral: requireElement("aim-mineral"),
      aimRemaining: requireElement("aim-remaining"),
      aimRequirement: requireElement("aim-requirement"),
      cargoContainer: requireElement("hud-cargo"),
      cargoTotal: requireElement("cargo-total"),
      cargoCapacity: requireElement("cargo-capacity"),
      cargoRows: requireElement("cargo-rows"),
    };

    this.elements.cargoCapacity.textContent = "0";
  }

  /** 시작 오버레이가 클릭되면 콜백을 호출한다. */
  public onEngageRequested(callback: () => void): void {
    this.elements.overlay.addEventListener("click", callback);
  }

  /**
   * 비행 계기를 갱신한다.
   *
   * @param speed 현재 속력 (m/s)
   * @param input 이번 프레임의 조종 입력
   * @param isEngaged 조종이 활성화돼 있는지 여부
   */
  public updateFlight(speed: number, input: FlightInputState, isEngaged: boolean): void {
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

  /**
   * 조준 대상 표시를 갱신한다.
   *
   * GDD 07 의 잠금 표시 설계를 따른다 — 색이 1차 신호이고, 글은 무엇이
   * 모자란지만 짧게 알린다.
   */
  public updateAim(report: AimReport): void {
    const signature: string = `${report.mineralName ?? ""}|${report.remaining ?? ""}|${report.requirementText ?? ""}`;
    if (signature === this.lastAimSignature) {
      return;
    }
    this.lastAimSignature = signature;

    if (!report.hasTarget || report.mineralName === null) {
      this.elements.aimMineral.textContent = "";
      this.elements.aimRemaining.textContent = "";
      this.elements.aimRequirement.textContent = "";
      this.elements.aimContainer.classList.remove("locked");
      return;
    }

    this.elements.aimMineral.textContent = report.mineralName;
    this.elements.aimRemaining.textContent =
      report.remaining === null ? "" : `잔량 ${report.remaining}`;
    this.elements.aimRequirement.textContent = report.requirementText ?? "";
    this.elements.aimContainer.classList.toggle("locked", !report.isAllowed);
  }

  /** 화물칸 표시를 갱신한다. */
  public updateCargo(cargo: Cargo): void {
    const entries: CargoEntry[] = cargo.entries();
    const signature: string = `${cargo.total}|${entries.map((entry) => `${entry.resource}:${entry.amount}`).join(",")}`;
    if (signature === this.lastCargoSignature) {
      return;
    }
    this.lastCargoSignature = signature;

    this.elements.cargoTotal.textContent = Math.floor(cargo.total).toString();
    this.elements.cargoCapacity.textContent = cargo.capacity.toString();
    this.elements.cargoContainer.classList.toggle("full", cargo.isFull);

    this.elements.cargoRows.replaceChildren(
      ...entries.map((entry) => {
        const row: HTMLDivElement = document.createElement("div");
        row.className = "row";

        const name: HTMLSpanElement = document.createElement("span");
        name.className = "name";
        name.textContent = resourceDisplayName(entry.resource);
        name.style.color = toCssColor(resourceColor(entry.resource));

        const amount: HTMLSpanElement = document.createElement("span");
        amount.textContent = Math.floor(entry.amount).toString();

        row.append(name, amount);
        return row;
      }),
    );
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

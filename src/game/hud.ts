import type { Cargo, CargoEntry } from "./cargo";
import type { ShipEquipment } from "./equipment";
import type { FlightInputState } from "./flight-input";
import { resourceColor, resourceDisplayName } from "./minerals";
import type { AimReport } from "./mining-laser";
import type { StationView } from "./station-console";

/** HUD 가 참조하는 DOM 요소 묶음. */
type HudElements = {
  readonly speed: HTMLElement;
  readonly throttle: HTMLElement;
  readonly assist: HTMLElement;
  readonly tractor: HTMLElement;
  readonly overlay: HTMLElement;
  readonly aimContainer: HTMLElement;
  readonly aimMineral: HTMLElement;
  readonly aimRemaining: HTMLElement;
  readonly aimRequirement: HTMLElement;
  readonly cargoContainer: HTMLElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoCapacity: HTMLElement;
  readonly cargoRows: HTMLElement;
  readonly equipmentLaser: HTMLElement;
  readonly equipmentStation: HTMLElement;
  readonly dockPrompt: HTMLElement;
  readonly stationPanel: HTMLElement;
  readonly stationStock: HTMLElement;
  readonly stationActions: HTMLElement;
  readonly stationMessage: HTMLElement;
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
  private lastTractorText: string = "";
  private lastEngaged: boolean | null = null;
  private lastAimSignature: string = "";
  private lastCargoSignature: string = "";
  private lastStationSignature: string = "";

  public constructor() {
    this.elements = {
      speed: requireElement("readout-speed"),
      throttle: requireElement("readout-throttle"),
      assist: requireElement("readout-assist"),
      tractor: requireElement("readout-tractor"),
      overlay: requireElement("overlay"),
      aimContainer: requireElement("hud-aim"),
      aimMineral: requireElement("aim-mineral"),
      aimRemaining: requireElement("aim-remaining"),
      aimRequirement: requireElement("aim-requirement"),
      cargoContainer: requireElement("hud-cargo"),
      cargoTotal: requireElement("cargo-total"),
      cargoCapacity: requireElement("cargo-capacity"),
      cargoRows: requireElement("cargo-rows"),
      equipmentLaser: requireElement("equipment-laser"),
      equipmentStation: requireElement("equipment-station"),
      dockPrompt: requireElement("hud-dock-prompt"),
      stationPanel: requireElement("hud-station"),
      stationStock: requireElement("station-stock"),
      stationActions: requireElement("station-actions"),
      stationMessage: requireElement("station-message"),
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
  public updateFlight(
    speed: number,
    input: FlightInputState,
    isEngaged: boolean,
    pulledDebrisCount: number,
  ): void {
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

    // 몇 개를 붙잡았는지까지 보여준다. 0이면 사거리 밖이라는 뜻이므로
    // 조작이 안 먹는 것과 구분된다.
    const tractorText: string = input.isTractorActive
      ? `ON ${pulledDebrisCount}`
      : "OFF";
    if (tractorText !== this.lastTractorText) {
      this.elements.tractor.textContent = tractorText;
      this.lastTractorText = tractorText;
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

  /** 장비 상태 표시를 갱신한다. */
  public updateEquipment(equipment: ShipEquipment, stationDistance: number): void {
    const laserText: string = `T${equipment.laserTier} +${equipment.laserUpgrade}`;
    if (this.elements.equipmentLaser.textContent !== laserText) {
      this.elements.equipmentLaser.textContent = laserText;
    }

    const distanceText: string = `${Math.round(stationDistance)}m`;
    if (this.elements.equipmentStation.textContent !== distanceText) {
      this.elements.equipmentStation.textContent = distanceText;
    }
  }

  /** 거점 화면을 갱신한다. */
  public updateStation(view: StationView): void {
    this.elements.dockPrompt.classList.toggle("is-hidden", !view.isDockPromptVisible);
    this.elements.stationPanel.classList.toggle("is-hidden", !view.isDocked);

    if (!view.isDocked) {
      this.lastStationSignature = "";
      return;
    }

    const signature: string = [
      view.stock.map((line) => `${line.label}=${line.value}`).join("|"),
      view.actions.map((action) => `${action.key}:${action.detail}:${action.isAvailable}`).join("|"),
      view.message,
    ].join("#");
    if (signature === this.lastStationSignature) {
      return;
    }
    this.lastStationSignature = signature;

    this.elements.stationStock.replaceChildren(
      ...view.stock.map((line) => {
        const row: HTMLDivElement = document.createElement("div");
        row.className = "row";

        const label: HTMLSpanElement = document.createElement("span");
        label.className = "label";
        label.textContent = line.label;

        const value: HTMLSpanElement = document.createElement("span");
        value.textContent = line.value;

        row.append(label, value);
        return row;
      }),
    );

    this.elements.stationActions.replaceChildren(
      ...view.actions.map((action) => {
        const row: HTMLDivElement = document.createElement("div");
        row.className = action.isAvailable ? "action" : "action unavailable";

        const key: HTMLSpanElement = document.createElement("span");
        key.className = "key";
        key.textContent = action.key;

        const label: HTMLSpanElement = document.createElement("span");
        label.textContent = action.label;

        const detail: HTMLSpanElement = document.createElement("span");
        detail.className = "detail";
        detail.textContent = action.detail;

        row.append(key, label, detail);
        return row;
      }),
    );

    this.elements.stationMessage.textContent = view.message;
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

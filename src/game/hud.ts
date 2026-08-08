import type { Cargo, CargoEntry } from "./cargo";
import { CONTROL_HELP, KEY_BINDING } from "./controls";
import type { ShipEquipment } from "./equipment";
import type { FlightInputState } from "./flight-input";
import { resourceColor, resourceDisplayName } from "./minerals";
import type { AimReport } from "./mining-laser";
import type { ObjectiveView } from "./objectives";
import type {
  StationAction,
  StationButton,
  StationCell,
  StationView,
  SystemRow,
} from "./station-console";

/** HUD 가 참조하는 DOM 요소 묶음. */
type HudElements = {
  readonly speed: HTMLElement;
  readonly throttle: HTMLElement;
  readonly assist: HTMLElement;
  readonly tractor: HTMLElement;
  readonly overlay: HTMLElement;
  readonly controls: HTMLElement;
  readonly controlsGroups: HTMLElement;
  readonly aimContainer: HTMLElement;
  readonly aimMineral: HTMLElement;
  readonly aimRemaining: HTMLElement;
  readonly aimRequirement: HTMLElement;
  readonly cargoContainer: HTMLElement;
  readonly cargoTotal: HTMLElement;
  readonly cargoCapacity: HTMLElement;
  readonly cargoRows: HTMLElement;
  readonly equipmentLaser: HTMLElement;
  readonly equipmentTractor: HTMLElement;
  readonly equipmentStation: HTMLElement;
  readonly objectiveContainer: HTMLElement;
  readonly objectiveStep: HTMLElement;
  readonly objectiveText: HTMLElement;
  readonly objectiveHint: HTMLElement;
  readonly dockPrompt: HTMLElement;
  readonly stationPanel: HTMLElement;
  readonly stationCredits: HTMLElement;
  readonly stationStorage: HTMLElement;
  readonly stationOperations: HTMLElement;
  readonly stationEquipment: HTMLElement;
  readonly stationDetail: HTMLElement;
  readonly stationSystems: HTMLElement;
  readonly stationSystemLabel: HTMLElement;
  readonly stationMessage: HTMLElement;
  readonly stationUndock: HTMLElement;
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
  private lastObjectiveSignature: string = "";
  private stationActionCallback: ((action: StationAction) => void) | null = null;
  /**
   * 지금 고른 격자 칸.
   *
   * 순수한 화면 상태다. 무엇을 눌러 보고 있는지가 게임 상태를 바꾸지는 않으므로
   * 콘솔까지 올리지 않는다.
   */
  private selectedCellKey: string | null = null;

  public constructor() {
    this.elements = {
      speed: requireElement("readout-speed"),
      throttle: requireElement("readout-throttle"),
      assist: requireElement("readout-assist"),
      tractor: requireElement("readout-tractor"),
      overlay: requireElement("overlay"),
      controls: requireElement("hud-controls"),
      controlsGroups: requireElement("controls-groups"),
      aimContainer: requireElement("hud-aim"),
      aimMineral: requireElement("aim-mineral"),
      aimRemaining: requireElement("aim-remaining"),
      aimRequirement: requireElement("aim-requirement"),
      cargoContainer: requireElement("hud-cargo"),
      cargoTotal: requireElement("cargo-total"),
      cargoCapacity: requireElement("cargo-capacity"),
      cargoRows: requireElement("cargo-rows"),
      equipmentLaser: requireElement("equipment-laser"),
      equipmentTractor: requireElement("equipment-tractor"),
      equipmentStation: requireElement("equipment-station"),
      objectiveContainer: requireElement("hud-objective"),
      objectiveStep: requireElement("objective-step"),
      objectiveText: requireElement("objective-text"),
      objectiveHint: requireElement("objective-hint"),
      dockPrompt: requireElement("hud-dock-prompt"),
      stationPanel: requireElement("hud-station"),
      stationCredits: requireElement("station-credits"),
      stationStorage: requireElement("station-storage"),
      stationOperations: requireElement("station-operations"),
      stationEquipment: requireElement("station-equipment"),
      stationDetail: requireElement("station-detail"),
      stationSystems: requireElement("station-systems"),
      stationSystemLabel: requireElement("station-system-label"),
      stationMessage: requireElement("station-message"),
      stationUndock: requireElement("station-undock"),
    };

    this.elements.cargoCapacity.textContent = "0";
    this.bindControlsLayer();
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
    tractorCapacity: number,
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

    // 붙잡은 수와 한도를 함께 보여준다. 한도에 닿아 있으면 회수가 병목이라는
    // 뜻이고, 0 이면 사거리 밖이라 조작 문제와 구분된다.
    const tractorText: string = input.isTractorActive
      ? `${pulledDebrisCount}/${tractorCapacity}`
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

    const tractorText: string = `T${equipment.tractorTier} (${equipment.tractorCapacity})`;
    if (this.elements.equipmentTractor.textContent !== tractorText) {
      this.elements.equipmentTractor.textContent = tractorText;
    }

    const distanceText: string = `${Math.round(stationDistance)}m`;
    if (this.elements.equipmentStation.textContent !== distanceText) {
      this.elements.equipmentStation.textContent = distanceText;
    }
  }

  /**
   * 목표 표시를 갱신한다.
   *
   * 무엇을 하라는 한 줄과 어떻게 하는지 한 줄을 함께 띄운다. 조작을 모르는
   * 상태를 전제해야 첫 화면에서 막히지 않는다.
   */
  public updateObjective(view: ObjectiveView): void {
    const signature: string = `${view.completedCount}|${view.text ?? ""}`;
    if (signature === this.lastObjectiveSignature) {
      return;
    }
    this.lastObjectiveSignature = signature;

    this.elements.objectiveContainer.classList.toggle("done", view.isComplete);

    if (view.isComplete) {
      this.elements.objectiveStep.textContent = "";
      this.elements.objectiveText.textContent = "첫 사이클 완료";
      this.elements.objectiveHint.textContent = "이제 자유롭게 캐고 올린다";
      return;
    }

    this.elements.objectiveStep.textContent = `${view.completedCount + 1} / ${view.totalCount}`;
    this.elements.objectiveText.textContent = view.text ?? "";
    this.elements.objectiveHint.textContent = view.hint ?? "";
  }

  /** 거점 화면에서 버튼이 눌리면 호출할 콜백을 등록한다. */
  public onStationAction(callback: (action: StationAction) => void): void {
    this.stationActionCallback = callback;
    this.elements.stationUndock.addEventListener("click", () => {
      callback({ kind: "UNDOCK" });
    });
  }

  /**
   * 거점 화면을 갱신한다.
   *
   * 도킹 중에는 비행이 멈추고 커서가 돌아오므로, 화면에서 직접 눌러 처리한다.
   * 숫자 키를 외우게 하지 않는다.
   */
  public updateStation(view: StationView): void {
    this.elements.dockPrompt.classList.toggle("is-hidden", !view.isDockPromptVisible);
    this.elements.stationPanel.classList.toggle("is-hidden", !view.isDocked);

    if (!view.isDocked) {
      this.lastStationSignature = "";
      this.selectedCellKey = null;
      return;
    }

    const signature: string = JSON.stringify([
      view.credits,
      view.storage.map((cell) => cell.badge),
      view.equipment.map((cell) => [
        cell.badge,
        cell.actions.map((button) => [button.label, button.detail, button.isAvailable]),
      ]),
      view.operations.map((button) => [button.detail, button.isAvailable]),
      view.systems.map((row) => [row.name, row.isCurrent, row.hasMinable]),
      view.systemLabel,
      view.message,
      this.selectedCellKey,
    ]);
    if (signature === this.lastStationSignature) {
      return;
    }
    this.lastStationSignature = signature;

    this.elements.stationCredits.textContent = `${view.credits}`;

    // 고른 칸이 사라졌을 수 있다. 다 팔면 그 칸이 격자에서 빠진다.
    const cells: StationCell[] = [...view.storage, ...view.equipment];
    const selected: StationCell | undefined = cells.find(
      (cell) => cell.key === this.selectedCellKey,
    );
    if (selected === undefined) {
      this.selectedCellKey = null;
    }

    this.elements.stationStorage.replaceChildren(
      ...view.storage.map((cell) => this.buildCell(cell)),
    );
    this.elements.stationEquipment.replaceChildren(
      ...view.equipment.map((cell) => this.buildCell(cell)),
    );

    this.elements.stationOperations.replaceChildren(
      ...view.operations.map((button) => this.buildButton(button, "wide")),
    );

    this.elements.stationSystemLabel.textContent = view.systemLabel;
    this.elements.stationSystems.replaceChildren(
      ...view.systems.map((row) => this.buildSystemRow(row)),
    );

    this.renderDetail(selected);
    this.elements.stationMessage.textContent = view.message;
  }

  /**
   * 조작법 레이어를 채우고 여닫기를 건다.
   *
   * 목록을 키 배치에서 그대로 만들어낸다. 화면에 손으로 적어두면 배치를 바꿀
   * 때 한쪽만 고치게 되고, 그러면 화면이 거짓말을 한다.
   *
   * 여닫기를 FlightInput 이 아니라 여기서 듣는 이유는 시작 화면 때문이다.
   * 조종을 시작하기 전에는 입력이 잠겨 있어서, 인트로에서 안내한 키가 정작
   * 그 화면에서 안 먹는 일이 생긴다.
   */
  private bindControlsLayer(): void {
    this.elements.controlsGroups.replaceChildren(
      ...CONTROL_HELP.map((group) => {
        const block: HTMLDivElement = document.createElement("div");

        const title: HTMLDivElement = document.createElement("div");
        title.className = "group-title";
        title.textContent = group.title;
        block.append(title);

        for (const entry of group.entries) {
          const row: HTMLDivElement = document.createElement("div");
          row.className = "entry";

          const keys: HTMLSpanElement = document.createElement("span");
          keys.className = "keys";
          keys.textContent = entry.keys;

          const label: HTMLSpanElement = document.createElement("span");
          label.textContent = entry.label;

          row.append(keys, label);
          block.append(row);
        }

        return block;
      }),
    );

    window.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.code !== KEY_BINDING.Help || event.repeat) {
        return;
      }
      this.elements.controls.classList.toggle("is-hidden");
    });

    // 레이어 자체를 눌러도 닫힌다. 여는 키를 잊어도 빠져나올 수 있어야 한다.
    this.elements.controls.addEventListener("click", () => {
      this.elements.controls.classList.add("is-hidden");
    });
  }

  /**
   * 격자 칸 하나를 만든다.
   *
   * 아이콘 38 종이 나오기 전까지는 색 사각형에 첫 글자만 넣는다 (GDD 09).
   * 배치가 맞는지는 아이콘 없이도 판정되므로 색으로 먼저 자리를 잡는다.
   */
  private buildCell(cell: StationCell): HTMLElement {
    const element: HTMLButtonElement = document.createElement("button");
    element.className = `station-cell kind-${cell.kind.toLowerCase()}`;
    element.classList.toggle("is-selected", cell.key === this.selectedCellKey);
    element.classList.toggle("is-empty", cell.isEmpty);
    element.style.setProperty("--cell-color", toCssColor(cell.color));
    element.title = cell.name;

    const glyph: HTMLSpanElement = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = cell.short;

    const badge: HTMLSpanElement = document.createElement("span");
    badge.className = "badge";
    badge.textContent = cell.badge;

    element.append(glyph, badge);
    element.addEventListener("click", () => {
      // 같은 칸을 다시 누르면 선택이 풀린다.
      this.selectedCellKey = this.selectedCellKey === cell.key ? null : cell.key;
      this.lastStationSignature = "";
    });

    return element;
  }

  /**
   * 고른 칸의 상세와 할 수 있는 일을 아래 한 줄에 모은다.
   *
   * 따로 창을 띄우지 않는다. 창이 하나 더 생기면 그것이 곧 패널이고, 패널을
   * 오가게 하지 않는 것이 GDD 09 의 전제다.
   */
  private renderDetail(cell: StationCell | undefined): void {
    if (cell === undefined) {
      this.elements.stationDetail.replaceChildren(
        buildEmptyRow("칸을 누르면 여기에 상세가 나온다"),
      );
      return;
    }

    const name: HTMLSpanElement = document.createElement("span");
    name.className = "detail-name";
    name.textContent = `${cell.name} · ${cell.badge}`;
    name.style.color = toCssColor(cell.color);

    const text: HTMLSpanElement = document.createElement("span");
    text.className = "detail-text";
    text.textContent = cell.detail;

    const buttons: HTMLDivElement = document.createElement("div");
    buttons.className = "detail-buttons";
    for (const button of cell.actions) {
      buttons.append(this.buildButton(button, "small"));
    }

    this.elements.stationDetail.replaceChildren(name, text, buttons);
  }

  /**
   * 항성계 한 줄.
   *
   * 지금 있는 곳은 누를 수 없게 두고, 캘 것이 없는 곳은 갈 수는 있되 그렇다고
   * 적어둔다. 못 가게 막지 않는 것이 GDD 05 의 확정이다.
   */
  private buildSystemRow(row: SystemRow): HTMLElement {
    const element: HTMLButtonElement = document.createElement("button");
    element.className = "station-button wide system-row";
    element.disabled = row.isCurrent;
    element.classList.toggle("is-current", row.isCurrent);
    element.classList.toggle("is-locked", !row.isCurrent && !row.hasMinable);

    const label: HTMLSpanElement = document.createElement("span");
    label.className = "label";
    label.textContent = row.isCurrent ? `${row.name} — 현재 위치` : row.name;

    const detail: HTMLSpanElement = document.createElement("span");
    detail.className = "detail";
    const minerals: string = row.minerals.join(" · ");
    detail.textContent = row.hasMinable
      ? `${minerals} · ${row.summary}`
      : `${minerals} · 지금 장비로는 캘 것이 없다`;

    element.append(label, detail);
    element.addEventListener("click", () => {
      this.stationActionCallback?.(row.action);
    });

    return element;
  }

  /** 버튼 하나를 만든다. 누를 수 없으면 이유가 보이도록 흐리게만 둔다. */
  private buildButton(button: StationButton, size: "small" | "wide"): HTMLButtonElement {
    const element: HTMLButtonElement = document.createElement("button");
    element.className = `station-button ${size}`;
    element.disabled = !button.isAvailable;

    const label: HTMLSpanElement = document.createElement("span");
    label.className = "label";
    label.textContent = button.label;

    const detail: HTMLSpanElement = document.createElement("span");
    detail.className = "detail";
    detail.textContent = button.detail;

    element.append(label, detail);
    element.addEventListener("click", () => {
      this.stationActionCallback?.(button.action);
    });

    return element;
  }
}

/** 목록이 비었을 때 자리를 채울 한 줄. */
function buildEmptyRow(text: string): HTMLDivElement {
  const row: HTMLDivElement = document.createElement("div");
  row.className = "empty";
  row.textContent = text;
  return row;
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

/**
 * 채집 사이클을 숫자로 재는 도구.
 *
 * GDD 02 는 재생 시간을 혼자 정할 수 없다고 적고 있다. 한 지역에 얼마나
 * 머무는지에 맞춰야 하는데 그것은 창고 용량과 거점 왕복 주기에서 나오고,
 * 그 주기는 프로토로 재야 한다. 이 스크립트가 그 측정을 맡는다.
 *
 * 화면 없이 상수만으로 계산하므로 게임을 켜지 않고도 값을 바꿔가며 볼 수 있다.
 * 실제 조작이 섞이지 않은 이상적인 수치라는 점은 감안해야 한다.
 */

const MINING_LASER = {
  BaseYieldPerSecond: 7,
  YieldPerTier: 9,
  YieldPerUpgrade: 1.4,
  MineralPerDebris: 5,
};

const TRACTOR_BEAM = {
  BaseCapacity: 3,
  CapacityPerTier: 2,
  Range: 90,
  ApproachRate: 1.6,
  ResponseRate: 4.5,
  CollectDistance: 6,
};

const CARGO = { StackSize: 100, Slots: 3 };

/** 한 종류만 실었을 때의 최대 적재량. 화물칸은 칸 단위다. */
const CARGO_CAPACITY = CARGO.Slots * CARGO.StackSize;
const SMELTING = { OrePerIngot: 4, PrimaryIngotPerAlloy: 3, PairIngotPerAlloy: 1 };
const UPGRADE_COST = { MaterialBase: 10, MaterialPerLevel: 8, CreditBase: 150, CreditPerLevel: 120 };
const SELL_PRICE = { Ore: 2, Ingot: 14 };
const STATION_DISTANCE = 150;
const SHIP_MAX_SPEED = 160;

/** 소행성 매장량 (크기 등급별). */
const ASTEROID_AMOUNT = { small: 45, medium: 95, large: 170, huge: 260 };

/** 채굴 속도 (광물 단위/s). */
function yieldPerSecond(tier, upgrade) {
  return (
    MINING_LASER.BaseYieldPerSecond +
    (tier - 1) * MINING_LASER.YieldPerTier +
    upgrade * MINING_LASER.YieldPerUpgrade
  );
}

/** 견인빔 동시 처리 수. */
function tractorCapacity(tier) {
  return TRACTOR_BEAM.BaseCapacity + (tier - 1) * TRACTOR_BEAM.CapacityPerTier;
}

/**
 * 파편 하나가 붙잡혀 들어오는 데 걸리는 시간 (s).
 *
 * 접근 속도가 거리에 비례하므로 거리는 지수적으로 준다. dx/dt = -k*x 를 풀면
 * 도달 시간은 ln(시작거리 / 회수거리) / k 다. 여기에 목표 속도를 따라가는
 * 응답 지연이 조금 붙는다.
 */
function pullSeconds(startDistance) {
  const decay = Math.log(startDistance / TRACTOR_BEAM.CollectDistance) / TRACTOR_BEAM.ApproachRate;
  const responseLag = 1 / TRACTOR_BEAM.ResponseRate;
  return decay + responseLag;
}

/**
 * 회수 처리량 (광물 단위/s).
 *
 * 파편이 평균적으로 사거리 절반쯤에 흩어져 있다고 본다. 슬롯 하나가 파편
 * 하나를 붙잡아 끌어오는 동안 다른 파편은 기다린다.
 */
function collectPerSecond(tractorTier) {
  const travelSeconds = pullSeconds(TRACTOR_BEAM.Range / 2);
  const perSlot = MINING_LASER.MineralPerDebris / travelSeconds;
  return perSlot * tractorCapacity(tractorTier);
}

/** 한 번 왕복하는 사이클을 잰다. */
function measureCycle(laserTier, laserUpgrade, tractorTier) {
  const mining = yieldPerSecond(laserTier, laserUpgrade);
  const collecting = collectPerSecond(tractorTier);
  // 둘 중 느린 쪽이 실제 처리량이다. 이것이 2층 모델의 핵심이다.
  const effective = Math.min(mining, collecting);

  const fillSeconds = CARGO_CAPACITY / effective;
  // 거점까지 갔다 오는 시간. 가속과 감속을 감안해 평균 속도를 최고의 60% 로 본다.
  const travelSeconds = (STATION_DISTANCE * 2) / (SHIP_MAX_SPEED * 0.6);
  const stationSeconds = 8;

  return {
    mining,
    collecting,
    effective,
    bottleneck: mining <= collecting ? "채굴" : "회수",
    fillSeconds,
    travelSeconds,
    cycleSeconds: fillSeconds + travelSeconds + stationSeconds,
  };
}

/** 강화 한 단계에 필요한 광물량과 시간. */
function measureUpgrade(level, laserTier, laserUpgrade, tractorTier) {
  const materialNeeded = UPGRADE_COST.MaterialBase + UPGRADE_COST.MaterialPerLevel * (level - 1);
  const creditsNeeded = UPGRADE_COST.CreditBase + UPGRADE_COST.CreditPerLevel * (level - 1);

  const oreForMaterial = materialNeeded * SMELTING.OrePerIngot;
  const oreForCredits = Math.ceil(creditsNeeded / SELL_PRICE.Ore);
  const totalOre = oreForMaterial + oreForCredits;

  const cycle = measureCycle(laserTier, laserUpgrade, tractorTier);
  const cycles = totalOre / CARGO_CAPACITY;

  return { level, materialNeeded, creditsNeeded, totalOre, cycles, seconds: cycles * cycle.cycleSeconds };
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

console.log("=== 처리량과 병목 ===");
console.log("레이저  견인빔  채굴/s  회수/s  실효/s  병목  화물 채우기  한 사이클");
for (const [laserTier, upgrade] of [[1, 0], [1, 3], [1, 5], [2, 0], [2, 3]]) {
  for (const tractorTier of [1, 2, 3]) {
    const result = measureCycle(laserTier, upgrade, tractorTier);
    console.log(
      `T${laserTier}+${upgrade}    T${tractorTier}      ` +
        `${result.mining.toFixed(1).padStart(5)}  ${result.collecting.toFixed(1).padStart(6)}  ` +
        `${result.effective.toFixed(1).padStart(6)}  ${result.bottleneck}  ` +
        `${formatSeconds(result.fillSeconds).padStart(10)}  ${formatSeconds(result.cycleSeconds)}`,
    );
  }
}

console.log("\n=== 첫 티어까지 걸리는 시간 ===");
let elapsed = 0;
for (let level = 1; level <= 3; level += 1) {
  const upgrade = measureUpgrade(level, 1, level - 1, 1);
  elapsed += upgrade.seconds;
  console.log(
    `강화 ${level}: 재료 ${upgrade.materialNeeded} 주괴 + ${upgrade.creditsNeeded} 크레딧 ` +
      `→ 광석 ${upgrade.totalOre} · ${upgrade.cycles.toFixed(1)} 사이클 · ${formatSeconds(upgrade.seconds)}`,
  );
}
console.log(`강화 3 도달 (주석 해금): ${formatSeconds(elapsed)}`);

const bronzeOre =
  (SMELTING.PrimaryIngotPerAlloy + SMELTING.PairIngotPerAlloy) * 8 * SMELTING.OrePerIngot;
const bronzeCycle = measureCycle(1, 3, 1);
const bronzeSeconds = (bronzeOre / CARGO_CAPACITY) * bronzeCycle.cycleSeconds;
console.log(
  `청동 8 개 (T2 제작): 광석 ${bronzeOre} · ${(bronzeOre / CARGO_CAPACITY).toFixed(1)} 사이클 · ${formatSeconds(bronzeSeconds)}`,
);
console.log(`T2 도달 총합: ${formatSeconds(elapsed + bronzeSeconds)}`);

console.log("\n=== 소행성 하나를 캐는 시간 ===");
for (const [name, amount] of Object.entries(ASTEROID_AMOUNT)) {
  const rate = measureCycle(1, 0, 1).effective;
  console.log(`${name.padEnd(7)} 매장량 ${String(amount).padStart(3)} → ${formatSeconds(amount / rate)}`);
}

console.log("\n=== 재생 시간 비교 ===");
const cycle = measureCycle(1, 0, 1);
console.log(`한 사이클: ${formatSeconds(cycle.cycleSeconds)}`);
for (const [name, respawn] of [["구리", 45], ["철", 150], ["티타늄", 300], ["이리듐", 600]]) {
  const ratio = respawn / cycle.cycleSeconds;
  console.log(`${name.padEnd(5)} 재생 ${String(respawn).padStart(3)}초 = 사이클의 ${ratio.toFixed(2)} 배`);
}

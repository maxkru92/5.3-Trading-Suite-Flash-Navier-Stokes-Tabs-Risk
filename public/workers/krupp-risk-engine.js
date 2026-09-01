// ============================================================================
// KRUPP CAPITAL // NAVIER-STOKES RISK KERNEL  (Web Worker — dedicated thread)
// Mirrors 'KruppNavierStokesEngine':
//   1. Hawkes Process (order-flow toxicity)   λt = μ + (λt-Δt − μ)·e^(−βΔt)
//   2. ABE Fluid Dynamics (viscosity, regularized jerk, Δt floor 0.005)
//   3. Shannon Chaos (10-bin |log-return| histogram, log10-normalized)
//   4. Composite Risk Z-Score → CALM / HIGH / CRISIS + pre-trade interceptors
// Constants: μ=0.1  α=0.4  β=1.8
// ============================================================================

'use strict';

var MU = 0.1, ALPHA = 0.4, BETA = 1.8, DT_FLOOR = 0.005;
var WIN = 100;            // rolling analysis window (ticks)
var ENTROPY_WINDOW = 100; // last 100 log returns
var BINS = 10;

// Desk risk policy (hot-loaded from the UI; spec defaults below).
var POL = { lockChaos: 0.85, scaleVisc: 0.55, killScore: 75 };

function clampB(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

var lambda = MU;
var lastT = null;
var prevPrice = null;
var p1 = null, p2 = null, p3 = null; // p_{t-1}, p_{t-2}, p_{t-3}
var lambdas = [];   // window for λ z-score
var jerks = [];     // window for jerk z-score
var volumes = [];   // window for viscosity numerator
var ranges = [];    // window for viscosity denominator
var returns = [];   // log returns for entropy
var viscBaseline = null;
var scoreEma = 0;
var warnedTox = false;

function mean(a) { if (!a.length) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
function std(a) { if (a.length < 2) return 0; var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; } return Math.sqrt(s / (a.length - 1)); }
function zscore(x, a) { var s = std(a); if (s < 1e-9) return 0; return (x - mean(a)) / s; }
function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

function entropyOf(rets) {
  var n = rets.length;
  if (n < 10) return 0;
  var abs = new Array(n);
  var maxr = 0;
  for (var i = 0; i < n; i++) { abs[i] = Math.abs(rets[i]); if (abs[i] > maxr) maxr = abs[i]; }
  if (maxr <= 0) return 0;
  var counts = new Array(BINS).fill(0);
  for (var j = 0; j < n; j++) {
    var b = Math.min(BINS - 1, Math.floor((abs[j] / maxr) * BINS));
    counts[b]++;
  }
  var H = 0;
  for (var k = 0; k < BINS; k++) {
    var p = counts[k] / n;
    if (p > 0) H -= p * Math.log(p);
  }
  return H / Math.log(10); // log10-normalized → clean [0,1]
}

function process(tick) {
  var t = tick.t, price = tick.price, volume = tick.volume;
  var high = tick.high, low = tick.low;

  // Δt (seconds), strict lower constraint to kill explosive spikes as Δt→0
  var dt = lastT == null ? 0.1 : Math.max(0.001, (t - lastT) / 1000);
  var dtReg = Math.max(dt, DT_FLOOR);

  // --- 1. Hawkes process -----------------------------------------------------
  lambda = MU + (lambda - MU) * Math.exp(-BETA * dt);
  var dP = prevPrice == null ? 0 : Math.abs(price - prevPrice);
  // Flow poisoning shock with numerical guards: the |Δp|/range kernel can
  // spike ~1e5+ on micro-range ticks — clamp to keep λ finite (spec ε-guards).
  var kern = dP / (high - low + 1e-9);
  if (!(kern > 0)) kern = 0;
  if (kern > 50) kern = 50;
  var shock = ALPHA * volume * kern;
  lambda += shock;
  if (lambda > 1e6) lambda = 1e6;
  if (!(lambda >= MU)) lambda = MU;

  // --- 2. ABE fluid dynamics ---------------------------------------------------
  volumes.push(volume); if (volumes.length > WIN) volumes.shift();
  ranges.push(high - low + 1e-9); if (ranges.length > WIN) ranges.shift();
  var viscosity = mean(volumes) / (mean(ranges) + 1e-9);
  viscBaseline = viscBaseline == null ? viscosity : viscBaseline * 0.994 + viscosity * 0.006;
  var viscRatio = viscosity / (viscBaseline + 1e-9);

  var jerk = 0;
  if (p1 != null && p2 != null && p3 != null) {
    var num = Math.abs(price - 3 * p1 + 3 * p2 - p3);
    jerk = num / (Math.pow(dtReg, 3) + 1e-9);
  }
  p3 = p2; p2 = p1; p1 = price;

  // --- 3. Shannon chaos ---------------------------------------------------------
  if (prevPrice != null && prevPrice > 0) {
    returns.push(Math.log(price / prevPrice));
    if (returns.length > ENTROPY_WINDOW) returns.shift();
  }
  var entropy = entropyOf(returns);

  // --- windows -------------------------------------------------------------------
  lambdas.push(lambda); if (lambdas.length > WIN) lambdas.shift();
  jerks.push(jerk); if (jerks.length > WIN) jerks.shift();

  var toxZ = zscore(lambda, lambdas);
  var jerkZ = p1 != null && p3 != null ? zscore(jerk, jerks) : 0;

  // --- 4. composite risk z-score ---------------------------------------------------
  var raw = clamp((toxZ * 20) + (jerkZ * 10) + (entropy * 50), 0, 100);
  scoreEma = scoreEma * 0.62 + raw * 0.38;
  var score = clamp(scoreEma, 0, 100);

  var regime = score < 50 ? 'CALM' : score <= 75 ? 'HIGH' : 'CRISIS';

  // --- pre-trade interceptors (desk policy thresholds) -------------------------------
  var lock = entropy > POL.lockChaos;
  var scale = viscRatio < POL.scaleVisc;
  var kill = score > POL.killScore;

  var hist = new Array(BINS).fill(0);
  if (returns.length >= 10) {
    var absR = new Array(returns.length), mx = 0;
    for (var i = 0; i < returns.length; i++) { absR[i] = Math.abs(returns[i]); if (absR[i] > mx) mx = absR[i]; }
    for (var q = 0; q < returns.length; q++) hist[Math.min(BINS - 1, Math.floor((absR[q] / (mx || 1)) * BINS))]++;
    var tot = returns.length;
    for (var w = 0; w < BINS; w++) hist[w] = +(hist[w] / tot).toFixed(3);
  }

  lastT = t;
  prevPrice = price;

  return {
    ts: t,
    hawkes: +lambda.toFixed(4),
    toxZ: +toxZ.toFixed(3),
    viscosity: +viscosity.toFixed(2),
    viscRatio: +viscRatio.toFixed(3),
    jerk: +jerk.toFixed(1),
    jerkZ: +jerkZ.toFixed(3),
    entropy: +entropy.toFixed(4),
    hist: hist,
    score: +score.toFixed(1),
    regime: regime,
    shock: jerkZ > 3.0,
    interceptors: { lock: lock, scale: scale, kill: kill },
    policy: {
      lockChaos: POL.lockChaos,
      scaleVisc: POL.scaleVisc,
      killScore: POL.killScore,
    },
    reasons: {
      lock: lock ? 'SHANNON CHAOS > ' + POL.lockChaos.toFixed(2) + ' — mean-reversion strategies sealed' : '',
      scale: scale ? 'FLUID VISCOSITY < ' + Math.round(POL.scaleVisc * 100) + '% BASELINE — liquidity vacuum' : '',
      kill: kill ? 'COMPOSITE RISK > ' + POL.killScore.toFixed(0) + ' — CRISIS regime' : '',
    },
  };
}

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type === 'tick') {
    var m = process(msg.tick);
    self.postMessage({ type: 'metrics', metrics: m });
  } else if (msg.type === 'reset') {
    lambda = MU; lastT = null; prevPrice = null; p1 = p2 = p3 = null;
    lambdas = []; jerks = []; volumes = []; ranges = []; returns = [];
    viscBaseline = null; scoreEma = 0; warnedTox = false;
  } else if (msg.type === 'policy') {
    // Desk policy hot-load (bounds enforced on both sides)
    var p = msg.policy || {};
    POL.lockChaos = clampB(Number(p.lockChaos) || POL.lockChaos, 0.6, 0.97);
    POL.scaleVisc = clampB(Number(p.scaleVisc) || POL.scaleVisc, 0.2, 0.9);
    POL.killScore = clampB(Number(p.killScore) || POL.killScore, 60, 92);
  }
};

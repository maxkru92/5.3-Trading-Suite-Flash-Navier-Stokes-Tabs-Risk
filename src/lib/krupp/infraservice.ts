/**
 * KRUPP CAPITAL — System Infrastructure & Ingestion Telemetry Service
 * Scrapling stealth session monitor, Redis stream tps, WebSocket health,
 * QuestDB buffer queues, Firebase bearer-token life cycles.
 */
import { Ring } from './ring';
import { clamp, gauss } from './math';
import { ms } from './engine';
import type { AuthToken, InfraLog, InfraState, ProxyStat, WsFeed } from './types';

const LOG_CAP = 160;
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.4.1',
  'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/126.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 Safari/604.1',
];

const g = globalThis as unknown as { __kruppInfra?: boolean };

function log(infra: InfraState, level: InfraLog['level'], msg: string): void {
  infra.logs.unshift({ t: Date.now(), level, msg });
  if (infra.logs.length > LOG_CAP) infra.logs.length = LOG_CAP;
}

function newToken(label: string, ttlMs: number): AuthToken {
  const now = Date.now();
  return { label, issuedAt: now, expAt: now + ttlMs, ttl0: ttlMs };
}

export const infra: InfraState = {
  cfStatus: 'CLEAR',
  uaList: [...UA_LIST],
  uaIndex: 0,
  proxies: [
    { name: 'RES-POOL-EU', ring: new Ring(240), ok: 0, fail: 0 },
    { name: 'RES-POOL-US', ring: new Ring(240), ok: 0, fail: 0 },
    { name: 'DC-DIRECT', ring: new Ring(240), ok: 0, fail: 0 },
  ],
  tps: new Ring(240),
  queue: new Ring(240),
  success: new Ring(240),
  ws: [
    { name: 'WS-L3-CRYPTO-MBO', status: 'CONNECTED', latency: 12 },
    { name: 'WS-FUTURES-L2', status: 'CONNECTED', latency: 18 },
    { name: 'WS-EQUITIES-TAPE', status: 'CONNECTED', latency: 22 },
    { name: 'WS-VOL-COMPLEX', status: 'CONNECTED', latency: 15 },
    { name: 'WS-MACRO-FLOW', status: 'CONNECTED', latency: 31 },
    { name: 'WS-FX-CROSS', status: 'CONNECTED', latency: 27 },
  ],
  tokens: [],
  logs: [],
  expired: 0,
  reqOk: 0,
  reqFail: 0,
  scrapePerMin: 0,
};

let cfTimer = 0;
let uaTimer = 0;
let lastCrisis = false;

function tickInfra(): void {
  const crisis = ms.crisis.active;
  const I = ms.crisis.intensity;

  /* crisis edge logging */
  if (crisis && !lastCrisis) {
    log(infra, 'CRIT', 'LIQUIDITY CRISIS INJECTED — SHOCK PROPAGATED TO 13 DESKS');
    log(infra, 'WARN', 'PRE-TRADE INTERCEPTORS ARMING: BLOCK-MR / REDUCE-SIZE / EMERGENCY-FLATTENING');
  }
  if (!crisis && lastCrisis) {
    log(infra, 'OK', 'MARKETS STABILIZED — SYSTEMIC LOCKDOWN LIFTED — ENGINES NOMINAL');
  }
  lastCrisis = crisis;

  /* Cloudflare clearance state machine */
  cfTimer--;
  if (cfTimer <= 0) {
    const r = Math.random();
    if (crisis && r < 0.3) {
      infra.cfStatus = 'BLOCKED';
      cfTimer = 4;
      log(infra, 'CRIT', 'CLOUDFLARE: BLOCKED — rotating TLS fingerprint +JA3 hash');
    } else if (r < 0.14 || (crisis && r < 0.45)) {
      infra.cfStatus = 'CHALLENGE';
      cfTimer = 4 + (Math.random() * 4) | 0;
      log(infra, 'WARN', 'CLOUDFLARE: managed challenge issued — solving via stealth context');
    } else if (r < 0.24) {
      infra.cfStatus = 'ROTATING';
      cfTimer = 2;
      log(infra, 'INFO', 'CLOUDFLARE: clearance cookie rotated (cf_bm + __cf_bm pool)');
    } else {
      infra.cfStatus = 'CLEAR';
      cfTimer = 10 + (Math.random() * 14) | 0;
    }
  }

  /* User-Agent rotation */
  uaTimer--;
  if (uaTimer <= 0) {
    infra.uaIndex = (infra.uaIndex + 1) % infra.uaList.length;
    uaTimer = 6 + (Math.random() * 6) | 0;
    log(infra, 'INFO', `SCRAPLING: UA rotated → profile #${infra.uaIndex + 1} (${infra.uaList[infra.uaIndex].slice(0, 38)}…)`);
  }

  /* proxies: latency + request accounting */
  const bases = [120, 180, 35];
  infra.proxies.forEach((p: ProxyStat, i) => {
    const lat = clamp(bases[i] * (1 + gauss() * 0.18) * (1 + 3.5 * I), 8, 4000);
    p.ring.push(lat);
    const failP = 0.02 + I * 0.3;
    const ok = Math.round(60 + Math.random() * 40);
    const fail = Math.random() < failP ? Math.round(2 + Math.random() * 30 * (0.3 + I)) : Math.round(Math.random() * 2);
    p.ok += ok;
    p.fail += fail;
    infra.reqOk += ok;
    infra.reqFail += fail;
    infra.scrapePerMin = infra.reqOk + infra.reqFail;
  });
  const ratio = infra.reqOk / Math.max(1, infra.reqOk + infra.reqFail);
  infra.success.push(ratio);

  /* Redis stream tps + QuestDB queue */
  const cF = crisis ? 1 : 0;
  const tps = 3800 + gauss() * 350 + cF * (3200 + Math.random() * 2600);
  infra.tps.push(clamp(tps, 400, 14000));
  const q = infra.queue.last() * 0.94 + (crisis ? 260 + Math.random() * 220 : gauss() * 18) * (1 - 0.12);
  infra.queue.push(clamp(q, 8, 9000));

  /* WebSocket health */
  for (const w of infra.ws) {
    if (w.status === 'RECONNECTING') {
      if (Math.random() < 0.5) {
        w.status = 'CONNECTED';
        log(infra, 'OK', `${w.name}: reconnected — resubscribing L3 channels`);
      }
    } else if (Math.random() < 0.012 + I * 0.05) {
      w.status = 'RECONNECTING';
      log(infra, 'WARN', `${w.name}: socket dropped — exponential backoff reconnect (attempt ${1 + ((Math.random() * 3) | 0)})`);
    }
    w.latency = clamp(w.latency * (1 + gauss() * 0.12) * (1 + 2.5 * I * 0.2) + gauss() * 2, 6, 2000);
  }

  /* Firebase bearer tokens */
  const now = Date.now();
  if (infra.tokens.length === 0) {
    infra.tokens = [
      newToken('FB-AUTH-WORKER-1', (95 + Math.random() * 60) * 1000),
      newToken('FB-AUTH-WORKER-2', (140 + Math.random() * 80) * 1000),
      newToken('FB-STREAM-GATEWAY', (180 + Math.random() * 90) * 1000),
    ];
    log(infra, 'OK', 'FIREBASE: 3 bearer tokens minted — streaming workers authenticated');
  }
  for (let i = 0; i < infra.tokens.length; i++) {
    const t = infra.tokens[i];
    if (now >= t.expAt) {
      infra.expired++;
      const ttl = crisis ? (50 + Math.random() * 40) * 1000 : (95 + Math.random() * 90) * 1000;
      infra.tokens[i] = newToken(t.label, ttl);
      log(infra, 'WARN', `FIREBASE: ${t.label} EXPIRED → rotating bearer token (exp count: ${infra.expired})`);
    }
  }
}

export function ensureInfra(): void {
  if (g.__kruppInfra || typeof window === 'undefined') return;
  g.__kruppInfra = true;
  // seed histories
  for (let i = 0; i < 120; i++) {
    infra.tps.push(3800 + gauss() * 300);
    infra.queue.push(140 + gauss() * 30);
    infra.success.push(0.975 + Math.random() * 0.02);
    infra.proxies[0].ring.push(120 * (1 + gauss() * 0.15));
    infra.proxies[1].ring.push(180 * (1 + gauss() * 0.15));
    infra.proxies[2].ring.push(35 * (1 + gauss() * 0.15));
  }
  infra.reqOk = 48211;
  infra.reqFail = 941;
  log(infra, 'OK', 'SCRAPLING: stealth session pool online — 3 proxy lanes active');
  log(infra, 'INFO', 'QUESTDB: disk-write buffer attached — WAL enabled');
  log(infra, 'OK', 'REDIS: stream ingestion @ ~3.8K ticks/s across 42 channels');
  setInterval(tickInfra, 700);
}

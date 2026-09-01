'use client';
/**
 * KRUPP CAPITAL — DESK 13 · SYSTEM INFRASTRUCTURE TERMINAL
 * OPS/SCRAPLING-DATAAPI-FIREBASE
 *
 * Sub-terminal 1 — Scrapling stealth session monitor (Cloudflare clearance,
 *                   rotating UA fingerprints, proxy lanes, request accounting).
 * Sub-terminal 2 — Data-API hub & storage health (Redis tps, QuestDB WAL
 *                   buffer, WebSocket health matrix, storage pipeline flow).
 * Sub-terminal 3 — Firebase bearer-token lifecycle (TTL bars @5 Hz, rotation
 *                   log, full system event console).
 *
 * Data contract: `infra` is service-mutated OUTSIDE React at 0.7 Hz; the
 * engine bump gives a 5 Hz React pulse. Charts read infra rings directly
 * inside rAF closures (zero allocation). UA fingerprint hashes are computed
 * once at module init (stable FNV-1a).
 */
import { Database, KeyRound, ServerCog, ShieldCheck, Terminal } from 'lucide-react';
import { ms } from '@/lib/krupp/engine';
import { infra } from '@/lib/krupp/infraservice';
import { fClock, fCompact, fCountdown, fN } from '@/lib/krupp/format';
import { useRevision, useSubTab } from '@/lib/krupp/store';
import { Badge, FlashAlert, Panel, SectionLabel, Stat, Tbl, Td, Tr } from '@/components/krupp/ui';
import { DeskFrame, SubPane } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Gauge } from '@/components/krupp/charts/Gauge';
import type { AuthToken, InfraLog, InfraState, WsStatus } from '@/lib/krupp/types';
import { KT } from '@/lib/theme';

/* ------------------------------------------------------------------ */
/* Module-init: stable fingerprint hashes for the UA pool (FNV-1a 32)  */
/* ------------------------------------------------------------------ */
function uaHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

const UA_HASHES: string[] = infra.uaList.map(uaHash);
const INFRA_BOOT_T = Date.now();

/* ------------------------------------------------------------------ */
/* Display kernels                                                     */
/* ------------------------------------------------------------------ */
const CF_META: Record<InfraState['cfStatus'], { tone: 'emerald' | 'amber' | 'cyan' | 'rose'; msg: string }> = {
  CLEAR: { tone: 'emerald', msg: 'clearance cookie valid — stealth context stable' },
  CHALLENGE: { tone: 'amber', msg: 'managed challenge issued — solving via stealth context' },
  ROTATING: { tone: 'cyan', msg: 'clearance cookie rotation in progress — cf_bm pool swap' },
  BLOCKED: { tone: 'rose', msg: 'WAF BLOCK — TLS/JA3 fingerprint rotation forced' },
};

const WS_META: Record<WsStatus, { tone: 'emerald' | 'amber' | 'zinc'; pulse: boolean }> = {
  CONNECTED: { tone: 'emerald', pulse: false },
  RECONNECTING: { tone: 'amber', pulse: true },
  STANDBY: { tone: 'zinc', pulse: false },
};

const LVL_META: Record<InfraLog['level'], { tone: 'zinc' | 'emerald' | 'amber' | 'rose'; pulse: boolean }> = {
  INFO: { tone: 'zinc', pulse: false },
  OK: { tone: 'emerald', pulse: false },
  WARN: { tone: 'amber', pulse: false },
  CRIT: { tone: 'rose', pulse: true },
};

function fUptime(el: number): string {
  const s = Math.max(0, Math.floor(el / 1000));
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function LvlBadge({ level }: { level: InfraLog['level'] }) {
  const m = LVL_META[level];
  return (
    <Badge tone={m.tone} pulse={m.pulse}>
      {level}
    </Badge>
  );
}

function UptimeChip() {
  useRevision(); // 5 Hz tick keeps the clock live
  return (
    <span className="rounded border border-emerald-800/60 bg-emerald-900/20 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-emerald-300">
      SESSION UPTIME {fUptime(Date.now() - INFRA_BOOT_T)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* SUB-TAB 1 — Scrapling stealth session monitor                       */
/* ------------------------------------------------------------------ */
function ScraplingPane() {
  useRevision();
  const cf = CF_META[infra.cfStatus];
  const totalReq = infra.reqOk + infra.reqFail;
  const failPct = totalReq > 0 ? (infra.reqFail / totalReq) * 100 : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Cloudflare clearance */}
        <Panel title="CLOUDFLARE CLEARANCE" right={<ShieldCheck size={12} className="text-zinc-500" />}>
          <div className="flex flex-col items-start gap-2">
            <Badge tone={cf.tone} pulse={infra.cfStatus === 'BLOCKED'} className="px-3 py-1 text-[12px]">
              {infra.cfStatus}
            </Badge>
            <p className="font-mono text-[10px] leading-snug text-zinc-400">{cf.msg}</p>
            <div className="flex w-full items-center justify-between rounded border border-kborder bg-kpanel px-2 py-1.5">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">STEALTH SESSION</span>
              <UptimeChip />
            </div>
            <div className="flex w-full justify-between font-mono text-[9.5px] text-zinc-500">
              <span>UA POOL · 6 PROFILES</span>
              <span className="text-zinc-400">ROT ≈ EVERY 9s</span>
            </div>
          </div>
        </Panel>

        {/* Request accounting */}
        <Panel title="REQUEST ACCOUNTING — SCRAPLING EGRESS" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="REQ OK" value={fN(infra.reqOk, 0)} tone="text-emerald-400" sub="2xx via stealth pool" />
            <Stat label="REQ FAIL" value={fN(infra.reqFail, 0)} tone="text-rose-400" sub="4xx/5xx + WAF rejects" />
            <Stat
              label="FAIL RATIO"
              value={`${failPct.toFixed(2)}%`}
              tone={failPct > 5 ? 'text-rose-400' : failPct > 2 ? 'text-amber-400' : 'text-zinc-100'}
              sub="ok+fail denominator"
            />
            <Stat label="SCRAPE VOL/MIN" value={fN(infra.scrapePerMin, 0)} sub="scrapling request counter" />
          </div>
        </Panel>
      </div>

      {/* Rotating UA table */}
      <Panel
        title="ROTATING USER-AGENT FINGERPRINT POOL"
        right={<Badge tone="cyan">ACTIVE PROFILE #{infra.uaIndex + 1}</Badge>}
      >
        <Tbl head={['IDX', 'UA STRING', 'FINGERPRINT HASH']}>
          {infra.uaList.map((ua, i) => {
            const active = i === infra.uaIndex;
            return (
              <Tr key={ua} className={active ? 'bg-kaccent-deep/40' : ''}>
                <Td className={active ? 'font-bold text-kaccent-soft' : 'text-zinc-500'}>
                  {String(i + 1).padStart(2, '0')}
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className="block max-w-[260px] truncate text-zinc-300 md:max-w-[420px] lg:max-w-[640px]">
                      {ua}
                    </span>
                    {active && <Badge tone="cyan">ACTIVE</Badge>}
                  </span>
                </Td>
                <Td className="text-zinc-500">0x{UA_HASHES[i]}</Td>
              </Tr>
            );
          })}
        </Tbl>
      </Panel>

      {/* Proxy lanes + success gauge */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="PROXY LANES — EGRESS LATENCY" className="lg:col-span-2">
          <LineChart
            height="h-44"
            series={[
              { label: 'RES-POOL-EU', color: KT('up'), data: () => infra.proxies[0].ring },
              { label: 'RES-POOL-US', color: KT('warn'), data: () => infra.proxies[1].ring },
              { label: 'DC-DIRECT', color: KT('cyan'), data: () => infra.proxies[2].ring },
            ]}
            fmtV={(v) => `${v.toFixed(0)}ms`}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {infra.proxies.map((p) => {
              const tot = p.ok + p.fail;
              const ratio = tot > 0 ? (p.ok / tot) * 100 : 0;
              const lat = p.ring.last();
              return (
                <div key={p.name} className="rounded border border-kborder bg-kpanel px-2 py-1.5">
                  <div className="flex justify-between font-mono text-[10px]">
                    <span className="font-semibold text-zinc-300">{p.name}</span>
                    <span className={lat > 300 ? 'text-amber-400' : 'text-zinc-400'}>
                      {isFinite(lat) ? `${fN(lat, 0)}ms` : '—'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex justify-between font-mono text-[9.5px] text-zinc-500">
                    <span>
                      OK {fN(p.ok, 0)} · FAIL {fN(p.fail, 0)}
                    </span>
                    <span className={ratio > 97 ? 'text-emerald-400' : ratio > 92 ? 'text-amber-400' : 'text-rose-400'}>
                      {ratio.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="INGEST SUCCESS RATIO">
          <Gauge
            value={() => {
              const s = infra.success.last();
              return isFinite(s) ? s * 100 : 0;
            }}
            min={0}
            max={100}
            label="SUCCESS"
            fmtV={(v) => `${v.toFixed(1)}%`}
            className="h-28 w-full"
            zones={[
              { from: 0, to: 92, color: KT('downDeep') },
              { from: 92, to: 97, color: KT('warnDeep') },
              { from: 97, to: 100, color: KT('upDeep') },
            ]}
          />
          <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            zones — rose below 92 · amber 92–97 · emerald above 97
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SUB-TAB 2 — Data-API hub & storage health                           */
/* ------------------------------------------------------------------ */
function DataApiPane() {
  useRevision();
  const tps = infra.tps.last();
  const q = infra.queue.last();
  const backlog = isFinite(q) && q > 2500;
  const conn = infra.ws.filter((w) => w.status === 'CONNECTED').length;
  const avgLat = infra.ws.reduce((a, w) => a + w.latency, 0) / Math.max(1, infra.ws.length);
  const succRaw = infra.success.last();
  const succ = isFinite(succRaw) ? succRaw : 0.97;
  const tpsNow = isFinite(tps) ? tps : 0;
  const qNow = isFinite(q) ? q : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Redis stream */}
        <Panel title="REDIS STREAM — INGESTION THROUGHPUT" right={<Database size={12} className="text-zinc-500" />}>
          <LineChart
            height="h-40"
            series={[{ label: 'TPS', color: KT('cyan'), data: () => infra.tps }]}
            fmtV={(v) => fN(v, 0)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="CURRENT TPS" value={fN(tpsNow, 0)} tone="text-kaccent-soft" sub="xadd across 42 channels" />
            <Stat label="PEAK · 240s RING" value={fN(infra.tps.minMax()[1], 0)} sub="window maximum" />
          </div>
        </Panel>

        {/* QuestDB WAL buffer */}
        <Panel title="QUESTDB — DISK-WRITE BUFFER (WAL)" right={<Database size={12} className="text-zinc-500" />}>
          <LineChart
            height="h-40"
            series={[{ label: 'QUEUE DEPTH', color: KT('warn'), data: () => infra.queue }]}
            fmtV={(v) => fCompact(v)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat
              label="BUFFER DEPTH"
              value={fCompact(qNow)}
              tone={backlog ? 'text-rose-400' : 'text-zinc-100'}
              sub="rows pending fsync"
            />
            <Stat
              label="WAL STATE"
              value={backlog ? 'COMPACTION QUEUED' : 'NOMINAL'}
              tone={backlog ? 'text-rose-400' : 'text-emerald-400'}
              sub="watermark 2.5K rows"
            />
          </div>
          <FlashAlert className="mt-2" active={backlog} tone="amber" title="QUESTDB WRITE BUFFER BACKLOG — WAL COMPACTION QUEUED">
            depth {fCompact(qNow)} exceeds the 2.5K watermark — compactor will freeze the merge window
          </FlashAlert>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* WebSocket health matrix */}
        <Panel title="WEBSOCKET HEALTH MATRIX" right={<Badge tone={conn === infra.ws.length ? 'emerald' : 'amber'}>{conn}/{infra.ws.length} CONNECTED</Badge>}>
          <Tbl head={['FEED', 'STATUS', 'LATENCY']} maxH="max-h-72">
            {infra.ws.map((w) => {
              const meta = WS_META[w.status];
              return (
                <Tr key={w.name}>
                  <Td className="font-semibold text-zinc-300">{w.name}</Td>
                  <Td>
                    <Badge tone={meta.tone} pulse={meta.pulse}>
                      {w.status}
                    </Badge>
                  </Td>
                  <Td className={w.latency > 100 ? 'text-amber-400' : 'text-zinc-400'}>{fN(w.latency, 0)}ms</Td>
                </Tr>
              );
            })}
          </Tbl>
        </Panel>

        {/* Storage pipeline mini-diagram */}
        <Panel title="STORAGE PIPELINE — LIVE FLOW" right={<Terminal size={12} className="text-zinc-500" />}>
          <pre className="krupp-scroll overflow-x-auto whitespace-pre font-mono text-[10.5px] leading-relaxed text-zinc-400">
{`[REDIS STREAM] ──xadd ${fN(tpsNow, 0)}/s──▶ [ENRICH WORKER ×4] ──depth ${fCompact(qNow)}──▶ [QUESTDB (WAL)] ──fsync──▶ [DESK MIRRORS ×13]

  INGEST   ${fN(tpsNow, 0)} msg/s across 42 channels · fanout lag ${fN(avgLat, 0)}ms
  BUFFER   ${fCompact(qNow)} rows pending WAL fsync · ${backlog ? 'COMPACTION QUEUED' : 'WATERMARK NOMINAL'}
  MIRROR   13/13 desks fed · WS fanout ${conn}/${infra.ws.length} up · ingest success ${(succ * 100).toFixed(1)}%`}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SUB-TAB 3 — Firebase bearer-token lifecycle                         */
/* ------------------------------------------------------------------ */
function TokenCard({ t, now }: { t: AuthToken; now: number }) {
  const left = t.expAt - now;
  const pct = Math.min(100, Math.max(0, (left / t.ttl0) * 100));
  const barTone = pct > 40 ? 'bg-emerald-500' : pct > 15 ? 'bg-amber-500' : 'bg-rose-500';
  const status =
    left <= 0
      ? { tone: 'rose' as const, label: 'EXPIRED — ROTATING', pulse: true }
      : pct < 15
        ? { tone: 'amber' as const, label: 'EXPIRING', pulse: true }
        : { tone: 'emerald' as const, label: 'ACTIVE', pulse: false };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-kborder bg-kpanel/90 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] font-bold tracking-wider text-zinc-200">{t.label}</span>
        <Badge tone={status.tone} pulse={status.pulse}>
          {status.label}
        </Badge>
      </div>
      <div className={`font-mono text-2xl font-semibold leading-none ${left < 15000 ? 'text-rose-400' : 'text-zinc-100'}`}>
        {fCountdown(left)}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-kpanel2">
        <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[9.5px] text-zinc-500">
        <span>ISSUED {fClock(t.issuedAt)}</span>
        <span>TTL LEFT {pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function FirebasePane() {
  useRevision();
  const now = Date.now();
  const fbLogs = infra.logs.filter((l) => l.msg.includes('FIREBASE')).slice(0, 12);
  return (
    <div className="flex flex-col gap-3">
      <FlashAlert
        active={ms.crisis.active && infra.cfStatus !== 'CLEAR'}
        tone="rose"
        title="OPS DEGRADED — CF CHALLENGE RATE SPIKE + TOKEN CHURN"
      >
        clearance {infra.cfStatus} · {infra.expired} token rotations this session · renewals throttled during lockdown
      </FlashAlert>

      <SectionLabel>FIREBASE BEARER TOKEN LIFECYCLE — 5 HZ TTL TRACKER</SectionLabel>
      {infra.tokens.length === 0 ? (
        <Panel title="TOKEN POOL">
          <div className="py-6 text-center font-mono text-[11px] tracking-wider text-zinc-500">
            AWAITING FIRST BEARER-TOKEN MINT FROM AUTH WORKER…
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {infra.tokens.map((t) => (
            <TokenCard key={t.label} t={t} now={now} />
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="flex flex-col justify-center">
          <Stat
            label="TOKEN EXPIRATIONS · SESSION"
            value={fN(infra.expired, 0)}
            tone={infra.expired > 0 ? 'text-amber-400' : 'text-emerald-400'}
            sub="auto-rotation on expiry — zero-downtime"
          />
        </div>
        <Panel title="FIREBASE ROTATION LOG — LAST 12" className="lg:col-span-2" right={<KeyRound size={12} className="text-zinc-500" />}>
          <Tbl head={['TIME', 'LVL', 'MESSAGE']} maxH="max-h-56">
            {fbLogs.map((l, i) => (
              <Tr key={`${l.t}-${i}`}>
                <Td className="text-zinc-500">{fClock(l.t)}</Td>
                <Td>
                  <LvlBadge level={l.level} />
                </Td>
                <Td className="text-zinc-300">{l.msg}</Td>
              </Tr>
            ))}
          </Tbl>
        </Panel>
      </div>

      <Panel title="EVENT CONSOLE — SYSTEM BUS (NEWEST FIRST)" right={<Terminal size={12} className="text-zinc-500" />}>
        <Tbl head={['TIME', 'LVL', 'MESSAGE']} maxH="max-h-[360px]">
          {infra.logs.slice(0, 40).map((l, i) => (
            <Tr key={`${l.t}-${i}`}>
              <Td className="text-zinc-500">{fClock(l.t)}</Td>
              <Td>
                <LvlBadge level={l.level} />
              </Td>
              <Td
                className={
                  l.level === 'CRIT' ? 'text-rose-300' : l.level === 'WARN' ? 'text-amber-300' : 'text-zinc-300'
                }
              >
                {l.msg}
              </Td>
            </Tr>
          ))}
        </Tbl>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desk 13 root                                                        */
/* ------------------------------------------------------------------ */
export default function Desk13Infra() {
  useRevision();
  const sub = useSubTab(12);
  return (
    <DeskFrame
      deskId={12}
      title="SYSTEM INFRASTRUCTURE TERMINAL"
      code="OPS/SCRAPLING-DATAAPI-FIREBASE"
      accent="violet"
      subtabs={['SCRAPLING STEALTH', 'DATA-API HUB & STORAGE', 'FIREBASE TOKEN LIFECYCLE']}
      right={
        <Badge tone={infra.cfStatus === 'CLEAR' ? 'emerald' : infra.cfStatus === 'BLOCKED' ? 'rose' : 'amber'} pulse={infra.cfStatus === 'BLOCKED'}>
          <ServerCog size={10} />
          OPS · CF {infra.cfStatus}
        </Badge>
      }
    >
      <SubPane active={sub} index={0}>
        <ScraplingPane />
      </SubPane>
      <SubPane active={sub} index={1}>
        <DataApiPane />
      </SubPane>
      <SubPane active={sub} index={2}>
        <FirebasePane />
      </SubPane>
    </DeskFrame>
  );
}

'use client';
/**
 * KRUPP CAPITAL — Desk 11 · CRYPTO L3 MBO DESK
 * DIGITAL/MBO-OFI-ENGINE — True market-by-order tape (BTC/ETH/SOL),
 * OFI & CVD flow analytics, iceberg detection feed and the 3-token
 * CVD comparison. Tape renders the L3 service array directly @5Hz.
 */
import { ms } from '@/lib/krupp/engine';
import { getL3, l3Symbols } from '@/lib/krupp/l3service';
import { useKrupp, useRevision, useSelected } from '@/lib/krupp/store';
import { fN, fPx, fCompact, fSign, fClock, fAgo, toneNum } from '@/lib/krupp/format';
import type { TapeEvent } from '@/lib/krupp/types';
import { Panel, Badge, Stat, FlashAlert, Tbl, Tr, Td } from '@/components/krupp/ui';
import { DeskFrame } from '@/components/krupp/DeskFrame';
import { LineChart } from '@/components/krupp/charts/LineChart';
import { Gauge } from '@/components/krupp/charts/Gauge';
import { Sparkline } from '@/components/krupp/charts/Sparkline';
import { KT } from '@/lib/theme';

const TOKENS = l3Symbols();
const DEC: Record<string, number> = { 'BTC-USD': 1, 'ETH-USD': 2, 'SOL-USD': 2 };
const TOKEN_COLOR: Record<string, string> = {
  'BTC-USD': KT('warn'),
  'ETH-USD': KT('cyan'),
  'SOL-USD': KT('violet'),
};
const TOKEN_CLS: Record<string, string> = {
  'BTC-USD': 'text-amber-300',
  'ETH-USD': 'text-kaccent-soft',
  'SOL-USD': 'text-violet-300',
};

function rowTone(ev: TapeEvent): string {
  if (ev.act === 'NEW') return 'bg-kaccent/[0.06]';
  if (ev.act === 'CXL') return 'bg-amber-400/[0.06]';
  return ev.side === 'B' ? 'bg-emerald-400/[0.06]' : 'bg-rose-400/[0.06]';
}

function actTone(ev: TapeEvent): 'cyan' | 'amber' | 'emerald' | 'rose' {
  if (ev.act === 'NEW') return 'cyan';
  if (ev.act === 'CXL') return 'amber';
  return ev.side === 'B' ? 'emerald' : 'rose';
}

/* ------------------------------------------------------------------ */

export default function Desk11Crypto() {
  useRevision(); // 5 Hz — tape / stats / feeds re-render; charts poll via rAF
  const sel = useSelected('desk11', 'BTC-USD');
  const select = useKrupp((s) => s.select);
  const l3 = getL3(sel);
  const now = Date.now();

  return (
    <DeskFrame
      deskId={10}
      title="CRYPTO L3 MBO DESK"
      code="DIGITAL/MBO-OFI-ENGINE"
      accent="amber"
      right={
        <div className="flex flex-wrap gap-1">
          {TOKENS.map((sym) => (
            <button
              key={sym}
              onClick={() => select('desk11', sym)}
              className={`rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                sel === sym
                  ? 'border-amber-400/70 bg-amber-400/10 text-amber-300'
                  : 'border-kborder2 text-zinc-500 hover:border-kborder4 hover:text-zinc-300'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      }
    >
      {!l3 ? (
        <Panel title="L3 MBO ENGINE">
          <div className="py-20 text-center font-mono text-xs tracking-widest text-zinc-500">
            AWAITING L3 MBO ENGINE BOOT — ORDER-FLOW WORKER OFFLINE
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {/* ---------------- L3 stats strip ---------------- */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="OPEN ORDERS" value={fN(l3.openOrders, 0)} sub="MBO BOOK ENTRIES" />
            <Stat
              label="CANCEL RATE"
              value={fN(l3.cancelRate * 100, 1) + '%'}
              tone="text-amber-300"
              sub="CXL / (NEW + CXL) EMA"
            />
            <Stat label="TAPE TPS" value={fN(l3.tps, 0)} sub="L3 EVENTS / SEC" />
            <Stat label="MID" value={fPx(l3.mid, DEC[sel] ?? 2)} sub={sel + ' MARK MID'} />
            <Stat
              label="CVD (LAST)"
              value={fCompact(l3.cvd.last())}
              tone={toneNum(l3.cvd.last())}
              sub="CUM VOLUME DELTA"
            />
            <Stat label="OFI" value={fSign(l3.ofi, 2)} tone={toneNum(l3.ofi)} sub="ORDER FLOW IMBALANCE" />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {/* ---------------- MBO tape ---------------- */}
            <Panel
              title={`L3 MARKET-BY-ORDER TAPE — ${sel}`}
              className="xl:col-span-2"
              bodyClass="p-2"
              right={<Badge tone="zinc">CAP 48 · NEWEST FIRST</Badge>}
            >
              <Tbl head={['TIME', 'ORDER ID', 'SIDE', 'PRICE', 'QTY', 'QUEUE', 'ACTION', 'ICE']} maxH="max-h-[420px]">
                {l3.tape.length === 0 ? (
                  <Tr key="boot">
                    <Td className="py-6 text-center text-zinc-500">SYNCING MBO TAPE…</Td>
                  </Tr>
                ) : (
                  l3.tape.map((ev, i) => (
                    <Tr key={ev.id + ':' + i} className={rowTone(ev)}>
                      <Td className="text-zinc-500">{fClock(ev.ts).slice(0, 8)}</Td>
                      <Td className="text-zinc-300">{ev.id}</Td>
                      <Td>
                        <Badge tone={ev.side === 'B' ? 'emerald' : 'rose'}>{ev.side}</Badge>
                      </Td>
                      <Td className={ev.side === 'B' ? 'text-emerald-300' : 'text-rose-300'}>
                        {fPx(ev.px, DEC[sel] ?? 2)}
                      </Td>
                      <Td>{fN(ev.qty, 2)}</Td>
                      <Td className="text-zinc-500">#{ev.qp}</Td>
                      <Td>
                        <Badge tone={actTone(ev)}>{ev.act}</Badge>
                      </Td>
                      <Td>
                        {ev.ice ? (
                          <Badge tone="rose" pulse>
                            ICEBERG
                          </Badge>
                        ) : (
                          <span className="text-zinc-600">·</span>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbl>
            </Panel>

            {/* ---------------- OFI & CVD ---------------- */}
            <Panel title="OFI & CVD — ORDER FLOW" right={<Badge tone={l3.ofi >= 0 ? 'emerald' : 'rose'}>{l3.ofi >= 0 ? 'BUY IMBALANCE' : 'SELL IMBALANCE'}</Badge>}>
              <LineChart
                height="h-40"
                fmtV={(v) => fCompact(v)}
                hlines={[{ y: 0, color: KT('axisFaint'), label: 'ZERO' }]}
                series={[{ label: 'CVD', color: KT('up'), data: () => l3.cvd, width: 1.6 }]}
              />
              <Gauge
                className="mt-1 h-28 w-full"
                label="FLOW BALANCE"
                value={() => (l3.ofi + 1) * 50}
                zones={[
                  { from: 0, to: 35, color: KT('downDeep') },
                  { from: 35, to: 65, color: KT('warn') },
                  { from: 65, to: 100, color: KT('up') },
                ]}
              />
              <p className="text-center font-mono text-[10px] tracking-wide text-zinc-500">
                OFI {fSign(l3.ofi, 3)} · &lt;35 SELL / NEUTRAL / BUY &gt;65
              </p>
            </Panel>

            {/* ---------------- Iceberg detection ---------------- */}
            <Panel
              title="ICEBERG DETECTION FEED"
              bodyClass="p-2"
              right={<Badge tone="zinc">CAP 14 · NEWEST FIRST</Badge>}
            >
              <FlashAlert
                active={l3.icebergs.length > 0 && now - l3.icebergs[0].ts < 15000}
                tone="rose"
                title="LARGE ORDER ICEBERG DETECTED — HIDDEN CHILD ORDERS REFILLING"
              />
              <div className="mt-2">
                <Tbl head={['AGE', 'SYM', 'PRICE', 'EST QTY', 'ORDER ID']} maxH="max-h-64">
                  {l3.icebergs.length === 0 ? (
                    <Tr key="boot">
                      <Td className="py-6 text-center text-zinc-500">NO ICEBERG PRINTS YET</Td>
                    </Tr>
                  ) : (
                    l3.icebergs.map((ev, i) => (
                      <Tr key={ev.oid + ':' + i}>
                        <Td className="text-zinc-500">{fAgo(ev.ts, now)} AGO</Td>
                        <Td className={TOKEN_CLS[ev.sym] ?? 'text-zinc-300'}>{ev.sym}</Td>
                        <Td>{fPx(ev.px, DEC[ev.sym] ?? 2)}</Td>
                        <Td className="text-rose-300">{fCompact(ev.estQty)}</Td>
                        <Td className="text-zinc-500">{ev.oid}</Td>
                      </Tr>
                    ))
                  )}
                </Tbl>
              </div>
            </Panel>

            {/* ---------------- 3-token CVD comparison ---------------- */}
            <Panel
              title="3-TOKEN CVD COMPARISON — RAW CUMULATIVE VOLUME DELTA"
              className="xl:col-span-2"
              right={<Badge tone="zinc">16HZ L3 RINGS</Badge>}
            >
              <LineChart
                height="h-44"
                fmtV={(v) => fCompact(v)}
                hlines={[{ y: 0, color: KT('axisFaint'), label: 'ZERO' }]}
                series={TOKENS.map((sym) => ({
                  label: sym,
                  color: TOKEN_COLOR[sym] ?? KT('textDim'),
                  data: () => getL3(sym)?.cvd ?? null,
                  width: 1.5,
                }))}
              />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TOKENS.map((sym) => {
                  const st = getL3(sym);
                  return (
                    <div
                      key={sym}
                      className={`rounded border px-2.5 py-2 ${
                        sel === sym ? 'border-amber-400/40 bg-amber-400/[0.04]' : 'border-kborder bg-kpanel'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold tracking-wider" style={{ color: TOKEN_COLOR[sym] ?? KT('textDim') }}>
                          {sym}
                        </span>
                        <Badge tone={sel === sym ? 'amber' : 'zinc'}>{sel === sym ? 'FOCUS' : 'LIVE'}</Badge>
                      </div>
                      <Sparkline data={() => st?.cvd ?? null} color={TOKEN_COLOR[sym] ?? KT('textDim')} className="mt-1 h-8 w-full" />
                      <div className="mt-1.5 space-y-0.5 font-mono text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">MID</span>
                          <span>{st ? fPx(st.mid, DEC[sym] ?? 2) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">CVD</span>
                          <span className={st ? toneNum(st.cvd.last()) : ''}>{st ? fCompact(st.cvd.last()) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">OFI</span>
                          <span className={st ? toneNum(st.ofi) : ''}>{st ? fSign(st.ofi, 2) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">TPS</span>
                          <span>{st ? fN(st.tps, 0) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* ---------------- Crisis: liquidation cascade ---------------- */}
          <FlashAlert
            active={ms.crisis.active && l3.ofi < -0.4}
            tone="rose"
            title="LIQUIDATION CASCADE ENGINE ACTIVE — BID WALL SWEEP DETECTED"
          >
            Crisis intensity {(ms.crisis.intensity * 100).toFixed(0)}% · {sel} OFI {fSign(l3.ofi, 3)} —
            bid walls being swept/cancelled while aggressive sell flow lifts through the offer stack.
          </FlashAlert>
        </div>
      )}
    </DeskFrame>
  );
}

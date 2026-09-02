// ============================================================================
// KRUPP CAPITAL — EXPORT FORMATTERS (CSV / HTML)
// Pure formatters — no I/O, no side-effects. Each accepts ExportPayload and
// returns a string ready for download() or NextResponse.
// ============================================================================

import type { ExportPayload, ExportRow } from './aggregator';

// ---------- RFC-4180 CSV helpers --------------------------------------------

function escCsv(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtVal(r: ExportRow): string {
  if (r.value == null) return '';
  if (typeof r.value === 'number') {
    if (Number.isInteger(r.value) && Math.abs(r.value) < 1e9) {
      return r.value.toLocaleString('en-US');
    }
    return r.value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
  return String(r.value);
}

export function formatCsv(payload: ExportPayload): string {
  const HEADERS = ['timestamp', 'section', 'key', 'metric', 'value', 'unit', 'regime', 'source'];
  const head = HEADERS.join(',');
  const body = payload.rows.map((r) =>
    [escCsv(r.timestamp), escCsv(r.section), escCsv(r.key), escCsv(r.metric),
     escCsv(fmtVal(r)), escCsv(r.unit), escCsv(r.regime), escCsv(r.source)].join(',')
  ).join('\n');
  return `${head}\n${body}\n`;
}

export function formatCsvFilename(payload: ExportPayload): string {
  const stamp = new Date(payload.meta.generatedAtUtcMs).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `krupp-quant-analysis-${stamp}.csv`;
}

// ---------- HTML Formatter --------------------------------------------------

const CELL_STYLE_POS = 'color:#10b981;font-weight:600;';
const CELL_STYLE_NEG = 'color:#ef4444;font-weight:600;';

function cellClass(r: ExportRow): string {
  if (typeof r.value !== 'number' || r.value === 0) return '';
  const map: Record<string, string> = {
    '$':     r.value > 0 ? CELL_STYLE_POS : CELL_STYLE_NEG,
    '$B':    r.value > 0 ? CELL_STYLE_POS : CELL_STYLE_NEG,
    'score': r.value > 75 ? CELL_STYLE_NEG : r.value > 50 ? 'color:#f59e0b;' : '',
    'sigma': r.value > 3 ? CELL_STYLE_NEG : r.value < -3 ? CELL_STYLE_POS : '',
    'bool':  r.value === 1 ? 'color:#10b981;font-weight:700;' : '',
  };
  return map[r.unit] ?? '';
}

function rowClass(r: ExportRow): string {
  if (r.section === 'risk' && (r.metric === 'SHOCK' || r.key === 'KILL_ICP')) {
    return r.value === 1 ? 'background:#7f1d1d;' : '';
  }
  if (r.key === 'NET_LIQ' && typeof r.value === 'number' && r.value < 0) {
    return 'background:#1e1b4b;';
  }
  return '';
}

export function formatHtml(payload: ExportPayload): string {
  const generated = new Date(payload.meta.generatedAtUtcMs).toLocaleString('en-US', { timeZone: 'UTC' });
  const meta = payload.meta;
  const sections = meta.sections;

  const rowsBySection = new Map<string, ExportRow[]>();
  for (const r of payload.rows) {
    const arr = rowsBySection.get(r.section) ?? [];
    arr.push(r);
    rowsBySection.set(r.section, arr);
  }

  const sectionTables = sections.map((sec) => {
    const rows = rowsBySection.get(sec) ?? [];
    const caption = sec.replace(/_/g, ' ').toUpperCase();
    const trs = rows.map((r) => {
      const cls = rowClass(r);
      const style = cellClass(r);
      const val = r.value != null ? String(r.value) : '—';
      const sign = typeof r.value === 'number' && r.value > 0 && ['$', '$B'].includes(r.unit) ? '+' : '';
      return `<tr${cls ? ` style="${cls}"` : ''}>
        <td>${r.timestamp}</td><td><strong>${r.key}</strong></td><td>${r.metric}</td>
        <td style="${style}">${sign}${val}</td><td>${r.unit}</td>
        <td>${r.regime}</td><td>${r.source}</td>
      </tr>`;
    }).join('\n');

    return `<section>
      <h2>${caption}</h2>
      <table>
        <thead><tr><th>Timestamp</th><th>Key</th><th>Metric</th><th>Value</th><th>Unit</th><th>Regime</th><th>Source</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Krupp Capital — Quant Analysis Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; margin: 2rem; background:#0f172a; color:#e2e8f0; font-size:12px; }
    h1 { color:#f8fafc; font-size:1.1rem; border-bottom:1px solid #334155; padding-bottom:.5rem; }
    h2 { color:#38bdf8; font-size:.9rem; margin:1.5rem 0 .5rem; }
    section { margin-bottom:2rem; }
    table { width:100%; border-collapse:collapse; margin-bottom:1rem; }
    thead { position:sticky; top:0; }
    th { background:#1e293b; color:#94a3b8; padding:.5rem .75rem; text-align:left; font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; border:1px solid #334155; white-space:nowrap; }
    td { padding:.4rem .75rem; border:1px solid #1e293b; white-space:nowrap; }
    tbody tr:nth-child(even) { background:#1e293b; }
    tbody tr:hover { background:#334155; }
    .meta { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:.5rem; margin-bottom:1.5rem; background:#1e293b; padding:.75rem; border-radius:6px; }
    .meta-item { display:flex; flex-direction:column; }
    .meta-label { font-size:.65rem; text-transform:uppercase; color:#64748b; letter-spacing:.05em; }
    .meta-value { font-size:.8rem; color:#38bdf8; font-weight:600; }
    footer { margin-top:2rem; padding-top:1rem; border-top:1px solid #334155; color:#64748b; font-size:.65rem; }
    @media print { body { background:#fff; color:#000; } th { background:#f1f5f9; color:#000; } td,th { border-color:#ccc; } }
  </style>
</head>
<body>
  <h1>KRUPP CAPITAL — QUANT ANALYSIS REPORT</h1>
  <div class="meta">
    <div class="meta-item"><span class="meta-label">Generated</span><span class="meta-value">${generated} UTC</span></div>
    <div class="meta-item"><span class="meta-label">Total Rows</span><span class="meta-value">${meta.rowCount.toLocaleString()}</span></div>
    <div class="meta-item"><span class="meta-label">Sections</span><span class="meta-value">${meta.sections.length}</span></div>
    <div class="meta-item"><span class="meta-label">Version</span><span class="meta-value">${meta.version}</span></div>
  </div>
  ${sectionTables}
  <footer>END OF REPORT — KRUPP CAPITAL RISK DESK · NOT INVESTMENT ADVICE · ALL FIGURES SYNTHETIC UNLESS LABELED LIVE</footer>
</body>
</html>`;
}

export function formatHtmlFilename(payload: ExportPayload): string {
  const stamp = new Date(payload.meta.generatedAtUtcMs).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `krupp-quant-analysis-${stamp}.html`;
}

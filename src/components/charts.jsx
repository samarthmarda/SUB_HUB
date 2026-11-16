// Lightweight, dependency-free SVG charts (revenue trend, renewal forecast, payment mix).
import React, { useEffect, useRef, useState } from 'react';

// Literal palette (SVG presentation attributes don't resolve CSS var()).
const C = {
  accent: '#dd7a5f',
  line: '#eae2db',
  lineStrong: '#d8cec5',
  success: '#5f8f72',
  warning: '#d3a03f',
  danger: '#c2554e',
  info: '#5d7fa6',
};

function useSize() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : el.clientWidth;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.ceil(raw / mag) * mag;
  const ticks = [];
  for (let v = 0; v <= max + step; v += step) ticks.push(v);
  return ticks;
}

// ---------------------------------------------------------------------------
// Area + line chart
// ---------------------------------------------------------------------------
export function AreaChart({ data, height = 220, valueFmt = (v) => v, yLabel }) {
  const [ref, width] = useSize();
  const pad = { top: 16, right: 12, bottom: 28, left: 52 };
  const iw = Math.max(120, width - pad.left - pad.right);
  const ih = height - pad.top - pad.bottom;
  const values = data.map((d) => d.value);
  const max = Math.max(1, ...values);
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];
  const x = (i) => pad.left + (data.length <= 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v) => pad.top + ih - (v / yMax) * ih;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const areaPath = data.length
    ? `${linePath} L ${x(data.length - 1).toFixed(1)} ${(pad.top + ih).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + ih).toFixed(1)} Z`
    : '';

  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={C.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + iw} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{valueFmt(t)}</text>
          </g>
        ))}
        {areaPath && <path d={areaPath} fill="url(#areaFill)" />}
        {linePath && <path d={linePath} fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.value)} r={d.value > 0 ? 3.5 : 2} className="chart-dot" />
            <title>{`${d.label}: ${valueFmt(d.value)}`}</title>
          </g>
        ))}
        {data.map((d, i) => (
          (i === 0 || i === data.length - 1 || (data.length <= 8)) && (
            <text key={`x${i}`} x={x(i)} y={height - 8} textAnchor="middle" className="chart-axis">{d.label}</text>
          )
        ))}
      </svg>
      {yLabel && <div className="chart-ylabel">{yLabel}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------
export function BarChart({ data, height = 220, valueFmt = (v) => v }) {
  const [ref, width] = useSize();
  const pad = { top: 16, right: 12, bottom: 26, left: 40 };
  const iw = Math.max(120, width - pad.left - pad.right);
  const ih = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];
  const slot = iw / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(26, slot * 0.66));
  const y = (v) => pad.top + ih - (v / yMax) * ih;

  return (
    <div className="chart" ref={ref}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + iw} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{valueFmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = (d.value / yMax) * ih;
          const bx = pad.left + i * slot + (slot - barW) / 2;
          return (
            <g key={i}>
              <rect x={bx} y={pad.top + ih - h} width={barW} height={Math.max(0, h)} rx="3" className="chart-bar" fill={d.value > 0 ? C.accent : C.lineStrong}>
                <title>{`${d.label}: ${valueFmt(d.value)}`}</title>
              </rect>
            </g>
          );
        })}
        {data.map((d, i) => (
          (i % Math.ceil(data.length / 7) === 0) && (
            <text key={`x${i}`} x={pad.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="chart-axis">{d.short || d.label}</text>
          )
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart
// ---------------------------------------------------------------------------
const DONUT_COLORS = { Paid: C.success, 'Partially Paid': C.warning, Unpaid: C.danger, 'Credit Balance': C.info };
export function DonutChart({ data, size = 200, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2;
  const inner = radius * 0.62;
  const cx = radius; const cy = radius;
  let angle = -Math.PI / 2;
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const a0 = angle; const a1 = angle + sweep; angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const x0 = cx + radius * Math.cos(a0); const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1); const y1 = cy + radius * Math.sin(a1);
    const xi1 = cx + inner * Math.cos(a1); const yi1 = cy + inner * Math.sin(a1);
    const xi0 = cx + inner * Math.cos(a0); const yi0 = cy + inner * Math.sin(a0);
    const path = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi1.toFixed(2)} ${yi1.toFixed(2)} A ${inner} ${inner} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`;
    return { path, color: DONUT_COLORS[d.label] || 'var(--line-strong)', label: d.label, value: d.value };
  });
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={cx} cy={cy} r={(radius + inner) / 2} fill="none" stroke={C.line} strokeWidth={radius - inner} />
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color}><title>{`${a.label}: ${a.value}`}</title></path>)}
        <text x={cx} y={cy - 2} textAnchor="middle" className="donut-value">{centerValue}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="donut-label">{centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {data.map((d) => (
          <li key={d.label}>
            <span className="dot" style={{ background: DONUT_COLORS[d.label] || 'var(--line-strong)' }} />
            <span className="legend-label">{d.label}</span>
            <span className="legend-value">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

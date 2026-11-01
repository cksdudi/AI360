/**
 * AI 360 — 고해상도 벡터(SVG) 데이터 시각화 엔진
 * 외부 라이브러리 의존 없이 화면 및 A4 인쇄물 모두에서 선명하게 렌더링
 */
(function () {
  'use strict';

  const { esc } = window.AI360Utils;
  const { getGradeInfo } = window.AI360Seed;

  /**
   * 1. 종합 점수 반원 게이지 (0~100점 + 등급 표시 + 전체 평균 마커)
   */
  function renderScoreGaugeSVG(score, benchmarkScore, subtitle) {
    const safeScore = Math.max(0, Math.min(100, Number(score || 0)));
    const gInfo = getGradeInfo(safeScore);
    const cx = 140;
    const cy = 128;
    const r = 92;

    const polar = (pct, radius = r) => {
      const angle = Math.PI - (pct / 100) * Math.PI;
      return {
        x: (cx + radius * Math.cos(angle)).toFixed(2),
        y: (cy - radius * Math.sin(angle)).toFixed(2)
      };
    };

    const start = polar(0);
    const endFull = polar(100);
    const cur = polar(safeScore);
    const benchPct = Math.max(0, Math.min(100, Number(benchmarkScore || 0)));
    const benchIn = polar(benchPct, r - 13);
    const benchOut = polar(benchPct, r + 13);

    const trackPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${endFull.x} ${endFull.y}`;
    const valPath = safeScore > 0.5
      ? `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${cur.x} ${cur.y}`
      : '';

    return `<svg viewBox="0 0 280 175" class="chart-svg gauge-svg" role="img" aria-label="AI 역량 종합 점수 게이지">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#2563eb"/>
          <stop offset="60%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#4f46e5"/>
        </linearGradient>
      </defs>
      <path d="${trackPath}" fill="none" stroke="#e2e8f0" stroke-width="18" stroke-linecap="round"/>
      ${valPath ? `<path d="${valPath}" fill="none" stroke="url(#gaugeGrad)" stroke-width="18" stroke-linecap="round"/>` : ''}
      ${benchmarkScore ? `<line x1="${benchIn.x}" y1="${benchIn.y}" x2="${benchOut.x}" y2="${benchOut.y}" stroke="#0f172a" stroke-width="2.5" stroke-dasharray="3,2"/>` : ''}
      <text x="${cx}" y="${cy - 26}" text-anchor="middle" font-size="34" font-weight="800" fill="#0f172a">${safeScore.toFixed(1)}<tspan font-size="15" font-weight="600" fill="#64748b">점</tspan></text>
      <rect x="${cx - 34}" y="${cy - 14}" width="68" height="24" rx="12" fill="${gInfo.bg}"/>
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${gInfo.color}">${esc(gInfo.grade)} 등급</text>
      <text x="44" y="150" text-anchor="middle" font-size="11" fill="#94a3b8">0</text>
      <text x="236" y="150" text-anchor="middle" font-size="11" fill="#94a3b8">100</text>
      ${subtitle ? `<text x="${cx}" y="166" text-anchor="middle" font-size="11.5" fill="#475569">${esc(subtitle)}</text>` : ''}
    </svg>`;
  }

  /**
   * 2. 7축 역량 레이더 차트 (최대 2개 시리즈 겹침 비교 지원)
   * labels: string[7], series: [{ name, values: number[7], color, fillOpacity, dashed }]
   */
  function renderRadarChartSVG(labels, series, size = 320) {
    const cx = size / 2;
    const cy = size / 2 + 6;
    const maxR = size * 0.33;
    const n = labels.length;
    const levels = [25, 50, 75, 100];

    const pt = (idx, val, rScale = maxR) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      const dist = (Math.max(0, Math.min(100, val)) / 100) * rScale;
      return {
        x: (cx + dist * Math.cos(angle)).toFixed(2),
        y: (cy + dist * Math.sin(angle)).toFixed(2)
      };
    };

    let gridXml = '';
    levels.forEach((lv) => {
      const pts = labels.map((_, idx) => {
        const p = pt(idx, lv);
        return `${p.x},${p.y}`;
      }).join(' ');
      gridXml += `<polygon points="${pts}" fill="${lv === 100 ? '#f8fafc' : 'none'}" stroke="#dbe4f0" stroke-width="1"/>`;
      gridXml += `<text x="${cx + 4}" y="${(cy - (lv / 100) * maxR + 3).toFixed(1)}" font-size="9.5" fill="#94a3b8">${lv}</text>`;
    });

    let axisXml = '';
    labels.forEach((lbl, idx) => {
      const outer = pt(idx, 100);
      const labelPos = pt(idx, 123);
      axisXml += `<line x1="${cx}" y1="${cy}" x2="${outer.x}" y2="${outer.y}" stroke="#e2e8f0" stroke-width="1"/>`;
      const anchor = Math.abs(Number(labelPos.x) - cx) < 12 ? 'middle' : (Number(labelPos.x) > cx ? 'start' : 'end');
      axisXml += `<text x="${labelPos.x}" y="${Number(labelPos.y) + 4}" text-anchor="${anchor}" font-size="11.5" font-weight="600" fill="#334155">${esc(lbl)}</text>`;
    });

    let polyXml = '';
    series.forEach((s) => {
      const pts = s.values.map((v, idx) => {
        const p = pt(idx, v);
        return `${p.x},${p.y}`;
      }).join(' ');
      polyXml += `<polygon points="${pts}" fill="${s.color}" fill-opacity="${s.fillOpacity ?? 0.18}" stroke="${s.color}" stroke-width="${s.dashed ? 2 : 2.5}" ${s.dashed ? 'stroke-dasharray="5,3"' : ''}/>`;
      s.values.forEach((v, idx) => {
        const p = pt(idx, v);
        polyXml += `<circle cx="${p.x}" cy="${p.y}" r="${s.dashed ? 3 : 4}" fill="#ffffff" stroke="${s.color}" stroke-width="2">
          <title>${esc(s.name)} - ${esc(labels[idx])}: ${Number(v).toFixed(1)}점</title>
        </circle>`;
      });
    });

    let legendXml = '';
    series.forEach((s, idx) => {
      const lx = 18 + idx * 145;
      legendXml += `<g transform="translate(${lx}, 14)">
        <line x1="0" y1="0" x2="18" y2="0" stroke="${s.color}" stroke-width="3" ${s.dashed ? 'stroke-dasharray="4,2"' : ''}/>
        <text x="24" y="4" font-size="11.5" font-weight="600" fill="#334155">${esc(s.name)}</text>
      </g>`;
    });

    return `<svg viewBox="0 0 ${size + 40} ${size + 18}" class="chart-svg radar-svg" role="img" aria-label="7개 영역 역량 레이더 차트">
      <g transform="translate(20, 12)">
        ${gridXml}
        ${axisXml}
        ${polyXml}
      </g>
      ${legendXml}
    </svg>`;
  }

  /**
   * 3. 하위 단위 막대 비교 차트 + 상위/전체 평균 기준선
   * items: [{ label, value, subLabel, clickKey }], benchmarkValue, benchmarkLabel, unitSuffix
   */
  function renderComparisonBarChartSVG(items, benchmarkValue, benchmarkLabel, maxVal = 100, unitSuffix = '점') {
    if (!items || !items.length) {
      return '<div class="empty-hint">비교할 하위 단위 데이터가 없습니다.</div>';
    }
    const width = 680;
    const height = 250;
    const padL = 44;
    const padR = 24;
    const padT = 32;
    const padB = 58;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const slotW = plotW / items.length;
    const barW = Math.min(42, Math.max(14, slotW * 0.56));
    const yOf = (val) => padT + plotH - (Math.max(0, Math.min(maxVal, val)) / maxVal) * plotH;

    let gridXml = '';
    [0, 25, 50, 75, 100].forEach((tick) => {
      const v = (tick / 100) * maxVal;
      const y = yOf(v).toFixed(1);
      gridXml += `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#eef2f7" stroke-width="1"/>`;
      gridXml += `<text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${Math.round(v)}</text>`;
    });

    let barsXml = '';
    items.forEach((it, idx) => {
      const cx = padL + slotW * idx + slotW / 2;
      const y = yOf(it.value);
      const h = Math.max(2, padT + plotH - y);
      const aboveAvg = benchmarkValue !== null && benchmarkValue !== undefined && it.value >= benchmarkValue;
      const fill = aboveAvg ? '#2563eb' : '#60a5fa';
      const shortLbl = it.label.length > 7 ? it.label.slice(0, 7) + '…' : it.label;
      const dataAttr = it.clickKey ? `data-drill-key="${esc(it.clickKey)}" class="bar-clickable"` : '';

      barsXml += `<g ${dataAttr}>
        <rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${fill}">
          <title>${esc(it.label)}: ${it.value}${unitSuffix}</title>
        </rect>
        <text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1e293b">${it.value}</text>
        <text x="${cx.toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="10.5" font-weight="600" fill="#334155" transform="rotate(${items.length > 8 ? -20 : 0}, ${cx.toFixed(1)}, ${padT + plotH + 18})">${esc(shortLbl)}</text>
      </g>`;
    });

    let benchXml = '';
    if (benchmarkValue !== null && benchmarkValue !== undefined) {
      const by = yOf(benchmarkValue).toFixed(1);
      benchXml = `
        <line x1="${padL}" y1="${by}" x2="${width - padR}" y2="${by}" stroke="#dc2626" stroke-width="2" stroke-dasharray="6,4"/>
        <rect x="${width - padR - 146}" y="${Number(by) - 21}" width="144" height="19" rx="4" fill="#fef2f2" stroke="#fecaca"/>
        <text x="${width - padR - 74}" y="${Number(by) - 8}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#dc2626">${esc(benchmarkLabel || '전체 평균')}: ${benchmarkValue}${unitSuffix}</text>
      `;
    }

    return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg bar-compare-svg" role="img" aria-label="하위 단위 비교 막대 차트">
      ${gridXml}
      ${barsXml}
      ${benchXml}
    </svg>`;
  }

  /**
   * 4. 역량 등급 분포 가로 스택 바 + 배지 요약
   */
  function renderGradeDistributionHTML(gradeCounts, totalHeadcount) {
    const specs = [
      { key: '선도', range: '90~100점', color: '#4f46e5', bg: '#eef2ff' },
      { key: '심화', range: '75~89점', color: '#0284c7', bg: '#e0f2fe' },
      { key: '활용', range: '60~74점', color: '#059669', bg: '#d1fae5' },
      { key: '기초', range: '40~59점', color: '#d97706', bg: '#fef3c7' },
      { key: '입문', range: '0~39점', color: '#dc2626', bg: '#fee2e2' },
      { key: '미진단', range: '응답 전', color: '#94a3b8', bg: '#f1f5f9' }
    ];
    const total = Math.max(1, totalHeadcount || specs.reduce((a, s) => a + (gradeCounts[s.key] || 0), 0));

    const segs = specs.map((s) => {
      const cnt = gradeCounts[s.key] || 0;
      const pct = (cnt / total) * 100;
      if (cnt === 0) return '';
      return `<div class="grade-seg" style="width:${pct.toFixed(2)}%;background:${s.color}" title="${s.key} (${s.range}): ${cnt}명 (${pct.toFixed(1)}%)"></div>`;
    }).join('');

    const legend = specs.map((s) => {
      const cnt = gradeCounts[s.key] || 0;
      const pct = ((cnt / total) * 100).toFixed(1);
      return `<div class="grade-legend-item">
        <span class="grade-dot" style="background:${s.color}"></span>
        <div class="grade-legend-text">
          <strong>${s.key}</strong> <small>(${s.range})</small>
          <div><span>${cnt.toLocaleString()}명</span> · <em>${pct}%</em></div>
        </div>
      </div>`;
    }).join('');

    return `<div class="grade-dist-wrap">
      <div class="grade-stack-bar">${segs}</div>
      <div class="grade-legend-grid">${legend}</div>
    </div>`;
  }

  /**
   * 5. 월별 교육 수료 인원(막대) & 평균 만족도(꺾은선) 추이 차트 (총괄 대시보드용)
   */
  function renderMonthlyTrendSVG(monthlyItems) {
    const width = 620;
    const height = 235;
    const padL = 42;
    const padR = 42;
    const padT = 28;
    const padB = 40;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const maxCount = Math.max(80, ...monthlyItems.map((m) => m.completions || 0)) * 1.15;

    const slotW = plotW / monthlyItems.length;
    const yCount = (c) => padT + plotH - (c / maxCount) * plotH;
    const ySat = (s) => padT + plotH - (Math.max(0, Math.min(5, s)) / 5) * plotH;

    let grid = '';
    [0, 0.5, 1].forEach((ratio) => {
      const y = (padT + plotH - ratio * plotH).toFixed(1);
      grid += `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#eef2f7"/>`;
      grid += `<text x="${padL - 6}" y="${Number(y) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${Math.round(maxCount * ratio)}명</text>`;
      grid += `<text x="${width - padR + 6}" y="${Number(y) + 4}" text-anchor="start" font-size="10" fill="#f59e0b">${(5 * ratio).toFixed(1)}점</text>`;
    });

    let bars = '';
    const linePts = [];
    monthlyItems.forEach((m, idx) => {
      const cx = padL + slotW * idx + slotW / 2;
      const by = yCount(m.completions);
      const bh = Math.max(2, padT + plotH - by);
      bars += `<rect x="${(cx - 13).toFixed(1)}" y="${by.toFixed(1)}" width="26" height="${bh.toFixed(1)}" rx="4" fill="#3b82f6" opacity="0.86">
        <title>${esc(m.month)}: 수료 ${m.completions}명</title>
      </rect>`;
      if (m.completions > 0) {
        bars += `<text x="${cx.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#1d4ed8">${m.completions}</text>`;
      }
      bars += `<text x="${cx.toFixed(1)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="10.5" fill="#475569">${esc(m.month)}</text>`;

      if (m.avgSat > 0) {
        linePts.push({ x: cx, y: ySat(m.avgSat), val: m.avgSat });
      }
    });

    let lineXml = '';
    if (linePts.length > 1) {
      const d = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      lineXml += `<path d="${d}" fill="none" stroke="#f59e0b" stroke-width="2.5"/>`;
    }
    linePts.forEach((p) => {
      lineXml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#ffffff" stroke="#f59e0b" stroke-width="2.5">
        <title>평균 만족도 ${p.val}점 / 5.0</title>
      </circle>`;
    });

    return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">
      <g transform="translate(${padL}, 12)">
        <rect x="0" y="-8" width="12" height="10" rx="2" fill="#3b82f6"/><text x="16" y="0" font-size="11" fill="#334155">월별 수료 인원(명)</text>
        <line x1="130" y1="-3" x2="146" y2="-3" stroke="#f59e0b" stroke-width="2.5"/><circle cx="138" cy="-3" r="3" fill="#fff" stroke="#f59e0b" stroke-width="2"/>
        <text x="152" y="0" font-size="11" fill="#334155">평균 만족도(5점 만점)</text>
      </g>
      ${grid}
      ${bars}
      ${lineXml}
    </svg>`;
  }

  /**
   * 6. 개인 진단 회차별 성장 그래프 (상반기 → 하반기 점수 변화 + 전사 평균 비교)
   */
  function renderPersonalGrowthSVG(points) {
    const width = 420;
    const height = 200;
    const padL = 44;
    const padR = 30;
    const padT = 28;
    const padB = 38;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const yOf = (v) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
    let grid = '';
    [0, 50, 75, 100].forEach((lv) => {
      const y = yOf(lv).toFixed(1);
      grid += `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#eef2f7"/>`;
      grid += `<text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${lv}</text>`;
    });

    if (!points.length) {
      return `<div class="empty-hint">진단 완료 후 회차별 성장 추이가 표시됩니다.</div>`;
    }

    const xs = points.map((_, idx) =>
      points.length === 1 ? padL + plotW / 2 : padL + 45 + idx * (plotW - 90) / (points.length - 1)
    );

    let line = '';
    if (points.length > 1) {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${yOf(p.myScore).toFixed(1)}`).join(' ');
      line += `<path d="${d}" fill="none" stroke="#2563eb" stroke-width="3"/>`;
      const dAvg = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${yOf(p.orgAvg).toFixed(1)}`).join(' ');
      line += `<path d="${dAvg}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,3"/>`;
    }

    let nodes = '';
    points.forEach((p, i) => {
      const x = xs[i];
      const y = yOf(p.myScore);
      const ya = yOf(p.orgAvg);
      nodes += `<circle cx="${x.toFixed(1)}" cy="${ya.toFixed(1)}" r="3.5" fill="#94a3b8"/>`;
      nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#ffffff" stroke="#2563eb" stroke-width="3"/>`;
      nodes += `<text x="${x.toFixed(1)}" y="${(y - 11).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#1d4ed8">${p.myScore}점 (${esc(p.grade)})</text>`;
      nodes += `<text x="${x.toFixed(1)}" y="${padT + plotH + 20}" text-anchor="middle" font-size="11" font-weight="600" fill="#334155">${esc(p.label)}</text>`;
    });

    return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">
      <g transform="translate(${padL}, 12)">
        <line x1="0" y1="-3" x2="16" y2="-3" stroke="#2563eb" stroke-width="3"/><text x="22" y="1" font-size="10.5" fill="#334155">나의 역량 점수</text>
        <line x1="115" y1="-3" x2="131" y2="-3" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,2"/><text x="137" y="1" font-size="10.5" fill="#64748b">전체 평균</text>
      </g>
      ${grid}
      ${line}
      ${nodes}
    </svg>`;
  }

  window.AI360Charts = {
    renderScoreGaugeSVG,
    renderRadarChartSVG,
    renderComparisonBarChartSVG,
    renderGradeDistributionHTML,
    renderMonthlyTrendSVG,
    renderPersonalGrowthSVG
  };
})();


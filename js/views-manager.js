/**
 * AI 360 — 담당자 공통 화면 (B. 부서 담당자 / C. 실·국 담당자 / D. 소속기관 담당자)
 * Section 2, 6 반영: 계층별 엄격한 조회 범위 + 하위 단위 드릴다운 + 전체 평균 비교 + 독려 센터
 */
(function () {
  'use strict';

  const { esc, downloadExcel, copyText, showToast } = window.AI360Utils;
  const { ASSESSMENT_ITEMS, getGradeInfo } = window.AI360Seed;
  const Store = window.AI360Store;
  const Charts = window.AI360Charts;

  // 드릴다운 상태 및 필터 상태
  let drillState = { roleKey: '', bureau: null, dept: null };
  let compareMetric = 'score'; // 'score' | 'completion' | 'diag'
  let memberSearch = '';
  let memberRankFilter = 'ALL';
  let memberStatusFilter = 'ALL'; // 'ALL' | 'UNDIAG' | 'UNREQ'
  let memberSort = 'score_desc';
  let reminderTab = 'diag_unanswered'; // 'course_unapplied' | 'course_uncompleted' | 'diag_unanswered'

  function ensureDrillValid(unit) {
    const key = `${unit.level}|${unit.org}|${unit.bureau || ''}|${unit.dept || ''}`;
    if (drillState.roleKey !== key) {
      drillState = { roleKey: key, bureau: null, dept: null };
    }
  }

  function getEffectiveScope(unit) {
    if (unit.level === 'dept') {
      return { org: unit.org, bureau: unit.bureau, dept: unit.dept, label: `${unit.org} > ${unit.bureau} > ${unit.dept}` };
    }
    if (unit.level === 'bureau') {
      if (drillState.dept) {
        return { org: unit.org, bureau: unit.bureau, dept: drillState.dept, label: `${unit.org} > ${unit.bureau} > ${drillState.dept}` };
      }
      return { org: unit.org, bureau: unit.bureau, dept: null, label: `${unit.org} > ${unit.bureau}` };
    }
    // org level
    if (drillState.bureau && drillState.dept) {
      return { org: unit.org, bureau: drillState.bureau, dept: drillState.dept, label: `${unit.org} > ${drillState.bureau} > ${drillState.dept}` };
    }
    if (drillState.bureau) {
      return { org: unit.org, bureau: drillState.bureau, dept: null, label: `${unit.org} > ${drillState.bureau}` };
    }
    return { org: unit.org, bureau: null, dept: null, label: unit.org };
  }

  function renderManagerMenu(menuId, container) {
    const session = Store.getSession();
    const unit = Store.getManagerUnitForEmployee(session.role, session.employeeId);
    ensureDrillValid(unit);

    switch (menuId) {
      case 'mgr-members':
        renderManagerMembers(unit, container);
        break;
      case 'mgr-reminders':
        renderManagerReminders(unit, container);
        break;
      case 'mgr-overview':
      default:
        renderManagerOverview(unit, container);
        break;
    }
  }

  /* =========================================================================
   * 1. 우리 단위 통합 현황 & 하위 드릴다운 비교
   * ========================================================================= */
  function renderManagerOverview(unit, container) {
    const db = Store.getDB();
    const effScope = getEffectiveScope(unit);
    const stats = Store.computeUnitAnalytics(effScope);
    const wholeStats = Store.computeUnitAnalytics({});
    const roleMeta = Store.ROLE_META[unit.level];

    // 하위 비교 막대 데이터 구성
    let subItems = [];
    let compareTitle = '';
    if (unit.level === 'org' && !drillState.bureau) {
      compareTitle = `${unit.org} 소속 실·국별 비교 (막대 클릭 시 실·국 드릴다운)`;
      const orgNode = db.orgs.find((o) => o.name === unit.org);
      const bureaus = orgNode ? orgNode.bureaus : [];
      subItems = bureaus.map((b) => {
        const st = Store.computeUnitAnalytics({ org: unit.org, bureau: b.name });
        return {
          label: b.name,
          value: compareMetric === 'score' ? st.avgCompetencyScore : compareMetric === 'completion' ? st.completionRate : st.diagResponseRate,
          clickKey: `bureau:${b.name}`,
          st
        };
      });
    } else if ((unit.level === 'org' && drillState.bureau && !drillState.dept) || (unit.level === 'bureau' && !drillState.dept)) {
      const targetBureau = unit.level === 'bureau' ? unit.bureau : drillState.bureau;
      compareTitle = `${targetBureau} 산하 부서별 비교 (막대 클릭 시 부서 드릴다운)`;
      const orgNode = db.orgs.find((o) => o.name === unit.org);
      const bNode = orgNode ? orgNode.bureaus.find((b) => b.name === targetBureau) : null;
      const depts = bNode ? bNode.depts : [];
      subItems = depts.map((dName) => {
        const st = Store.computeUnitAnalytics({ org: unit.org, bureau: targetBureau, dept: dName });
        return {
          label: dName,
          value: compareMetric === 'score' ? st.avgCompetencyScore : compareMetric === 'completion' ? st.completionRate : st.diagResponseRate,
          clickKey: `dept:${dName}`,
          st
        };
      });
    } else {
      // 부서 단위(또는 부서까지 드릴다운된 상태): 부서 내 직급별 비교 표시
      compareTitle = `${effScope.dept} 직급별 비교`;
      const deptEmps = Store.filterEmployeesByScope(effScope);
      ['과장', '서기관', '사무관', '주무관'].forEach((rk) => {
        const rkEmps = deptEmps.filter((e) => e.rank === rk);
        if (!rkEmps.length) return;
        const rkIds = new Set(rkEmps.map((e) => e.id));
        const activeRnd = Store.getActiveRound();
        const diagCnt = activeRnd ? db.assessment_responses.filter((r) => r.roundId === activeRnd.id && rkIds.has(r.employeeId)).length : 0;
        let scoreSum = 0;
        let scCnt = 0;
        rkEmps.forEach((e) => {
          const lat = Store.getLatestAssessmentForEmployee(e.id);
          if (lat) { scoreSum += lat.totalScore; scCnt++; }
        });
        const enrCnt = db.enrollments.filter((en) => en.status === 'active' && rkIds.has(en.employeeId)).length;
        const cmpCnt = db.completions.filter((cm) => rkIds.has(cm.employeeId)).length;
        const val = compareMetric === 'score'
          ? (scCnt ? Math.round((scoreSum / scCnt) * 10) / 10 : 0)
          : compareMetric === 'completion'
            ? (enrCnt ? Math.round((cmpCnt / enrCnt) * 1000) / 10 : 0)
            : Math.round((diagCnt / rkEmps.length) * 1000) / 10;
        subItems.push({ label: `${rk}(${rkEmps.length}명)`, value: val, clickKey: '' });
      });
    }

    const benchVal = compareMetric === 'score'
      ? wholeStats.avgCompetencyScore
      : compareMetric === 'completion'
        ? wholeStats.completionRate
        : wholeStats.diagResponseRate;
    const unitSuffix = compareMetric === 'score' ? '점' : '%';

    const radarLabels = ASSESSMENT_ITEMS.map((i) => i.domain);
    const radarSeries = [
      {
        name: '우리 단위 평균',
        values: stats.domainAverages.map((d) => d.score),
        color: '#2563eb',
        fillOpacity: 0.22
      },
      {
        name: '전 기관 전체 평균',
        values: wholeStats.domainAverages.map((d) => d.score),
        color: '#dc2626',
        fillOpacity: 0.05,
        dashed: true
      }
    ];

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">${esc(roleMeta.badge)} · 타 조직 비공개 / 전체 평균만 비교 제공</span>
          <h1 class="page-title">${esc(effScope.label)} AI 교육·역량 현황</h1>
          <p class="page-desc">관할 범위 외 다른 기관·실·국·부서 데이터는 열람할 수 없으며, 비교 기준선으로 전 기관 평균값만 함께 표시됩니다.</p>
        </div>
        <div class="head-actions">
          <button id="btn-export-mgr-summary" class="btn btn-outline">📥 현황 요약 엑셀 다운로드</button>
          <button class="btn btn-primary" data-go-mgr="mgr-reminders">📣 미신청·미응답 독려하기</button>
        </div>
      </div>

      ${renderDrillBreadcrumb(unit)}

      <!-- 7대 핵심 KPI 카드 -->
      <div class="kpi-grid kpi-grid-7">
        <div class="kpi-card">
          <div class="kpi-label">소속 인원 <span class="sample-mini">샘플</span></div>
          <div class="kpi-value">${stats.headcount.toLocaleString()}명</div>
          <div class="kpi-sub">전체의 ${((stats.headcount / db.employees.length) * 100).toFixed(1)}%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">교육 신청률</div>
          <div class="kpi-value">${stats.enrollRate}%</div>
          <div class="kpi-sub">참여 ${stats.enrolledUniqueCount}명 (전체 ${wholeStats.enrollRate}%)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">신청 대비 수료율</div>
          <div class="kpi-value">${stats.completionRate}%</div>
          <div class="kpi-sub">수료 ${stats.totalCompletions}건 (전체 ${wholeStats.completionRate}%)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">누적 이수시간</div>
          <div class="kpi-value">${stats.totalHours}h</div>
          <div class="kpi-sub">1인당 평균 ${stats.avgHoursPerEmp}시간</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">필수교육 이수율</div>
          <div class="kpi-value">${stats.reqCompletionRate}%</div>
          <div class="kpi-sub">${stats.reqCompletedCount} / ${stats.headcount}명 완료</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">하반기 진단 응답률</div>
          <div class="kpi-value">${stats.diagResponseRate}%</div>
          <div class="kpi-sub">미응답 ${stats.headcount - stats.diagRespondedCount}명</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">평균 AI 역량 점수</div>
          <div class="kpi-value-row">
            <span class="kpi-value">${stats.avgCompetencyScore}점</span>
            <span class="grade-pill" style="background:${stats.avgGradeInfo.bg};color:${stats.avgGradeInfo.color}">${esc(stats.avgGradeInfo.grade)}</span>
          </div>
          <div class="kpi-sub">전체 평균 ${wholeStats.avgCompetencyScore}점</div>
        </div>
      </div>

      <!-- 하위 단위 막대 비교 + 상위(전체) 평균선 -->
      <div class="card mb-16">
        <div class="card-header">
          <h3>${esc(compareTitle)}</h3>
          <div class="seg-group">
            <button class="seg-btn ${compareMetric === 'score' ? 'active' : ''}" data-cmp-metric="score">평균 역량 점수</button>
            <button class="seg-btn ${compareMetric === 'completion' ? 'active' : ''}" data-cmp-metric="completion">교육 수료율(%)</button>
            <button class="seg-btn ${compareMetric === 'diag' ? 'active' : ''}" data-cmp-metric="diag">진단 응답률(%)</button>
          </div>
        </div>
        <div class="chart-box">
          ${Charts.renderComparisonBarChartSVG(subItems, benchVal, '전체 평균 기준선', 100, unitSuffix)}
        </div>
      </div>

      <!-- 7개 영역 레이더 비교 + 등급 분포 -->
      <div class="grid-2-cols">
        <div class="card">
          <div class="card-header">
            <h3>7대 역량 영역 평균 비교 (우리 단위 vs 전체 평균)</h3>
            <span class="badge-subtle">최근 진단 응답자 기준</span>
          </div>
          <div class="chart-box center">
            ${Charts.renderRadarChartSVG(radarLabels, radarSeries, 305)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>우리 단위 AI 역량 등급 분포 (${stats.headcount}명)</h3>
            <button class="btn btn-xs btn-outline" data-go-mgr="mgr-members">구성원별 상세 보기 →</button>
          </div>
          ${Charts.renderGradeDistributionHTML(stats.gradeCounts, stats.headcount)}
          <div class="info-Banner mt-16">
            <strong>📌 관리 포인트 안내:</strong>
            하반기 역량 진단 미응답자 <strong>${stats.headcount - stats.diagRespondedCount}명</strong> 및 필수교육 미이수자 <strong>${stats.headcount - stats.reqCompletedCount}명</strong>에 대해 [독려 센터]에서 일괄 안내 문구 복사 및 명단 추출이 가능합니다.
          </div>
        </div>
      </div>
    `;

    bindBreadcrumbEvents(container, unit, () => renderManagerOverview(unit, container));

    container.querySelectorAll('[data-cmp-metric]').forEach((b) => {
      b.addEventListener('click', () => {
        compareMetric = b.dataset.cmpMetric;
        renderManagerOverview(unit, container);
      });
    });

    container.querySelectorAll('[data-drill-key]').forEach((bar) => {
      bar.addEventListener('click', () => {
        const [kind, name] = bar.dataset.drillKey.split(':');
        if (kind === 'bureau') {
          drillState.bureau = name;
          drillState.dept = null;
        } else if (kind === 'dept') {
          if (unit.level === 'org' && !drillState.bureau) return;
          drillState.dept = name;
        }
        renderManagerOverview(unit, container);
      });
    });

    container.querySelectorAll('[data-go-mgr]').forEach((b) => {
      b.addEventListener('click', () => Store.setActiveMenu(b.dataset.goMgr));
    });

    const expBtn = container.querySelector('#btn-export-mgr-summary');
    if (expBtn) {
      expBtn.addEventListener('click', () => exportUnitSummaryExcel(effScope, stats, subItems));
    }
  }

  function renderDrillBreadcrumb(unit) {
    if (unit.level === 'dept') return '';
    const crumbs = [`<button class="crumb-btn ${!drillState.bureau && !drillState.dept ? 'active' : ''}" data-crumb="root">🏢 ${esc(unit.label)}</button>`];
    if (unit.level === 'org' && drillState.bureau) {
      crumbs.push(`<span class="crumb-sep">›</span><button class="crumb-btn ${!drillState.dept ? 'active' : ''}" data-crumb="bureau">${esc(drillState.bureau)}</button>`);
    }
    if (drillState.dept) {
      crumbs.push(`<span class="crumb-sep">›</span><button class="crumb-btn active" data-crumb="dept">${esc(drillState.dept)}</button>`);
    }
    return `<div class="drill-breadcrumb-bar">
      <span class="drill-hint">하위 조직 드릴다운 경로:</span>
      ${crumbs.join('')}
      ${(drillState.bureau || drillState.dept) ? '<button class="btn btn-xs btn-ghost ml-auto" data-crumb="root">상위 단위로 복귀 ↺</button>' : ''}
    </div>`;
  }

  function bindBreadcrumbEvents(container, unit, rerender) {
    container.querySelectorAll('[data-crumb]').forEach((b) => {
      b.addEventListener('click', () => {
        const c = b.dataset.crumb;
        if (c === 'root') {
          drillState.bureau = null;
          drillState.dept = null;
        } else if (c === 'bureau') {
          drillState.dept = null;
        }
        rerender();
      });
    });
  }

  function exportUnitSummaryExcel(effScope, stats, subItems) {
    const rows = [
      ['[시연용 샘플 데이터] AI 360 조직 단위 현황 요약 보고'],
      ['조회 단위', effScope.label],
      ['소속 인원(명)', stats.headcount, '교육 신청률(%)', stats.enrollRate],
      ['수료율(%)', stats.completionRate, '누적 이수시간(h)', stats.totalHours],
      ['필수교육 이수율(%)', stats.reqCompletionRate, '진단 응답률(%)', stats.diagResponseRate],
      ['평균 역량 점수', stats.avgCompetencyScore, '평균 등급', stats.avgGradeInfo.grade],
      [],
      ['하위 구분', '비교 지표 값'],
      ...subItems.map((s) => [s.label, s.value])
    ];
    downloadExcel(`AI360_현황요약_${effScope.dept || effScope.bureau || effScope.org}.xlsx`, '현황요약', rows);
    showToast('현황 요약 엑셀 파일이 다운로드되었습니다.', 'success');
  }

  /* =========================================================================
   * 2. 소속 구성원 목록 (검색 · 정렬 · 필터 · 개인 상세 드릴다운)
   * ========================================================================= */
  function renderManagerMembers(unit, container) {
    const db = Store.getDB();
    const effScope = getEffectiveScope(unit);
    const emps = Store.filterEmployeesByScope(effScope);
    const activeRnd = Store.getActiveRound();
    const reqCourseIds = new Set(db.courses.filter((c) => c.required).map((c) => c.id));

    const enriched = emps.map((e) => {
      const latest = Store.getLatestAssessmentForEmployee(e.id);
      const answeredCurrent = activeRnd
        ? db.assessment_responses.some((r) => r.roundId === activeRnd.id && r.employeeId === e.id)
        : false;
      const enrCnt = db.enrollments.filter((en) => en.employeeId === e.id && en.status === 'active').length;
      const myComps = db.completions.filter((c) => c.employeeId === e.id);
      const hours = myComps.reduce((a, c) => a + Number(c.hours || 0), 0);
      const reqDone = myComps.some((c) => reqCourseIds.has(c.courseId));
      return {
        emp: e,
        score: latest ? latest.totalScore : -1,
        grade: latest ? latest.grade : '미진단',
        answeredCurrent,
        enrCnt,
        compCnt: myComps.length,
        hours,
        reqDone
      };
    });

    const filtered = enriched.filter((row) => {
      if (memberSearch) {
        const q = memberSearch.toLowerCase();
        if (!row.emp.name.toLowerCase().includes(q) && !row.emp.dept.toLowerCase().includes(q) && !row.emp.bureau.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (memberRankFilter !== 'ALL' && row.emp.rank !== memberRankFilter) return false;
      if (memberStatusFilter === 'UNDIAG' && row.answeredCurrent) return false;
      if (memberStatusFilter === 'UNREQ' && row.reqDone) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (memberSort === 'score_desc') return b.score - a.score;
      if (memberSort === 'hours_desc') return b.hours - a.hours;
      return a.emp.name.localeCompare(b.emp.name, 'ko');
    });

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">관할 구성원 학습·진단 이력 상세</span>
          <h1 class="page-title">${esc(effScope.label)} 구성원 목록 (${filtered.length} / ${emps.length}명)</h1>
          <p class="page-desc">구성원 이름을 클릭하면 개인별 7축 역량 레이더와 교육 이수 이력을 드릴다운하여 조회합니다.</p>
        </div>
        <div class="head-actions">
          <button id="btn-export-members" class="btn btn-outline">📥 구성원 현황 엑셀 다운로드</button>
        </div>
      </div>

      ${renderDrillBreadcrumb(unit)}

      <div class="filter-bar card">
        <input id="mgr-mem-search" type="search" class="form-input" style="max-width:240px" placeholder="이름 또는 부서명 검색..." value="${esc(memberSearch)}">
        <select id="mgr-mem-rank" class="form-select">
          <option value="ALL">전체 직급</option>
          ${['과장', '서기관', '사무관', '주무관'].map((r) => `<option value="${r}" ${memberRankFilter === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <select id="mgr-mem-status" class="form-select">
          <option value="ALL" ${memberStatusFilter === 'ALL' ? 'selected' : ''}>전체 상태</option>
          <option value="UNDIAG" ${memberStatusFilter === 'UNDIAG' ? 'selected' : ''}>하반기 진단 미응답자만</option>
          <option value="UNREQ" ${memberStatusFilter === 'UNREQ' ? 'selected' : ''}>필수교육 미이수자만</option>
        </select>
        <select id="mgr-mem-sort" class="form-select">
          <option value="score_desc" ${memberSort === 'score_desc' ? 'selected' : ''}>역량 점수 높은순</option>
          <option value="hours_desc" ${memberSort === 'hours_desc' ? 'selected' : ''}>이수시간 많은순</option>
          <option value="name_asc" ${memberSort === 'name_asc' ? 'selected' : ''}>이름 가나다순</option>
        </select>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>소속 실·국 / 부서</th>
                <th>직급</th>
                <th>역량 점수 · 등급</th>
                <th>하반기 진단</th>
                <th>신청 / 수료 과정</th>
                <th>이수시간</th>
                <th>필수교육</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.slice(0, 150).map((r) => {
                const gInfo = r.score >= 0 ? getGradeInfo(r.score) : { bg: '#f1f5f9', color: '#64748b' };
                return `
                  <tr>
                    <td><button class="link-btn" data-emp-modal="${esc(r.emp.id)}"><strong>${esc(r.emp.name)}</strong></button></td>
                    <td>${esc(r.emp.bureau)} &gt; ${esc(r.emp.dept)}</td>
                    <td>${esc(r.emp.rank)}</td>
                    <td>
                      ${r.score >= 0
                        ? `<strong>${r.score.toFixed(1)}점</strong> <span class="grade-pill-sm" style="background:${gInfo.bg};color:${gInfo.color}">${esc(r.grade)}</span>`
                        : '<span class="text-muted">미진단</span>'}
                    </td>
                    <td>${r.answeredCurrent ? '<span class="enrolled-chip">응답 완료</span>' : '<span class="warn-chip">미응답</span>'}</td>
                    <td>신청 ${r.enrCnt}건 / <strong>수료 ${r.compCnt}건</strong></td>
                    <td>${r.hours}시간</td>
                    <td>${r.reqDone ? '<span class="text-success font-bold">이수</span>' : '<span class="text-danger">미이수</span>'}</td>
                    <td><button class="btn btn-xs btn-ghost" data-emp-modal="${esc(r.emp.id)}">드릴다운</button></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ${filtered.length > 150 ? `<div class="table-more-note">조회 성능을 위해 상위 150명까지 화면에 표시됩니다. 전체 ${filtered.length}명은 우측 상단 [엑셀 다운로드]로 확인하실 수 있습니다.</div>` : ''}
        </div>
      </div>
    `;

    bindBreadcrumbEvents(container, unit, () => renderManagerMembers(unit, container));

    const searchEl = container.querySelector('#mgr-mem-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        memberSearch = searchEl.value;
        renderManagerMembers(unit, container);
        const nextInput = container.querySelector('#mgr-mem-search');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(memberSearch.length, memberSearch.length);
        }
      });
    }
    container.querySelector('#mgr-mem-rank')?.addEventListener('change', (e) => {
      memberRankFilter = e.target.value;
      renderManagerMembers(unit, container);
    });
    container.querySelector('#mgr-mem-status')?.addEventListener('change', (e) => {
      memberStatusFilter = e.target.value;
      renderManagerMembers(unit, container);
    });
    container.querySelector('#mgr-mem-sort')?.addEventListener('change', (e) => {
      memberSort = e.target.value;
      renderManagerMembers(unit, container);
    });
    container.querySelectorAll('[data-emp-modal]').forEach((b) => {
      b.addEventListener('click', () => window.AI360App.openEmployeeDetailModal(b.dataset.empModal));
    });
    container.querySelector('#btn-export-members')?.addEventListener('click', () => {
      const rows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름', '역량점수', '역량등급', '하반기진단여부', '신청건수', '수료건수', '누적이수시간', '필수교육이수'],
        ...filtered.map((r, i) => [
          i + 1, r.emp.org, r.emp.bureau, r.emp.dept, r.emp.rank, r.emp.name,
          r.score >= 0 ? r.score : '미진단', r.grade, r.answeredCurrent ? '응답' : '미응답',
          r.enrCnt, r.compCnt, r.hours, r.reqDone ? '이수' : '미이수'
        ])
      ];
      downloadExcel(`AI360_구성원명단_${effScope.dept || effScope.org}.xlsx`, '구성원현황', rows);
      showToast('구성원 목록 엑셀 다운로드가 완료되었습니다.', 'success');
    });
  }

  /* =========================================================================
   * 3. 독려 센터 (미신청자 / 신청 후 미수료자 / 진단 미응답자 + 독려 이력)
   * ========================================================================= */
  function renderManagerReminders(unit, container) {
    const db = Store.getDB();
    const effScope = getEffectiveScope(unit);
    const emps = Store.filterEmployeesByScope(effScope);
    const empSet = new Set(emps.map((e) => e.id));
    const activeRnd = Store.getActiveRound();
    const reqCourseIds = new Set(db.courses.filter((c) => c.required).map((c) => c.id));

    let targets = [];
    let categoryLabel = '';
    let defaultMsg = '';

    if (reminderTab === 'diag_unanswered') {
      categoryLabel = '하반기 역량 진단 미응답자';
      const answeredIds = new Set(
        activeRnd ? db.assessment_responses.filter((r) => r.roundId === activeRnd.id).map((r) => r.employeeId) : []
      );
      targets = emps.filter((e) => !answeredIds.has(e.id));
      defaultMsg = `[AI 360 참여 독려] ${effScope.label} 구성원 여러분,\n현재 「${activeRnd ? activeRnd.title : '2026년 하반기 AI 역량 진단'}」이 진행 중입니다.\n7문항(약 2분 소요) 응답 즉시 개인별 역량 레이더 분석과 맞춤형 집합교육 추천이 제공되오니 기한 내 참여 바랍니다.`;
    } else if (reminderTab === 'course_unapplied') {
      categoryLabel = '필수 집합교육 미신청자';
      const reqEnrolledIds = new Set(
        db.enrollments.filter((en) => en.status === 'active' && reqCourseIds.has(en.courseId)).map((en) => en.employeeId)
      );
      targets = emps.filter((e) => !reqEnrolledIds.has(e.id));
      defaultMsg = `[AI 360 필수교육 신청 독려] ${effScope.label} 필수 AI 교육 미신청 직원 안내\n2026년도 공공부문 AI 윤리·보안 및 필수 역량 집합교육 신청 기한이 도래하고 있습니다.\nAI 360 포털 > [교육 안내·신청] 메뉴에서 희망 기수를 선택하여 신청해 주시기 바랍니다.`;
    } else {
      categoryLabel = '신청 후 미수료자';
      const completedKey = new Set(db.completions.map((c) => `${c.courseId}|${c.employeeId}`));
      const uncompIds = new Set(
        db.enrollments
          .filter((en) => en.status === 'active' && empSet.has(en.employeeId) && !completedKey.has(`${en.courseId}|${en.employeeId}`))
          .map((en) => en.employeeId)
      );
      targets = emps.filter((e) => uncompIds.has(e.id));
      defaultMsg = `[AI 360 출석·이수 독려] 집합교육 사전 신청 후 미수료 직원 안내\n신청하신 집합교육 과정의 현장 QR 출석 인증이 확인되지 않았거나 예정 교육일이 임박했습니다.\n교육 당일 현장 비치 출석 QR 스캔을 통해 수료 처리가 누락되지 않도록 유의 바랍니다.`;
    }

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">참여율 제고 자동화 도구</span>
          <h1 class="page-title">${esc(effScope.label)} 미이수 · 미응답 독려 센터</h1>
          <p class="page-desc">독려 대상을 자동 추출하여 메신저·메일 문구를 복사하고 명단 엑셀 다운로드 및 독려 이력을 남깁니다.</p>
        </div>
      </div>

      <div class="seg-group mb-16">
        <button class="seg-btn ${reminderTab === 'diag_unanswered' ? 'active' : ''}" data-rmd-tab="diag_unanswered">📊 진단 미응답자</button>
        <button class="seg-btn ${reminderTab === 'course_unapplied' ? 'active' : ''}" data-rmd-tab="course_unapplied">📢 필수교육 미신청자</button>
        <button class="seg-btn ${reminderTab === 'course_uncompleted' ? 'active' : ''}" data-rmd-tab="course_uncompleted">⏳ 신청 후 미수료자</button>
      </div>

      <div class="grid-2-cols">
        <div class="card">
          <div class="card-header">
            <h3>추출 대상: ${esc(categoryLabel)} (${targets.length}명)</h3>
            <button id="btn-rmd-excel" class="btn btn-xs btn-outline">📥 대상자 명단 엑셀 다운로드</button>
          </div>
          <div class="table-wrap" style="max-height:310px;overflow:auto">
            <table class="data-table">
              <thead>
                <tr><th>연번</th><th>부서</th><th>직급</th><th>이름</th></tr>
              </thead>
              <tbody>
                ${targets.length === 0 ? '<tr><td colspan="4" class="text-center">해당 대상자가 없습니다 (100% 완료!).</td></tr>' :
                  targets.slice(0, 80).map((e, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${esc(e.dept)}</td>
                      <td>${esc(e.rank)}</td>
                      <td><strong>${esc(e.name)}</strong></td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>자동 생성 독려 문구 (온톡 메신저 · 온메일 겸용)</h3>
            <span class="badge-subtle">편집 가능</span>
          </div>
          <textarea id="rmd-msg-box" rows="7" class="form-textarea">${esc(defaultMsg)}</textarea>
          <div class="btn-row mt-12">
            <button id="btn-rmd-copy" class="btn btn-outline">📋 독려 문구 복사</button>
            <button id="btn-rmd-record" class="btn btn-primary" ${targets.length === 0 ? 'disabled' : ''}>
              ✓ 독려 발송 실행 및 이력 기록 (${targets.length}명)
            </button>
          </div>
          <p class="help-note mt-8">※ 실제 운영 전환 시 행정망 메신저(온톡)·메일 발송 API와 직결되며, 현재 시연 모드에서는 문구 복사 + 명단 엑셀 추출 + 독려 이력 자동 기록을 수행합니다.</p>
        </div>
      </div>

      <div class="card mt-16">
        <div class="card-header">
          <h3>최근 독려 발송 이력 (${db.reminders.length}건)</h3>
          <span class="badge-subtle">담당자별 독려 기록</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>일시</th><th>실행 담당자</th><th>대상 단위</th><th>독려 구분</th><th>대상 인원</th><th>문구 요약</th></tr>
            </thead>
            <tbody>
              ${db.reminders.map((r) => `
                <tr>
                  <td>${esc(r.createdAt)}</td>
                  <td><strong>${esc(r.actorName)}</strong></td>
                  <td>${esc(r.unitLabel)}</td>
                  <td><span class="warn-chip">${esc(r.targetCategory)}</span></td>
                  <td><strong>${r.targetCount}명</strong></td>
                  <td>${esc(r.messagePreview)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-rmd-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        reminderTab = b.dataset.rmdTab;
        renderManagerReminders(unit, container);
      });
    });

    container.querySelector('#btn-rmd-copy')?.addEventListener('click', () => {
      const txt = container.querySelector('#rmd-msg-box').value;
      copyText(txt, '독려 안내 문구가 클립보드에 복사되었습니다.');
    });

    container.querySelector('#btn-rmd-excel')?.addEventListener('click', () => {
      const rows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름', '독려구분'],
        ...targets.map((e, i) => [i + 1, e.org, e.bureau, e.dept, e.rank, e.name, categoryLabel])
      ];
      downloadExcel(`AI360_독려대상명단_${categoryLabel}.xlsx`, '독려대상', rows);
      showToast('독려 대상자 명단 엑셀 다운로드 완료', 'success');
    });

    container.querySelector('#btn-rmd-record')?.addEventListener('click', () => {
      const txt = container.querySelector('#rmd-msg-box').value;
      Store.recordReminder(categoryLabel, targets.length, effScope.label, txt);
      showToast(`${categoryLabel} ${targets.length}명에 대한 독려 이력이 기록되었습니다.`, 'success');
    });
  }

  window.AI360ManagerViews = {
    renderManagerMenu
  };
})();


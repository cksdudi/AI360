/**
 * AI 360 — 총괄 관리자 화면 Part 1 (① 통합 대시보드, ② 집합교육 전주기 자동화 관리)
 */
(function () {
  'use strict';

  const {
    esc,
    calcDurationHours,
    renderQRSVG,
    downloadQRPng,
    downloadExcel,
    createSamplePhotoDataURL,
    copyText,
    showToast
  } = window.AI360Utils;
  const { TOPICS, COURSE_STATUS_ORDER, ASSESSMENT_ITEMS, formatTargetSummary } = window.AI360Seed;
  const Store = window.AI360Store;
  const Charts = window.AI360Charts;

  // 대시보드 드릴다운 상태 (전체 -> 기관 -> 실국 -> 부서)
  let adminDrill = { org: null, bureau: null, dept: null };
  let adminCourseFilter = 'ALL';
  let activeWorkspaceTab = 'qr'; // 'qr' | 'plan' | 'notice' | 'roster' | 'satisfaction' | 'report'
  let rosterSubTab = 'enrolled'; // 'enrolled' | 'unapplied' | 'completed' | 'absent'

  function renderAdminMenu(menuId, container) {
    switch (menuId) {
      case 'admin-courses':
        renderAdminCourses(container);
        break;
      case 'admin-assessments':
      case 'admin-roster':
      case 'admin-managers':
      case 'admin-analytics':
        window.AI360AdminExtraViews.renderAdminExtraMenu(menuId, container);
        break;
      case 'admin-dashboard':
      default:
        renderAdminDashboard(container);
        break;
    }
  }

  /* =========================================================================
   * 1. 총괄 관리자 — 통합 대시보드 (전체 KPI + 조직 드릴다운 + 월별/주제별 현황)
   * ========================================================================= */
  function renderAdminDashboard(container) {
    const db = Store.getDB();
    const scopeStats = Store.computeUnitAnalytics(adminDrill);
    const wholeStats = Store.computeUnitAnalytics({});

    // 전체 만족도 평균
    const allSats = db.satisfaction_responses;
    let satSum = 0;
    allSats.forEach((s) => {
      satSum += (s.scores.S1 + s.scores.S2 + s.scores.S3 + s.scores.S4 + s.scores.S5) / 5;
    });
    const avgSat = allSats.length ? (satSum / allSats.length).toFixed(2) : '-';

    // 드릴다운 막대 항목 계산
    let barItems = [];
    let drillTitle = '';
    if (!adminDrill.org) {
      drillTitle = '7개 소속기관별 평균 AI 역량 점수 비교 (막대 클릭 시 실·국 드릴다운)';
      barItems = db.orgs.map((o) => {
        const st = Store.computeUnitAnalytics({ org: o.name });
        return { label: `${o.name}`, value: st.avgCompetencyScore, clickKey: `org:${o.name}` };
      });
    } else if (!adminDrill.bureau) {
      drillTitle = `${adminDrill.org} 산하 실·국별 평균 역량 점수 (막대 클릭 시 부서 드릴다운)`;
      const oNode = db.orgs.find((o) => o.name === adminDrill.org);
      barItems = (oNode ? oNode.bureaus : []).map((b) => {
        const st = Store.computeUnitAnalytics({ org: adminDrill.org, bureau: b.name });
        return { label: b.name, value: st.avgCompetencyScore, clickKey: `bureau:${b.name}` };
      });
    } else {
      drillTitle = `${adminDrill.org} > ${adminDrill.bureau} 산하 부서별 평균 역량 점수`;
      const oNode = db.orgs.find((o) => o.name === adminDrill.org);
      const bNode = oNode ? oNode.bureaus.find((b) => b.name === adminDrill.bureau) : null;
      barItems = (bNode ? bNode.depts : []).map((d) => {
        const st = Store.computeUnitAnalytics({ org: adminDrill.org, bureau: adminDrill.bureau, dept: d });
        return { label: d, value: st.avgCompetencyScore, clickKey: `dept:${d}` };
      });
    }

    // 월별 수료 및 만족도 추이 (3월 ~ 12월)
    const months = ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const monthlyItems = months.map((m) => {
      const mCourses = db.courses.filter((c) => c.date.slice(5, 7) === m);
      const mIds = new Set(mCourses.map((c) => c.id));
      const mComp = db.completions.filter((cp) => mIds.has(cp.courseId)).length;
      const mSats = db.satisfaction_responses.filter((s) => mIds.has(s.courseId));
      let sAvg = 0;
      if (mSats.length) {
        sAvg = mSats.reduce((a, r) => a + (r.scores.S1 + r.scores.S2 + r.scores.S3 + r.scores.S4 + r.scores.S5) / 5, 0) / mSats.length;
      }
      return { month: `${Number(m)}월`, completions: mComp, avgSat: Math.round(sAvg * 100) / 100 };
    });

    // 할 일 요약 (안내 미발송 / 결과보고 미작성)
    const todoUnsent = db.courses.filter((c) => c.status === '등록').length;
    const todoUnreported = db.courses.filter((c) => c.status === '만족도 조사').length;
    const unassignedMgrs = db.org_managers.filter((m) => !m.employeeId).length;

    const scopeLabel = [adminDrill.org, adminDrill.bureau, adminDrill.dept].filter(Boolean).join(' > ') || '전 기관 전체 (산업통상부 및 6개 소속기관)';

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">E. 총괄 관리자 · 전사 AI 교육 및 역량 통합 관제</span>
          <h1 class="page-title">산업통상부 AI 360 통합 대시보드</h1>
          <p class="page-desc">교육 한 번 등록으로 계획서·안내·QR 출결·수료·만족도·결과보고까지 전주기를 자동화하고 회차별 AI 역량 성장을 관리합니다.</p>
        </div>
        <div class="head-actions">
          <button id="btn-dash-new-course" class="btn btn-primary">+ 신규 집합교육 등록</button>
          <button class="btn btn-outline" data-admin-go="admin-analytics">📄 기관장 1페이지 보고서</button>
          <button id="btn-dash-download" class="btn btn-accent">📥 대시보드 다운로드</button>
        </div>
      </div>

      <!-- 다음 할 일 액션 배너 -->
      <div class="todo-strip">
        <span class="todo-strip-label">⚡ 교육 총괄 다음 할 일:</span>
        <button class="todo-pill warn" data-jump-course-filter="등록">안내 미발송 교육 <strong>${todoUnsent}건</strong></button>
        <button class="todo-pill primary" data-jump-course-filter="교육 당일(출석 인증)">당일 출석 인증 중 <strong>${db.courses.filter((c) => c.status === '교육 당일(출석 인증)').length}건</strong></button>
        <button class="todo-pill warn" data-jump-course-filter="만족도 조사">결과보고 미작성 <strong>${todoUnreported}건</strong></button>
        ${unassignedMgrs > 0 ? `<button class="todo-pill danger" data-admin-go="admin-managers">담당자 미지정 단위 <strong>${unassignedMgrs}곳</strong></button>` : `<span class="todo-pill ok">조직 담당자 전 단위 지정 완료</span>`}
      </div>

      <!-- 전사 KPI 6종 -->
      <div class="kpi-grid kpi-grid-6">
        <div class="kpi-card">
          <div class="kpi-label">조회 범위 인원 <span class="sample-mini">샘플</span></div>
          <div class="kpi-value">${scopeStats.headcount.toLocaleString()}명</div>
          <div class="kpi-sub">7개 기관 · 56개 부서 총 ${db.employees.length.toLocaleString()}명</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">개설 집합교육 과정</div>
          <div class="kpi-value">${db.courses.length}개</div>
          <div class="kpi-sub">완료 ${db.courses.filter((c) => c.status === '결과보고 완료').length} · 진행/예정 ${db.courses.filter((c) => c.status !== '결과보고 완료').length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">누적 수료 · 수료율</div>
          <div class="kpi-value">${scopeStats.totalCompletions.toLocaleString()}건</div>
          <div class="kpi-sub">신청 대비 수료율 ${scopeStats.completionRate}% (${scopeStats.totalHours}h)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">교육 평균 만족도</div>
          <div class="kpi-value">${avgSat} <small>/ 5.0</small></div>
          <div class="kpi-sub">수료자 QR 응답 ${allSats.length.toLocaleString()}건 집계</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">하반기 진단 응답률</div>
          <div class="kpi-value">${scopeStats.diagResponseRate}%</div>
          <div class="kpi-sub">${scopeStats.diagRespondedCount.toLocaleString()} / ${scopeStats.headcount.toLocaleString()}명 참여</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">평균 AI 역량 점수</div>
          <div class="kpi-value-row">
            <span class="kpi-value">${scopeStats.avgCompetencyScore}점</span>
            <span class="grade-pill" style="background:${scopeStats.avgGradeInfo.bg};color:${scopeStats.avgGradeInfo.color}">${esc(scopeStats.avgGradeInfo.grade)}</span>
          </div>
          <div class="kpi-sub">상반기 대비 수료자 역량 뚜렷한 상승</div>
        </div>
      </div>

      <!-- 소속기관 -> 실국 -> 부서 인터랙티브 드릴다운 -->
      <div class="card mb-16">
        <div class="card-header">
          <div>
            <h3>조직 계층별 드릴다운 비교 — <span class="text-primary">${esc(scopeLabel)}</span></h3>
            <small class="text-muted">${esc(drillTitle)}</small>
          </div>
          <div class="drill-crumbs-inline">
            <button class="crumb-btn ${!adminDrill.org ? 'active' : ''}" data-adm-crumb="all">전체 기관</button>
            ${adminDrill.org ? `<span class="crumb-sep">›</span><button class="crumb-btn ${!adminDrill.bureau ? 'active' : ''}" data-adm-crumb="org">${esc(adminDrill.org)}</button>` : ''}
            ${adminDrill.bureau ? `<span class="crumb-sep">›</span><button class="crumb-btn ${!adminDrill.dept ? 'active' : ''}" data-adm-crumb="bureau">${esc(adminDrill.bureau)}</button>` : ''}
            ${adminDrill.dept ? `<span class="crumb-sep">›</span><span class="crumb-btn active">${esc(adminDrill.dept)}</span>` : ''}
          </div>
        </div>
        <div class="chart-box">
          ${Charts.renderComparisonBarChartSVG(barItems, wholeStats.avgCompetencyScore, '전 기관 평균', 100, '점')}
        </div>
      </div>

      <!-- 월별 운영·수료·만족도 추이 & 역량 등급 분포 -->
      <div class="grid-2-cols mb-16">
        <div class="card">
          <div class="card-header">
            <h3>월별 집합교육 수료 인원 및 만족도 추이</h3>
            <span class="badge-subtle">2026년 3월 ~ 12월</span>
          </div>
          <div class="chart-box">
            ${Charts.renderMonthlyTrendSVG(monthlyItems)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>선택 범위 AI 역량 등급 분포 (${scopeStats.headcount.toLocaleString()}명)</h3>
            <span class="badge-subtle">${esc(scopeLabel)}</span>
          </div>
          ${Charts.renderGradeDistributionHTML(scopeStats.gradeCounts, scopeStats.headcount)}
        </div>
      </div>

      <!-- 10대 주제별 교육 운영 현황 -->
      <div class="card">
        <div class="card-header">
          <h3>10대 AI 교육 주제별 과정 운영 현황</h3>
          <button class="btn btn-xs btn-outline" data-admin-go="admin-courses">집합교육 관리 이동 →</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>교육 주제 (10대 분류)</th>
                <th>개설 과정 수</th>
                <th>총 정원</th>
                <th>신청 인원</th>
                <th>수료 인원 (수료율)</th>
                <th>평균 만족도</th>
              </tr>
            </thead>
            <tbody>
              ${TOPICS.map((topic) => {
                const tCourses = db.courses.filter((c) => c.topic === topic);
                const tIds = new Set(tCourses.map((c) => c.id));
                const cap = tCourses.reduce((a, c) => a + c.capacity, 0);
                const enr = db.enrollments.filter((e) => e.status === 'active' && tIds.has(e.courseId)).length;
                const cmp = db.completions.filter((c) => tIds.has(c.courseId)).length;
                const sats = db.satisfaction_responses.filter((s) => tIds.has(s.courseId));
                const sAvg = sats.length
                  ? (sats.reduce((a, r) => a + (r.scores.S1 + r.scores.S2 + r.scores.S3 + r.scores.S4 + r.scores.S5) / 5, 0) / sats.length).toFixed(2) + '점'
                  : '-';
                return `
                  <tr>
                    <td><span class="topic-chip">${esc(topic)}</span></td>
                    <td><strong>${tCourses.length}개</strong></td>
                    <td>${cap}명</td>
                    <td>${enr}명</td>
                    <td><strong>${cmp}명</strong> ${enr > 0 ? `(${((cmp / enr) * 100).toFixed(1)}%)` : ''}</td>
                    <td>${sAvg}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('#btn-dash-new-course')?.addEventListener('click', () => {
      openCourseRegisterModal();
    });
    container.querySelectorAll('[data-admin-go]').forEach((b) => {
      b.addEventListener('click', () => Store.setActiveMenu(b.dataset.adminGo));
    });
    container.querySelectorAll('[data-jump-course-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        adminCourseFilter = b.dataset.jumpCourseFilter;
        const firstMatch = Store.getDB().courses.find((c) => c.status === adminCourseFilter);
        Store.setActiveMenu('admin-courses', firstMatch ? { selectedCourseId: firstMatch.id } : {});
      });
    });
    container.querySelectorAll('[data-drill-key]').forEach((bar) => {
      bar.addEventListener('click', () => {
        const [kind, val] = bar.dataset.drillKey.split(':');
        if (kind === 'org') adminDrill = { org: val, bureau: null, dept: null };
        else if (kind === 'bureau') adminDrill = { org: adminDrill.org, bureau: val, dept: null };
        else if (kind === 'dept') adminDrill = { org: adminDrill.org, bureau: adminDrill.bureau, dept: val };
        renderAdminDashboard(container);
      });
    });
    container.querySelectorAll('[data-adm-crumb]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.dataset.admCrumb;
        if (k === 'all') adminDrill = { org: null, bureau: null, dept: null };
        else if (k === 'org') adminDrill = { org: adminDrill.org, bureau: null, dept: null };
        else if (k === 'bureau') adminDrill = { org: adminDrill.org, bureau: adminDrill.bureau, dept: null };
        renderAdminDashboard(container);
      });
    });
  }

  /* =========================================================================
   * 2. 총괄 관리자 — 집합교육 전주기 자동화 관리 (Section 3 핵심!)
   * ========================================================================= */
  function renderAdminCourses(container) {
    const db = Store.getDB();
    const session = Store.getSession();

    const filteredCourses = db.courses.filter((c) =>
      adminCourseFilter === 'ALL' ? true : c.status === adminCourseFilter
    );

    let selectedId = session.selectedCourseId;
    if (!filteredCourses.some((c) => c.id === selectedId)) {
      selectedId = filteredCourses[0] ? filteredCourses[0].id : (db.courses[0]?.id || null);
      if (selectedId) session.selectedCourseId = selectedId;
    }

    const summary = selectedId ? Store.getCourseSummary(selectedId) : null;

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">목적 1순위 · 오프라인 집합교육 전주기 자동화</span>
          <h1 class="page-title">집합교육 통합 관리 (등록 → QR → 계획서 → 안내 → 출결·수료 → 만족도 → 결과보고)</h1>
          <p class="page-desc">교육 한 건만 등록하면 QR 3종, A4 공문서 계획서, 안내문 및 대상자 명단, 출석·수료 집계, 만족도 결과보고서까지 한 흐름으로 자동 생성됩니다.</p>
        </div>
        <div class="head-actions">
          <button id="btn-open-register-course" class="btn btn-primary btn-lg">+ 신규 집합교육 등록</button>
        </div>
      </div>

      <!-- 상태별 필터 탭 -->
      <div class="status-filter-pills mb-16">
        <button class="filter-pill ${adminCourseFilter === 'ALL' ? 'active' : ''}" data-crs-filter="ALL">전체 (${db.courses.length})</button>
        ${['등록', '신청 중', '교육 당일(출석 인증)', '만족도 조사', '결과보고 완료'].map((st) => {
          const cnt = db.courses.filter((c) => c.status === st).length;
          return `<button class="filter-pill ${adminCourseFilter === st ? 'active' : ''}" data-crs-filter="${esc(st)}">${esc(st)} (${cnt})</button>`;
        }).join('')}
      </div>

      <div class="admin-course-layout">
        <!-- 좌측 교육 목록 -->
        <div class="course-list-pane card">
          <div class="pane-title">개설 교육 목록 (${filteredCourses.length}건)</div>
          <div class="course-select-list">
            ${filteredCourses.map((c) => {
              const todo = Store.getCourseNextTodo(c);
              const active = c.id === selectedId;
              return `
                <div class="course-select-item ${active ? 'active' : ''}" data-select-course="${esc(c.id)}">
                  <div class="csi-top">
                    <span class="topic-chip-xs">${esc(c.topic)}</span>
                    <span class="todo-badge tone-${todo.tone}">${esc(todo.text)}</span>
                  </div>
                  <div class="csi-title">${esc(c.title)}</div>
                  <div class="csi-meta">${esc(c.date)} · 정원 ${c.capacity}명 · ${esc(c.status)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 우측 선택 교육 전주기 워크스페이스 -->
        <div class="course-workspace-pane">
          ${summary ? renderCourseWorkspaceHTML(summary) : '<div class="card">교육 과정을 선택해 주세요.</div>'}
        </div>
      </div>
    `;

    container.querySelector('#btn-open-register-course')?.addEventListener('click', openCourseRegisterModal);

    container.querySelectorAll('[data-crs-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        adminCourseFilter = b.dataset.crsFilter;
        renderAdminCourses(container);
      });
    });

    container.querySelectorAll('[data-select-course]').forEach((el) => {
      el.addEventListener('click', () => {
        Store.setActiveMenu('admin-courses', { selectedCourseId: el.dataset.selectCourse });
      });
    });

    if (summary) {
      bindWorkspaceEvents(container, summary);
    }
  }

  function renderCourseWorkspaceHTML(summary) {
    const { course } = summary;
    const stepIdx = COURSE_STATUS_ORDER.indexOf(course.status);

    return `
      <!-- 상단 과정 헤더 + 7단계 상태 흐름 스텝퍼 -->
      <div class="card mb-16">
        <div class="ws-course-head">
          <div>
            <div class="btn-row mb-6">
              <span class="topic-chip">${esc(course.topic)}</span>
              ${course.required ? '<span class="req-badge">필수교육</span>' : '<span class="opt-badge">선택교육</span>'}
              <span class="todo-badge tone-${summary.nextTodo.tone}">다음 할 일: ${esc(summary.nextTodo.text)}</span>
            </div>
            <h2 class="ws-title">${esc(course.title)}</h2>
            <p class="ws-meta">
              📅 ${esc(course.date)} ${esc(course.startTime)}~${esc(course.endTime)} (<strong>${course.hours}시간</strong>) ·
              📍 ${esc(course.place)} ·
              👤 강사: ${esc(course.instructorName)} (${esc(course.instructorOrg)}) ·
              🎯 대상: ${esc(formatTargetSummary(course))} (정원 ${course.capacity}명)
            </p>
          </div>
          <div class="ws-quick-stats">
            <div><small>신청</small><strong>${summary.enrollList.length}명</strong><span>(${summary.enrollRateOfCap}%)</span></div>
            <div><small>출석·수료</small><strong>${summary.completeList.length}명</strong><span>(${summary.completionRate}%)</span></div>
            <div><small>만족도</small><strong>${summary.satOverallAvg || '-'}점</strong><span>(${summary.satList.length}명)</span></div>
          </div>
        </div>

        <!-- 7단계 상태 흐름 바 (클릭하여 시연 단계 즉시 전환 가능) -->
        <div class="lifecycle-stepper">
          ${COURSE_STATUS_ORDER.map((st, idx) => `
            <button class="step-node ${idx < stepIdx ? 'done' : idx === stepIdx ? 'current' : ''}" data-set-course-status="${esc(st)}" title="시연용 상태 전환: ${esc(st)}">
              <span class="step-num">${idx < stepIdx ? '✓' : idx + 1}</span>
              <span class="step-label">${esc(st)}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 워크스페이스 6개 기능 탭 -->
      <div class="ws-tabs-bar">
        <button class="ws-tab ${activeWorkspaceTab === 'qr' ? 'active' : ''}" data-ws-tab="qr">① QR 3종 · 스캔 시뮬레이션</button>
        <button class="ws-tab ${activeWorkspaceTab === 'plan' ? 'active' : ''}" data-ws-tab="plan">② 교육 계획서 (A4)</button>
        <button class="ws-tab ${activeWorkspaceTab === 'notice' ? 'active' : ''}" data-ws-tab="notice">③ 안내문 · 알림 발송</button>
        <button class="ws-tab ${activeWorkspaceTab === 'roster' ? 'active' : ''}" data-ws-tab="roster">④ 신청·수료 집계 &amp; 보정</button>
        <button class="ws-tab ${activeWorkspaceTab === 'satisfaction' ? 'active' : ''}" data-ws-tab="satisfaction">⑤ 만족도 조사 (${summary.satList.length})</button>
        <button class="ws-tab ${activeWorkspaceTab === 'report' ? 'active' : ''}" data-ws-tab="report">⑥ 결과보고서 (사진·A4)</button>
      </div>

      <div class="card ws-tab-body">
        ${renderWorkspaceTabContent(summary)}
      </div>
    `;
  }

  function renderWorkspaceTabContent(summary) {
    const { course, docBundle } = summary;

    // 탭 1: QR코드 3종
    if (activeWorkspaceTab === 'qr') {
      const qrSpecs = [
        { type: 'apply', title: '1. 교육 신청 QR', desc: '안내문·포스터 삽입용 — 스캔 시 모바일 교육 신청 화면으로 직결', color: '#1d4ed8' },
        { type: 'attend', title: '2. 현장 출석(장소 인증) QR', desc: '교육장 입구 게시용 — 스캔 즉시 출석 및 수료(' + course.hours + 'h) 자동 처리', color: '#0f766e' },
        { type: 'satisfaction', title: '3. 만족도 조사 QR', desc: '교육 종료 시 스크린 게시용 — 수료자 5문항 만족도 조사(1인 1회)', color: '#4338ca' }
      ];
      return `
        <div class="card-header">
          <div>
            <h3>등록 즉시 자동 생성된 QR코드 3종</h3>
            <p class="text-muted">실제 휴대폰 카메라 스캔 호환 표준 QR이며, 발표·시연 시 [스캔 시뮬레이션] 버튼으로 즉시 동작을 확인할 수 있습니다.</p>
          </div>
          <label class="toggle-inline">
            <input type="checkbox" id="chk-allow-walkin" ${course.allowWalkIn ? 'checked' : ''}>
            <span>미신청자 현장 출석 QR 스캔 시 <strong>현장 신청 후 출석 허용</strong></span>
          </label>
        </div>

        <div class="qr-3-grid">
          ${qrSpecs.map((q) => {
            const urlToken = `${location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'https://ai360.motie.go.kr/'}#qr=${q.type}:${course.id}`;
            return `
              <div class="qr-box-card">
                <div class="qr-box-title">${esc(q.title)}</div>
                <p class="qr-box-desc">${esc(q.desc)}</p>
                <div class="qr-svg-holder">
                  ${renderQRSVG(urlToken, 152, q.color)}
                </div>
                <div class="qr-btn-stack">
                  <button class="btn btn-sm btn-primary btn-block" data-sim-qr="${q.type}">📱 스캔 시뮬레이션 실행</button>
                  <div class="btn-row-even">
                    <button class="btn btn-xs btn-outline" data-dl-qr="${q.type}" data-qr-url="${esc(urlToken)}" data-qr-label="${esc(q.title)}">⬇ 이미지 저장</button>
                    <button class="btn btn-xs btn-outline" data-print-qr="${q.type}" data-qr-url="${esc(urlToken)}" data-qr-label="${esc(q.title)}">🖨️ A4 게시물 인쇄</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 탭 2: 교육 계획서 (1페이지 공문서 스타일)
    if (activeWorkspaceTab === 'plan') {
      const plan = docBundle.plan;
      const applyUrl = `https://ai360.motie.go.kr/#qr=apply:${course.id}`;
      return `
        <div class="card-header">
          <div>
            <h3>교육 계획서 (1페이지 자동 작성 · 편집 · A4 인쇄/PDF 저장)</h3>
            <p class="text-muted">입력한 교육 등록 정보와 신청 QR코드가 공문서 양식에 맞춰 자동 배치되었습니다.</p>
          </div>
          <div class="btn-row">
            <button id="btn-save-plan" class="btn btn-outline">💾 문구 수정 저장</button>
            <button id="btn-print-plan" class="btn btn-primary">🖨️ 계획서 A4 인쇄 / PDF 저장</button>
          </div>
        </div>

        <div class="doc-editor-preview-grid">
          <div class="doc-edit-pane">
            <label class="form-label">문서 제목</label>
            <input id="plan-title" class="form-input mb-10" value="${esc(plan.title)}">
            <label class="form-label">추진 배경 및 목적</label>
            <textarea id="plan-bg" rows="4" class="form-textarea mb-10">${esc(plan.background)}</textarea>
            <label class="form-label">교육 내용 (커리큘럼)</label>
            <textarea id="plan-curr" rows="4" class="form-textarea mb-10">${esc(plan.curriculum)}</textarea>
            <label class="form-label">운영 방법 (QR 신청·출석·만족도)</label>
            <textarea id="plan-method" rows="3" class="form-textarea mb-10">${esc(plan.method)}</textarea>
            <label class="form-label">행정사항</label>
            <textarea id="plan-admin" rows="3" class="form-textarea">${esc(plan.adminNote)}</textarea>
          </div>

          <div class="a4-preview-wrapper">
            ${buildOfficialPlanHTML(course, plan, applyUrl)}
          </div>
        </div>
      `;
    }

    // 탭 3: 교육 안내문 & 대상자 명단
    if (activeWorkspaceTab === 'notice') {
      return `
        <div class="card-header">
          <div>
            <h3>교육 안내문 자동 생성 &amp; 대상자 알림 발송 (대상자 ${summary.eligibleList.length}명)</h3>
            <p class="text-muted">[안내 발송] 클릭 시 대상 직원의 화면 알림함에 안내가 즉시 도착하며 교육 상태가 「신청 중」으로 전환됩니다.</p>
          </div>
          <div class="btn-row">
            <button id="btn-dl-target-excel" class="btn btn-outline">📥 대상자 명단 엑셀 다운로드 (${summary.eligibleList.length}명)</button>
            <button id="btn-send-course-notice" class="btn btn-primary">📣 안내 발송 실행 ${course.noticeSent ? '(재발송)' : ''}</button>
          </div>
        </div>

        ${course.noticeSent ? `<div class="info-Banner ok mb-12">✓ 최근 안내 발송 완료 시각: <strong>${esc(course.noticeSentAt)}</strong> — 교육생 알림함에 안내가 게시되었습니다.</div>` : `<div class="info-Banner warn mb-12">⚡ 아직 안내가 발송되지 않은 등록 과정입니다. 우측 상단 [안내 발송 실행]을 눌러 시연해 보세요.</div>`}

        <div class="grid-2-cols">
          <div>
            <div class="flex-between mb-6">
              <label class="form-label mb-0">💬 행정망 메신저(온톡) 안내 문구</label>
              <button class="btn btn-xs btn-outline" id="btn-copy-messenger">📋 문구 복사</button>
            </div>
            <textarea id="notice-messenger-txt" rows="11" class="form-textarea">${esc(course.messengerText)}</textarea>
          </div>
          <div>
            <div class="flex-between mb-6">
              <label class="form-label mb-0">✉️ 공직자 통합메일 안내 문구</label>
              <button class="btn btn-xs btn-outline" id="btn-copy-email">📋 문구 복사</button>
            </div>
            <textarea id="notice-email-txt" rows="11" class="form-textarea">${esc(course.emailText)}</textarea>
          </div>
        </div>
      `;
    }

    // 탭 4: 신청자·수료자 자동 집계 및 수동 보정
    if (activeWorkspaceTab === 'roster') {
      const db = Store.getDB();
      const attendedMap = new Map(summary.attendList.map((a) => [a.employeeId, a]));

      // 소속기관별 집계 요약
      const orgBreak = db.orgs.map((o) => {
        const elCnt = summary.eligibleList.filter((e) => e.org === o.name).length;
        const enCnt = summary.enrollList.filter((en) => Store.getEmployeeById(en.employeeId)?.org === o.name).length;
        const cmCnt = summary.completeList.filter((cm) => Store.getEmployeeById(cm.employeeId)?.org === o.name).length;
        return { org: o.name, elCnt, enCnt, cmCnt };
      }).filter((x) => x.elCnt > 0 || x.enCnt > 0);

      return `
        <div class="card-header">
          <div>
            <h3>실시간 신청 · 출석 · 수료 자동 집계 및 관리자 수동 보정</h3>
            <p class="text-muted">신청 즉시 소속·직급별로 집계되며, 현장 QR 누락자는 사유를 기록하여 수동 수료 처리할 수 있습니다.</p>
          </div>
          <button id="btn-dl-course-roster" class="btn btn-outline">📥 현재 탭 목록 엑셀 다운로드</button>
        </div>

        <!-- 소속기관별 요약 미니 테이블 -->
        <div class="mini-stat-strip mb-14">
          ${orgBreak.map((ob) => `
            <div class="mini-stat-chip">
              <strong>${esc(ob.org)}</strong>
              <span>대상 ${ob.elCnt} · 신청 ${ob.enCnt} · 수료 ${ob.cmCnt}</span>
            </div>
          `).join('')}
        </div>

        <div class="seg-group mb-12">
          <button class="seg-btn ${rosterSubTab === 'enrolled' ? 'active' : ''}" data-roster-sub="enrolled">신청자 목록 (${summary.enrollList.length})</button>
          <button class="seg-btn ${rosterSubTab === 'completed' ? 'active' : ''}" data-roster-sub="completed">출석·수료자 목록 (${summary.completeList.length})</button>
          <button class="seg-btn ${rosterSubTab === 'absent' ? 'active' : ''}" data-roster-sub="absent">신청 후 미출석자 · 수동보정 (${summary.absentAfterApplyList.length})</button>
          <button class="seg-btn ${rosterSubTab === 'unapplied' ? 'active' : ''}" data-roster-sub="unapplied">대상 중 미신청자 (${summary.unappliedList.length})</button>
        </div>

        <div class="table-wrap" style="max-height:380px;overflow:auto">
          ${renderCourseRosterTableHTML(summary, attendedMap)}
        </div>
      `;
    }

    // 탭 5: 만족도 조사 결과
    if (activeWorkspaceTab === 'satisfaction') {
      const comments = summary.satList.filter((s) => s.comment && s.comment.trim());
      return `
        <div class="card-header">
          <div>
            <h3>만족도 조사 자동 집계 (5문항 5점 척도 + 자유의견)</h3>
            <p class="text-muted">수료생 ${summary.completeList.length}명 중 <strong>${summary.satList.length}명 응답</strong> (응답률 ${summary.satResponseRate}%) · 전체 평균 <strong>${summary.satOverallAvg || '-'}점 / 5.0점</strong></p>
          </div>
          <button class="btn btn-outline btn-sm" data-sim-qr="satisfaction">📱 만족도 QR 응답 시뮬레이션</button>
        </div>

        ${summary.satList.length === 0 ? `<div class="empty-hint">아직 수집된 만족도 응답이 없습니다. 우측 상단 [만족도 QR 응답 시뮬레이션]으로 테스트해 보세요.</div>` : `
          <div class="sat-bars-box mb-16">
            ${summary.satItemAvgs.map((it) => `
              <div class="sat-bar-row">
                <div class="sat-bar-label"><strong>${esc(it.id)}.</strong> ${esc(it.text)}</div>
                <div class="sat-bar-track">
                  <div class="sat-bar-fill" style="width:${(it.avg / 5) * 100}%"></div>
                </div>
                <div class="sat-bar-val">${it.avg.toFixed(2)}점</div>
              </div>
            `).join('')}
          </div>

          <h4 class="sub-heading">수강생 주요 자유의견 (${comments.length}건)</h4>
          <div class="comment-grid">
            ${comments.length === 0 ? '<div class="text-muted">등록된 자유의견이 없습니다.</div>' :
              comments.slice(0, 12).map((c) => {
                const emp = Store.getEmployeeById(c.employeeId);
                return `<div class="comment-card">
                  <p>"${esc(c.comment)}"</p>
                  <small>${emp ? `${esc(emp.org)} ${esc(emp.dept)} (${esc(emp.rank)})` : '수료생'} · ${esc(c.submittedAt)}</small>
                </div>`;
              }).join('')}
          </div>
        `}
      `;
    }

    // 탭 6: 교육 결과보고서 (자동 작성 + 현장 사진 최대 4장 업로드 + A4 인쇄)
    const report = docBundle.report;
    return `
      <div class="card-header">
        <div>
          <h3>교육 결과보고서 자동 작성 (실적·만족도·현장 사진 최대 4장 자동 배치)</h3>
          <p class="text-muted">출석·수료율 및 만족도 결과가 자동 삽입되며, 현장 사진 업로드 시 A4 보고서에 즉시 배치됩니다.</p>
        </div>
        <div class="btn-row">
          <button id="btn-save-report" class="btn btn-outline">💾 문구·사진 저장</button>
          <button id="btn-complete-report" class="btn btn-accent">✓ 결과보고 완료 확정</button>
          <button id="btn-print-report" class="btn btn-primary">🖨️ 결과보고서 A4 인쇄 / PDF</button>
        </div>
      </div>

      <div class="doc-editor-preview-grid">
        <div class="doc-edit-pane">
          <label class="form-label">결과보고서 제목</label>
          <input id="rep-title" class="form-input mb-10" value="${esc(report.title)}">
          <label class="form-label">주요 성과</label>
          <textarea id="rep-ach" rows="3" class="form-textarea mb-10">${esc(report.achievements)}</textarea>
          <label class="form-label">시사점 및 개선사항</label>
          <textarea id="rep-imp" rows="3" class="form-textarea mb-10">${esc(report.implications)}</textarea>
          <label class="form-label">향후 계획</label>
          <textarea id="rep-fut" rows="3" class="form-textarea mb-12">${esc(report.futurePlan)}</textarea>

          <div class="photo-upload-box">
            <div class="flex-between mb-8">
              <label class="form-label mb-0">📷 교육 현장 사진 첨부 (${report.photos.length} / 4장)</label>
              <button type="button" id="btn-add-sample-photo" class="btn btn-xs btn-ghost">+ 샘플 일러스트 추가</button>
            </div>
            <input type="file" id="rep-photo-input" accept="image/*" multiple class="form-input mb-8" ${report.photos.length >= 4 ? 'disabled' : ''}>
            <div class="photo-thumb-grid">
              ${report.photos.map((src, idx) => `
                <div class="photo-thumb-item">
                  <img src="${src}" alt="현장사진 ${idx + 1}">
                  <button type="button" class="photo-del-btn" data-del-photo="${idx}" title="사진 삭제">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="a4-preview-wrapper">
          ${buildOfficialReportHTML(summary)}
        </div>
      </div>
    `;
  }

  function renderCourseRosterTableHTML(summary, attendedMap) {
    if (rosterSubTab === 'enrolled') {
      if (!summary.enrollList.length) return '<div class="empty-hint">신청자가 없습니다.</div>';
      return `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>연번</th><th>소속기관</th><th>실·국 / 부서</th><th>직급</th><th>이름</th><th>신청경로</th><th>신청일시</th><th>출석상태</th></tr></thead>
        <tbody>
          ${summary.enrollList.map((en, i) => {
            const emp = Store.getEmployeeById(en.employeeId);
            const att = attendedMap.get(en.employeeId);
            if (!emp) return '';
            return `<tr>
              <td>${i + 1}</td><td>${esc(emp.org)}</td><td>${esc(emp.bureau)} &gt; ${esc(emp.dept)}</td>
              <td>${esc(emp.rank)}</td><td><strong>${esc(emp.name)}</strong></td>
              <td><span class="badge-subtle">${esc(en.channel)}</span></td><td>${esc(en.enrolledAt)}</td>
              <td>${att ? `<span class="enrolled-chip">수료(${esc(att.method)})</span>` : '<span class="text-muted">출석 전</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    }

    if (rosterSubTab === 'completed') {
      if (!summary.attendList.length) return '<div class="empty-hint">아직 출석·수료 인증자가 없습니다.</div>';
      return `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>연번</th><th>소속기관</th><th>실·국 / 부서</th><th>직급</th><th>이름</th><th>인증방식</th><th>인증시각</th><th>수동처리 사유</th></tr></thead>
        <tbody>
          ${summary.attendList.map((att, i) => {
            const emp = Store.getEmployeeById(att.employeeId);
            if (!emp) return '';
            return `<tr>
              <td>${i + 1}</td><td>${esc(emp.org)}</td><td>${esc(emp.bureau)} &gt; ${esc(emp.dept)}</td>
              <td>${esc(emp.rank)}</td><td><strong>${esc(emp.name)}</strong></td>
              <td><span class="enrolled-chip">${esc(att.method)}</span></td><td>${esc(att.checkedAt)}</td>
              <td>${att.manualReason ? esc(att.manualReason) : '-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    }

    if (rosterSubTab === 'absent') {
      if (!summary.absentAfterApplyList.length) return '<div class="empty-hint">신청 후 미출석 인원이 없습니다.</div>';
      return `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>연번</th><th>소속기관</th><th>부서</th><th>직급</th><th>이름</th><th>신청일시</th><th>관리자 수동 수료 보정 (사유 입력)</th></tr></thead>
        <tbody>
          ${summary.absentAfterApplyList.map(({ enrollment, emp }, i) => `
            <tr>
              <td>${i + 1}</td><td>${esc(emp.org)}</td><td>${esc(emp.dept)}</td><td>${esc(emp.rank)}</td>
              <td><strong>${esc(emp.name)}</strong></td><td>${esc(enrollment.enrolledAt)}</td>
              <td>
                <div class="manual-fix-inline">
                  <input type="text" class="form-input input-xs" placeholder="예: 현장 서명부 대조 확인" data-manual-reason="${esc(emp.id)}" value="휴대폰 미소지로 현장 서명부 출석 확인">
                  <button class="btn btn-xs btn-primary" data-manual-complete="${esc(emp.id)}">수동 수료 처리</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;
    }

    // unapplied
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>연번</th><th>소속기관</th><th>실·국</th><th>부서</th><th>직급</th><th>이름</th></tr></thead>
      <tbody>
        ${summary.unappliedList.slice(0, 100).map((emp, i) => `
          <tr>
            <td>${i + 1}</td><td>${esc(emp.org)}</td><td>${esc(emp.bureau)}</td>
            <td>${esc(emp.dept)}</td><td>${esc(emp.rank)}</td><td><strong>${esc(emp.name)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;
  }

  /* =========================================================================
   * 공문서 스타일 A4 계획서 & 결과보고서 HTML 빌더 (미리보기 + 인쇄 공용!)
   * ========================================================================= */
  function buildOfficialPlanHTML(course, plan, applyUrl) {
    return `
      <div class="official-doc-sheet">
        <div class="doc-sample-watermark">[시연용 샘플 공문서 · 실제 행정문서 아님]</div>
        <div class="doc-header-org">산 업 통 상 부</div>
        <div class="doc-sub-meta">
          <span>문서번호: ${esc(plan.docNo)}</span>
          <span>시행일자: ${esc(course.applyStart)}</span>
        </div>
        <h1 class="doc-main-title">${esc(plan.title)}</h1>

        <div class="doc-section">
          <div class="doc-pre">${esc(plan.background)}</div>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">2. 교육 개요</div>
          <table class="doc-table">
            <tbody>
              <tr>
                <th>교 육 명</th><td colspan="3"><strong>${esc(course.title)}</strong> (${course.required ? '필수교육' : '선택교육'})</td>
              </tr>
              <tr>
                <th>교육주제</th><td>${esc(course.topic)}</td>
                <th>교육대상 / 정원</th><td>${esc(formatTargetSummary(course))} / ${course.capacity}명</td>
              </tr>
              <tr>
                <th>교육일시</th><td>${esc(course.date)} ${esc(course.startTime)}~${esc(course.endTime)} (${course.hours}시간)</td>
                <th>교육장소</th><td>${esc(course.place)}</td>
              </tr>
              <tr>
                <th>초빙강사</th><td>${esc(course.instructorName)} (${esc(course.instructorOrg)} ${esc(course.instructorTitle)})</td>
                <th>수료기준</th><td>${esc(course.completionRule)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">3. 세부 교육 내용</div>
          <div class="doc-pre">${esc(plan.curriculum)}</div>
        </div>

        <div class="doc-section doc-qr-split">
          <div style="flex:1">
            <div class="doc-sec-title">4. 운영 방법 및 행정사항</div>
            <div class="doc-pre">${esc(plan.method)}\n${esc(plan.adminNote)}</div>
          </div>
          <div class="doc-qr-embed">
            ${renderQRSVG(applyUrl, 96, '#0f2942')}
            <span>모바일 참가 신청 QR</span>
          </div>
        </div>
      </div>
    `;
  }

  function buildOfficialReportHTML(summary) {
    const { course, docBundle, satItemAvgs, satOverallAvg } = summary;
    const report = docBundle.report;
    const db = Store.getDB();

    // 직급별 수료 현황
    const rankStats = ['과장', '서기관', '사무관', '주무관'].map((rk) => {
      const cnt = summary.completeList.filter((c) => Store.getEmployeeById(c.employeeId)?.rank === rk).length;
      return `${rk} ${cnt}명`;
    }).join(' / ');

    // 소속별 상위 수료 현황
    const orgStats = db.orgs.map((o) => {
      const cnt = summary.completeList.filter((c) => Store.getEmployeeById(c.employeeId)?.org === o.name).length;
      return cnt > 0 ? `${o.name} ${cnt}명` : null;
    }).filter(Boolean).join(', ') || '수료 집계 전';

    const topComments = summary.satList.filter((s) => s.comment).slice(0, 2).map((s) => `• "${s.comment}"`).join('\n') || '• 실습 중심 강의 구성에 대한 긍정적 평가 다수';

    return `
      <div class="official-doc-sheet">
        <div class="doc-sample-watermark">[시연용 샘플 결과보고서 · 가상 샘플 수치]</div>
        <div class="doc-header-org">산 업 통 상 부</div>
        <div class="doc-sub-meta">
          <span>문서번호: ${esc(report.docNo)}</span>
          <span>보고일자: ${esc(course.date)}</span>
        </div>
        <h1 class="doc-main-title">${esc(report.title)}</h1>

        <div class="doc-section">
          <div class="doc-sec-title">1. 교육 개요 및 추진 실적 (자동 집계)</div>
          <table class="doc-table">
            <tbody>
              <tr>
                <th>교 육 명</th><td colspan="3"><strong>${esc(course.title)}</strong> (${esc(course.topic)})</td>
              </tr>
              <tr>
                <th>일시 / 장소</th><td>${esc(course.date)} (${course.hours}h) / ${esc(course.place)}</td>
                <th>강 사</th><td>${esc(course.instructorName)} (${esc(course.instructorOrg)})</td>
              </tr>
              <tr>
                <th>참여 실적</th>
                <td colspan="3">
                  대상 ${summary.eligibleList.length}명 / 정원 ${course.capacity}명 중
                  <strong>신청 ${summary.enrollList.length}명(${summary.enrollRateOfCap}%)</strong> →
                  <strong>수료 ${summary.completeList.length}명(수료율 ${summary.completionRate}%)</strong>
                </td>
              </tr>
              <tr>
                <th>소속별 수료</th><td colspan="3">${esc(orgStats)}</td>
              </tr>
              <tr>
                <th>직급별 수료</th><td colspan="3">${esc(rankStats)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">2. 만족도 조사 결과 (응답 ${summary.satList.length}명 · 종합 평균 ${satOverallAvg || '-'} / 5.0점)</div>
          <table class="doc-table compact">
            <thead>
              <tr>
                ${satItemAvgs.map((it) => `<th>${esc(it.id)} 문항</th>`).join('')}
                <th>종합 평균</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                ${satItemAvgs.map((it) => `<td class="text-center">${it.avg ? it.avg.toFixed(2) : '-'}</td>`).join('')}
                <td class="text-center"><strong>${satOverallAvg || '-'}점</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="doc-pre mt-6">${esc(topComments)}</div>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">3. 주요 성과 · 시사점 및 향후 계획</div>
          <div class="doc-pre">${esc(report.achievements)}\n${esc(report.implications)}\n${esc(report.futurePlan)}</div>
        </div>

        ${report.photos && report.photos.length > 0 ? `
          <div class="doc-section">
            <div class="doc-sec-title">4. 교육 현장 사진 (${report.photos.length}매)</div>
            <div class="doc-photo-grid count-${report.photos.length}">
              ${report.photos.slice(0, 4).map((src, i) => `
                <div class="doc-photo-cell">
                  <img src="${src}" alt="교육 현장 사진 ${i + 1}">
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /* =========================================================================
   * 워크스페이스 이벤트 바인딩 & 신규 교육 등록 모달
   * ========================================================================= */
  function bindWorkspaceEvents(container, summary) {
    const { course, docBundle } = summary;

    container.querySelectorAll('[data-ws-tab]').forEach((t) => {
      t.addEventListener('click', () => {
        activeWorkspaceTab = t.dataset.wsTab;
        renderAdminCourses(container);
      });
    });

    container.querySelectorAll('[data-set-course-status]').forEach((stBtn) => {
      stBtn.addEventListener('click', () => {
        Store.updateCourseStatus(course.id, stBtn.dataset.setCourseStatus);
        showToast(`교육 상태가 「${stBtn.dataset.setCourseStatus}」(으)로 전환되었습니다.`, 'info');
      });
    });

    // QR 탭 이벤트
    container.querySelector('#chk-allow-walkin')?.addEventListener('change', (e) => {
      Store.updateCourseAllowWalkIn(course.id, e.target.checked);
      showToast(`미신청자 현장 QR 출석 ${e.target.checked ? '허용' : '차단'}으로 설정되었습니다.`, 'info');
    });

    container.querySelectorAll('[data-sim-qr]').forEach((b) => {
      b.addEventListener('click', () => {
        window.AI360App.openQRSimulatorModal(course.id, b.dataset.simQr);
      });
    });

    container.querySelectorAll('[data-dl-qr]').forEach((b) => {
      b.addEventListener('click', () => {
        downloadQRPng(
          b.dataset.qrUrl,
          `AI360_${course.id}_${b.dataset.dlQr}_QR.png`,
          b.dataset.qrLabel,
          `${course.title} (${course.date})`
        );
        showToast('QR 코드 이미지(PNG)가 다운로드되었습니다.', 'success');
      });
    });

    container.querySelectorAll('[data-print-qr]').forEach((b) => {
      b.addEventListener('click', () => {
        const html = `
          <div class="official-doc-sheet qr-poster-sheet">
            <div class="doc-sample-watermark">[시연용 샘플 현장 게시물 · A4 1매 규격]</div>
            <div class="poster-badge">산업통상부 AI 360 집합교육 현장 안내</div>
            <h1 class="poster-title">${esc(course.title)}</h1>
            <h2 class="poster-qr-kind">${esc(b.dataset.qrLabel)}</h2>
            <div class="poster-qr-frame">
              ${renderQRSVG(b.dataset.qrUrl, 300, '#0f2942')}
            </div>
            <div class="poster-info-box">
              <div><strong>교육 일시:</strong> ${esc(course.date)} ${esc(course.startTime)} ~ ${esc(course.endTime)} (${course.hours}시간 인정)</div>
              <div><strong>교육 장소:</strong> ${esc(course.place)}</div>
              <div><strong>초빙 강사:</strong> ${esc(course.instructorName)} (${esc(course.instructorOrg)})</div>
            </div>
            <p class="poster-guide">스마트폰 기본 카메라로 위 QR코드를 스캔하면 별도 앱 설치 없이 즉시 처리됩니다.</p>
          </div>
        `;
        window.AI360App.printA4Document(html);
      });
    });

    // 계획서 탭 이벤트
    const getPlanPatch = () => ({
      title: container.querySelector('#plan-title')?.value || docBundle.plan.title,
      background: container.querySelector('#plan-bg')?.value || docBundle.plan.background,
      curriculum: container.querySelector('#plan-curr')?.value || docBundle.plan.curriculum,
      method: container.querySelector('#plan-method')?.value || docBundle.plan.method,
      adminNote: container.querySelector('#plan-admin')?.value || docBundle.plan.adminNote
    });

    container.querySelector('#btn-save-plan')?.addEventListener('click', () => {
      Store.savePlanDoc(course.id, getPlanPatch());
      showToast('교육 계획서 문구가 저장되었습니다.', 'success');
    });

    container.querySelector('#btn-print-plan')?.addEventListener('click', () => {
      const patch = getPlanPatch();
      Store.savePlanDoc(course.id, patch);
      const applyUrl = `https://ai360.motie.go.kr/#qr=apply:${course.id}`;
      window.AI360App.printA4Document(buildOfficialPlanHTML(course, Object.assign({}, docBundle.plan, patch), applyUrl));
    });

    // 안내문 탭 이벤트
    container.querySelector('#btn-copy-messenger')?.addEventListener('click', () => {
      copyText(container.querySelector('#notice-messenger-txt').value, '메신저용 안내 문구가 복사되었습니다.');
    });
    container.querySelector('#btn-copy-email')?.addEventListener('click', () => {
      copyText(container.querySelector('#notice-email-txt').value, '메일용 안내 문구가 복사되었습니다.');
    });
    container.querySelector('#btn-dl-target-excel')?.addEventListener('click', () => {
      const rows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름', '안내대상과정'],
        ...summary.eligibleList.map((e, i) => [i + 1, e.org, e.bureau, e.dept, e.rank, e.name, course.title])
      ];
      downloadExcel(`AI360_교육대상자명단_${course.id}.xlsx`, '교육대상자', rows);
      showToast('교육 대상자 명단 엑셀 다운로드 완료', 'success');
    });
    container.querySelector('#btn-send-course-notice')?.addEventListener('click', () => {
      const mTxt = container.querySelector('#notice-messenger-txt').value;
      const eTxt = container.querySelector('#notice-email-txt').value;
      const res = Store.sendCourseNotice(course.id, mTxt, eTxt);
      if (res.ok) {
        showToast(`대상자 ${res.eligibleCount}명의 알림함에 교육 안내가 발송되었습니다!`, 'success');
      }
    });

    // 신청·수료 명단 탭 이벤트
    container.querySelectorAll('[data-roster-sub]').forEach((b) => {
      b.addEventListener('click', () => {
        rosterSubTab = b.dataset.rosterSub;
        renderAdminCourses(container);
      });
    });

    container.querySelectorAll('[data-manual-complete]').forEach((b) => {
      b.addEventListener('click', () => {
        const empId = b.dataset.manualComplete;
        const reasonInput = container.querySelector(`[data-manual-reason="${empId}"]`);
        const reason = reasonInput ? reasonInput.value : '현장 출석 확인 후 관리자 수동 보정';
        const res = Store.manualCompleteAttendance(course.id, empId, reason);
        showToast(res.message, res.ok ? 'success' : 'warning');
      });
    });

    container.querySelector('#btn-dl-course-roster')?.addEventListener('click', () => {
      let rows = [];
      if (rosterSubTab === 'enrolled') {
        rows = [['연번', '소속기관', '실국', '부서', '직급', '이름', '신청경로', '신청일시']];
        summary.enrollList.forEach((en, i) => {
          const e = Store.getEmployeeById(en.employeeId);
          if (e) rows.push([i + 1, e.org, e.bureau, e.dept, e.rank, e.name, en.channel, en.enrolledAt]);
        });
      } else if (rosterSubTab === 'completed') {
        rows = [['연번', '소속기관', '실국', '부서', '직급', '이름', '인증방식', '인증시각', '수동보정사유']];
        summary.attendList.forEach((at, i) => {
          const e = Store.getEmployeeById(at.employeeId);
          if (e) rows.push([i + 1, e.org, e.bureau, e.dept, e.rank, e.name, at.method, at.checkedAt, at.manualReason || '']);
        });
      } else if (rosterSubTab === 'absent') {
        rows = [['연번', '소속기관', '실국', '부서', '직급', '이름', '신청일시']];
        summary.absentAfterApplyList.forEach(({ enrollment, emp }, i) => {
          rows.push([i + 1, emp.org, emp.bureau, emp.dept, emp.rank, emp.name, enrollment.enrolledAt]);
        });
      } else {
        rows = [['연번', '소속기관', '실국', '부서', '직급', '이름']];
        summary.unappliedList.forEach((e, i) => rows.push([i + 1, e.org, e.bureau, e.dept, e.rank, e.name]));
      }
      downloadExcel(`AI360_${course.id}_${rosterSubTab}_목록.xlsx`, '명단', rows);
      showToast('목록 엑셀 파일이 다운로드되었습니다.', 'success');
    });

    // 결과보고서 탭 이벤트
    const getReportPatch = () => ({
      title: container.querySelector('#rep-title')?.value || docBundle.report.title,
      achievements: container.querySelector('#rep-ach')?.value || docBundle.report.achievements,
      implications: container.querySelector('#rep-imp')?.value || docBundle.report.implications,
      futurePlan: container.querySelector('#rep-fut')?.value || docBundle.report.futurePlan,
      photos: docBundle.report.photos.slice(0, 4)
    });

    container.querySelector('#btn-save-report')?.addEventListener('click', () => {
      Store.saveReportDoc(course.id, getReportPatch(), false);
      showToast('결과보고서 내용이 저장되었습니다.', 'success');
    });

    container.querySelector('#btn-complete-report')?.addEventListener('click', () => {
      Store.saveReportDoc(course.id, getReportPatch(), true);
      showToast('결과보고 완료 확정! 교육 전주기가 마감되었습니다.', 'success');
    });

    container.querySelector('#btn-print-report')?.addEventListener('click', () => {
      Store.saveReportDoc(course.id, getReportPatch(), false);
      const freshSummary = Store.getCourseSummary(course.id);
      window.AI360App.printA4Document(buildOfficialReportHTML(freshSummary));
    });

    container.querySelector('#rep-photo-input')?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const remain = 4 - docBundle.report.photos.length;
      const toRead = files.slice(0, remain);
      let loaded = 0;
      const nextPhotos = docBundle.report.photos.slice();
      toRead.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          nextPhotos.push(reader.result);
          loaded++;
          if (loaded === toRead.length) {
            Store.saveReportDoc(course.id, Object.assign(getReportPatch(), { photos: nextPhotos }), false);
            showToast(`현장 사진 ${loaded}장이 결과보고서에 자동 배치되었습니다.`, 'success');
          }
        };
        reader.readAsDataURL(file);
      });
    });

    container.querySelector('#btn-add-sample-photo')?.addEventListener('click', () => {
      if (docBundle.report.photos.length >= 4) {
        showToast('현장 사진은 최대 4장까지 첨부 가능합니다.', 'warning');
        return;
      }
      const nextPhotos = docBundle.report.photos.concat([
        createSamplePhotoDataURL(docBundle.report.photos.length + 1, course.title, course.place)
      ]);
      Store.saveReportDoc(course.id, Object.assign(getReportPatch(), { photos: nextPhotos }), false);
      showToast('샘플 현장 일러스트 이미지가 추가되었습니다.', 'info');
    });

    container.querySelectorAll('[data-del-photo]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.delPhoto);
        const nextPhotos = docBundle.report.photos.filter((_, i) => i !== idx);
        Store.saveReportDoc(course.id, Object.assign(getReportPatch(), { photos: nextPhotos }), false);
      });
    });
  }

  /* =========================================================================
   * 신규 집합교육 등록 모달 (한 화면 입력 -> 등록 즉시 QR·계획서·안내문 생성!)
   * ========================================================================= */
  function openCourseRegisterModal() {
    const db = Store.getDB();
    const html = `
      <div class="modal-header">
        <div>
          <span class="section-eyebrow">한 화면 입력 → 전주기 산출물 자동 생성</span>
          <h3>신규 집합교육 과정 등록</h3>
        </div>
        <div class="btn-row">
          <button type="button" id="btn-autofill-course" class="btn btn-xs btn-outline">✨ 시연용 샘플값 자동 입력</button>
          <button type="button" class="modal-close-btn" data-close-modal="1">✕</button>
        </div>
      </div>
      <form id="course-register-form" class="modal-body form-grid-2">
        <div class="col-span-2">
          <label class="form-label">교육명 *</label>
          <input name="title" required class="form-input" placeholder="예: 현업 보고서 자동화를 위한 생성형 AI·프롬프트 실전 과정">
        </div>
        <div class="col-span-2">
          <label class="form-label">교육 목적 (2~3줄) *</label>
          <textarea name="purpose" required rows="2" class="form-textarea" placeholder="정책 보고서 초안 작성 및 통계 자료 요약 실습을 통해 반복 행정업무 시간을 단축한다."></textarea>
        </div>
        <div>
          <label class="form-label">주제 (10대 교육 분류) *</label>
          <select name="topic" class="form-select">
            ${TOPICS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">교육 대상 *</label>
          <select name="targetType" id="reg-target-type" class="form-select">
            <option value="전직원">전직원</option>
            <option value="간부(과장급 이상)">간부(과장급 이상)</option>
            <option value="리더(팀장·서기관급)">리더(팀장·서기관급)</option>
            <option value="실무자(사무관·주무관)">실무자(사무관·주무관)</option>
            <option value="특정 기관·실국·부서 지정">특정 기관·실국·부서 지정</option>
          </select>
        </div>

        <div id="reg-specific-org-wrap" class="col-span-2 hidden-box">
          <div class="form-grid-3">
            <div>
              <label class="form-label">지정 소속기관</label>
              <select name="targetOrg" id="reg-org-sel" class="form-select">
                ${db.orgs.map((o) => `<option value="${esc(o.name)}">${esc(o.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">지정 실·국 (선택)</label>
              <input name="targetBureau" class="form-input" placeholder="전체 실·국 (비워두면 기관 전체)">
            </div>
            <div>
              <label class="form-label">지정 부서 (선택)</label>
              <input name="targetDept" class="form-input" placeholder="전체 부서">
            </div>
          </div>
        </div>

        <div>
          <label class="form-label">초빙 강사명 *</label>
          <input name="instructorName" required class="form-input" placeholder="예: 이지훈">
        </div>
        <div>
          <label class="form-label">강사 소속 · 직위 *</label>
          <input name="instructorOrg" required class="form-input" placeholder="예: 한국지능정보사회진흥원 수석연구원">
        </div>

        <div>
          <label class="form-label">교육 일자 *</label>
          <input type="date" name="date" value="2026-11-27" required class="form-input">
        </div>
        <div>
          <label class="form-label">시작 ~ 종료 시각 (이수시간 자동 계산) *</label>
          <div class="time-calc-row">
            <input type="time" name="startTime" id="reg-start" value="13:30" required class="form-input">
            <span>~</span>
            <input type="time" name="endTime" id="reg-end" value="17:30" required class="form-input">
            <span id="reg-hours-badge" class="hours-auto-badge">자동 계산: 4시간</span>
          </div>
        </div>

        <div>
          <label class="form-label">교육 장소 *</label>
          <input name="place" required class="form-input" value="세종청사 13동 대회의실">
        </div>
        <div>
          <label class="form-label">정원(명) *</label>
          <input type="number" name="capacity" value="60" min="5" max="1000" required class="form-input">
        </div>

        <div>
          <label class="form-label">신청 시작일 ~ 마감일 *</label>
          <div class="time-calc-row">
            <input type="date" name="applyStart" value="2026-11-02" required class="form-input">
            <span>~</span>
            <input type="date" name="applyEnd" value="2026-11-24" required class="form-input">
          </div>
        </div>
        <div>
          <label class="form-label">필수교육 여부 &amp; 수료 기준</label>
          <div class="time-calc-row">
            <select name="required" class="form-select" style="max-width:140px">
              <option value="no">선택교육 (아니오)</option>
              <option value="yes">필수교육 (예)</option>
            </select>
            <input name="completionRule" class="form-input" value="현장 QR 출석 인증">
          </div>
        </div>

        <div class="col-span-2 modal-footer-bar">
          <button type="button" class="btn btn-ghost" data-close-modal="1">취소</button>
          <button type="submit" class="btn btn-primary btn-lg">교육 등록 및 QR·계획서·안내문 즉시 생성</button>
        </div>
      </form>
    `;

    const modalEl = window.AI360App.openModal(html, 'modal-lg');

    const updateHours = () => {
      const st = modalEl.querySelector('#reg-start').value;
      const et = modalEl.querySelector('#reg-end').value;
      const h = calcDurationHours(st, et);
      modalEl.querySelector('#reg-hours-badge').textContent = `자동 계산: ${h}시간`;
    };
    modalEl.querySelector('#reg-start').addEventListener('change', updateHours);
    modalEl.querySelector('#reg-end').addEventListener('change', updateHours);

    modalEl.querySelector('#reg-target-type').addEventListener('change', (e) => {
      const box = modalEl.querySelector('#reg-specific-org-wrap');
      box.style.display = e.target.value === '특정 기관·실국·부서 지정' ? 'block' : 'none';
    });

    modalEl.querySelector('#btn-autofill-course').addEventListener('click', () => {
      const f = modalEl.querySelector('#course-register-form');
      f.elements.title.value = '행정 생산성 2배 향상! 생성형 AI 기안·검토보고서 실전 특강';
      f.elements.purpose.value = '산업·통상 현안 검토보고서 및 보도자료 초안 작성 시 생성형 AI와 구조화 프롬프트를 안전하게 활용하여 반복 행정 시간을 단축한다.';
      f.elements.topic.value = '프롬프트 엔지니어링';
      f.elements.targetType.value = '전직원';
      f.elements.instructorName.value = '안성민';
      f.elements.instructorOrg.value = '공공지능행정혁신센터 수석교수';
      f.elements.place.value = '정부세종청사 13동 대회의실';
      f.elements.capacity.value = '80';
      f.elements.required.value = 'yes';
      updateHours();
      showToast('시연용 샘플 입력값이 채워졌습니다.', 'info');
    });

    modalEl.querySelector('#course-register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const created = Store.registerCourse({
        title: fd.get('title'),
        purpose: fd.get('purpose'),
        topic: fd.get('topic'),
        targetType: fd.get('targetType'),
        targetOrg: fd.get('targetOrg'),
        targetBureau: fd.get('targetBureau'),
        targetDept: fd.get('targetDept'),
        instructorName: fd.get('instructorName'),
        instructorOrg: fd.get('instructorOrg'),
        date: fd.get('date'),
        startTime: fd.get('startTime'),
        endTime: fd.get('endTime'),
        place: fd.get('place'),
        capacity: Number(fd.get('capacity')),
        applyStart: fd.get('applyStart'),
        applyEnd: fd.get('applyEnd'),
        required: fd.get('required') === 'yes',
        completionRule: fd.get('completionRule')
      });
      adminCourseFilter = 'ALL';
      activeWorkspaceTab = 'qr';
      window.AI360App.closeModal();
      Store.setActiveMenu('admin-courses', { selectedCourseId: created.id });
      showToast(`「${created.title}」 등록 완료! QR 3종·계획서·안내문이 자동 생성되었습니다.`, 'success');
    });
  }

  window.AI360AdminViews = {
    renderAdminMenu,
    openCourseRegisterModal
  };
})();


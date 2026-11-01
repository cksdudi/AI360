/**
 * AI 360 — 메인 애플리케이션 컨트롤러 (모바일 반응형 웹앱 지원 강화)
 * 상단 글로벌 바(시연 사용자 5단계 전환, 나의 화면 ↔ 관리 화면 전환, 샘플 데이터 초기화, 발표 시연 가이드),
 * 모바일 반응형 사이드 드로어, 모바일 하단 탭바(Bottom Navigation Bar),
 * 모바일 QR 스캔 시뮬레이터 모달, 구성원 드릴다운 모달, A4 공문서 인쇄 제어
 */
(function () {
  'use strict';

  const { esc, showToast } = window.AI360Utils;
  const { SATISFACTION_ITEMS, ASSESSMENT_ITEMS, getGradeInfo, formatTargetSummary } = window.AI360Seed;
  const Store = window.AI360Store;
  const Charts = window.AI360Charts;

  const MENUS = {
    personal: [
      { id: 'student-dashboard', icon: '🏠', label: '나의 AI 대시보드' },
      { id: 'student-courses', icon: '📚', label: '교육 안내 · 신청' },
      { id: 'student-qr', icon: '📱', label: 'QR 출석 · 만족도' },
      { id: 'student-assessment', icon: '🧭', label: 'AI 역량 진단' },
      { id: 'student-growth', icon: '📈', label: '나의 AI 성장 기록' }
    ],
    manager: [
      { id: 'mgr-overview', icon: '📊', label: '우리 단위 통합 현황' },
      { id: 'mgr-members', icon: '👥', label: '소속 구성원 목록' },
      { id: 'mgr-reminders', icon: '📣', label: '미이수 · 미응답 독려' }
    ],
    admin: [
      { id: 'admin-dashboard', icon: '🏛️', label: '1. 통합 대시보드' },
      { id: 'admin-courses', icon: '⚡', label: '2. 집합교육 관리 (자동화)' },
      { id: 'admin-assessments', icon: '🧭', label: '3. 역량 진단 회차 관리' },
      { id: 'admin-roster', icon: '🗂️', label: '4. 명단 관리 (엑셀)' },
      { id: 'admin-managers', icon: '🛡️', label: '5. 담당자 지정' },
      { id: 'admin-analytics', icon: '📑', label: '6. 성과 분석 · 보고' }
    ]
  };

  // 모바일 사이드바 드로어 제어 함수
  function openSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const btn = document.getElementById('mobile-menu-btn');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    if (btn) btn.classList.add('active');
    document.body.classList.add('sidebar-locked');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const btn = document.getElementById('mobile-menu-btn');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (btn) btn.classList.remove('active');
    document.body.classList.remove('sidebar-locked');
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function getMenuListForSession(session) {
    if (session.role === 'student' || session.viewMode === 'personal') {
      return MENUS.personal;
    }
    if (session.role === 'admin') {
      return MENUS.admin;
    }
    return MENUS.manager;
  }

  function renderApp() {
    const db = Store.getDB();
    const session = Store.getSession();
    const emp = Store.getEmployeeById(session.employeeId) || db.employees[0];
    const roleMeta = Store.ROLE_META[session.role];
    const unitInfo = Store.getManagerUnitForEmployee(session.role, emp.id);

    renderHeaderControls(db, session, emp, roleMeta, unitInfo);
    renderSidebar(session, emp, roleMeta, unitInfo);
    renderBottomNav(session);

    const mainEl = document.getElementById('app-main-view');
    if (!mainEl) return;

    if (session.role === 'student' || session.viewMode === 'personal') {
      window.AI360StudentViews.renderStudentMenu(session.activeMenu, mainEl);
    } else if (session.role === 'admin') {
      window.AI360AdminViews.renderAdminMenu(session.activeMenu, mainEl);
    } else {
      window.AI360ManagerViews.renderManagerMenu(session.activeMenu, mainEl);
    }
  }

  function renderHeaderControls(db, session, emp, roleMeta, unitInfo) {
    const switcherMount = document.getElementById('header-controls-mount');
    if (!switcherMount) return;

    // 현재 선택한 역할에서 빠르게 바꿔볼 수 있는 세부 사용자 옵션 구성
    let personaOptions = [];
    if (session.role === 'student') {
      const presets = ['EMP-0085', 'EMP-0086', 'EMP-0002', 'EMP-0145', 'EMP-0780', 'EMP-0999'];
      personaOptions = presets.map((id) => Store.getEmployeeById(id)).filter(Boolean).map((e) => ({
        id: e.id,
        label: `${e.name} ${e.rank} (${e.org} · ${e.dept})${e.id === 'EMP-0086' ? ' [진단미응답]' : ''}`
      }));
      if (!personaOptions.some((p) => p.id === emp.id)) {
        personaOptions.unshift({ id: emp.id, label: `${emp.name} ${emp.rank} (${emp.org} · ${emp.dept})` });
      }
    } else if (session.role === 'admin') {
      personaOptions = [{ id: emp.id, label: `${emp.name} ${emp.rank} (전 기관 교육 총괄)` }];
    } else {
      personaOptions = db.org_managers
        .filter((m) => m.level === session.role && m.employeeId)
        .slice(0, 35)
        .map((m) => {
          const e = Store.getEmployeeById(m.employeeId);
          return e ? { id: e.id, label: `[${m.unitLabel}] ${e.name} ${e.rank}` } : null;
        })
        .filter(Boolean);
    }

    switcherMount.innerHTML = `
      <!-- 시연용 샘플 데이터 상시 배지 (모바일에서는 간소화) -->
      <div class="sample-global-badge" title="모든 수치는 고정 시드 기반 가상 샘플 데이터입니다.">
        <span class="pulse-dot"></span> <span class="badge-txt">시연용 샘플</span>
      </div>

      <!-- 5단계 시연 사용자 전환 바 -->
      <div class="role-switcher-group">
        <span class="switcher-label">시연 전환:</span>
        <select id="global-role-select" class="hdr-select role-sel" aria-label="시연 권한 단계 선택">
          <option value="student" ${session.role === 'student' ? 'selected' : ''}>A. 교육생 (본인)</option>
          <option value="dept" ${session.role === 'dept' ? 'selected' : ''}>B. 부서 담당자 (부서)</option>
          <option value="bureau" ${session.role === 'bureau' ? 'selected' : ''}>C. 실·국 담당자 (실·국)</option>
          <option value="org" ${session.role === 'org' ? 'selected' : ''}>D. 소속기관 담당자 (기관)</option>
          <option value="admin" ${session.role === 'admin' ? 'selected' : ''}>E. 총괄 관리자 (전체)</option>
        </select>

        <select id="global-persona-select" class="hdr-select persona-sel" aria-label="세부 시연 인물 선택">
          ${personaOptions.map((p) => `<option value="${esc(p.id)}" ${p.id === emp.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select>
      </div>

      <!-- 담당자일 때 「나의 화면 ↔ 관리 화면」 전환 토글 (PDF p.2 필수 요건) -->
      ${session.role !== 'student' ? `
        <div class="mode-toggle-pill" title="담당자도 본인은 교육생이므로 나의 화면과 관리 화면을 전환해 사용합니다.">
          <button class="mode-btn ${session.viewMode === 'manage' ? 'active' : ''}" data-view-mode="manage">관리 화면</button>
          <button class="mode-btn ${session.viewMode === 'personal' ? 'active' : ''}" data-view-mode="personal">나의 화면</button>
        </div>
      ` : ''}

      <div class="hdr-btn-group">
        <button id="btn-open-demo-guide" class="btn btn-sm btn-guide" title="발표·시연 가이드">🎯 <span class="hdr-btn-text">시연 가이드</span></button>
        <button id="btn-reset-sample" class="btn btn-sm btn-reset" title="모든 샘플 데이터를 초기 시드 상태로 되돌립니다.">↺ <span class="hdr-btn-text">초기화</span></button>
      </div>
    `;

    switcherMount.querySelector('#global-role-select')?.addEventListener('change', (e) => {
      Store.switchRole(e.target.value);
      const nextRoleMeta = Store.ROLE_META[e.target.value];
      showToast(`시연 권한 전환: ${nextRoleMeta.badge}`, 'info');
    });

    switcherMount.querySelector('#global-persona-select')?.addEventListener('change', (e) => {
      Store.switchRole(session.role, e.target.value);
      const nextEmp = Store.getEmployeeById(e.target.value);
      if (nextEmp) showToast(`${nextEmp.name} ${nextEmp.rank}(${nextEmp.dept}) 화면으로 전환되었습니다.`, 'info');
    });

    switcherMount.querySelectorAll('[data-view-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        Store.setViewMode(b.dataset.viewMode);
        showToast(b.dataset.viewMode === 'personal' ? '담당자 본인의 「나의 화면(교육생)」으로 전환했습니다.' : '조직 「관리 화면」으로 전환했습니다.', 'info');
      });
    });

    switcherMount.querySelector('#btn-open-demo-guide')?.addEventListener('click', openDemoGuideModal);

    switcherMount.querySelector('#btn-reset-sample')?.addEventListener('click', () => {
      if (!confirm('시연 중 변경한 모든 데이터(신규 교육, 신청·출석, 진단, 명단 변경 등)를 초기 샘플 상태로 되돌리시겠습니까?')) return;
      Store.resetDatabase();
      showToast('모든 시연용 샘플 데이터가 초기 상태로 복원되었습니다.', 'success');
    });
  }

  function renderSidebar(session, emp, roleMeta, unitInfo) {
    const navEl = document.getElementById('app-sidebar');
    if (!navEl) return;
    const menuItems = getMenuListForSession(session);
    const isPersonalOnMgr = session.role !== 'student' && session.viewMode === 'personal';

    navEl.innerHTML = `
      <!-- 모바일 드로어 전용 상단 닫기 바 -->
      <div class="sidebar-drawer-header">
        <div class="sdh-title">
          <span class="brand-emblem-sm">360°</span>
          <strong>메뉴 &amp; 권한 설정</strong>
        </div>
        <button id="btn-sidebar-close" class="sidebar-close-btn" aria-label="메뉴 닫기">✕</button>
      </div>

      <div class="sidebar-profile-card">
        <div class="sp-role-row">
          <span class="sp-role-badge role-${esc(session.role)}">${esc(roleMeta.badge)}</span>
          ${unitInfo.managerRecord?.autoAssigned ? '<span class="sp-auto-tag">샘플 자동지정</span>' : ''}
        </div>
        <div class="sp-name">${esc(emp.name)} <span>${esc(emp.rank)}</span></div>
        <div class="sp-org">${esc(emp.org)} &gt; ${esc(emp.bureau)} &gt; ${esc(emp.dept)}</div>
        <div class="sp-scope">
          <strong>조회 범위:</strong>
          ${isPersonalOnMgr ? '본인 (나의 화면 전환 중)' : esc(unitInfo.label)}
        </div>
      </div>

      <!-- 모바일에서 빠른 역할 전환 편의를 위한 인-사이드바 퀵 스위처 (모바일 뷰 전용) -->
      <div class="sidebar-mobile-quick-switch">
        <div class="smq-label">⚡ 빠른 권한 단계 전환:</div>
        <div class="smq-role-grid">
          <button class="smq-chip ${session.role === 'student' ? 'active' : ''}" data-smq-role="student">교육생</button>
          <button class="smq-chip ${session.role === 'dept' ? 'active' : ''}" data-smq-role="dept">부서</button>
          <button class="smq-chip ${session.role === 'bureau' ? 'active' : ''}" data-smq-role="bureau">실·국</button>
          <button class="smq-chip ${session.role === 'org' ? 'active' : ''}" data-smq-role="org">기관</button>
          <button class="smq-chip ${session.role === 'admin' ? 'active' : ''}" data-smq-role="admin">총괄관리자</button>
        </div>
        ${session.role !== 'student' ? `
          <div class="smq-mode-toggle mt-8">
            <button class="btn btn-xs ${session.viewMode === 'manage' ? 'btn-primary' : 'btn-outline'} btn-block" data-smq-mode="manage">🏢 관리 화면 보기</button>
            <button class="btn btn-xs ${session.viewMode === 'personal' ? 'btn-primary' : 'btn-outline'} btn-block" data-smq-mode="personal">👤 나의 화면(개인) 보기</button>
          </div>
        ` : ''}
      </div>

      <div class="sidebar-menu-label">
        ${isPersonalOnMgr ? '개인 학습 메뉴 (나의 화면)' : session.role === 'student' ? '교육생 메뉴' : session.role === 'admin' ? '총괄 관리자 전체 메뉴' : '조직 담당자 메뉴'}
      </div>

      <nav class="sidebar-nav-list">
        ${menuItems.map((m) => `
          <button class="side-nav-btn ${session.activeMenu === m.id ? 'active' : ''}" data-side-menu="${esc(m.id)}">
            <span class="nav-ico">${m.icon}</span>
            <span class="nav-label-txt">${esc(m.label)}</span>
          </button>
        `).join('')}
      </nav>

      <div class="sidebar-slogan-box">
        <div class="slogan-kicker">AI Competency 360</div>
        <div class="slogan-main">“AI 역량의 시작부터 성장까지, AI 360°”</div>
        <div class="slogan-sub">※ 본 시스템의 모든 인원(1,000명)과 실적 수치는 보고·시연용 가상 샘플입니다.</div>
      </div>
    `;

    // 메뉴 클릭 이벤트
    navEl.querySelectorAll('[data-side-menu]').forEach((b) => {
      b.addEventListener('click', () => {
        Store.setActiveMenu(b.dataset.sideMenu);
        closeSidebar();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // 닫기 버튼 이벤트
    navEl.querySelector('#btn-sidebar-close')?.addEventListener('click', closeSidebar);

    // 모바일 퀵 스위처 이벤트
    navEl.querySelectorAll('[data-smq-role]').forEach((b) => {
      b.addEventListener('click', () => {
        Store.switchRole(b.dataset.smqRole);
        closeSidebar();
      });
    });

    navEl.querySelectorAll('[data-smq-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        Store.setViewMode(b.dataset.smqMode);
        closeSidebar();
      });
    });
  }

  /**
   * 모바일 하단 네이티브 스타일 탭바 동적 렌더링
   */
  function renderBottomNav(session) {
    const bottomNav = document.getElementById('app-bottom-nav');
    if (!bottomNav) return;

    let tabs = [];
    const isPersonal = session.role === 'student' || session.viewMode === 'personal';

    if (isPersonal) {
      tabs = [
        { id: 'student-dashboard', icon: '🏠', label: '홈' },
        { id: 'student-courses', icon: '📚', label: '교육' },
        { id: 'student-qr', icon: '📱', label: 'QR인증' },
        { id: 'student-assessment', icon: '🧭', label: '진단' },
        { id: 'menu-more', icon: '☰', label: '전체' }
      ];
    } else if (session.role === 'admin') {
      tabs = [
        { id: 'admin-dashboard', icon: '🏛️', label: '대시보드' },
        { id: 'admin-courses', icon: '⚡', label: '교육관리' },
        { id: 'admin-assessments', icon: '🧭', label: '진단회차' },
        { id: 'admin-analytics', icon: '📑', label: '성과분석' },
        { id: 'menu-more', icon: '☰', label: '전체' }
      ];
    } else {
      // manager
      tabs = [
        { id: 'mgr-overview', icon: '📊', label: '현황' },
        { id: 'mgr-members', icon: '👥', label: '구성원' },
        { id: 'mgr-reminders', icon: '📣', label: '독려' },
        { id: 'toggle-personal', icon: '👤', label: '나의화면' },
        { id: 'menu-more', icon: '☰', label: '전체' }
      ];
    }

    bottomNav.innerHTML = `
      <div class="bottom-nav-inner">
        ${tabs.map((t) => {
          const isActive = (session.activeMenu === t.id);
          return `
            <button type="button" class="bottom-nav-tab ${isActive ? 'active' : ''}" data-bottom-tab="${esc(t.id)}">
              <span class="bnav-icon">${t.icon}</span>
              <span class="bnav-label">${esc(t.label)}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;

    bottomNav.querySelectorAll('[data-bottom-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.bottomTab;
        if (tabId === 'menu-more') {
          toggleSidebar();
        } else if (tabId === 'toggle-personal') {
          Store.setViewMode('personal');
          showToast('나의 화면(교육생)으로 전환했습니다.', 'info');
        } else {
          Store.setActiveMenu(tabId);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  /* =========================================================================
   * 공통 모달 & 모바일 QR 스캔 시뮬레이터 (신청 / 출석 / 만족도 모바일 화면)
   * ========================================================================= */
  function openModal(innerHTML, sizeClass = '') {
    let backdrop = document.getElementById('global-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'global-modal-backdrop';
      backdrop.className = 'modal-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML = `<div class="modal-dialog ${sizeClass}" role="dialog" aria-modal="true">${innerHTML}</div>`;
    backdrop.classList.add('open');
    document.body.classList.add('modal-open');

    backdrop.onclick = (e) => {
      if (e.target === backdrop || e.target.closest('[data-close-modal]')) {
        closeModal();
      }
    };
    return backdrop;
  }

  function closeModal() {
    const backdrop = document.getElementById('global-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.innerHTML = '';
      document.body.classList.remove('modal-open');
    }
  }

  /**
   * 휴대폰 없이도 QR을 찍은 것처럼 동작하는 모바일 최적화 스캔 시뮬레이터
   */
  function openQRSimulatorModal(courseId, qrType = 'apply', forcedActorId = null) {
    const db = Store.getDB();
    const session = Store.getSession();
    const course = db.courses.find((c) => c.id === courseId);
    if (!course) {
      showToast('해당 교육 과정을 찾을 수 없습니다.', 'warning');
      return;
    }

    const actorId = forcedActorId || session.employeeId;
    const actor = Store.getEmployeeById(actorId) || db.employees[0];

    const isEnrolled = db.enrollments.some((e) => e.courseId === courseId && e.employeeId === actor.id && e.status === 'active');
    const attRec = db.attendances.find((a) => a.courseId === courseId && a.employeeId === actor.id);
    const isCompleted = db.completions.some((c) => c.courseId === courseId && c.employeeId === actor.id);
    const satRec = db.satisfaction_responses.find((s) => s.courseId === courseId && s.employeeId === actor.id);

    const demoCandidates = [
      Store.getEmployeeById(session.employeeId),
      Store.getEmployeeById('EMP-0085'),
      Store.getEmployeeById('EMP-0060'),
      Store.getEmployeeById('EMP-0002')
    ].filter((v, idx, arr) => v && arr.findIndex((x) => x && x.id === v.id) === idx);

    let bodyContent = '';
    if (qrType === 'apply') {
      bodyContent = `
        <div class="qr-sim-tag blue">📲 신청 QR 스캔 화면 (모바일 최적화)</div>
        <h3 class="qr-sim-title">${esc(course.title)}</h3>
        <div class="qr-sim-info">
          <div><strong>주제:</strong> ${esc(course.topic)} ${course.required ? '(필수)' : '(선택)'}</div>
          <div><strong>일시:</strong> ${esc(course.date)} ${esc(course.startTime)}~${esc(course.endTime)} (${course.hours}시간)</div>
          <div><strong>장소:</strong> ${esc(course.place)}</div>
          <div><strong>대상:</strong> ${esc(formatTargetSummary(course))}</div>
        </div>
        ${isEnrolled ? `
          <div class="qr-done-banner">
            <div class="qr-done-icon">✓</div>
            <strong>이미 참가 신청이 완료되었습니다!</strong>
            <p>교육 당일 현장에 게시된 「출석 QR」을 스캔해 주세요.</p>
          </div>
          <button class="btn btn-sm btn-outline btn-block mt-8" data-switch-qr-type="attend">출석 QR 화면으로 바로 전환 →</button>
        ` : `
          <button id="qr-modal-apply-btn" class="btn btn-primary btn-lg btn-block">원터치 교육 참가 신청하기</button>
        `}
      `;
    } else if (qrType === 'attend') {
      bodyContent = `
        <div class="qr-sim-tag green">📍 현장 출석(장소 인증) QR 스캔 화면</div>
        <h3 class="qr-sim-title">${esc(course.title)}</h3>
        <div class="qr-sim-info">
          <div><strong>교육장소:</strong> ${esc(course.place)}</div>
          <div><strong>인정시간:</strong> ${course.hours}시간 (출석 즉시 수료 처리)</div>
          <div><strong>사전신청 상태:</strong> ${isEnrolled ? '<span class="text-success font-bold">사전신청 확인됨</span>' : `<span class="text-warning font-bold">미신청 (${course.allowWalkIn ? '현장 신청 후 출석 허용' : '현장 출석 차단'})</span>`}</div>
        </div>
        ${attRec ? `
          <div class="qr-done-banner">
            <div class="qr-done-icon">✓</div>
            <strong>출석 및 수료 인증 완료!</strong>
            <p>「${esc(course.title)}」 출석이 인증되었습니다.<br>수료 처리되었습니다.</p>
            <small>인증 시각: ${esc(attRec.checkedAt)} (${esc(attRec.method)})</small>
          </div>
          <button class="btn btn-sm btn-accent btn-block mt-8" data-switch-qr-type="satisfaction">이어서 만족도 QR 응답하기 →</button>
        ` : `
          <button id="qr-modal-attend-btn" class="btn btn-primary btn-lg btn-block">📍 현장 출석 · 수료 인증하기</button>
        `}
      `;
    } else {
      bodyContent = `
        <div class="qr-sim-tag indigo">📝 만족도 조사 QR 스캔 화면 (5문항)</div>
        <h3 class="qr-sim-title">${esc(course.title)}</h3>
        ${!isCompleted ? `
          <div class="qr-lock-banner">
            <strong>🔒 수료자만 만족도 응답 가능</strong>
            <p>출석·수료 처리된 직원만 응답할 수 있습니다 (1인 1회).</p>
            <button class="btn btn-xs btn-primary mt-8" data-switch-qr-type="attend">먼저 출석 QR 인증하기</button>
          </div>
        ` : satRec ? `
          <div class="qr-done-banner">
            <div class="qr-done-icon">★</div>
            <strong>만족도 조사 응답 완료 (1인 1회)</strong>
            <p>응답해 주신 점수가 결과보고서에 실시간 반영되었습니다.</p>
            <small>제출 시각: ${esc(satRec.submittedAt)}</small>
          </div>
        ` : `
          <form id="qr-modal-sat-form" class="sat-form compact">
            ${SATISFACTION_ITEMS.map((it) => `
              <div class="sat-q-block">
                <label class="sat-q-label"><strong>${esc(it.id)}.</strong> ${esc(it.text)}</label>
                <div class="rating-5-group">
                  ${[1, 2, 3, 4, 5].map((sc) => `
                    <label class="rating-pill">
                      <input type="radio" name="${esc(it.id)}" value="${sc}" ${sc === 5 ? 'checked' : ''}>
                      <span>${sc}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            `).join('')}
            <div class="sat-q-block">
              <textarea name="comment" rows="2" class="form-textarea" placeholder="좋았던 점, 개선할 점 (선택)">현장 실습 구성이 체계적이어서 실무 보고서 작성에 큰 도움이 되었습니다.</textarea>
            </div>
            <button type="submit" class="btn btn-primary btn-block">만족도 응답 제출하기</button>
          </form>
        `}
      `;
    }

    const html = `
      <div class="qr-phone-modal-shell">
        <div class="phone-top-bar">
          <span>📱 QR 스캔 시뮬레이터 (모바일)</span>
          <button type="button" class="modal-close-btn light" data-close-modal="1">✕</button>
        </div>

        <div class="phone-actor-switcher">
          <label>스캔 사용자:</label>
          <select id="qr-sim-actor-sel" class="form-select select-xs">
            ${demoCandidates.map((c) => `
              <option value="${esc(c.id)}" ${c.id === actor.id ? 'selected' : ''}>
                ${esc(c.name)} ${esc(c.rank)} (${esc(c.dept)})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="phone-type-tabs">
          <button class="${qrType === 'apply' ? 'active' : ''}" data-switch-qr-type="apply">신청 QR</button>
          <button class="${qrType === 'attend' ? 'active' : ''}" data-switch-qr-type="attend">출석 QR</button>
          <button class="${qrType === 'satisfaction' ? 'active' : ''}" data-switch-qr-type="satisfaction">만족도 QR</button>
        </div>

        <div class="phone-screen-body">
          ${bodyContent}
        </div>
      </div>
    `;

    const modal = openModal(html, 'modal-phone');

    modal.querySelector('#qr-sim-actor-sel')?.addEventListener('change', (e) => {
      openQRSimulatorModal(courseId, qrType, e.target.value);
    });

    modal.querySelectorAll('[data-switch-qr-type]').forEach((b) => {
      b.addEventListener('click', () => {
        openQRSimulatorModal(courseId, b.dataset.switchQrType, actor.id);
      });
    });

    modal.querySelector('#qr-modal-apply-btn')?.addEventListener('click', () => {
      const res = Store.enrollCourse(courseId, actor.id, 'QR신청');
      showToast(res.message, res.ok ? 'success' : 'warning');
      openQRSimulatorModal(courseId, 'apply', actor.id);
    });

    modal.querySelector('#qr-modal-attend-btn')?.addEventListener('click', () => {
      const res = Store.checkInAttendanceQR(courseId, actor.id);
      showToast(res.message, res.ok ? 'success' : 'error');
      openQRSimulatorModal(courseId, 'attend', actor.id);
    });

    modal.querySelector('#qr-modal-sat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const scores = {};
      SATISFACTION_ITEMS.forEach((it) => { scores[it.id] = Number(fd.get(it.id) || 5); });
      const res = Store.submitSatisfaction(courseId, actor.id, scores, fd.get('comment'));
      showToast(res.message, res.ok ? 'success' : 'warning');
      openQRSimulatorModal(courseId, 'satisfaction', actor.id);
    });
  }

  /**
   * 개인 드릴다운 상세 모달 (구성원 클릭 시)
   */
  function openEmployeeDetailModal(empId) {
    const profile = Store.getEmployeeProfileSummary(empId);
    if (!profile) return;
    const { emp, latestAssessment } = profile;
    const db = Store.getDB();
    const gInfo = latestAssessment ? getGradeInfo(latestAssessment.totalScore) : { grade: '미진단', bg: '#f1f5f9', color: '#64748b' };

    const labels = ASSESSMENT_ITEMS.map((i) => i.domain);
    const series = latestAssessment ? [{
      name: `${emp.name} 역량 점수`,
      values: ASSESSMENT_ITEMS.map((i) => latestAssessment.domainScores[i.id] || 0),
      color: '#2563eb',
      fillOpacity: 0.22
    }] : [];

    const html = `
      <div class="modal-header">
        <div>
          <span class="section-eyebrow">구성원 개인 역량 · 이수 드릴다운</span>
          <h3>${esc(emp.name)} ${esc(emp.rank)} (${esc(emp.org)} &gt; ${esc(emp.bureau)} &gt; ${esc(emp.dept)})</h3>
        </div>
        <div class="btn-row">
          <button class="btn btn-xs btn-outline" id="btn-impersonate-emp">이 직원의 화면으로 전환</button>
          <button class="modal-close-btn" data-close-modal="1">✕</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="kpi-grid kpi-grid-4 mb-14">
          <div class="kpi-card">
            <div class="kpi-label">최근 역량 점수</div>
            <div class="kpi-value-row">
              <span class="kpi-value">${latestAssessment ? latestAssessment.totalScore + '점' : '미진단'}</span>
              <span class="grade-pill-sm" style="background:${gInfo.bg};color:${gInfo.color}">${esc(gInfo.grade)}</span>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">신청 / 수료 과정</div>
            <div class="kpi-value">${profile.myEnrollments.length} / ${profile.myCompletions.length}건</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">누적 이수시간</div>
            <div class="kpi-value">${profile.totalHours}시간</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">필수교육 이수</div>
            <div class="kpi-value ${profile.hasCompletedRequired ? 'text-success' : 'text-danger'}">${profile.hasCompletedRequired ? '이수 완료' : '미이수'}</div>
          </div>
        </div>

        <div class="grid-2-cols">
          <div class="chart-box center">
            ${latestAssessment ? Charts.renderRadarChartSVG(labels, series, 260) : '<div class="empty-hint">진단 응답 이력이 없습니다.</div>'}
          </div>
          <div>
            <h4 class="sub-heading">수료 집합교육 목록</h4>
            <div class="table-wrap" style="max-height:220px;overflow:auto">
              <table class="data-table compact">
                <thead><tr><th>일자</th><th>과정명</th><th>시간</th></tr></thead>
                <tbody>
                  ${profile.myCompletions.length === 0 ? '<tr><td colspan="3" class="text-center">수료 내역 없음</td></tr>' :
                    profile.myCompletions.map((cm) => {
                      const c = db.courses.find((x) => x.id === cm.courseId);
                      return `<tr><td>${esc(c ? c.date : '')}</td><td>${esc(c ? c.title : cm.courseId)}</td><td>${cm.hours}h</td></tr>`;
                    }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    const modal = openModal(html, 'modal-lg');
    modal.querySelector('#btn-impersonate-emp')?.addEventListener('click', () => {
      closeModal();
      Store.switchRole('student', emp.id);
      showToast(`${emp.name} ${emp.rank}(교육생) 시연 화면으로 전환되었습니다.`, 'info');
    });
  }

  /**
   * 발표·보고자용 원클릭 시연 시나리오 가이드 모달
   */
  function openDemoGuideModal() {
    const html = `
      <div class="modal-header">
        <div>
          <span class="section-eyebrow">발표자 · 보고자용 인터랙티브 시연 네비게이터</span>
          <h3>🎯 「AI 360」 핵심 시연 시나리오 (원클릭 이동)</h3>
        </div>
        <button class="modal-close-btn" data-close-modal="1">✕</button>
      </div>
      <div class="modal-body guide-steps-list">
        <div class="guide-step-card">
          <div class="gs-num">STEP 1</div>
          <div class="gs-body">
            <h4>[총괄 관리자] 교육 등록 → QR 3종 · 계획서 · 안내문 자동 생성</h4>
            <p>반복 행정업무(계획서 작성, 안내문 생성, 대상자 추출)를 1회 등록으로 자동화하는 기능을 시연합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step1">이동 →</button>
        </div>

        <div class="guide-step-card">
          <div class="gs-num">STEP 2</div>
          <div class="gs-body">
            <h4>[현장 QR 시뮬레이션] 신청 → 현장 출석·수료 인증 → 만족도 5문항 응답</h4>
            <p>휴대폰 없이도 당일 교육(CRS-008)의 출석 QR 스캔 시뮬레이션을 눌러 즉시 수료·만족도가 집계되는 흐름을 시연합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step2">QR 시뮬레이터 →</button>
        </div>

        <div class="guide-step-card">
          <div class="gs-num">STEP 3</div>
          <div class="gs-body">
            <h4>[총괄 관리자] 현장 사진 첨부 &amp; 결과보고서 A4 인쇄 / PDF 저장</h4>
            <p>집계된 신청·수료율과 만족도, 현장 사진(최대 4장)이 공문서 양식 결과보고서에 자동 배치되는 화면을 확인합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step3">결과보고서 →</button>
        </div>

        <div class="guide-step-card">
          <div class="gs-num">STEP 4</div>
          <div class="gs-body">
            <h4>[교육생 화면] 7문항 AI 역량 진단 → 강점/보완 분석 → 맞춤 교육 추천</h4>
            <p>교육생(박선하 사무관) 화면에서 7축 역량 레이더, 회차별 성장 그래프, 보완영역 기반 추천 과정을 확인합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step4">교육생 화면 →</button>
        </div>

        <div class="guide-step-card">
          <div class="gs-num">STEP 5</div>
          <div class="gs-body">
            <h4>[5단계 권한 비교] 소속기관 · 실·국 · 부서 담당자 조회 범위 및 독려</h4>
            <p>실·국 담당자(기획조정실 차태빈 과장)로 전환하여 하위 부서 비교 및 전체 평균선이 표시됨을 시연합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step5">실·국 담당자 →</button>
        </div>

        <div class="guide-step-card">
          <div class="gs-num">STEP 6</div>
          <div class="gs-body">
            <h4>[성과 보고] 교육 수료 전·후 역량 상승 입증 &amp; 기관장 1페이지 요약 인쇄</h4>
            <p>수료 과정 수에 따른 역량 점수 상승 효과를 데이터로 확인하고 기관장 보고용 1페이지 요약서를 출력합니다.</p>
          </div>
          <button class="btn btn-sm btn-primary" data-guide-act="step6">성과 보고서 →</button>
        </div>
      </div>
    `;

    const modal = openModal(html, 'modal-lg');
    modal.querySelectorAll('[data-guide-act]').forEach((b) => {
      b.addEventListener('click', () => {
        const act = b.dataset.guideAct;
        closeModal();
        if (act === 'step1') {
          Store.switchRole('admin');
          Store.setActiveMenu('admin-courses', { selectedCourseId: 'CRS-011' });
          window.AI360AdminViews.openCourseRegisterModal();
        } else if (act === 'step2') {
          Store.switchRole('admin');
          Store.setActiveMenu('admin-courses', { selectedCourseId: 'CRS-008' });
          openQRSimulatorModal('CRS-008', 'attend', 'EMP-0085');
        } else if (act === 'step3') {
          Store.switchRole('admin');
          Store.setActiveMenu('admin-courses', { selectedCourseId: 'CRS-007' });
          setTimeout(() => {
            document.querySelector('[data-ws-tab="report"]')?.click();
          }, 50);
        } else if (act === 'step4') {
          Store.switchRole('student', 'EMP-0085');
        } else if (act === 'step5') {
          Store.switchRole('bureau', 'EMP-0053');
        } else if (act === 'step6') {
          Store.switchRole('admin');
          Store.setActiveMenu('admin-analytics');
        }
      });
    });
  }

  /**
   * A4 공문서 전용 인쇄 컨테이너 출력 (window.print)
   */
  function printA4Document(sheetHTML) {
    let printRoot = document.getElementById('a4-print-root');
    if (!printRoot) {
      printRoot = document.createElement('div');
      printRoot.id = 'a4-print-root';
      document.body.appendChild(printRoot);
    }
    printRoot.innerHTML = sheetHTML;
    document.body.classList.add('printing-a4-doc');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-a4-doc');
      }, 400);
    }, 120);
  }

  function checkHashQRDeepLink() {
    const hash = location.hash || '';
    const m = hash.match(/^#qr=(apply|attend|satisfaction):(CRS-\d+)/);
    if (m) {
      openQRSimulatorModal(m[2], m[1]);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Store.subscribe(renderApp);
    renderApp();
    checkHashQRDeepLink();
    window.addEventListener('hashchange', checkHashQRDeepLink);

    // 모바일 햄버거 토글 버튼
    const menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', toggleSidebar);
    }

    // 모바일 사이드바 백드롭 클릭 시 닫기
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // 모바일 ESC 키 닫기 지원
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSidebar();
        closeModal();
      }
    });

    // 화면 크기 변경 시 (PC <-> 모바일 전환 시) 처리
    window.addEventListener('resize', () => {
      if (window.innerWidth > 920) {
        closeSidebar();
      }
    });
  });

  window.AI360App = {
    openModal,
    closeModal,
    openQRSimulatorModal,
    openEmployeeDetailModal,
    openDemoGuideModal,
    printA4Document,
    toggleSidebar,
    openSidebar,
    closeSidebar
  };
})();

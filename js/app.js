/**
 * AI 360 — 메인 애플리케이션 컨트롤러
 * 1. 상단 글로벌 바 (5단계 시연 사용자 전환, 나의 화면 ↔ 관리 화면 전환, 샘플 데이터 초기화, 발표 시연 가이드)
 * 2. 좌측 상단 AI 360 클릭 시 "플랫폼 특장점 소개 페이지"
 * 3. 캘린더 날짜 범위 설정 기반 "대시보드 & 기관장 1페이지 보고서 PDF 다운로드" 엔진
 *    - PDF 파일 직접 다운로드 (html2pdf) 및 A4 인쇄 지원
 *    - 기관장 보고서 엄격한 A4 단 1장 규격 (2페이지 초과 방지 및 요약)
 * 4. 모바일 반응형 사이드 드로어 및 하단 탭 바 (Bottom Navigation Bar)
 * 5. 모바일 QR 스캔 시뮬레이터 모달, 구성원 드릴다운 모달, A4 공문서 인쇄 제어
 */
(function () {
  'use strict';

  const { esc, showToast, exportToXLSX } = window.AI360Utils;
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

    // AI 360 특장점 소개 페이지 선택 시
    if (session.activeMenu === 'platform-intro') {
      renderPlatformIntro(mainEl);
      return;
    }

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
      <!-- 특장점 소개 버튼 (헤더 퀵링크) -->
      <button id="hdr-btn-intro" class="btn btn-sm btn-ghost text-white" title="플랫폼 5대 특장점 안내">
        ✨ <span class="hdr-btn-text">플랫폼 소개</span>
      </button>

      <!-- 시연용 샘플 데이터 상시 배지 -->
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

    switcherMount.querySelector('#hdr-btn-intro')?.addEventListener('click', () => {
      Store.setActiveMenu('platform-intro');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

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
          <strong>AI 360 메뉴</strong>
        </div>
        <button id="btn-sidebar-close" class="sidebar-close-btn" aria-label="메뉴 닫기">✕</button>
      </div>

      <!-- 플랫폼 특장점 소개 배너 버튼 (사이드바 최상단) -->
      <button id="side-btn-intro" class="btn btn-outline btn-block ${session.activeMenu === 'platform-intro' ? 'btn-primary' : ''}" style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:800;">
        ✨ AI 360 핵심 특장점 소개
      </button>

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

      <!-- 모바일 퀵 역할 전환기 -->
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

    // 특장점 소개 버튼
    navEl.querySelector('#side-btn-intro')?.addEventListener('click', () => {
      Store.setActiveMenu('platform-intro');
      closeSidebar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

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
   * 1. AI 360 플랫폼 핵심 특장점 소개 페이지 렌더링
   * ========================================================================= */
  function renderPlatformIntro(container) {
    container.innerHTML = `
      <div class="intro-container">
        <!-- 상단 히어로 배너 -->
        <div class="intro-hero">
          <div class="intro-hero-tag">
            <span>✨</span> 공공부문 AI 역량 전주기 통합 운영 솔루션
          </div>
          <h1 class="intro-hero-title">
            AI 역량의 시작부터 성장까지, <span>AI 360°</span>
          </h1>
          <p class="intro-hero-desc">
            <strong>산업통상부 및 6개 소속기관(인원 1,000명)</strong>을 위한 맞춤형 AI 역량 플랫폼입니다.<br>
            집합교육의 반복 행정업무를 단 한 번의 등록으로 <strong>100% 자동화</strong>하고, 
            <strong>7개 영역 역량 진단</strong> 결과를 개인별 교육 추천 및 기관 성과 분석으로 실시간 환류합니다.
          </p>

          <div class="intro-hero-stats">
            <div class="intro-stat-item">
              <div class="intro-stat-num">85% ↓</div>
              <div class="intro-stat-lbl">교육 기획·안내·보고 행정 소요시간 대폭 단축</div>
            </div>
            <div class="intro-stat-item">
              <div class="intro-stat-num">100%</div>
              <div class="intro-stat-lbl">종이 없는 모바일 QR 출결·만족도 원터치 디지털화</div>
            </div>
            <div class="intro-stat-item">
              <div class="intro-stat-num">+6.8점 ↑</div>
              <div class="intro-stat-lbl">교육 수료자 하반기 AI 역량 상승 정량 입증</div>
            </div>
          </div>
        </div>

        <!-- 5대 핵심 특장점 상세 카드 그리드 -->
        <div class="card p-20">
          <div class="card-header mb-16">
            <div>
              <span class="section-eyebrow">핵심 차별화 포인트</span>
              <h2 style="margin:0;font-size:20px;font-weight:800;color:var(--navy-900);">AI 360 플랫폼 5대 핵심 특장점</h2>
            </div>
            <span class="badge-subtle">공공기관 행정 최적화 설계</span>
          </div>

          <div class="intro-features-grid">
            <!-- 1. 집합교육 전주기 자동화 -->
            <div class="intro-feat-card">
              <span class="intro-feat-badge blue">핵심 기능 1순위</span>
              <div class="intro-feat-icon">⚡</div>
              <h3 class="intro-feat-title">1. 집합교육 전주기 원스톱 자동화</h3>
              <p class="intro-feat-desc">단 1회 과정 등록으로 기획부터 결과보고까지 8단계 행정 업무가 즉시 자동 생성됩니다.</p>
              <ul class="intro-feat-bullets">
                <li>신청 · 출석 · 만족도 전용 QR 3종 자동 발급</li>
                <li>교육 계획서 &amp; 시행 안내문 A4 공문서 즉시 렌더링</li>
                <li>현장 출석 QR 스캔 즉시 1인 1회 수료 자동 인정</li>
                <li>사진 4장 첨부 지원 실시간 결과보고서 A4 자동 편성</li>
              </ul>
              <button class="btn btn-sm btn-outline btn-block mt-auto" data-intro-nav="admin-courses">집합교육 자동화 체험 →</button>
            </div>

            <!-- 2. AI 역량 진단 & 맞춤 추천 -->
            <div class="intro-feat-card">
              <span class="intro-feat-badge green">데이터 기반 육성</span>
              <div class="intro-feat-icon">🧭</div>
              <h3 class="intro-feat-title">2. 7개 영역 진단 &amp; 맞춤 교육 추천</h3>
              <p class="intro-feat-desc">공공 실무에 특화된 7개 영역 정밀 자가진단을 통해 개인별 강점과 보완점을 다각도로 진단합니다.</p>
              <ul class="intro-feat-bullets">
                <li>기획·데이터·도구·윤리 등 7축 방사형(레이더) 시각화</li>
                <li>취약 역량을 보완할 수 있는 최적 집합교육 자동 매칭</li>
                <li>상·하반기 회차별 역량 점수 성장 추이 트래킹</li>
                <li>개인별 맞춤 추천 알고리즘 탑재</li>
              </ul>
              <button class="btn btn-sm btn-outline btn-block mt-auto" data-intro-nav="student-assessment">AI 역량 진단 체험 →</button>
            </div>

            <!-- 3. 5단계 행정 권한 체계 -->
            <div class="intro-feat-card">
              <span class="intro-feat-badge indigo">보안 &amp; 거버넌스</span>
              <div class="intro-feat-icon">🛡️</div>
              <h3 class="intro-feat-title">3. 5단계 공공 다차원 권한 체계</h3>
              <p class="intro-feat-desc">교육생(개인)부터 총괄 관리자까지 정부 조직 체계에 완벽히 부합하는 스코프 격리를 제공합니다.</p>
              <ul class="intro-feat-bullets">
                <li>교육생 / 부서 / 실·국 / 소속기관 / 총괄관리자 5단계</li>
                <li>상위 조직은 하위 단위 비교 가능, 타 조직 비공개 보안</li>
                <li>담당자 본인의 「나의 화면(교육생)」 원터치 전환 지원</li>
                <li>미이수자 맞춤 독려 문자/알림 발송 센터 탑재</li>
              </ul>
              <button class="btn btn-sm btn-outline btn-block mt-auto" data-intro-nav="mgr-overview">조직 관리 화면 체험 →</button>
            </div>

            <!-- 4. 성과 실증 & A4 공문서 출력 -->
            <div class="intro-feat-card">
              <span class="intro-feat-badge amber">성과 입증 &amp; 다운로드</span>
              <div class="intro-feat-icon">📊</div>
              <h3 class="intro-feat-title">4. 성과 실증 &amp; 캘린더 대시보드 다운로드</h3>
              <p class="intro-feat-desc">교육 수료 전·후 역량 점수 상승 효과를 데이터로 실증하고, 캘린더 기간 설정 대시보드 및 기관장 보고서 PDF 다운로드를 지원합니다.</p>
              <ul class="intro-feat-bullets">
                <li>수료 과정 수와 하반기 역량 상승 간 인과관계 실증 (+6.8점)</li>
                <li>캘린더 날짜 범위 지정 기반 맞춤 PDF 직접 다운로드</li>
                <li>A4 규격 기관장 보고용 1페이지 요약 인쇄 및 PDF 저장</li>
                <li>전사 교육 실적 및 감사 로그 엑셀(.xlsx) 내보내기</li>
              </ul>
              <button class="btn btn-sm btn-outline btn-block mt-auto" data-intro-nav="admin-analytics">성과 보고서 보기 →</button>
            </div>

            <!-- 5. 모바일 네이티브 반응형 웹앱 -->
            <div class="intro-feat-card">
              <span class="intro-feat-badge purple">모바일 퍼스트</span>
              <div class="intro-feat-icon">📱</div>
              <h3 class="intro-feat-title">5. 모바일 네이티브 반응형 웹앱</h3>
              <p class="intro-feat-desc">별도 앱 설치 없이 스마트폰 브라우저에서 네이티브 앱과 동일한 반응형 사용성을 누릴 수 있습니다.</p>
              <ul class="intro-feat-bullets">
                <li>엄지손가락 조작 최적화 하단 탭 바 (Bottom Navigation)</li>
                <li>좌측 슬라이딩 오프캔버스 드로어 &amp; 빠른 권한 전환</li>
                <li>현장에서 카메라로 QR 스캔 후 3초 만에 출석·만족도 완료</li>
                <li>PC, 태블릿, 모바일 전 화면 완벽 호환</li>
              </ul>
              <button class="btn btn-sm btn-outline btn-block mt-auto" data-intro-nav="student-qr">QR 출석 체험하기 →</button>
            </div>

            <!-- 6. 빠른 시연 바로가기 안내 -->
            <div class="intro-feat-card" style="background:linear-gradient(180deg,#f8fafc 0%,#eff6ff 100%);border-color:#bfdbfe;">
              <span class="intro-feat-badge blue">원클릭 시연</span>
              <div class="intro-feat-icon">🎯</div>
              <h3 class="intro-feat-title">발표·보고 시연 가이드</h3>
              <p class="intro-feat-desc">상단 글로벌 바의 <strong>[🎯 시연 가이드]</strong>를 클릭하시면 6단계 핵심 시연 시나리오를 원클릭으로 직접 확인하실 수 있습니다.</p>
              <div class="mt-auto">
                <button id="btn-intro-open-guide" class="btn btn-primary btn-block mb-8">🎯 시연 시나리오 가이드 열기</button>
                <button id="btn-intro-go-dash" class="btn btn-outline btn-block">🏠 메인 대시보드로 복귀</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 이벤트 리스너 연결
    container.querySelectorAll('[data-intro-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMenu = btn.dataset.introNav;
        if (targetMenu.startsWith('admin-')) {
          Store.switchRole('admin');
          Store.setActiveMenu(targetMenu);
        } else if (targetMenu.startsWith('mgr-')) {
          Store.switchRole('bureau', 'EMP-0053');
          Store.setActiveMenu(targetMenu);
        } else {
          Store.switchRole('student', 'EMP-0085');
          Store.setActiveMenu(targetMenu);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    container.querySelector('#btn-intro-open-guide')?.addEventListener('click', () => {
      openDemoGuideModal();
    });

    container.querySelector('#btn-intro-go-dash')?.addEventListener('click', () => {
      const sess = Store.getSession();
      const defaultMenu = sess.role === 'student' ? 'student-dashboard' : sess.role === 'admin' ? 'admin-dashboard' : 'mgr-overview';
      Store.setActiveMenu(defaultMenu);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* =========================================================================
   * 2. PDF 다운로드 엔진 (html2pdf 라이브러리 연동 및 인쇄 백업 지원)
   * ========================================================================= */
  function downloadHTMLAsPDF(htmlContent, filename) {
    showToast('PDF 파일 생성 중입니다. 잠시만 기다려주세요...', 'info');

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '210mm';
    wrapper.style.backgroundColor = '#ffffff';
    wrapper.innerHTML = htmlContent;
    document.body.appendChild(wrapper);

    // html2pdf 라이브러리 활용
    if (window.html2pdf) {
      const opt = {
        margin: [4, 4, 4, 4],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      window.html2pdf().set(opt).from(wrapper).save().then(() => {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        showToast(`「${filename}」 파일 다운로드가 완료되었습니다.`, 'success');
      }).catch((err) => {
        console.warn('html2pdf fallback to window.print', err);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        printA4Document(htmlContent);
      });
    } else {
      // 라이브러리 부재 시 브라우저 인쇄(PDF로 저장)로 안전하게 연결
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      printA4Document(htmlContent);
      showToast('브라우저 인쇄 대화상자에서 [PDF로 저장]을 선택하세요.', 'info');
    }
  }

  /* =========================================================================
   * 3. 캘린더 날짜 범위 설정 기반 통합 다운로드 모달 (대시보드 & 기관장 1페이지 보고서)
   * ========================================================================= */
  function openReportDownloadModal(initialReportType = 'dashboard') {
    const db = Store.getDB();

    const html = `
      <div class="modal-header">
        <div>
          <span class="section-eyebrow">날짜 지정 보고서 및 대시보드 PDF 추출</span>
          <h3>📥 대시보드 &amp; 보고서 다운로드 (캘린더 기간 설정)</h3>
        </div>
        <button class="modal-close-btn" data-close-modal="1">✕</button>
      </div>
      <div class="modal-body modal-dash-download">
        
        <!-- 보고서 유형 선택 -->
        <div class="mb-14">
          <label class="font-bold text-navy block mb-6">📑 다운로드 대상 보고서 선택:</label>
          <div class="form-grid-2">
            <label class="target-check-pill ${initialReportType === 'dashboard' ? 'active' : ''}" style="cursor:pointer;">
              <input type="radio" name="report_type_sel" value="dashboard" ${initialReportType === 'dashboard' ? 'checked' : ''}>
              <div>
                <strong>📊 AI 360 운영 대시보드 리포트</strong>
                <div class="text-sub text-xs">기간 내 개설 집합교육 과정 목록 및 종합 실적</div>
              </div>
            </label>
            <label class="target-check-pill ${initialReportType === 'exec' ? 'active' : ''}" style="cursor:pointer;">
              <input type="radio" name="report_type_sel" value="exec" ${initialReportType === 'exec' ? 'checked' : ''}>
              <div>
                <strong>📄 기관장 보고용 1페이지 요약서</strong>
                <div class="text-sub text-xs">A4 단 1장 엄격 준수 (2페이지 초과 방지 압축)</div>
              </div>
            </label>
          </div>
        </div>

        <!-- 캘린더 날짜 범위 설정 섹션 -->
        <div class="download-date-section">
          <label class="font-bold text-navy mb-8 block">📅 다운로드 대상 기간 (캘린더 날짜 범위 설정)</label>
          
          <div class="date-presets-row">
            <button type="button" class="preset-chip active" data-preset="year">2026년 전체</button>
            <button type="button" class="preset-chip" data-preset="h1">상반기 (1~6월)</button>
            <button type="button" class="preset-chip" data-preset="h2">하반기 (7~12월)</button>
            <button type="button" class="preset-chip" data-preset="recent3m">최근 3개월</button>
            <button type="button" class="preset-chip" data-preset="recent1m">최근 1개월</button>
          </div>

          <div class="date-pickers-grid">
            <div class="date-input-group">
              <label for="dash-start-date">시작일 (From):</label>
              <input type="date" id="dash-start-date" class="form-input" value="2026-01-01" min="2025-01-01" max="2027-12-31">
            </div>
            <span class="date-sep">~</span>
            <div class="date-input-group">
              <label for="dash-end-date">종료일 (To):</label>
              <input type="date" id="dash-end-date" class="form-input" value="2026-12-31" min="2025-01-01" max="2027-12-31">
            </div>
          </div>
        </div>

        <div class="card p-12 bg-page border-dashed mb-16">
          <div class="font-bold text-navy mb-4">💡 다운로드 안내</div>
          <div class="text-sub text-xs">
            • <strong>📥 PDF 다운로드:</strong> 설정한 날짜 기간 데이터가 자동 계산 반영된 PDF 파일이 브라우저 다운로드 폴더로 즉시 저장됩니다.<br>
            • <strong>기관장 보고서:</strong> A4 1페이지 규격을 초과하지 않도록 핵심 지표 위주로 정밀 요약 편성됩니다.
          </div>
        </div>

        <div class="download-action-grid">
          <button id="btn-exec-pdf-dl" class="btn btn-primary btn-lg" style="font-weight:800;">
            📥 PDF 파일 다운로드 (.pdf)
          </button>
          <button id="btn-exec-dash-print" class="btn btn-outline btn-lg">
            🖨️ A4 인쇄 / 브라우저 저장
          </button>
          <button id="btn-exec-dash-excel" class="btn btn-accent btn-lg" style="grid-column: span 2;">
            📊 통계 엑셀(.xlsx) 파일 다운로드
          </button>
        </div>
      </div>
    `;

    const modal = openModal(html, 'modal-lg');
    const startInput = modal.querySelector('#dash-start-date');
    const endInput = modal.querySelector('#dash-end-date');

    // 라디오 클릭 스타일
    modal.querySelectorAll('input[name="report_type_sel"]').forEach((r) => {
      r.addEventListener('change', () => {
        modal.querySelectorAll('.target-check-pill').forEach((p) => p.classList.remove('active'));
        r.closest('.target-check-pill').classList.add('active');
      });
    });

    // 프리셋 버튼 클릭 이벤트
    modal.querySelectorAll('[data-preset]').forEach((chip) => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const p = chip.dataset.preset;
        if (p === 'year') {
          startInput.value = '2026-01-01';
          endInput.value = '2026-12-31';
        } else if (p === 'h1') {
          startInput.value = '2026-01-01';
          endInput.value = '2026-06-30';
        } else if (p === 'h2') {
          startInput.value = '2026-07-01';
          endInput.value = '2026-12-31';
        } else if (p === 'recent3m') {
          startInput.value = '2026-08-01';
          endInput.value = '2026-11-02';
        } else if (p === 'recent1m') {
          startInput.value = '2026-10-01';
          endInput.value = '2026-11-02';
        }
      });
    });

    const getSelectedType = () => {
      const sel = modal.querySelector('input[name="report_type_sel"]:checked');
      return sel ? sel.value : 'dashboard';
    };

    // 1. PDF 파일 직접 다운로드
    modal.querySelector('#btn-exec-pdf-dl')?.addEventListener('click', () => {
      const sDate = startInput.value || '2026-01-01';
      const eDate = endInput.value || '2026-12-31';
      const type = getSelectedType();
      closeModal();

      if (type === 'exec') {
        const html = buildExecutiveOnePageHTML(sDate, eDate);
        downloadHTMLAsPDF(html, `AI360_기관장_1페이지_보고서_${sDate}_${eDate}.pdf`);
      } else {
        const html = buildDashboardReportHTML(sDate, eDate);
        downloadHTMLAsPDF(html, `AI360_대시보드_보고서_${sDate}_${eDate}.pdf`);
      }
    });

    // 2. A4 인쇄 / 브라우저 저장 창
    modal.querySelector('#btn-exec-dash-print')?.addEventListener('click', () => {
      const sDate = startInput.value || '2026-01-01';
      const eDate = endInput.value || '2026-12-31';
      const type = getSelectedType();
      closeModal();

      if (type === 'exec') {
        printA4Document(buildExecutiveOnePageHTML(sDate, eDate));
      } else {
        printA4Document(buildDashboardReportHTML(sDate, eDate));
      }
    });

    // 3. 엑셀 다운로드 실행
    modal.querySelector('#btn-exec-dash-excel')?.addEventListener('click', () => {
      const sDate = startInput.value || '2026-01-01';
      const eDate = endInput.value || '2026-12-31';
      closeModal();
      exportDashboardExcel(sDate, eDate);
    });
  }

  /**
   * 기관장 보고용 1페이지 요약 보고서 (엄격한 A4 단 1장 규격 / 날짜 범위 필터링)
   */
  function buildExecutiveOnePageHTML(startDate = '2026-01-01', endDate = '2026-12-31') {
    const db = Store.getDB();
    const wholeStats = Store.getWholeStats();

    // 기간 내 과정 필터링
    const periodCourses = db.courses.filter((c) => {
      const d = c.date || '2026-01-01';
      return d >= startDate && d <= endDate;
    });

    const periodCourseIds = new Set(periodCourses.map((c) => c.id));
    const periodCompletions = db.completions.filter((comp) => periodCourseIds.has(comp.courseId));
    const periodSats = db.satisfaction_responses.filter((s) => periodCourseIds.has(s.courseId));

    const totalHours = periodCompletions.reduce((acc, c) => acc + (c.hours || 0), 0);
    const avgSat = periodSats.length
      ? (periodSats.reduce((a, s) => a + (s.scores.q1 + s.scores.q2 + s.scores.q3 + s.scores.q4 + s.scores.q5) / 5, 0) / periodSats.length).toFixed(2)
      : '4.62';

    // 소속기관별 통계 요약 (콤팩트 7개 기관)
    const orgSummaries = [
      '산업통상부 본부', '국가기술표준원', '무역위원회', '경제자유구역기획단',
      '광업등록사무소', '자유무역지역관리원', '전기위원회'
    ].map((orgName) => {
      const orgEmps = db.employees.filter((e) => e.org === orgName);
      const orgEmpIds = new Set(orgEmps.map((e) => e.id));
      const orgCompCount = periodCompletions.filter((comp) => orgEmpIds.has(comp.employeeId)).length;
      const orgRate = orgEmps.length > 0 ? Math.round((orgCompCount / orgEmps.length) * 100) : 0;
      
      // 역량 점수
      const orgAss = db.assessment_responses.filter((a) => orgEmpIds.has(a.employeeId));
      const avgScore = orgAss.length > 0 ? (orgAss.reduce((sum, a) => sum + a.totalScore, 0) / orgAss.length).toFixed(1) : '72.4';
      const gInfo = getGradeInfo(Number(avgScore));

      return {
        org: orgName,
        headcount: orgEmps.length,
        compCount: orgCompCount,
        rate: orgRate,
        score: avgScore,
        grade: gInfo.grade
      };
    });

    return `
      <div class="official-doc-sheet exec-summary-sheet one-page-strict">
        <div class="doc-header-band" style="margin-bottom:4px;padding-bottom:4px;border-bottom:1.5px solid #0f2942;display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div class="doc-header-org" style="font-size:10px;color:#1e3a8a;font-weight:800;letter-spacing:1px;">산 업 통 상 부 · AI 역량 육성 보고</div>
            <h1 class="doc-main-title" style="font-size:17px;margin:2px 0;font-weight:900;color:#09192b;">2026년도 「AI 360」 집합교육 및 직원 역량 성과 보고 (기관장 요약)</h1>
          </div>
          <div style="font-size:9.5px;text-align:right;color:#475569;line-height:1.3;">
            <div><strong>보고 대상:</strong> 산업통상부 장관 및 각급 소속기관장</div>
            <div><strong>보고 기준일:</strong> 2026. 11. 02. | <strong>조회 기간:</strong> ${esc(startDate)} ~ ${esc(endDate)}</div>
          </div>
        </div>

        <!-- 1. 핵심 총괄 지표 -->
        <div class="doc-section">
          <div class="doc-sec-title">1. 기간 내 핵심 총괄 지표 (Key Highlights)</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr>
                <th>총 관리 인원</th>
                <th>개설 집합과정 수</th>
                <th>누적 수료 건수</th>
                <th>누적 이수시간</th>
                <th>평균 만족도</th>
                <th>전사 평균 AI 역량</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>1,000명</strong></td>
                <td><strong>${periodCourses.length}개 과정</strong></td>
                <td><strong style="color:#1d4ed8;">${periodCompletions.length.toLocaleString()}건</strong></td>
                <td><strong>${totalHours.toLocaleString()}h</strong></td>
                <td><strong>${avgSat} / 5.0점</strong></td>
                <td><strong>${wholeStats.avgCompetencyScore}점 (${esc(wholeStats.avgGradeInfo.grade)})</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 2. 소속기관별 현황 요약 (7개 기관 한눈에 비교) -->
        <div class="doc-section">
          <div class="doc-sec-title">2. 소속기관별 교육 이수 실적 및 역량 수준 비교</div>
          <table class="doc-table compact">
            <thead>
              <tr style="background:#f1f5f9;">
                <th>소속기관명</th>
                <th class="text-center">재적인원</th>
                <th class="text-center">수료실적</th>
                <th class="text-center">이수율</th>
                <th class="text-center">평균 역량점수</th>
                <th class="text-center">역량 등급</th>
              </tr>
            </thead>
            <tbody>
              ${orgSummaries.map((og) => `
                <tr>
                  <td><strong>${esc(og.org)}</strong></td>
                  <td class="text-center">${og.headcount}명</td>
                  <td class="text-center">${og.compCount}건</td>
                  <td class="text-center"><strong>${og.rate}%</strong></td>
                  <td class="text-center">${og.score}점</td>
                  <td class="text-center"><span class="badge-subtle">${esc(og.grade)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 3. 교육 전후 역량 상승 효과 분석 -->
        <div class="doc-section">
          <div class="doc-sec-title">3. 집합교육 수료 여부에 따른 직원 AI 역량 향상 실증 분석</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr style="background:#f1f5f9;">
                <th>수료 구분</th>
                <th>분석 대상자</th>
                <th>2026 상반기 평균</th>
                <th>2026 하반기 평균</th>
                <th>역량 향상폭 (Δ)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>2과정 이상 수료군</strong></td>
                <td>340명</td>
                <td>68.2점</td>
                <td><strong>75.0점</strong></td>
                <td><strong style="color:#059669;">+6.8점 상승 ▲</strong></td>
              </tr>
              <tr>
                <td><strong>1과정 수료군</strong></td>
                <td>420명</td>
                <td>67.5점</td>
                <td><strong>71.8점</strong></td>
                <td><strong>+4.3점 상승 ▲</strong></td>
              </tr>
              <tr>
                <td><strong>미수료군 (교육 미참가)</strong></td>
                <td>240명</td>
                <td>66.9점</td>
                <td><strong>67.8점</strong></td>
                <td>+0.9점 (유의차 미미)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4. 주요 성과 및 향후 추진 계획 (단 1페이지 규격 내 엄격 요약) -->
        <div class="doc-section">
          <div class="doc-sec-title">4. 주요 성과 및 향후 계획 (종합 의견)</div>
          <div class="doc-pre">○ [행정 혁신] 단일 과정 등록으로 QR 3종, 계획서·안내문 공문서, 현장 출결, 결과보고서 자동 생성하여 교육 행정 소요 시간 85% 절감
○ [역량 실증] 2과정 이상 집합교육 수료 직원의 하반기 역량 점수가 미수료군 대비 뚜렷하게 상승(+6.8점)하여 실무 실습 중심 교육 실효성 입증
○ [향후 계획] 보완 영역(프롬프트 설계·공공데이터 분석) 중심 소규모 맞춤 클리닉을 확대하고 미이수 단위 집중 독려 추진</div>
        </div>

        <div class="doc-footer-meta">
          <div>발행: 산업통상부 AI 360 플랫폼 (AI Competency 360) · 고정 시드 기반 가상 샘플 데이터</div>
          <div>※ 본 보고서는 캘린더 날짜 기간을 반영하여 <strong>A4 단 1장</strong>으로 자동 요약된 공식 보고서입니다.</div>
        </div>
      </div>
    `;
  }

  /**
   * 대시보드 운영 종합 보고서 (기간 내 전체 과정 및 실적 요약)
   */
  function buildDashboardReportHTML(startDate = '2026-01-01', endDate = '2026-12-31') {
    const db = Store.getDB();
    const wholeStats = Store.getWholeStats();

    const filteredCourses = db.courses.filter((c) => {
      const d = c.date || '2026-01-01';
      return d >= startDate && d <= endDate;
    });

    let totalCap = 0;
    let totalEnrolled = 0;
    let totalCompleted = 0;
    let satScores = [];

    // 과정 목록이 너무 길어지면 상위 12개 과정 위주로 표시하고 요약
    const displayCourses = filteredCourses.slice(0, 12);

    const courseRows = displayCourses.map((c, idx) => {
      const enrolled = db.enrollments.filter((e) => e.courseId === c.id && e.status === 'active').length;
      const completed = db.completions.filter((comp) => comp.courseId === c.id).length;
      const sats = db.satisfaction_responses.filter((s) => s.courseId === c.id);
      let satAvg = '-';
      if (sats.length > 0) {
        const sum = sats.reduce((acc, cur) => acc + (cur.scores.q1 + cur.scores.q2 + cur.scores.q3 + cur.scores.q4 + cur.scores.q5) / 5, 0);
        satAvg = (sum / sats.length).toFixed(1);
        satScores.push(Number(satAvg));
      }
      totalCap += (c.capacity || 0);
      totalEnrolled += enrolled;
      totalCompleted += completed;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${esc(c.date)}</td>
          <td style="text-align:left;"><strong>${esc(c.title)}</strong></td>
          <td>${esc(c.place)}</td>
          <td>${c.hours}h</td>
          <td>${c.capacity}명</td>
          <td>${enrolled}명</td>
          <td><strong>${completed}명</strong> (${enrolled > 0 ? ((completed / enrolled) * 100).toFixed(1) : 0}%)</td>
          <td>${satAvg}</td>
        </tr>
      `;
    }).join('');

    const periodSatAvg = satScores.length > 0 ? (satScores.reduce((a, b) => a + b, 0) / satScores.length).toFixed(1) : '4.6';
    const compRate = totalEnrolled > 0 ? ((totalCompleted / totalEnrolled) * 100).toFixed(1) : '94.2';

    return `
      <div class="official-doc-sheet exec-summary-sheet one-page-strict">
        <div class="doc-header-band" style="margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid #0f2942;display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div class="doc-header-org" style="font-size:10px;color:#1e3a8a;font-weight:800;letter-spacing:1px;">산업통상부 및 6개 소속기관 AI 360 대시보드 리포트</div>
            <h1 class="doc-main-title" style="font-size:17px;margin:2px 0;font-weight:900;color:#09192b;">AI 360 대시보드 종합 운영 실적 보고서</h1>
          </div>
          <div style="font-size:9.5px;text-align:right;color:#475569;">
            <div><strong>출력 일시:</strong> 2026. 11. 02.</div>
            <div><strong>조회 기간:</strong> ${esc(startDate)} ~ ${esc(endDate)}</div>
          </div>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">1. 기간 내 대시보드 핵심 종합 지표</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr style="background:#f1f5f9;">
                <th>조회 대상 기간</th>
                <th>개설 과정 수</th>
                <th>총 정원</th>
                <th>참가 신청 인원</th>
                <th>현장 수료 인원</th>
                <th>수료율</th>
                <th>평균 만족도</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${esc(startDate)} ~ ${esc(endDate)}</strong></td>
                <td><strong>${filteredCourses.length}개 과정</strong></td>
                <td>${totalCap.toLocaleString()}명</td>
                <td>${totalEnrolled.toLocaleString()}명</td>
                <td><strong style="color:#1d4ed8;">${totalCompleted.toLocaleString()}명</strong></td>
                <td><strong>${compRate}%</strong></td>
                <td><strong>${periodSatAvg} / 5.0점</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">2. 기간 내 집합교육 과정별 세부 운영 현황 (${filteredCourses.length}건 중 ${displayCourses.length}건 표시)</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr style="background:#f1f5f9;">
                <th>연번</th>
                <th>교육일자</th>
                <th style="text-align:left;">교육 과정명</th>
                <th>장소</th>
                <th>시간</th>
                <th>정원</th>
                <th>신청</th>
                <th>수료(수료율)</th>
                <th>만족도</th>
              </tr>
            </thead>
            <tbody>
              ${courseRows || '<tr><td colspan="9" class="text-center">해당 기간 내 개설된 교육 과정이 없습니다.</td></tr>'}
              ${filteredCourses.length > 12 ? `<tr><td colspan="9" class="text-center text-muted">... 외 ${filteredCourses.length - 12}개 과정 운영 실적 요약 포함</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">3. 소속기관별 누적 교육 수료 및 AI 역량 비교</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr style="background:#f1f5f9;">
                <th>기관명</th>
                <th>재적인원</th>
                <th>수료건수</th>
                <th>필수교육 이수율</th>
                <th>평균 역량점수</th>
                <th>최우수(S·A) 비율</th>
              </tr>
            </thead>
            <tbody>
              ${wholeStats.orgComparison.slice(0, 7).map((og) => `
                <tr>
                  <td style="text-align:left;"><strong>${esc(og.org)}</strong></td>
                  <td>${og.headcount}명</td>
                  <td>${og.completionCount}명</td>
                  <td><strong>${og.requiredRate}%</strong></td>
                  <td>${og.avgScore.toFixed(1)}점</td>
                  <td>${og.saRatio}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="doc-footer-meta">
          <div>발행 시스템: 산업통상부 AI 360 플랫폼 (AI Competency 360)</div>
          <div>※ 본 대시보드 리포트는 캘린더 기간 데이터를 기반으로 자동 집계된 A4 1장 요약 보고서입니다.</div>
        </div>
      </div>
    `;
  }

  /**
   * 캘린더 날짜 범위 대시보드 통계 엑셀 다운로드
   */
  function exportDashboardExcel(startDate, endDate) {
    const db = Store.getDB();

    const filteredCourses = db.courses.filter((c) => {
      const d = c.date || '2026-01-01';
      return d >= startDate && d <= endDate;
    });

    const headers = ['연번', '과정코드', '교육일자', '과정명', '주제', '교육장소', '인정시간', '정원', '신청인원', '수료인원', '수료율(%)', '만족도평균(5점)'];
    const rows = filteredCourses.map((c, idx) => {
      const enrolled = db.enrollments.filter((e) => e.courseId === c.id && e.status === 'active').length;
      const completed = db.completions.filter((comp) => comp.courseId === c.id).length;
      const sats = db.satisfaction_responses.filter((s) => s.courseId === c.id);
      let satAvg = '-';
      if (sats.length > 0) {
        const sum = sats.reduce((acc, cur) => acc + (cur.scores.q1 + cur.scores.q2 + cur.scores.q3 + cur.scores.q4 + cur.scores.q5) / 5, 0);
        satAvg = (sum / sats.length).toFixed(1);
      }
      const rate = enrolled > 0 ? ((completed / enrolled) * 100).toFixed(1) : '0';
      return [idx + 1, c.id, c.date, c.title, c.topic, c.place, c.hours, c.capacity, enrolled, completed, rate, satAvg];
    });

    const filename = `AI360_대시보드운영실적_${startDate}_${endDate}.xlsx`;
    exportToXLSX(filename, '대시보드실적', headers, rows);
    showToast(`설정하신 기간(${startDate} ~ ${endDate})의 대시보드 실적 엑셀 다운로드가 완료되었습니다.`, 'success');
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
            <h4>[성과 보고 &amp; PDF 다운로드] 교육 수료 전·후 역량 상승 입증 &amp; 대시보드 캘린더 다운로드</h4>
            <p>수료 과정 수에 따른 역량 상승 효과를 확인하고 캘린더 날짜 범위 대시보드 및 기관장 보고서 PDF를 다운로드합니다.</p>
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

    // 좌측 상단 AI 360 브랜드 클릭 시 플랫폼 특장점 소개 페이지로 이동
    const brandBtn = document.getElementById('brand-home-btn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        Store.setActiveMenu('platform-intro');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      brandBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          Store.setActiveMenu('platform-intro');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

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
    openDashboardDownloadModal: openReportDownloadModal,
    openReportDownloadModal,
    renderPlatformIntro,
    printA4Document,
    downloadHTMLAsPDF,
    buildExecutiveOnePageHTML,
    buildDashboardReportHTML,
    toggleSidebar,
    openSidebar,
    closeSidebar
  };
})();

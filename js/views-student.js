/**
 * AI 360 — 교육생 화면 (A. 교육생 및 각 단계 담당자의 「나의 화면」)
 * 메뉴: ① 나의 AI 대시보드 ② 교육 안내·신청 ③ QR 출석·만족도 ④ AI 역량 진단 ⑤ 나의 AI 성장 기록
 */
(function () {
  'use strict';

  const { esc, showToast } = window.AI360Utils;
  const { ASSESSMENT_ITEMS, SATISFACTION_ITEMS, getGradeInfo, formatTargetSummary, isEmployeeEligibleForCourse } = window.AI360Seed;
  const Store = window.AI360Store;
  const Charts = window.AI360Charts;

  let courseFilterMode = 'eligible'; // 'eligible' | 'all'
  let courseTopicFilter = 'ALL';
  let activeQrCourseId = 'CRS-008';

  function renderStudentMenu(menuId, container) {
    const session = Store.getSession();
    const profile = Store.getEmployeeProfileSummary(session.employeeId);
    if (!profile) {
      container.innerHTML = '<div class="card">직원 정보를 불러올 수 없습니다.</div>';
      return;
    }

    switch (menuId) {
      case 'student-courses':
        renderStudentCourses(profile, container);
        break;
      case 'student-qr':
        renderStudentQRCenter(profile, container);
        break;
      case 'student-assessment':
        renderStudentAssessment(profile, container);
        break;
      case 'student-growth':
        renderStudentGrowth(profile, container);
        break;
      case 'student-dashboard':
      default:
        renderStudentDashboard(profile, container);
        break;
    }
  }

  /* =========================================================================
   * ① 나의 AI 대시보드
   * ========================================================================= */
  function renderStudentDashboard(profile, container) {
    const db = Store.getDB();
    const wholeStats = Store.computeUnitAnalytics({});
    const emp = profile.emp;
    const latest = profile.latestAssessment;
    const latestScore = latest ? latest.totalScore : 0;
    const gInfo = latest ? getGradeInfo(latestScore) : { grade: '미진단', color: '#64748b', bg: '#f1f5f9' };

    // 나에게 해당하는 알림 필터링
    const myNotices = db.notices.filter((n) => {
      if (!n.targetType || n.targetType === '전직원') return true;
      if (n.courseId) {
        const crs = db.courses.find((c) => c.id === n.courseId);
        return crs ? isEmployeeEligibleForCourse(emp, crs) : true;
      }
      return true;
    }).slice(0, 6);

    // 레이더 시리즈 구성
    const labels = ASSESSMENT_ITEMS.map((i) => i.domain);
    const radarSeries = [];
    if (latest) {
      radarSeries.push({
        name: `나의 역량 (${latest.roundId === 'RND-2026-H2' ? '하반기' : '최근'})`,
        values: ASSESSMENT_ITEMS.map((i) => latest.domainScores[i.id] || 0),
        color: '#2563eb',
        fillOpacity: 0.22
      });
    }
    if (profile.h1 && profile.h2) {
      radarSeries.push({
        name: '2026 상반기',
        values: ASSESSMENT_ITEMS.map((i) => profile.h1.domainScores[i.id] || 0),
        color: '#94a3b8',
        fillOpacity: 0.06,
        dashed: true
      });
    } else {
      radarSeries.push({
        name: '전 기관 평균',
        values: wholeStats.domainAverages.map((d) => d.score),
        color: '#64748b',
        fillOpacity: 0.06,
        dashed: true
      });
    }

    // 회차별 성장 그래프 데이터
    const growthPoints = [];
    db.assessment_rounds.forEach((rnd) => {
      const myRec = profile.myAssessments.find((a) => a.roundId === rnd.id);
      if (myRec) {
        const allRnd = db.assessment_responses.filter((a) => a.roundId === rnd.id);
        const avg = allRnd.length
          ? Math.round((allRnd.reduce((acc, x) => acc + x.totalScore, 0) / allRnd.length) * 10) / 10
          : 55;
        growthPoints.push({
          label: rnd.title.replace('AI 역량 진단', '').trim(),
          myScore: myRec.totalScore,
          grade: myRec.grade,
          orgAvg: avg
        });
      }
    });

    // 신청한 다가오는/진행 중 교육
    const upcomingEnrolled = profile.myEnrollments
      .map((en) => {
        const c = db.courses.find((x) => x.id === en.courseId);
        const completed = profile.myCompletions.some((cm) => cm.courseId === en.courseId);
        const satDone = profile.mySatisfactions.some((s) => s.courseId === en.courseId);
        return c ? { course: c, completed, satDone, enrolledAt: en.enrolledAt } : null;
      })
      .filter((x) => x && x.course.status !== '결과보고 완료');

    const openRound = db.assessment_rounds.find((r) => r.status === 'open');
    const answeredOpenRound = openRound && profile.myAssessments.some((a) => a.roundId === openRound.id);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">개인 맞춤형 역량 &amp; 학습 포털</span>
          <h1 class="page-title">${esc(emp.name)} ${esc(emp.rank)}님의 AI 역량 대시보드</h1>
          <p class="page-desc">${esc(emp.org)} &gt; ${esc(emp.bureau)} &gt; ${esc(emp.dept)} · AI 역량 진단 결과와 집합교육 이수 현황이 실시간 연동됩니다.</p>
        </div>
        <div class="head-actions">
          ${openRound ? `<button class="btn ${answeredOpenRound ? 'btn-outline' : 'btn-primary'}" data-go-menu="student-assessment">
            ${answeredOpenRound ? '하반기 진단 결과·재점검' : '진행 중 역량 진단 참여하기'}
          </button>` : ''}
          <button class="btn btn-outline" data-go-menu="student-courses">맞춤 교육 신청하기</button>
        </div>
      </div>

      <!-- KPI 4종 (클릭 시 출처 데이터 드릴다운 연동) -->
      <div class="kpi-grid kpi-grid-4">
        <div class="kpi-card highlight kpi-clickable" data-drill-target="student-assessment" title="클릭 시 AI 역량 진단 화면으로 이동합니다.">
          <div class="kpi-card-header-row">
            <div class="kpi-label">최근 AI 역량 점수 · 등급 <span class="sample-mini">샘플</span></div>
            <span class="kpi-link-badge">출처 데이터 ↗</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${latest ? latestScore.toFixed(1) + '점' : '미진단'}</span>
            <span class="grade-pill" style="background:${gInfo.bg};color:${gInfo.color}">${esc(gInfo.grade)}</span>
          </div>
          <div class="kpi-sub">전 기관 평균 ${wholeStats.avgCompetencyScore}점 대비 ${latest ? ((latestScore - wholeStats.avgCompetencyScore >= 0 ? '+' : '') + (latestScore - wholeStats.avgCompetencyScore).toFixed(1) + '점') : '진단 필요'}</div>
        </div>
        <div class="kpi-card kpi-clickable" data-drill-target="student-growth" title="클릭 시 나의 AI 성장 기록 화면으로 이동합니다.">
          <div class="kpi-card-header-row">
            <div class="kpi-label">수료 집합교육 과정 수 <span class="sample-mini">샘플</span></div>
            <span class="kpi-link-badge">출처 데이터 ↗</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${profile.myCompletions.length}개 과정</span>
            <span class="kpi-tag">신청 ${profile.myEnrollments.length}건</span>
          </div>
          <div class="kpi-sub">현장 QR 출석 인증과 동시에 자동 집계</div>
        </div>
        <div class="kpi-card kpi-clickable" data-drill-target="student-growth" title="클릭 시 나의 AI 성장 기록 화면으로 이동합니다.">
          <div class="kpi-card-header-row">
            <div class="kpi-label">누적 AI 교육 이수시간 <span class="sample-mini">샘플</span></div>
            <span class="kpi-link-badge">출처 데이터 ↗</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value">${profile.totalHours}시간</span>
            <span class="kpi-tag">연간 권장 12h</span>
          </div>
          <div class="kpi-sub">부서원 평균 대비 체계적 학습 이력 관리</div>
        </div>
        <div class="kpi-card kpi-clickable" data-drill-target="student-courses" title="클릭 시 교육 안내 및 신청 화면으로 이동합니다.">
          <div class="kpi-card-header-row">
            <div class="kpi-label">2026 필수교육 이수 여부 <span class="sample-mini">샘플</span></div>
            <span class="kpi-link-badge">출처 데이터 ↗</span>
          </div>
          <div class="kpi-value-row">
            <span class="kpi-value ${profile.hasCompletedRequired ? 'text-success' : 'text-danger'}">${profile.hasCompletedRequired ? '이수 완료' : '미이수'}</span>
            <span class="status-dot ${profile.hasCompletedRequired ? 'ok' : 'warn'}"></span>
          </div>
          <div class="kpi-sub">${profile.hasCompletedRequired ? '공공 AI 윤리·보안 필수과정 충족' : '필수 지정 집합교육 수강이 필요합니다'}</div>
        </div>
      </div>

      <!-- 시각화 3종: 게이지 / 7축 레이더 / 회차별 성장 그래프 -->
      <div class="grid-3-charts">
        <div class="card">
          <div class="card-header">
            <h3>종합 역량 게이지</h3>
            <span class="badge-subtle">최근 진단 기준</span>
          </div>
          <div class="chart-box center">
            ${latest
              ? Charts.renderScoreGaugeSVG(latestScore, wholeStats.avgCompetencyScore, `점선 마커: 전체 평균(${wholeStats.avgCompetencyScore}점)`)
              : '<div class="empty-hint">진단 참여 후 종합 점수 게이지가 표시됩니다.</div>'}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>7대 AI 역량 영역 레이더</h3>
            <span class="badge-subtle">${profile.h1 && profile.h2 ? '상·하반기 비교' : '전체 평균 비교'}</span>
          </div>
          <div class="chart-box center">
            ${Charts.renderRadarChartSVG(labels, radarSeries, 285)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>진단 회차별 성장 추이</h3>
            <span class="badge-subtle">교육 이수 연계</span>
          </div>
          <div class="chart-box center">
            ${Charts.renderPersonalGrowthSVG(growthPoints)}
          </div>
          ${profile.h1 && profile.h2 ? `
            <div class="growth-callout">
              상반기 대비 <strong>${(profile.h2.totalScore - profile.h1.totalScore >= 0 ? '+' : '') + (profile.h2.totalScore - profile.h1.totalScore).toFixed(1)}점</strong> 변화
              (${esc(profile.h1.grade)} → ${esc(profile.h2.grade)})
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 알림함 + 신청한 교육 일정 / 맞춤형 추천 교육 -->
      <div class="grid-2-cols">
        <div class="card">
          <div class="card-header">
            <h3>나의 알림함 <span class="count-pill">${myNotices.filter((n) => !n.readBy.includes(emp.id)).length}건 미확인</span></h3>
            <span class="badge-subtle">교육 안내 · 마감 · 진단</span>
          </div>
          <div class="notice-list">
            ${myNotices.map((n) => {
              const unread = !n.readBy.includes(emp.id);
              const icon = n.type === 'assessment' ? '📊' : n.type === 'deadline' ? '⏰' : '📢';
              return `
                <div class="notice-item ${unread ? 'unread' : ''}" data-notice-id="${esc(n.id)}" data-notice-course="${esc(n.courseId || '')}" data-notice-type="${esc(n.type)}">
                  <div class="notice-icon">${icon}</div>
                  <div class="notice-content">
                    <div class="notice-title-row">
                      <strong>${esc(n.title)}</strong>
                      ${unread ? '<span class="unread-dot">NEW</span>' : ''}
                    </div>
                    <p>${esc(n.body)}</p>
                    <span class="notice-time">${esc(n.createdAt)}</span>
                  </div>
                  <button class="btn btn-xs btn-ghost">바로가기 →</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>맞춤형 추천 집합교육</h3>
            <span class="badge-subtle">진단 보완영역 · 직급 자동 매핑</span>
          </div>
          <div class="rec-list">
            ${profile.recommendations.map((rec) => `
              <div class="rec-item">
                <div class="rec-top">
                  <span class="rec-badge">${esc(rec.badge)}</span>
                  <span class="topic-chip">${esc(rec.topic)}</span>
                </div>
                <h4 class="rec-title">${rec.course ? esc(rec.course.title) : `차기 「${esc(rec.topic)}」 과정 개설 예정`}</h4>
                <p class="rec-reason">💡 <strong>추천 사유:</strong> ${esc(rec.reason)}</p>
                ${rec.course ? `
                  <div class="rec-meta">
                    <span>📅 ${esc(rec.course.date)} (${rec.course.hours}h)</span>
                    <span>📍 ${esc(rec.course.place)}</span>
                    <span class="status-badge">${esc(rec.course.status)}</span>
                  </div>
                  <div class="rec-actions">
                    ${rec.alreadyEnrolled
                      ? `<span class="enrolled-chip">✓ 신청 완료</span>
                         <button class="btn btn-xs btn-outline" data-open-qr-sim="${esc(rec.course.id)}" data-qr-type="attend">QR 출석 화면</button>`
                      : `<button class="btn btn-xs btn-primary" data-quick-enroll="${esc(rec.course.id)}">바로 신청</button>
                         <button class="btn btn-xs btn-outline" data-open-qr-sim="${esc(rec.course.id)}" data-qr-type="apply">신청 QR 보기</button>`}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 신청한 교육 일정 (다가오는/진행 중 교육) -->
      <div class="card mt-16">
        <div class="card-header">
          <h3>나의 진행·예정 교육 일정 (${upcomingEnrolled.length}건)</h3>
          <button class="btn btn-xs btn-outline" data-go-menu="student-qr">현장 QR 인증 센터 열기</button>
        </div>
        ${upcomingEnrolled.length === 0 ? `<div class="empty-hint">현재 신청 중인 예정 교육이 없습니다. [교육 안내·신청] 메뉴에서 과정을 신청해 보세요.</div>` : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>교육명</th>
                  <th>주제</th>
                  <th>일시 · 이수시간</th>
                  <th>장소</th>
                  <th>진행 상태</th>
                  <th>내 출석·만족도 실행</th>
                </tr>
              </thead>
              <tbody>
                ${upcomingEnrolled.map(({ course, completed, satDone }) => `
                  <tr>
                    <td><strong>${esc(course.title)}</strong> ${course.required ? '<span class="req-badge">필수</span>' : ''}</td>
                    <td><span class="topic-chip">${esc(course.topic)}</span></td>
                    <td>${esc(course.date)} ${esc(course.startTime)}~${esc(course.endTime)} (${course.hours}h)</td>
                    <td>${esc(course.place)}</td>
                    <td><span class="status-badge">${esc(course.status)}</span></td>
                    <td>
                      <div class="btn-row">
                        ${!completed
                          ? `<button class="btn btn-xs btn-primary" data-open-qr-sim="${esc(course.id)}" data-qr-type="attend">📱 출석 QR 스캔</button><button class="btn btn-xs btn-danger-outline" data-cancel-enroll="${esc(course.id)}">신청 취소</button>`
                          : `<span class="enrolled-chip">출석·수료 완료</span>`}
                        ${completed && !satDone
                          ? `<button class="btn btn-xs btn-accent" data-open-qr-sim="${esc(course.id)}" data-qr-type="satisfaction">📝 만족도 QR 응답</button>`
                          : (satDone ? '<span class="badge-subtle">만족도 완료</span>' : '')}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    bindStudentDashboardEvents(container, emp.id);
  }

  function bindStudentDashboardEvents(container, empId) {
    container.querySelectorAll('.kpi-card[data-drill-target]').forEach((card) => {
      card.addEventListener('click', () => {
        Store.setActiveMenu(card.dataset.drillTarget);
      });
    });
    container.querySelectorAll('[data-go-menu]').forEach((btn) => {
      btn.addEventListener('click', () => Store.setActiveMenu(btn.dataset.goMenu));
    });
    container.querySelectorAll('[data-notice-id]').forEach((item) => {
      item.addEventListener('click', () => {
        const nid = item.dataset.noticeId;
        const ntype = item.dataset.noticeType;
        const cid = item.dataset.noticeCourse;
        Store.markNoticeRead(nid, empId);
        if (ntype === 'assessment') {
          Store.setActiveMenu('student-assessment');
        } else if (ntype === 'deadline' && cid) {
          window.AI360App.openQRSimulatorModal(cid, 'attend');
        } else {
          Store.setActiveMenu('student-courses');
        }
      });
    });
    container.querySelectorAll('[data-cancel-enroll]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('정말 이 교육 신청을 취소하시겠습니까?')) return;
        const res = Store.cancelEnrollment(btn.dataset.cancelEnroll, empId);
        showToast(res.message, res.ok ? 'info' : 'warning');
      });
    });
    container.querySelectorAll('[data-quick-enroll]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = Store.enrollCourse(btn.dataset.quickEnroll, empId, '추천바로신청');
        showToast(res.message, res.ok ? 'success' : 'warning');
      });
    });
    container.querySelectorAll('[data-open-qr-sim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.AI360App.openQRSimulatorModal(btn.dataset.openQrSim, btn.dataset.qrType || 'apply');
      });
    });
  }

  /* =========================================================================
   * ② 교육 안내·신청
   * ========================================================================= */
  function renderStudentCourses(profile, container) {
    const db = Store.getDB();
    const emp = profile.emp;
    const enrolledSet = new Set(profile.myEnrollments.map((e) => e.courseId));
    const completedSet = new Set(profile.myCompletions.map((c) => c.courseId));

    const filtered = db.courses.filter((c) => {
      if (courseFilterMode === 'eligible' && !isEmployeeEligibleForCourse(emp, c)) return false;
      if (courseTopicFilter !== 'ALL' && c.topic !== courseTopicFilter) return false;
      return true;
    });

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">집합교육 안내 · 온라인/QR 신청</span>
          <h1 class="page-title">교육 안내 및 수강 신청</h1>
          <p class="page-desc">본인 직급(${esc(emp.rank)}) 및 소속(${esc(emp.org)})에 해당하는 집합교육을 확인하고 즉시 신청·취소할 수 있습니다.</p>
        </div>
      </div>

      <div class="filter-bar card">
        <div class="seg-group">
          <button class="seg-btn ${courseFilterMode === 'eligible' ? 'active' : ''}" data-elig-mode="eligible">나에게 해당하는 교육만</button>
          <button class="seg-btn ${courseFilterMode === 'all' ? 'active' : ''}" data-elig-mode="all">전체 개설 교육 보기</button>
        </div>
        <div class="filter-right">
          <label class="inline-label">교육 주제</label>
          <select id="stu-topic-select" class="form-select">
            <option value="ALL">전체 10대 주제</option>
            ${window.AI360Seed.TOPICS.map((t) => `<option value="${esc(t)}" ${courseTopicFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="course-cards-grid">
        ${filtered.map((c) => {
          const sum = Store.getCourseSummary(c.id);
          const eligible = isEmployeeEligibleForCourse(emp, c);
          const isEnrolled = enrolledSet.has(c.id);
          const isCompleted = completedSet.has(c.id);
          const canApply = eligible && ['등록', '안내', '신청 중', '교육 당일(출석 인증)'].includes(c.status);

          return `
            <div class="course-card ${isEnrolled ? 'enrolled-border' : ''}">
              <div class="course-card-top">
                <div>
                  <span class="topic-chip">${esc(c.topic)}</span>
                  ${c.required ? '<span class="req-badge">필수교육</span>' : '<span class="opt-badge">선택</span>'}
                </div>
                <span class="status-badge">${esc(c.status)}</span>
              </div>
              <h3 class="course-card-title">${esc(c.title)}</h3>
              <p class="course-card-purpose">${esc(c.purpose)}</p>
              <div class="course-meta-list">
                <div><strong>교육 대상:</strong> ${esc(formatTargetSummary(c))} ${eligible ? '<span class="elig-ok">(해당)</span>' : '<span class="elig-no">(비대상)</span>'}</div>
                <div><strong>교육 일시:</strong> ${esc(c.date)} ${esc(c.startTime)}~${esc(c.endTime)} (${c.hours}시간)</div>
                <div><strong>교육 장소:</strong> ${esc(c.place)}</div>
                <div><strong>초빙 강사:</strong> ${esc(c.instructorName)} (${esc(c.instructorOrg)})</div>
                <div><strong>신청 현황:</strong> <strong>${sum.enrollList.length}</strong> / ${c.capacity}명 (${sum.enrollRateOfCap}%) · 기한 ${esc(c.applyEnd)}</div>
              </div>
              <div class="course-card-footer">
                <button class="btn btn-xs btn-ghost" data-open-qr-sim="${esc(c.id)}" data-qr-type="apply">📱 모바일 신청 QR 화면</button>
                <div class="btn-row">
                  ${isCompleted
                    ? '<span class="enrolled-chip">✓ 수료 완료</span>'
                    : isEnrolled
                      ? `<span class="enrolled-chip">신청됨</span>
                         <button class="btn btn-xs btn-danger-outline" data-cancel-enroll="${esc(c.id)}">신청 취소</button>`
                      : canApply
                        ? `<button class="btn btn-sm btn-primary" data-do-enroll="${esc(c.id)}">교육 신청</button>`
                        : `<button class="btn btn-sm btn-disabled" disabled>${eligible ? '마감/종료' : '대상 아님'}</button>`
                  }
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('[data-elig-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        courseFilterMode = b.dataset.eligMode;
        renderStudentCourses(Store.getEmployeeProfileSummary(emp.id), container);
      });
    });
    const sel = container.querySelector('#stu-topic-select');
    if (sel) {
      sel.addEventListener('change', () => {
        courseTopicFilter = sel.value;
        renderStudentCourses(Store.getEmployeeProfileSummary(emp.id), container);
      });
    }
    container.querySelectorAll('[data-do-enroll]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = Store.enrollCourse(b.dataset.doEnroll, emp.id, '포털신청');
        showToast(res.message, res.ok ? 'success' : 'warning');
      });
    });
    container.querySelectorAll('[data-cancel-enroll]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = Store.cancelEnrollment(b.dataset.cancelEnroll, emp.id);
        showToast(res.message, res.ok ? 'info' : 'warning');
      });
    });
    container.querySelectorAll('[data-open-qr-sim]').forEach((b) => {
      b.addEventListener('click', () => {
        window.AI360App.openQRSimulatorModal(b.dataset.openQrSim, b.dataset.qrType);
      });
    });
  }

  /* =========================================================================
   * ③ QR 출석 인증 / 만족도 응답 (현장 모바일 체험 뷰)
   * ========================================================================= */
  function renderStudentQRCenter(profile, container) {
    const db = Store.getDB();
    const emp = profile.emp;
    if (!db.courses.some((c) => c.id === activeQrCourseId)) {
      activeQrCourseId = db.courses[0].id;
    }
    const course = db.courses.find((c) => c.id === activeQrCourseId);
    const att = profile.myAttendances.find((a) => a.courseId === course.id);
    const comp = profile.myCompletions.find((c) => c.courseId === course.id);
    const sat = profile.mySatisfactions.find((s) => s.courseId === course.id);
    const enr = profile.myEnrollments.find((e) => e.courseId === course.id);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">현장 QR 무인 출결 · 수료 · 만족도 조사</span>
          <h1 class="page-title">QR 출석 인증 및 만족도 응답</h1>
          <p class="page-desc">교육장 입구·종료 화면에 게시된 QR코드를 스마트폰으로 찍었을 때 나타나는 모바일 최적화 화면입니다.</p>
        </div>
      </div>

      <div class="card mb-16">
        <label class="inline-label"><strong>현장 QR 대상 교육과정 선택:</strong></label>
        <select id="qr-center-course" class="form-select" style="max-width:520px">
          ${db.courses.map((c) => `
            <option value="${esc(c.id)}" ${c.id === activeQrCourseId ? 'selected' : ''}>
              [${esc(c.status)}] ${esc(c.title)} (${esc(c.date)})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="qr-dual-mobile-wrap">
        <!-- 모바일 카드 1: 출석 QR 인증 -->
        <div class="mobile-frame-card">
          <div class="mobile-notch">AI 360 Mobile · 현장 출석 QR</div>
          <div class="mobile-body">
            <span class="topic-chip">${esc(course.topic)}</span>
            <h3>${esc(course.title)}</h3>
            <p class="mobile-meta">📅 ${esc(course.date)} ${esc(course.startTime)}~${esc(course.endTime)} (${course.hours}시간)<br>📍 ${esc(course.place)}</p>

            <div class="mobile-user-box">
              <div>인증자: <strong>${esc(emp.name)} ${esc(emp.rank)}</strong></div>
              <div>소속: ${esc(emp.org)} &gt; ${esc(emp.dept)}</div>
              <div>사전신청 여부: ${enr ? '<strong class="text-success">신청 완료</strong>' : `<strong class="text-warning">미신청 (${course.allowWalkIn ? '현장신청 후 출석 허용' : '현장출석 차단 설정됨'})</strong>`}</div>
            </div>

            ${att ? `
              <div class="qr-done-banner">
                <div class="qr-done-icon">✓</div>
                <strong>출석 및 수료 인증 완료!</strong>
                <p>「${esc(course.title)}」 출석이 인증되었습니다.<br>수료(${course.hours}시간) 처리되었습니다.</p>
                <small>인증 시각: ${esc(att.checkedAt)} (${esc(att.method)})</small>
              </div>
            ` : `
              <button id="btn-do-qr-attend" class="btn btn-primary btn-block btn-lg">
                📍 지금 현장 출석·수료 인증하기
              </button>
              <p class="mobile-footnote">버튼 클릭 시 휴대폰으로 교육장 출석 QR을 촬영한 것과 동일하게 즉시 수료 집계됩니다.</p>
            `}
          </div>
        </div>

        <!-- 모바일 카드 2: 만족도 조사 QR (5문항 + 자유의견) -->
        <div class="mobile-frame-card">
          <div class="mobile-notch">AI 360 Mobile · 만족도 조사 QR</div>
          <div class="mobile-body">
            <span class="badge-subtle">수료자 전용 · 1인 1회</span>
            <h3>교육 만족도 조사 (5문항)</h3>
            ${!comp ? `
              <div class="qr-lock-banner">
                <strong>🔒 출석·수료 인증 후 참여 가능</strong>
                <p>왼쪽 출석 QR 인증을 완료하면 만족도 응답 화면이 즉시 활성화됩니다.</p>
              </div>
            ` : sat ? `
              <div class="qr-done-banner">
                <div class="qr-done-icon">★</div>
                <strong>만족도 응답 완료 (감사합니다)</strong>
                <p>제출 시각: ${esc(sat.submittedAt)} · 결과보고서에 자동 반영되었습니다.</p>
                <div class="sat-summary-mini">
                  ${SATISFACTION_ITEMS.map((it) => `<div>${esc(it.id)}: <strong>${sat.scores[it.id]}점</strong></div>`).join('')}
                </div>
                ${sat.comment ? `<p class="mt-8">"${esc(sat.comment)}"</p>` : ''}
              </div>
            ` : `
              <form id="stu-sat-form" class="sat-form">
                ${SATISFACTION_ITEMS.map((item) => `
                  <div class="sat-q-block">
                    <label class="sat-q-label"><strong>${esc(item.id)}.</strong> ${esc(item.text)}</label>
                    <div class="rating-5-group">
                      ${[1, 2, 3, 4, 5].map((score) => `
                        <label class="rating-pill">
                          <input type="radio" name="${esc(item.id)}" value="${score}" ${score === 5 ? 'checked' : ''}>
                          <span>${score}점</span>
                        </label>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
                <div class="sat-q-block">
                  <label class="sat-q-label"><strong>자유의견 (선택)</strong> 좋았던 점, 개선할 점</label>
                  <textarea name="comment" rows="2" class="form-textarea" placeholder="실습 예제가 실무에 많은 도움이 되었습니다."></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-block">만족도 조사 제출하기</button>
              </form>
            `}
          </div>
        </div>
      </div>
    `;

    const sel = container.querySelector('#qr-center-course');
    if (sel) {
      sel.addEventListener('change', () => {
        activeQrCourseId = sel.value;
        renderStudentQRCenter(Store.getEmployeeProfileSummary(emp.id), container);
      });
    }

    const attendBtn = container.querySelector('#btn-do-qr-attend');
    if (attendBtn) {
      attendBtn.addEventListener('click', () => {
        const res = Store.checkInAttendanceQR(course.id, emp.id);
        showToast(res.message, res.ok ? 'success' : 'error');
      });
    }

    const satForm = container.querySelector('#stu-sat-form');
    if (satForm) {
      satForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(satForm);
        const scores = {};
        SATISFACTION_ITEMS.forEach((it) => { scores[it.id] = Number(fd.get(it.id) || 5); });
        const res = Store.submitSatisfaction(course.id, emp.id, scores, fd.get('comment'));
        showToast(res.message, res.ok ? 'success' : 'warning');
      });
    }
  }

  /* =========================================================================
   * ④ AI 역량 진단 (7문항 5점 척도 응답 & 즉시 분석 결과)
   * ========================================================================= */
  function renderStudentAssessment(profile, container) {
    const db = Store.getDB();
    const emp = profile.emp;
    const openRound = db.assessment_rounds.find((r) => r.status === 'open');
    const existingOpen = openRound
      ? profile.myAssessments.find((a) => a.roundId === openRound.id)
      : null;
    const latest = profile.latestAssessment;

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">연 1~2회 회차형 AI 역량 측정</span>
          <h1 class="page-title">AI 역량 자가진단 (7개 영역)</h1>
          <p class="page-desc">산식: 영역 점수 = (응답 - 1) ÷ 4 × 100 · 등급: 입문(0~39) / 기초(40~59) / 활용(60~74) / 심화(75~89) / 선도(90~100)</p>
        </div>
      </div>

      ${latest ? renderAssessmentResultCard(profile) : ''}

      <div class="card mt-16">
        <div class="card-header">
          <h3>${openRound ? `진행 중 회차: ${esc(openRound.title)} (${esc(openRound.periodStart)} ~ ${esc(openRound.periodEnd)})` : '현재 진행 중인 진단 회차가 없습니다.'}</h3>
          ${openRound ? `<span class="status-badge status-open">${existingOpen ? '응답 완료 (재제출·수정 가능)' : '미응답 · 참여 가능'}</span>` : '<span class="status-badge">마감됨</span>'}
        </div>

        ${!openRound ? `
          <div class="empty-hint">총괄 관리자가 진단 회차를 개설(열림)하면 실시 기간 동안 이 화면에서 진단 문항이 활성화됩니다.</div>
        ` : `
          <form id="assessment-take-form" class="assessment-form">
            ${ASSESSMENT_ITEMS.map((item, idx) => {
              const curVal = existingOpen ? existingOpen.answers[item.id] : 4;
              const scaleLabels = ['전혀 그렇지 않다(0점)', '그렇지 않다(25점)', '보통이다(50점)', '그렇다(75점)', '매우 그렇다(100점)'];
              return `
                <div class="assess-item-row">
                  <div class="assess-q-info">
                    <span class="assess-domain-tag">${esc(item.id)} · ${esc(item.domain)}</span>
                    <p class="assess-q-text">${idx + 1}. ${esc(item.text)}</p>
                  </div>
                  <div class="assess-scale-group">
                    ${[1, 2, 3, 4, 5].map((val) => `
                      <label class="scale-choice">
                        <input type="radio" name="${esc(item.id)}" value="${val}" ${Number(curVal) === val ? 'checked' : ''}>
                        <span class="scale-box">
                          <strong>${val}점</strong>
                          <small>${scaleLabels[val - 1]}</small>
                        </span>
                      </label>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
            <div class="form-actions-bar">
              <button type="submit" class="btn btn-primary btn-lg">진단 제출 및 맞춤 추천 교육 확인하기</button>
            </div>
          </form>
        `}
      </div>
    `;

    const form = container.querySelector('#assessment-take-form');
    if (form && openRound) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const answers = {};
        ASSESSMENT_ITEMS.forEach((it) => { answers[it.id] = Number(fd.get(it.id) || 3); });
        const res = Store.submitAssessment(openRound.id, emp.id, answers);
        if (res.ok) {
          showToast(`진단 제출 완료! 종합 ${res.record.totalScore}점 (${res.record.grade} 등급)`, 'success');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          showToast(res.message, 'warning');
        }
      });
    }

    container.querySelectorAll('[data-go-courses]').forEach((b) => {
      b.addEventListener('click', () => Store.setActiveMenu('student-courses'));
    });
  }

  function renderAssessmentResultCard(profile) {
    const latest = profile.latestAssessment;
    const gInfo = getGradeInfo(latest.totalScore);
    const labels = ASSESSMENT_ITEMS.map((i) => i.domain);
    const series = [
      {
        name: '최근 진단 점수',
        values: ASSESSMENT_ITEMS.map((i) => latest.domainScores[i.id] || 0),
        color: '#2563eb',
        fillOpacity: 0.24
      }
    ];
    if (profile.h1 && profile.h2 && latest.roundId === profile.h2.roundId) {
      series.push({
        name: '이전 회차(상반기)',
        values: ASSESSMENT_ITEMS.map((i) => profile.h1.domainScores[i.id] || 0),
        color: '#94a3b8',
        fillOpacity: 0.06,
        dashed: true
      });
    }

    const s1 = profile.strengths[0];
    const s2 = profile.strengths[1];
    const w1 = profile.weaknesses[0];
    const w2 = profile.weaknesses[1];

    return `
      <div class="card result-highlight-card">
        <div class="card-header">
          <h3>나의 최근 역량 진단 분석 결과</h3>
          <span class="grade-pill" style="background:${gInfo.bg};color:${gInfo.color}">종합 ${latest.totalScore}점 · ${esc(gInfo.grade)} 등급</span>
        </div>
        <div class="grid-2-cols align-center">
          <div class="chart-box center">
            ${Charts.renderRadarChartSVG(labels, series, 300)}
          </div>
          <div class="diag-feedback-panel">
            <div class="feedback-box good">
              <h4>🌟 나의 강점 영역 2가지</h4>
              <p>• <strong>${esc(s1.domain)} (${s1.score}점)</strong> 및 <strong>${esc(s2.domain)} (${s2.score}점)</strong> 영역에서 우수한 활용 역량을 보유하고 있습니다. 부서 내 AI 실무 활용 사례 확산 리더 역할을 수행하기에 적합합니다.</p>
            </div>
            <div class="feedback-box improve">
              <h4>🎯 중점 보완 영역 2가지 &amp; 교육 추천 연결</h4>
              <p>• <strong>${esc(w1.domain)} (${w1.score}점)</strong> 보완을 위해 <strong>「${esc(w1.mappedTopics[0])}」</strong> 주제 과정을 우선 추천합니다.</p>
              <p>• <strong>${esc(w2.domain)} (${w2.score}점)</strong> 역량 강화를 위해 <strong>「${esc(w2.mappedTopics[0])}」</strong> 실습 과정 수강을 권장합니다.</p>
              ${profile.emp.rank === '과장' ? `<p>• <strong>[직급 맞춤]</strong> 과장급 간부이시므로 <strong>「관리자 AI 리더십」</strong> 과정이 추가 추천되었습니다.</p>` : ''}
            </div>
            <button class="btn btn-outline btn-sm mt-8" data-go-courses="1">추천 집합교육 바로 신청하러 가기 →</button>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================================
   * ⑤ 나의 AI 성장 기록
   * ========================================================================= */
  function renderStudentGrowth(profile, container) {
    const db = Store.getDB();
    const emp = profile.emp;

    const historyRows = profile.myEnrollments.map((en) => {
      const c = db.courses.find((x) => x.id === en.courseId);
      const comp = profile.myCompletions.find((cm) => cm.courseId === en.courseId);
      const att = profile.myAttendances.find((a) => a.courseId === en.courseId);
      const sat = profile.mySatisfactions.find((s) => s.courseId === en.courseId);
      return { en, c, comp, att, sat };
    }).filter((x) => x.c);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">누적 학습 &amp; 역량 변화 포트폴리오</span>
          <h1 class="page-title">나의 AI 성장 기록</h1>
          <p class="page-desc">회차별 AI 역량 진단 변화와 집합교육 신청·수료·이수시간 기록을 한눈에 확인합니다.</p>
        </div>
      </div>

      <!-- 회차 간 영역별 점수 비교표 -->
      <div class="card mb-16">
        <div class="card-header">
          <h3>진단 회차 간 7개 영역별 변화 분석</h3>
          <span class="badge-subtle">상반기 vs 하반기 역량 성장</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>문항</th>
                <th>역량 영역</th>
                <th>2026 상반기</th>
                <th>2026 하반기</th>
                <th>변화폭 (Δ)</th>
                <th>연계 추천 주제</th>
              </tr>
            </thead>
            <tbody>
              ${ASSESSMENT_ITEMS.map((it) => {
                const v1 = profile.h1 ? profile.h1.domainScores[it.id] : null;
                const v2 = profile.h2 ? profile.h2.domainScores[it.id] : null;
                const diff = v1 !== null && v2 !== null ? v2 - v1 : null;
                return `
                  <tr>
                    <td><strong>${esc(it.id)}</strong></td>
                    <td>${esc(it.domain)}</td>
                    <td>${v1 !== null ? v1 + '점' : '-'}</td>
                    <td><strong>${v2 !== null ? v2 + '점' : '미응답'}</strong></td>
                    <td class="${diff > 0 ? 'text-success font-bold' : diff < 0 ? 'text-danger' : ''}">
                      ${diff !== null ? (diff > 0 ? `+${diff}점 ▲` : diff < 0 ? `${diff}점 ▼` : '0점 -') : '-'}
                    </td>
                    <td><span class="topic-chip">${esc(it.mappedTopics[0])}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 신청·수료 이력 -->
      <div class="card">
        <div class="card-header">
          <h3>집합교육 신청 · 출석 · 수료 이력 (누적 ${profile.totalHours}시간)</h3>
          <span class="badge-subtle">수료 ${profile.myCompletions.length}건 / 신청 ${historyRows.length}건</span>
        </div>
        ${historyRows.length === 0 ? '<div class="empty-hint">교육 신청 및 수료 이력이 없습니다.</div>' : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>교육 일자</th>
                  <th>교육명</th>
                  <th>주제</th>
                  <th>구분</th>
                  <th>출석 인증 시각</th>
                  <th>수료 상태</th>
                  <th>인정 시간</th>
                  <th>만족도</th>
                </tr>
              </thead>
              <tbody>
                ${historyRows.map(({ en, c, comp, att, sat }) => `
                  <tr>
                    <td>${esc(c.date)}</td>
                    <td><strong>${esc(c.title)}</strong></td>
                    <td><span class="topic-chip">${esc(c.topic)}</span></td>
                    <td>${c.required ? '<span class="req-badge">필수</span>' : '선택'}</td>
                    <td>${att ? `${esc(att.checkedAt)} <small>(${esc(att.method)})</small>` : '-'}</td>
                    <td>${comp ? '<span class="enrolled-chip">수료 완료</span>' : `<span class="badge-subtle">신청(${esc(en.channel)})</span>`}</td>
                    <td><strong>${comp ? comp.hours + '시간' : '-'}</strong></td>
                    <td>${sat ? '응답 완료' : (comp ? '<button class="btn btn-xs btn-outline" data-sat-now="' + esc(c.id) + '">응답하기</button>' : '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    container.querySelectorAll('[data-sat-now]').forEach((b) => {
      b.addEventListener('click', () => {
        window.AI360App.openQRSimulatorModal(b.dataset.satNow, 'satisfaction');
      });
    });
  }

  window.AI360StudentViews = {
    renderStudentMenu
  };
})();


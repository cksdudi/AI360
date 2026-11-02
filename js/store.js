/**
 * AI 360 — 상태 저장소(Store), 5단계 권한 스코프 엔진, 전주기 업무 트랜잭션 레이어
 * 향후 실제 운영 전환 시 localStorage 어댑터만 REST API / RDB(PostgreSQL·티베로 등)로 교체 가능하도록 설계
 */
(function () {
  'use strict';

  const DB_KEY = 'AI360_DEMO_DB_V3_1';
  const SESSION_KEY = 'AI360_DEMO_SESSION_V3_1';

  const {
    ASSESSMENT_ITEMS,
    SATISFACTION_ITEMS,
    getGradeInfo,
    buildPlanDocTemplate,
    buildNoticeTemplates,
    formatTargetSummary,
    isEmployeeEligibleForCourse,
    createAssessmentRecord,
    buildSeedDatabase
  } = window.AI360Seed;
  const { calcDurationHours } = window.AI360Utils;

  const ROLE_META = {
    student: { code: 'student', badge: 'A. 교육생', short: '교육생', levelNum: 1 },
    dept: { code: 'dept', badge: 'B. 부서 담당자', short: '부서 담당자', levelNum: 2 },
    bureau: { code: 'bureau', badge: 'C. 실·국 담당자', short: '실·국 담당자', levelNum: 3 },
    org: { code: 'org', badge: 'D. 소속기관 담당자', short: '소속기관 담당자', levelNum: 4 },
    admin: { code: 'admin', badge: 'E. 총괄 관리자', short: '총괄 관리자', levelNum: 5 }
  };

  let db = null;
  let session = null;
  const listeners = [];

  function nowStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function init() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        db = JSON.parse(raw);
      }
    } catch (e) {
      db = null;
    }
    if (!db || !db.employees || !db.courses) {
      db = buildSeedDatabase();
      saveDB(false);
    }

    try {
      const sRaw = localStorage.getItem(SESSION_KEY);
      if (sRaw) session = JSON.parse(sRaw);
    } catch (e) {
      session = null;
    }
    if (!session || !session.role || !getEmployeeById(session.employeeId)) {
      session = {
        role: 'admin',
        employeeId: db.defaultPersonas.admin,
        viewMode: 'manage', // 'manage' | 'personal'
        activeMenu: 'admin-dashboard',
        selectedCourseId: 'CRS-008'
      };
      saveSession(false);
    }
  }

  function saveDB(emit = true) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('localStorage 용량 제한 경고:', e);
    }
    if (emit) notify();
  }

  function saveSession(emit = true) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      // ignore
    }
    if (emit) notify();
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach((fn) => fn(db, session));
  }

  function resetDatabase() {
    db = buildSeedDatabase();
    session = {
      role: 'admin',
      employeeId: db.defaultPersonas.admin,
      viewMode: 'manage',
      activeMenu: 'admin-dashboard',
      selectedCourseId: 'CRS-008'
    };
    saveDB(false);
    saveSession(true);
  }

  function getDB() {
    return db;
  }

  function getSession() {
    return session;
  }

  function getEmployeeById(id) {
    return db.employees.find((e) => e.id === id) || null;
  }

  function addAuditLog(action, detail) {
    const actorEmp = getEmployeeById(session.employeeId);
    const roleLabel = ROLE_META[session.role]?.short || '';
    const actorText = actorEmp ? `${actorEmp.name} ${actorEmp.rank} (${roleLabel})` : roleLabel;
    db.audit_logs.unshift({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      createdAt: nowStr(),
      actor: actorText,
      action,
      detail
    });
  }

  /* =========================================================================
   * 사용자 전환 & 권한 스코프 계산
   * ========================================================================= */
  function switchRole(role, customEmployeeId) {
    let targetEmpId = customEmployeeId;
    if (!targetEmpId) {
      if (role === 'student') targetEmpId = db.defaultPersonas.student;
      else if (role === 'admin') targetEmpId = db.defaultPersonas.admin;
      else {
        // 해당 레벨의 담당자 중 기본 페르소나 또는 첫 번째 담당자
        const preferred = db.defaultPersonas[role];
        const hasPref = db.org_managers.find((m) => m.level === role && m.employeeId === preferred);
        if (hasPref) targetEmpId = preferred;
        else {
          const firstMgr = db.org_managers.find((m) => m.level === role && m.employeeId);
          targetEmpId = firstMgr ? firstMgr.employeeId : db.employees[0].id;
        }
      }
    }
    session.role = role;
    session.employeeId = targetEmpId;
    session.viewMode = role === 'student' ? 'personal' : 'manage';
    session.activeMenu = getDefaultMenuForSession();
    saveSession(true);
  }

  function setViewMode(mode) {
    if (session.role === 'student') {
      session.viewMode = 'personal';
    } else {
      session.viewMode = mode;
    }
    session.activeMenu = getDefaultMenuForSession();
    saveSession(true);
  }

  function setActiveMenu(menuId, extraPatch) {
    session.activeMenu = menuId;
    if (extraPatch && typeof extraPatch === 'object') {
      Object.assign(session, extraPatch);
    }
    saveSession(true);
  }

  function getDefaultMenuForSession() {
    if (session.role === 'student' || session.viewMode === 'personal') {
      return 'student-dashboard';
    }
    if (session.role === 'admin') {
      return 'admin-dashboard';
    }
    return 'mgr-overview';
  }

  function getManagerUnitForEmployee(role, empId) {
    const emp = getEmployeeById(empId) || db.employees[0];
    if (role === 'admin') {
      return { level: 'admin', org: null, bureau: null, dept: null, label: '전 기관 총괄 (산업통상부 및 6개 소속기관)' };
    }
    const assigned = db.org_managers.find((m) => m.level === role && m.employeeId === empId);
    if (assigned) {
      return {
        level: role,
        org: assigned.org,
        bureau: assigned.bureau,
        dept: assigned.dept,
        label: assigned.unitLabel,
        managerRecord: assigned
      };
    }
    // 임의 직원으로 시연 전환한 경우 해당 직원의 소속 단위를 기준으로 매핑
    if (role === 'org') return { level: 'org', org: emp.org, bureau: null, dept: null, label: emp.org };
    if (role === 'bureau') return { level: 'bureau', org: emp.org, bureau: emp.bureau, dept: null, label: `${emp.org} > ${emp.bureau}` };
    if (role === 'dept') return { level: 'dept', org: emp.org, bureau: emp.bureau, dept: emp.dept, label: `${emp.org} > ${emp.bureau} > ${emp.dept}` };
    return { level: 'student', org: emp.org, bureau: emp.bureau, dept: emp.dept, label: `${emp.name} (${emp.dept})` };
  }

  function filterEmployeesByScope(filter) {
    return db.employees.filter((e) => {
      if (filter.org && e.org !== filter.org) return false;
      if (filter.bureau && e.bureau !== filter.bureau) return false;
      if (filter.dept && e.dept !== filter.dept) return false;
      return true;
    });
  }

  /* =========================================================================
   * KPI 및 통계 집계 엔진 (전체 / 기관 / 실국 / 부서 / 개인 공통)
   * ========================================================================= */
  function getActiveRound() {
    return db.assessment_rounds.find((r) => r.status === 'open') || db.assessment_rounds[db.assessment_rounds.length - 1];
  }

  function getLatestAssessmentForEmployee(empId) {
    const list = db.assessment_responses.filter((r) => r.employeeId === empId);
    if (!list.length) return null;
    // 하반기(최신 회차) 우선
    for (let i = db.assessment_rounds.length - 1; i >= 0; i--) {
      const rnd = db.assessment_rounds[i];
      const found = list.find((r) => r.roundId === rnd.id);
      if (found) return found;
    }
    return list[list.length - 1];
  }

  function computeUnitAnalytics(scopeFilter) {
    const emps = filterEmployeesByScope(scopeFilter || {});
    const empSet = new Set(emps.map((e) => e.id));
    const count = emps.length;

    const unitEnrollments = db.enrollments.filter((en) => en.status === 'active' && empSet.has(en.employeeId));
    const unitCompletions = db.completions.filter((c) => empSet.has(c.employeeId));

    const enrolledEmpSet = new Set(unitEnrollments.map((e) => e.employeeId));
    const completedEmpSet = new Set(unitCompletions.map((c) => c.employeeId));
    const totalHours = unitCompletions.reduce((acc, c) => acc + Number(c.hours || 0), 0);

    // 필수교육 이수 여부 (완료/진행 필수교육 중 1건 이상 수료한 직원 비율)
    const reqCourseIds = new Set(db.courses.filter((c) => c.required).map((c) => c.id));
    const reqCompletedEmpSet = new Set(
      unitCompletions.filter((c) => reqCourseIds.has(c.courseId)).map((c) => c.employeeId)
    );

    // 현재(최신 진행) 진단 응답률
    const activeRound = getActiveRound();
    const activeRoundResponses = activeRound
      ? db.assessment_responses.filter((r) => r.roundId === activeRound.id && empSet.has(r.employeeId))
      : [];

    // 최신 진단 기준 개인별 역량 점수·영역별 평균·등급 분포
    const domainSums = {};
    ASSESSMENT_ITEMS.forEach((it) => { domainSums[it.id] = 0; });
    const gradeCounts = { 선도: 0, 심화: 0, 활용: 0, 기초: 0, 입문: 0, 미진단: 0 };
    let assessedCount = 0;
    let totalScoreSum = 0;

    emps.forEach((e) => {
      const latest = getLatestAssessmentForEmployee(e.id);
      if (!latest) {
        gradeCounts.미진단++;
        return;
      }
      assessedCount++;
      totalScoreSum += latest.totalScore;
      gradeCounts[latest.grade] = (gradeCounts[latest.grade] || 0) + 1;
      ASSESSMENT_ITEMS.forEach((it) => {
        domainSums[it.id] += Number(latest.domainScores[it.id] || 0);
      });
    });

    const domainAverages = ASSESSMENT_ITEMS.map((it) => ({
      id: it.id,
      domain: it.domain,
      score: assessedCount > 0 ? Math.round((domainSums[it.id] / assessedCount) * 10) / 10 : 0
    }));

    const avgCompetencyScore = assessedCount > 0 ? Math.round((totalScoreSum / assessedCount) * 10) / 10 : 0;
    const enrollRate = count > 0 ? Math.round((enrolledEmpSet.size / count) * 1000) / 10 : 0;
    const completionRate = unitEnrollments.length > 0
      ? Math.round((unitCompletions.length / unitEnrollments.length) * 1000) / 10
      : 0;
    const empCompletionRate = count > 0 ? Math.round((completedEmpSet.size / count) * 1000) / 10 : 0;
    const reqCompletionRate = count > 0 ? Math.round((reqCompletedEmpSet.size / count) * 1000) / 10 : 0;
    const diagResponseRate = count > 0 ? Math.round((activeRoundResponses.length / count) * 1000) / 10 : 0;

    return {
      headcount: count,
      enrolledUniqueCount: enrolledEmpSet.size,
      totalEnrollments: unitEnrollments.length,
      completedUniqueCount: completedEmpSet.size,
      totalCompletions: unitCompletions.length,
      enrollRate,
      completionRate,
      empCompletionRate,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHoursPerEmp: count > 0 ? Math.round((totalHours / count) * 10) / 10 : 0,
      reqCompletedCount: reqCompletedEmpSet.size,
      reqCompletionRate,
      activeRound,
      diagRespondedCount: activeRoundResponses.length,
      diagResponseRate,
      assessedCount,
      avgCompetencyScore,
      avgGradeInfo: getGradeInfo(avgCompetencyScore),
      domainAverages,
      gradeCounts
    };
  }

  /* =========================================================================
   * 개인별 상세 요약 & 맞춤형 교육 추천 (Section 4, 5)
   * ========================================================================= */
  function getEmployeeProfileSummary(empId) {
    const emp = getEmployeeById(empId);
    if (!emp) return null;

    const myEnrollments = db.enrollments.filter((e) => e.employeeId === empId && e.status === 'active');
    const myCompletions = db.completions.filter((c) => c.employeeId === empId);
    const myAttendances = db.attendances.filter((a) => a.employeeId === empId);
    const mySatisfactions = db.satisfaction_responses.filter((s) => s.employeeId === empId);
    const myAssessments = db.assessment_responses.filter((r) => r.employeeId === empId);

    const totalHours = myCompletions.reduce((acc, c) => acc + Number(c.hours || 0), 0);
    const reqCourseIds = new Set(db.courses.filter((c) => c.required).map((c) => c.id));
    const hasCompletedRequired = myCompletions.some((c) => reqCourseIds.has(c.courseId));

    const latestAssessment = getLatestAssessmentForEmployee(empId);
    const h1 = myAssessments.find((a) => a.roundId === 'RND-2026-H1') || null;
    const h2 = myAssessments.find((a) => a.roundId === 'RND-2026-H2') || null;

    // 강점 2개 · 보완 2개 분석
    let strengths = [];
    let weaknesses = [];
    if (latestAssessment) {
      const sorted = ASSESSMENT_ITEMS.map((it) => ({
        id: it.id,
        domain: it.domain,
        score: latestAssessment.domainScores[it.id] ?? 0,
        mappedTopics: it.mappedTopics
      })).sort((a, b) => b.score - a.score);
      strengths = sorted.slice(0, 2);
      weaknesses = sorted.slice(-2).reverse();
    }

    // 맞춤형 추천 교육 생성 (보완 영역 매핑 + 과장급 관리자 AI 리더십 추가 추천)
    const recommendations = buildRecommendationsForEmployee(emp, weaknesses, myEnrollments, myCompletions);

    return {
      emp,
      myEnrollments,
      myCompletions,
      myAttendances,
      mySatisfactions,
      myAssessments,
      totalHours: Math.round(totalHours * 10) / 10,
      hasCompletedRequired,
      latestAssessment,
      h1,
      h2,
      strengths,
      weaknesses,
      recommendations
    };
  }

  function buildRecommendationsForEmployee(emp, weaknesses, myEnrollments, myCompletions) {
    const completedIds = new Set(myCompletions.map((c) => c.courseId));
    const enrolledIds = new Set(myEnrollments.map((e) => e.courseId));
    const recs = [];
    const usedCourseIds = new Set();

    const candidateCourses = db.courses.filter((c) =>
      c.status !== '결과보고 완료' && !completedIds.has(c.id) && isEmployeeEligibleForCourse(emp, c)
    );
    const fallbackAllCourses = db.courses.filter((c) => !completedIds.has(c.id));

    // 1) 과장 직급은 '관리자 AI 리더십' 추가 추천 (PDF p.6 명시 규칙)
    if (emp.rank === '과장') {
      const leaderCourse = db.courses.find((c) => c.topic === '관리자 AI 리더십');
      if (leaderCourse) {
        usedCourseIds.add(leaderCourse.id);
        recs.push({
          course: leaderCourse,
          topic: '관리자 AI 리더십',
          badge: '직급 맞춤 추천',
          reason: `과장급 간부 대상 필수 리더십 추천 — 부서 내 AI 활용 확산 및 정책 의사결정 역량 강화`,
          alreadyEnrolled: enrolledIds.has(leaderCourse.id)
        });
      }
    }

    // 2) 진단 보완 영역 2개 → 교육 주제 매핑 추천
    if (weaknesses && weaknesses.length > 0) {
      weaknesses.forEach((w) => {
        const primaryTopic = w.mappedTopics[0];
        let matched = candidateCourses.find((c) => w.mappedTopics.includes(c.topic) && !usedCourseIds.has(c.id));
        if (!matched) {
          matched = fallbackAllCourses.find((c) => w.mappedTopics.includes(c.topic) && !usedCourseIds.has(c.id));
        }
        if (matched) {
          usedCourseIds.add(matched.id);
          recs.push({
            course: matched,
            topic: matched.topic,
            badge: `보완영역 연계 (${w.domain})`,
            reason: `최근 역량 진단에서 '${w.domain}(${w.score}점)' 영역 보완이 필요하여 「${matched.topic}」 과정을 추천합니다.`,
            alreadyEnrolled: enrolledIds.has(matched.id)
          });
        } else {
          recs.push({
            course: null,
            topic: primaryTopic,
            badge: `추천 주제 (${w.domain})`,
            reason: `최근 역량 진단에서 '${w.domain}(${w.score}점)' 영역 보완을 위해 차기 「${primaryTopic}」 개설 과정 수강을 권장합니다.`,
            alreadyEnrolled: false
          });
        }
      });
    } else {
      // 미진단자 기본 입문 과정 추천
      const intro = candidateCourses.find((c) => c.topic === 'AI 입문') || candidateCourses[0];
      if (intro && !usedCourseIds.has(intro.id)) {
        recs.push({
          course: intro,
          topic: intro.topic,
          badge: '기초 입문 추천',
          reason: '아직 AI 역량 진단 이력이 없어 공공부문 필수 기본 과정부터 시작하시는 것을 추천합니다.',
          alreadyEnrolled: enrolledIds.has(intro.id)
        });
      }
    }

    return recs;
  }

  /* =========================================================================
   * 집합교육 관리 및 자동 집계 비즈니스 로직 (Section 3)
   * ========================================================================= */
  function getCourseSummary(courseId) {
    const course = db.courses.find((c) => c.id === courseId);
    if (!course) return null;

    const eligibleList = db.employees.filter((e) => isEmployeeEligibleForCourse(e, course));
    const enrollList = db.enrollments.filter((e) => e.courseId === courseId && e.status === 'active');
    const attendList = db.attendances.filter((a) => a.courseId === courseId);
    const completeList = db.completions.filter((c) => c.courseId === courseId);
    const satList = db.satisfaction_responses.filter((s) => s.courseId === courseId);
    const qrs = db.qr_codes.filter((q) => q.courseId === courseId);
    const docBundle = db.course_reports.find((r) => r.courseId === courseId);

    const enrolledIds = new Set(enrollList.map((e) => e.employeeId));
    const attendedIds = new Set(attendList.map((a) => a.employeeId));
    const unappliedList = eligibleList.filter((e) => !enrolledIds.has(e.id));
    const absentAfterApplyList = enrollList
      .filter((e) => !attendedIds.has(e.employeeId))
      .map((e) => ({ enrollment: e, emp: getEmployeeById(e.employeeId) }))
      .filter((x) => x.emp);

    // 만족도 문항별 평균
    const satItemAvgs = SATISFACTION_ITEMS.map((item) => {
      if (!satList.length) return { id: item.id, text: item.text, avg: 0 };
      const sum = satList.reduce((acc, r) => acc + Number(r.scores[item.id] || 0), 0);
      return { id: item.id, text: item.text, avg: Math.round((sum / satList.length) * 100) / 100 };
    });
    const satOverallAvg = satList.length
      ? Math.round((satItemAvgs.reduce((acc, x) => acc + x.avg, 0) / satItemAvgs.length) * 100) / 100
      : 0;

    return {
      course,
      eligibleList,
      enrollList,
      attendList,
      completeList,
      satList,
      unappliedList,
      absentAfterApplyList,
      qrs,
      docBundle,
      satItemAvgs,
      satOverallAvg,
      enrollRateOfCap: course.capacity > 0 ? Math.round((enrollList.length / course.capacity) * 1000) / 10 : 0,
      completionRate: enrollList.length > 0 ? Math.round((completeList.length / enrollList.length) * 1000) / 10 : 0,
      satResponseRate: completeList.length > 0 ? Math.round((satList.length / completeList.length) * 1000) / 10 : 0,
      nextTodo: getCourseNextTodo(course, docBundle)
    };
  }

  function getCourseNextTodo(course) {
    switch (course.status) {
      case '등록':
        return { text: '안내 미발송', tone: 'warn', actionHint: '교육 안내문 발송 필요' };
      case '안내':
      case '신청 중':
        return { text: '신청 접수 중', tone: 'info', actionHint: '미신청자 독려 / 마감 관리' };
      case '신청 마감':
        return { text: '당일 QR 게시 준비', tone: 'info', actionHint: '출석 QR 인쇄물 게시' };
      case '교육 당일(출석 인증)':
        return { text: '현장 출석 진행 중', tone: 'primary', actionHint: '출석 QR 인증 및 누락자 확인' };
      case '만족도 조사':
        return { text: '결과보고 미작성', tone: 'warn', actionHint: '만족도 집계 후 결과보고 완료 처리' };
      case '결과보고 완료':
        return { text: '전주기 완료', tone: 'done', actionHint: '결과보고서 열람·인쇄 가능' };
      default:
        return { text: course.status, tone: 'info', actionHint: '' };
    }
  }

  function registerCourse(input) {
    const seq = db.courses.length + 1;
    const id = `CRS-${String(seq).padStart(3, '0')}`;
    const hours = calcDurationHours(input.startTime, input.endTime) || 3;
    const course = {
      seq,
      id,
      title: input.title.trim(),
      purpose: input.purpose.trim(),
      targetType: input.targetType,
      targetOrg: input.targetOrg || '',
      targetBureau: input.targetBureau || '',
      targetDept: input.targetDept || '',
      topic: input.topic,
      instructorName: input.instructorName.trim(),
      instructorOrg: input.instructorOrg.trim(),
      instructorTitle: input.instructorTitle || '전문강사',
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      hours,
      place: input.place.trim(),
      capacity: Number(input.capacity) || 50,
      applyStart: input.applyStart,
      applyEnd: input.applyEnd,
      required: Boolean(input.required),
      allowWalkIn: input.allowWalkIn !== false,
      completionRule: input.completionRule || '현장 QR 출석 인증',
      status: '등록',
      noticeSent: false,
      noticeSentAt: null,
      createdAt: nowStr()
    };

    const noticesText = buildNoticeTemplates(course);
    course.messengerText = noticesText.messenger;
    course.emailText = noticesText.email;

    db.courses.unshift(course);

    // 1) QR 3종 즉시 자동 생성
    db.qr_codes.push(
      { id: `QR-${id}-APPLY`, courseId: id, type: 'apply', label: '신청 QR', token: `AI360://qr?type=apply&course=${id}` },
      { id: `QR-${id}-ATTEND`, courseId: id, type: 'attend', label: '출석(장소 인증) QR', token: `AI360://qr?type=attend&course=${id}` },
      { id: `QR-${id}-SATIS`, courseId: id, type: 'satisfaction', label: '만족도 QR', token: `AI360://qr?type=satisfaction&course=${id}` }
    );

    // 2) 계획서 & 결과보고서 초안 즉시 자동 생성
    db.course_reports.push({
      courseId: id,
      plan: buildPlanDocTemplate(course),
      report: {
        docNo: `정보관리담당관-${202650 + seq}호`,
        title: `${course.title} 운영 결과보고`,
        achievements: `○ QR 기반 원스톱 신청·출결 운영으로 수기 명부 대조 업무 자동화 및 정확한 이수 실적 집계\n○ ${course.topic} 실무 실습을 통한 직원 AI 업무 활용 역량 제고`,
        implications: `○ 부서 현업 과제 중심 실습 수요가 높음에 따라 후속 심화 클리닉 과정 연계 추진`,
        futurePlan: `○ 수료생 상시학습(${hours}시간) 반영 및 차기 AI 역량 진단 시 성과 변화 추적`,
        photos: [
          window.AI360Utils.createSamplePhotoDataURL(0, course.title, course.place),
          window.AI360Utils.createSamplePhotoDataURL(2, course.title, course.place)
        ]
      }
    });

    session.selectedCourseId = id;
    addAuditLog('신규 집합교육 등록', `「${course.title}」 등록 및 QR 3종·교육계획서·안내문 자동 생성`);
    saveDB(false);
    saveSession(true);
    return course;
  }

  function sendCourseNotice(courseId, customMessengerText, customEmailText) {
    const course = db.courses.find((c) => c.id === courseId);
    if (!course) return { ok: false, message: '교육 과정을 찾을 수 없습니다.' };

    if (typeof customMessengerText === 'string') course.messengerText = customMessengerText;
    if (typeof customEmailText === 'string') course.emailText = customEmailText;

    course.noticeSent = true;
    course.noticeSentAt = nowStr();
    if (course.status === '등록' || course.status === '안내') {
      course.status = '신청 중';
    }

    const existingNotice = db.notices.find((n) => n.courseId === courseId && n.type === 'course_guide');
    if (existingNotice) {
      existingNotice.createdAt = course.noticeSentAt;
      existingNotice.readBy = [];
    } else {
      db.notices.unshift({
        id: `NTC-${courseId}-${Date.now()}`,
        type: 'course_guide',
        courseId,
        title: `[교육 안내] 「${course.title}」 참가 신청 안내`,
        body: `${course.date} (${course.place}, ${course.hours}시간) · 신청기한 ${course.applyEnd}까지`,
        targetType: course.targetType,
        targetOrg: course.targetOrg || null,
        createdAt: course.noticeSentAt,
        readBy: []
      });
    }

    const eligibleCount = db.employees.filter((e) => isEmployeeEligibleForCourse(e, course)).length;
    addAuditLog('교육 안내 발송', `「${course.title}」 교육 대상자(${eligibleCount}명) 알림함 안내 발송 완료`);
    saveDB(true);
    return { ok: true, eligibleCount };
  }

  function updateCourseStatus(courseId, nextStatus) {
    const course = db.courses.find((c) => c.id === courseId);
    if (!course) return;
    const prev = course.status;
    course.status = nextStatus;
    addAuditLog('교육 상태 변경', `「${course.title}」 상태 전환: ${prev} → ${nextStatus}`);
    saveDB(true);
  }

  function updateCourseAllowWalkIn(courseId, allow) {
    const course = db.courses.find((c) => c.id === courseId);
    if (!course) return;
    course.allowWalkIn = Boolean(allow);
    saveDB(true);
  }

  function savePlanDoc(courseId, planPatch) {
    const bundle = db.course_reports.find((r) => r.courseId === courseId);
    if (!bundle) return;
    Object.assign(bundle.plan, planPatch);
    addAuditLog('교육 계획서 수정', `교육코드 ${courseId} 계획서 문구 저장`);
    saveDB(true);
  }

  function saveReportDoc(courseId, reportPatch, markComplete = false) {
    const bundle = db.course_reports.find((r) => r.courseId === courseId);
    const course = db.courses.find((c) => c.id === courseId);
    if (!bundle || !course) return;
    Object.assign(bundle.report, reportPatch);
    if (markComplete) {
      course.status = '결과보고 완료';
      addAuditLog('결과보고서 완료 확정', `「${course.title}」 결과보고서 저장 및 전주기 완료 처리`);
    } else {
      addAuditLog('결과보고서 수정', `「${course.title}」 결과보고서 문구·사진 저장`);
    }
    saveDB(true);
  }

  function enrollCourse(courseId, employeeId, channel = '포털신청') {
    const course = db.courses.find((c) => c.id === courseId);
    const emp = getEmployeeById(employeeId);
    if (!course || !emp) return { ok: false, message: '교육 또는 직원 정보를 찾을 수 없습니다.' };

    const exists = db.enrollments.find((e) => e.courseId === courseId && e.employeeId === employeeId && e.status === 'active');
    if (exists) return { ok: false, message: '이미 신청 완료된 교육 과정입니다.' };

    const activeCount = db.enrollments.filter((e) => e.courseId === courseId && e.status === 'active').length;
    if (activeCount >= course.capacity) {
      return { ok: false, message: `정원(${course.capacity}명)이 마감되었습니다.` };
    }

    db.enrollments.push({
      id: `ENR-${courseId}-${employeeId}-${Date.now()}`,
      courseId,
      employeeId,
      enrolledAt: nowStr(),
      channel,
      status: 'active'
    });
    addAuditLog('교육 신청', `${emp.name} ${emp.rank}(${emp.dept}) — 「${course.title}」 ${channel}`);
    saveDB(true);
    return { ok: true, message: `「${course.title}」 신청이 완료되었습니다.` };
  }

  function deleteCourse(courseId) {
    const idx = db.courses.findIndex((c) => c.id === courseId);
    if (idx < 0) return { ok: false, message: '해당 교육 과정을 찾을 수 없습니다.' };
    const course = db.courses[idx];

    // 연관된 신청, 출석, 수료, 만족도 데이터 및 자동 생성 산출물 정리
    db.courses.splice(idx, 1);
    db.enrollments = db.enrollments.filter((e) => e.courseId !== courseId);
    db.attendances = db.attendances.filter((a) => a.courseId !== courseId);
    db.completions = db.completions.filter((comp) => comp.courseId !== courseId);
    db.satisfaction_responses = db.satisfaction_responses.filter((s) => s.courseId !== courseId);
    if (db.generated_docs) {
      delete db.generated_docs[courseId];
    }

    addAuditLog('교육 과정 삭제', `관리자 — 「${course.title}」(${course.code}) 과정 및 연관 신청/출석/수료 데이터 삭제 완료`);
    saveDB(true);
    return { ok: true, message: `「${course.title}」 과정이 안전하게 삭제되었습니다.` };
  }
  function cancelEnrollment(courseId, employeeId) {
    const idx = db.enrollments.findIndex((e) => e.courseId === courseId && e.employeeId === employeeId && e.status === 'active');
    if (idx < 0) return { ok: false, message: '신청 내역이 없습니다.' };
    const attended = db.attendances.some((a) => a.courseId === courseId && a.employeeId === employeeId);
    if (attended) return { ok: false, message: '이미 출석·수료 처리된 교육은 취소할 수 없습니다.' };

    db.enrollments.splice(idx, 1);
    const course = db.courses.find((c) => c.id === courseId);
    const emp = getEmployeeById(employeeId);
    addAuditLog('교육 신청 취소', `${emp ? emp.name : employeeId} — 「${course ? course.title : courseId}」 신청 취소`);
    saveDB(true);
    return { ok: true, message: '교육 신청이 취소되었습니다.' };
  }

  function checkInAttendanceQR(courseId, employeeId) {
    const course = db.courses.find((c) => c.id === courseId);
    const emp = getEmployeeById(employeeId);
    if (!course || !emp) return { ok: false, message: '유효하지 않은 교육 또는 사용자입니다.' };

    const existingAtt = db.attendances.find((a) => a.courseId === courseId && a.employeeId === employeeId);
    if (existingAtt) {
      return {
        ok: true,
        already: true,
        checkedAt: existingAtt.checkedAt,
        message: `이미 출석·수료 인증된 과정입니다. (인증시각: ${existingAtt.checkedAt})`
      };
    }

    const enrolled = db.enrollments.find((e) => e.courseId === courseId && e.employeeId === employeeId && e.status === 'active');
    let walkInApplied = false;
    if (!enrolled) {
      if (!course.allowWalkIn) {
        return {
          ok: false,
          blockedWalkIn: true,
          message: '사전 신청 내역이 없습니다. 본 교육은 관리자 설정에 따라 미신청자 현장 출석이 차단되어 있습니다.'
        };
      }
      // 현장 신청 후 출석 처리 (PDF p.5 명시 기능!)
      db.enrollments.push({
        id: `ENR-WALKIN-${courseId}-${employeeId}`,
        courseId,
        employeeId,
        enrolledAt: nowStr(),
        channel: '현장QR신청',
        status: 'active'
      });
      walkInApplied = true;
    }

    const checkedAt = nowStr();
    db.attendances.push({
      id: `ATT-${courseId}-${employeeId}`,
      courseId,
      employeeId,
      checkedAt,
      method: walkInApplied ? '현장신청+QR인증' : 'QR인증',
      manualReason: null
    });
    db.completions.push({
      id: `CMP-${courseId}-${employeeId}`,
      courseId,
      employeeId,
      hours: course.hours,
      completedAt: checkedAt
    });

    addAuditLog(
      '현장 QR 출석·수료 인증',
      `${emp.name} ${emp.rank}(${emp.dept}) — 「${course.title}」 ${walkInApplied ? '[미신청 현장접수 후 출석] ' : ''}수료(${course.hours}시간)`
    );
    saveDB(true);
    return {
      ok: true,
      walkInApplied,
      checkedAt,
      message: `${walkInApplied ? '[현장 신청 자동 처리] ' : ''}「${course.title}」 출석이 인증되었습니다. 수료(${course.hours}시간) 처리되었습니다.`
    };
  }

  function manualCompleteAttendance(courseId, employeeId, reason) {
    const course = db.courses.find((c) => c.id === courseId);
    const emp = getEmployeeById(employeeId);
    if (!course || !emp) return { ok: false, message: '대상 정보를 찾을 수 없습니다.' };
    if (!reason || !reason.trim()) return { ok: false, message: '수동 수료 처리 사유를 입력해 주세요.' };

    if (db.attendances.some((a) => a.courseId === courseId && a.employeeId === employeeId)) {
      return { ok: false, message: '이미 출석·수료 처리된 직원입니다.' };
    }

    if (!db.enrollments.some((e) => e.courseId === courseId && e.employeeId === employeeId && e.status === 'active')) {
      db.enrollments.push({
        id: `ENR-MANUAL-${courseId}-${employeeId}`,
        courseId,
        employeeId,
        enrolledAt: nowStr(),
        channel: '관리자직권등록',
        status: 'active'
      });
    }

    const checkedAt = nowStr();
    db.attendances.push({
      id: `ATT-MAN-${courseId}-${employeeId}`,
      courseId,
      employeeId,
      checkedAt,
      method: '관리자 수동보정',
      manualReason: reason.trim()
    });
    db.completions.push({
      id: `CMP-MAN-${courseId}-${employeeId}`,
      courseId,
      employeeId,
      hours: course.hours,
      completedAt: checkedAt
    });

    addAuditLog('출석 누락자 수동 수료 보정', `${emp.name} ${emp.rank}(${emp.dept}) — 「${course.title}」 사유: ${reason.trim()}`);
    saveDB(true);
    return { ok: true, message: `${emp.name} ${emp.rank} 수동 수료 처리가 완료되었습니다.` };
  }

  function submitSatisfaction(courseId, employeeId, scores, comment) {
    const course = db.courses.find((c) => c.id === courseId);
    const emp = getEmployeeById(employeeId);
    if (!course || !emp) return { ok: false, message: '유효하지 않은 과정입니다.' };

    // 수료자만 응답 가능 검증 (PDF p.5)
    const isCompleted = db.completions.some((c) => c.courseId === courseId && c.employeeId === employeeId);
    if (!isCompleted) {
      return { ok: false, message: '출석·수료 인증이 완료된 교육생만 만족도 조사에 참여할 수 있습니다.' };
    }

    // 1인 1회 검증 (PDF p.5)
    const already = db.satisfaction_responses.some((s) => s.courseId === courseId && s.employeeId === employeeId);
    if (already) {
      return { ok: false, message: '이미 본 교육의 만족도 조사에 응답하셨습니다. (1인 1회 제한)' };
    }

    db.satisfaction_responses.push({
      id: `SAT-${courseId}-${employeeId}`,
      courseId,
      employeeId,
      scores: {
        S1: Number(scores.S1 || 5),
        S2: Number(scores.S2 || 5),
        S3: Number(scores.S3 || 5),
        S4: Number(scores.S4 || 5),
        S5: Number(scores.S5 || 5)
      },
      comment: (comment || '').trim(),
      submittedAt: nowStr()
    });

    addAuditLog('만족도 조사 응답', `${emp.name} ${emp.rank}(${emp.dept}) — 「${course.title}」 만족도 제출`);
    saveDB(true);
    return { ok: true, message: '소중한 만족도 의견이 제출되어 결과보고서 통계에 즉시 반영되었습니다.' };
  }

  /* =========================================================================
   * AI 역량 진단 비즈니스 로직 (Section 5)
   * ========================================================================= */
  function submitAssessment(roundId, employeeId, answers) {
    const round = db.assessment_rounds.find((r) => r.id === roundId);
    const emp = getEmployeeById(employeeId);
    if (!round || !emp) return { ok: false, message: '진단 회차 정보를 찾을 수 없습니다.' };
    if (round.status !== 'open') return { ok: false, message: '현재 마감된 진단 회차입니다.' };

    const rec = createAssessmentRecord(roundId, employeeId, answers, nowStr());
    const idx = db.assessment_responses.findIndex((r) => r.roundId === roundId && r.employeeId === employeeId);
    if (idx >= 0) {
      db.assessment_responses[idx] = rec;
    } else {
      db.assessment_responses.push(rec);
    }

    addAuditLog('AI 역량 진단 제출', `${emp.name} ${emp.rank}(${emp.dept}) — ${round.title} 완료 (${rec.totalScore}점 / ${rec.grade})`);
    saveDB(true);
    return { ok: true, record: rec };
  }

  function createAssessmentRound(input) {
    const id = `RND-${Date.now()}`;
    const round = {
      id,
      title: input.title.trim(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      targetType: input.targetType || '전직원',
      status: 'open',
      createdAt: nowStr()
    };
    db.assessment_rounds.push(round);
    db.notices.unshift({
      id: `NTC-RND-${id}`,
      type: 'assessment',
      roundId: id,
      title: `[역량 진단] ${round.title} 실시 안내`,
      body: `실시 기간: ${round.periodStart} ~ ${round.periodEnd} · 대상: ${round.targetType}`,
      targetType: round.targetType,
      targetOrg: null,
      createdAt: nowStr(),
      readBy: []
    });
    addAuditLog('진단 회차 신규 개설', `「${round.title}」 개설 및 알림함 안내 발송`);
    saveDB(true);
    return round;
  }

  function toggleAssessmentRoundStatus(roundId) {
    const round = db.assessment_rounds.find((r) => r.id === roundId);
    if (!round) return;
    round.status = round.status === 'open' ? 'closed' : 'open';
    addAuditLog('진단 회차 상태 변경', `「${round.title}」 → ${round.status === 'open' ? '진행 중(열림)' : '마감'}`);
    saveDB(true);
  }

  /* =========================================================================
   * 담당자 지정·해제 & 독려 기록 & 명단 업로드 검증 (Section 6, 7)
   * ========================================================================= */
  function assignOrgManager(managerRecordId, newEmployeeId) {
    const rec = db.org_managers.find((m) => m.id === managerRecordId);
    if (!rec) return { ok: false, message: '단위 정보를 찾을 수 없습니다.' };
    if (!newEmployeeId) {
      rec.employeeId = null;
      rec.autoAssigned = false;
      rec.assignedAt = nowStr();
      addAuditLog('담당자 해제', `${rec.unitLabel} 담당자 지정 해제 (미지정 상태)`);
      saveDB(true);
      return { ok: true, message: `${rec.unitLabel} 담당자가 해제되었습니다.` };
    }
    const emp = getEmployeeById(newEmployeeId);
    if (!emp) return { ok: false, message: '직원을 찾을 수 없습니다.' };

    // 단위당 1명만 지정 (새로 지정하면 기존 담당자 자동 해제)
    const prevEmp = rec.employeeId ? getEmployeeById(rec.employeeId) : null;
    rec.employeeId = emp.id;
    rec.autoAssigned = false;
    rec.assignedAt = nowStr();

    addAuditLog(
      '조직 담당자 변경 지정',
      `${rec.unitLabel}: ${prevEmp ? prevEmp.name + ' 해제 → ' : ''}${emp.name} ${emp.rank} 신규 지정`
    );
    saveDB(true);
    return { ok: true, message: `${rec.unitLabel} 담당자가 ${emp.name} ${emp.rank}(으)로 변경되었습니다.` };
  }

  function recordReminder(targetCategory, targetCount, unitLabel, messagePreview) {
    const actor = getEmployeeById(session.employeeId);
    const roleMeta = ROLE_META[session.role];
    db.reminders.unshift({
      id: `RMD-${Date.now()}`,
      actorId: actor ? actor.id : '',
      actorName: actor ? `${actor.name} ${actor.rank}` : '담당자',
      actorRoleLabel: `${roleMeta ? roleMeta.short : ''} (${unitLabel})`,
      targetCategory,
      targetCount,
      unitLabel,
      messagePreview: messagePreview.slice(0, 80),
      createdAt: nowStr()
    });
    addAuditLog('미이수·미응답 독려 기록', `${unitLabel} — ${targetCategory} ${targetCount}명 독려 실행`);
    saveDB(true);
  }

  function markNoticeRead(noticeId, empId) {
    const n = db.notices.find((x) => x.id === noticeId);
    if (n && !n.readBy.includes(empId)) {
      n.readBy.push(empId);
      saveDB(true);
    }
  }

  function previewRosterUpload(rowsArray) {
    if (!rowsArray || rowsArray.length < 2) {
      return { ok: false, error: '데이터 행이 없는 빈 파일입니다.' };
    }
    const expectedCols = ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름'];
    const header = rowsArray[0].map((h) => String(h || '').trim());
    const missingCols = expectedCols.filter((col, idx) => header[idx] !== col);
    if (missingCols.length > 0) {
      return {
        ok: false,
        error: `컬럼 헤더 검증 실패! 표준 양식 6개 컬럼(${expectedCols.join(' / ')}) 순서와 일치해야 합니다. (현재 헤더: ${header.slice(0, 6).join(' / ')})`
      };
    }

    const validRanks = new Set(['과장', '서기관', '사무관', '주무관']);
    const existingByKey = new Map();
    db.employees.forEach((e) => {
      existingByKey.set(`${e.name}|${e.org}`, e);
    });

    const parsedItems = [];
    const errors = [];
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (let r = 1; r < rowsArray.length; r++) {
      const row = rowsArray[r];
      if (!row || row.every((cell) => !String(cell || '').trim())) continue;
      const [seqStr, org, rawBureauInput, dept, rank, name] = row.map((c) => String(c ?? '').trim());
      const rowNum = r + 1;

      if (!org || !dept || !rank || !name) {
        errors.push({ rowNum, reason: '필수 값(소속기관·부서·직급·이름) 누락', raw: row.slice(0, 6) });
        continue;
      }
      if (!validRanks.has(rank)) {
        errors.push({ rowNum, reason: `허용되지 않는 직급명('${rank}') — 과장/서기관/사무관/주무관 중 입력`, raw: row.slice(0, 6) });
        continue;
      }

      const rawBureau = !rawBureauInput || rawBureauInput === '-' ? '-' : rawBureauInput;
      const bureau = rawBureau === '-' ? '(기관 직속)' : rawBureau;
      const match = existingByKey.get(`${name}|${org}`);

      let changeType = '신규';
      if (match) {
        if (match.bureau !== bureau || match.dept !== dept || match.rank !== rank) {
          changeType = '변경';
          updatedCount++;
        } else {
          changeType = '동일';
          unchangedCount++;
        }
      } else {
        newCount++;
      }

      parsedItems.push({
        rowNum,
        seq: Number(seqStr) || parsedItems.length + 1,
        org,
        rawBureau,
        bureau,
        dept,
        rank,
        name,
        changeType,
        matchedId: match ? match.id : null
      });
    }

    return {
      ok: true,
      totalRows: parsedItems.length + errors.length,
      validCount: parsedItems.length,
      newCount,
      updatedCount,
      unchangedCount,
      errorCount: errors.length,
      errors,
      items: parsedItems
    };
  }

  function rebuildOrgsFromEmployees() {
    const orgMap = new Map();
    db.employees.forEach((emp) => {
      if (!orgMap.has(emp.org)) orgMap.set(emp.org, new Map());
      const bMap = orgMap.get(emp.org);
      if (!bMap.has(emp.bureau)) bMap.set(emp.bureau, new Set());
      bMap.get(emp.bureau).add(emp.dept);
    });
    const nextOrgs = [];
    orgMap.forEach((bMap, orgName) => {
      const bureaus = [];
      bMap.forEach((dSet, bName) => bureaus.push({ name: bName, depts: Array.from(dSet) }));
      nextOrgs.push({ name: orgName, bureaus });
    });
    db.orgs = nextOrgs;
  }

  function applyRosterUpload(preview, mode) {
    if (!preview || !preview.ok) return { ok: false, message: '유효한 미리보기 결과가 없습니다.' };

    if (mode === 'replace') {
      db.employees = preview.items.map((it, idx) => ({
        id: it.matchedId || `EMP-U${String(idx + 1).padStart(4, '0')}`,
        seq: idx + 1,
        org: it.org,
        rawBureau: it.rawBureau,
        bureau: it.bureau,
        dept: it.dept,
        rank: it.rank,
        name: it.name,
        is_sample: true
      }));
      // 현재 세션 사용자가 목록에 없으면 첫 직원으로 안전 보정
      if (!db.employees.some((e) => e.id === session.employeeId) && db.employees[0]) {
        session.employeeId = db.employees[0].id;
      }
      rebuildOrgsFromEmployees();
      addAuditLog('명단 엑셀 전체 교체', `총 ${db.employees.length}명으로 전체 명단 교체 적용`);
    } else {
      // merge: 추가·갱신
      let maxSeq = db.employees.reduce((m, e) => Math.max(m, e.seq || 0), 0);
      preview.items.forEach((it) => {
        if (it.matchedId) {
          const target = getEmployeeById(it.matchedId);
          if (target) {
            target.rawBureau = it.rawBureau;
            target.bureau = it.bureau;
            target.dept = it.dept;
            target.rank = it.rank;
          }
        } else {
          maxSeq++;
          db.employees.push({
            id: `EMP-${String(maxSeq).padStart(4, '0')}`,
            seq: maxSeq,
            org: it.org,
            rawBureau: it.rawBureau,
            bureau: it.bureau,
            dept: it.dept,
            rank: it.rank,
            name: it.name,
            is_sample: true
          });
        }
      });
      rebuildOrgsFromEmployees();
      addAuditLog('명단 엑셀 추가·갱신', `신규 ${preview.newCount}명 추가, 변경 ${preview.updatedCount}명 갱신 (총 ${db.employees.length}명)`);
    }

    saveDB(false);
    saveSession(true);
    return { ok: true, total: db.employees.length };
  }

  init();

  window.AI360Store = {
    ROLE_META,
    subscribe,
    getDB,
    getSession,
    resetDatabase,
    getEmployeeById,
    switchRole,
    setViewMode,
    setActiveMenu,
    getManagerUnitForEmployee,
    filterEmployeesByScope,
    getActiveRound,
    getLatestAssessmentForEmployee,
    computeUnitAnalytics,
    getEmployeeProfileSummary,
    getCourseSummary,
    getCourseNextTodo,
    registerCourse,
    sendCourseNotice,
    updateCourseStatus,
    updateCourseAllowWalkIn,
    savePlanDoc,
    saveReportDoc,
    enrollCourse,
    cancelEnrollment,
    deleteCourse,
    checkInAttendanceQR,
    manualCompleteAttendance,
    submitSatisfaction,
    submitAssessment,
    createAssessmentRound,
    toggleAssessmentRoundStatus,
    assignOrgManager,
    recordReminder,
    markNoticeRead,
    previewRosterUpload,
    applyRosterUpload
  };
})();


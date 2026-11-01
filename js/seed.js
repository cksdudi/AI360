/**
 * AI 360 — 고정 시드 샘플 데이터베이스 생성기 (Section 2, 3, 5, 8, 9 완벽 반영)
 * ※ 모든 수치는 고정 시드(20261101)로 생성되는 시연용 가상 샘플 데이터입니다.
 */
(function () {
  'use strict';

  const { createPRNG, calcDurationHours, createSamplePhotoDataURL } = window.AI360Utils;

  // 10대 교육 주제 (PDF p.3)
  const TOPICS = [
    'AI 입문',
    '생성형 AI 활용',
    '프롬프트 엔지니어링',
    '데이터 분석',
    'AI 업무 자동화',
    'AI 에이전트',
    '바이브코딩',
    '산업 AI·제조 AX',
    'AI 정책·전략',
    '관리자 AI 리더십'
  ];

  // 교육 상태 7단계 흐름 (PDF p.4)
  const COURSE_STATUS_ORDER = [
    '등록',
    '안내',
    '신청 중',
    '신청 마감',
    '교육 당일(출석 인증)',
    '만족도 조사',
    '결과보고 완료'
  ];

  // 만족도 조사 5문항 (PDF p.4)
  const SATISFACTION_ITEMS = [
    { id: 'S1', text: '교육 내용이 내 업무에 도움이 되었다.' },
    { id: 'S2', text: '강사의 전문성과 전달력이 우수했다.' },
    { id: 'S3', text: '교육 시간과 진행 방식이 적절했다.' },
    { id: 'S4', text: '교육 장소와 환경(장비·자료 등)이 적절했다.' },
    { id: 'S5', text: '이 교육을 동료에게 추천하고 싶다.' }
  ];

  // AI 역량 진단 7문항 (PDF p.5)
  const ASSESSMENT_ITEMS = [
    {
      id: 'Q1',
      domain: 'AI 기본 이해',
      text: '생성형 AI의 원리와 한계(환각, 최신성 부족 등)를 동료에게 설명할 수 있다.',
      mappedTopics: ['AI 입문', 'AI 정책·전략']
    },
    {
      id: 'Q2',
      domain: 'AI 기획',
      text: '내 업무 중 AI로 개선할 수 있는 과제를 찾아 목표와 적용 방법을 기획할 수 있다.',
      mappedTopics: ['산업 AI·제조 AX', 'AI 정책·전략']
    },
    {
      id: 'Q3',
      domain: 'AI 도구 활용',
      text: '생성형 AI 도구(온AI 등)를 문서 작성·요약·번역 등 실제 업무에 꾸준히 활용한다.',
      mappedTopics: ['생성형 AI 활용', 'AI 업무 자동화']
    },
    {
      id: 'Q4',
      domain: '프롬프트 설계',
      text: '원하는 결과를 얻기 위해 역할·맥락·출력형식을 지정해 프롬프트를 작성하고 고쳐 쓸 수 있다.',
      mappedTopics: ['프롬프트 엔지니어링', '생성형 AI 활용']
    },
    {
      id: 'Q5',
      domain: 'AI 결과 분석·검증',
      text: 'AI 결과물의 사실관계·출처·오류를 검증하고, 업무에 맞게 판단해 보완할 수 있다.',
      mappedTopics: ['프롬프트 엔지니어링', 'AI 에이전트']
    },
    {
      id: 'Q6',
      domain: '데이터 활용',
      text: '엑셀·공공데이터 등 업무 데이터를 AI와 함께 분석해 시사점을 도출할 수 있다.',
      mappedTopics: ['데이터 분석', '바이브코딩']
    },
    {
      id: 'Q7',
      domain: 'AI 윤리·보안',
      text: '개인정보·비공개자료 입력 금지 등 공공부문 AI 활용 준수사항을 알고 지킨다.',
      mappedTopics: ['AI 입문', 'AI 정책·전략']
    }
  ];

  function getGradeInfo(score) {
    if (score >= 90) return { grade: '선도', color: '#4f46e5', bg: '#eef2ff', min: 90, max: 100 };
    if (score >= 75) return { grade: '심화', color: '#0284c7', bg: '#e0f2fe', min: 75, max: 89 };
    if (score >= 60) return { grade: '활용', color: '#059669', bg: '#d1fae5', min: 60, max: 74 };
    if (score >= 40) return { grade: '기초', color: '#d97706', bg: '#fef3c7', min: 40, max: 59 };
    return { grade: '입문', color: '#dc2626', bg: '#fee2e2', min: 0, max: 39 };
  }

  function buildPlanDocTemplate(course) {
    return {
      docNo: `정보관리담당관-${202600 + course.seq}호`,
      title: `${course.title} 운영 계획(안)`,
      background: `1. 추진 배경 및 목적\n ○ 범정부 초거대 AI 행정 도입 확산에 따라 산업통상부 및 소속기관 직원의 실무 AI 활용 역량 내재화 필요\n ○ ${course.purpose}\n ○ 현장 중심 실습과 QR 기반 전주기(신청·출석·수료·만족도) 자동화로 교육 행정 효율성 제고`,
      curriculum: `1차시 (60분): ${course.topic} 핵심 개념 및 공공부문 도입 우수사례 분석\n2차시 (${Math.max(60, Math.round((course.hours - 1) * 60))}분): 행정 실무 과제 기반 실습 및 업무 적용 워크숍 (${course.instructorName} ${course.instructorTitle})\n정리 (20분): 공공부문 AI 보안 가이드라인 점검, 질의응답 및 현장 만족도 QR 참여`,
      method: `○ 교육 방식: 오프라인 집합교육 (이론 30% + 실습·토의 70%)\n○ 출결·수료 관리: 교육장 비치 「출석 인증 QR」 스캔 시 실시간 출석 및 수료 자동 처리 (${course.hours}시간 인정)\n○ 사후 환류: 교육 종료 직후 「만족도 조사 QR」 응답(5문항)을 통해 차기 교육과정 설계 반영`,
      adminNote: `○ 교육 대상자는 신청 기간(${course.applyStart} ~ ${course.applyEnd}) 내 신청 QR 또는 AI 360 포털을 통해 사전 신청 요망\n○ 개인 노트북(또는 교육장 실습 PC) 지참, 비공개 행정자료·개인정보 입력 엄금\n○ 상시학습 시간(${course.hours}시간)은 현장 QR 출석 인증 기록을 근거로 일괄 반영 예정`
    };
  }

  function buildNoticeTemplates(course) {
    const targetLabel = formatTargetSummary(course);
    const messenger = `[AI 360 교육 안내] 「${course.title}」 신청 안내\n\n` +
      `안녕하세요, AI 360 교육 운영담당입니다.\n` +
      `직원의 실무 AI 역량 강화를 위한 집합교육 과정을 아래와 같이 운영하오니 대상 직원의 적극적인 참여 바랍니다.\n\n` +
      `• 교육명: ${course.title} (${course.required ? '필수교육' : '선택교육'})\n` +
      `• 주제분류: ${course.topic}\n` +
      `• 일시: ${course.date} ${course.startTime}~${course.endTime} (${course.hours}시간)\n` +
      `• 장소: ${course.place}\n` +
      `• 대상/정원: ${targetLabel} / ${course.capacity}명\n` +
      `• 신청기간: ${course.applyStart} ~ ${course.applyEnd}\n` +
      `• 신청방법: AI 360 포털 > [교육 안내·신청] 또는 안내문 QR 스캔 즉시 신청`;

    const email = `제목: [산업통상부 AI 360] 「${course.title}」 집합교육 참가 신청 안내\n\n` +
      `수신: ${targetLabel} (${course.orgScope || '전 기관 해당자'})\n` +
      `발신: 산업통상부 AI 역량 교육 총괄담당\n` +
      `------------------------------------------------------------\n` +
      `1. 관련: 2026년도 산업통상부 AI 역량 전주기 육성계획\n` +
      `2. ${course.purpose}\n\n` +
      `  가. 교 육 명: ${course.title}\n` +
      `  나. 교육주제: ${course.topic} (${course.required ? '필수이수' : '자율선택'})\n` +
      `  다. 교육일시: ${course.date} ${course.startTime} ~ ${course.endTime} (이수인정: ${course.hours}시간)\n` +
      `  라. 교육장소: ${course.place}\n` +
      `  마. 초빙강사: ${course.instructorName} (${course.instructorOrg})\n` +
      `  바. 신청기한: ${course.applyStart} ~ ${course.applyEnd} (정원 ${course.capacity}명 선착순)\n` +
      `  사. 수료기준: ${course.completionRule}\n\n` +
      `3. 행정사항: 당일 현장 QR코드 스캔으로 출석 및 수료가 즉시 처리됩니다.\n` +
      `※ 본 메일 문구는 AI 360 시스템에서 자동 생성된 시연용 샘플입니다.`;

    return { messenger, email };
  }

  function formatTargetSummary(course) {
    if (course.targetType === '특정 기관·실국·부서 지정') {
      const parts = [course.targetOrg, course.targetBureau, course.targetDept].filter(Boolean);
      return `지정 조직(${parts.join(' > ')})`;
    }
    return course.targetType;
  }

  function isEmployeeEligibleForCourse(emp, course) {
    switch (course.targetType) {
      case '전직원':
        return true;
      case '간부(과장급 이상)':
        return emp.rank === '과장';
      case '리더(팀장·서기관급)':
        return emp.rank === '과장' || emp.rank === '서기관';
      case '실무자(사무관·주무관)':
        return emp.rank === '사무관' || emp.rank === '주무관';
      case '특정 기관·실국·부서 지정':
        if (course.targetOrg && emp.org !== course.targetOrg) return false;
        if (course.targetBureau && emp.bureau !== course.targetBureau) return false;
        if (course.targetDept && emp.dept !== course.targetDept) return false;
        return true;
      default:
        return true;
    }
  }

  function buildSeedDatabase() {
    const rand = createPRNG(20261101);
    const rawList = window.AI360_RAW_EMPLOYEES || [];

    // 1. employees & orgs 계층 생성
    const employees = [];
    const orgMap = new Map();

    rawList.forEach((row) => {
      const [seq, org, rawBureau, dept, rank, name] = row;
      const bureau = rawBureau === '-' ? '(기관 직속)' : rawBureau;
      const id = `EMP-${String(seq).padStart(4, '0')}`;
      const emp = {
        id,
        seq,
        org,
        rawBureau,
        bureau,
        dept,
        rank,
        name,
        is_sample: true
      };
      employees.push(emp);

      if (!orgMap.has(org)) {
        orgMap.set(org, { org, rawHasDirect: rawBureau === '-', bureaus: new Map() });
      }
      const oEntry = orgMap.get(org);
      if (!oEntry.bureaus.has(bureau)) {
        oEntry.bureaus.set(bureau, new Set());
      }
      oEntry.bureaus.get(bureau).add(dept);
    });

    const orgs = [];
    orgMap.forEach((oVal, orgName) => {
      const bureauArr = [];
      oVal.bureaus.forEach((deptSet, bureauName) => {
        bureauArr.push({
          name: bureauName,
          depts: Array.from(deptSet)
        });
      });
      orgs.push({
        name: orgName,
        bureaus: bureauArr
      });
    });

    // 2. org_managers 자동 지정 (부서=과장, 실국=첫 부서 과장, 기관=기관 내 첫 과장)
    const org_managers = [];
    const seenDept = new Set();
    const seenBureau = new Set();
    const seenOrg = new Set();

    employees.forEach((emp) => {
      if (emp.rank !== '과장') return;
      const deptKey = `${emp.org}|${emp.bureau}|${emp.dept}`;
      const bureauKey = `${emp.org}|${emp.bureau}`;
      const orgKey = emp.org;

      if (!seenDept.has(deptKey)) {
        seenDept.add(deptKey);
        org_managers.push({
          id: `MGR-DEPT-${seenDept.size}`,
          level: 'dept',
          unitKey: deptKey,
          org: emp.org,
          bureau: emp.bureau,
          dept: emp.dept,
          unitLabel: `${emp.org} > ${emp.bureau} > ${emp.dept}`,
          employeeId: emp.id,
          autoAssigned: true,
          assignedAt: '2026-01-05 09:00'
        });
      }
      if (!seenBureau.has(bureauKey)) {
        seenBureau.add(bureauKey);
        org_managers.push({
          id: `MGR-BUR-${seenBureau.size}`,
          level: 'bureau',
          unitKey: bureauKey,
          org: emp.org,
          bureau: emp.bureau,
          dept: null,
          unitLabel: `${emp.org} > ${emp.bureau}`,
          employeeId: emp.id,
          autoAssigned: true,
          assignedAt: '2026-01-05 09:00'
        });
      }
      if (!seenOrg.has(orgKey)) {
        seenOrg.add(orgKey);
        org_managers.push({
          id: `MGR-ORG-${seenOrg.size}`,
          level: 'org',
          unitKey: orgKey,
          org: emp.org,
          bureau: null,
          dept: null,
          unitLabel: emp.org,
          employeeId: emp.id,
          autoAssigned: true,
          assignedAt: '2026-01-05 09:00'
        });
      }
    });

    // 총괄 관리자 (E): EMP-0084 정형석 사무관 (기획조정실 정보관리담당관)
    const defaultAdminEmp = employees.find((e) => e.id === 'EMP-0084') || employees[0];

    // 3. 집합교육 12개 시드 생성 (결과보고 완료 6, 진행 중 4, 등록만 된 것 2)
    const rawCourses = [
      {
        seq: 1,
        id: 'CRS-001',
        title: '공직자 AI 리터러시와 공공 AI 윤리·보안 필수과정 (1기)',
        purpose: '생성형 AI의 작동 원리와 환각 현상을 이해하고, 국가정보보안 지침에 부합하는 안전한 행정 활용 기준을 습득한다.',
        targetType: '전직원',
        topic: 'AI 입문',
        instructorName: '박지훈',
        instructorOrg: '한국지능정보사회진흥원(NIA)',
        instructorTitle: '수석연구원',
        date: '2026-03-18',
        startTime: '14:00',
        endTime: '17:00',
        place: '정부세종청사 13동 대회의실',
        capacity: 120,
        applyStart: '2026-03-04',
        applyEnd: '2026-03-15',
        required: true,
        allowWalkIn: true,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-03-04 09:30'
      },
      {
        seq: 2,
        id: 'CRS-002',
        title: '보도자료·보고서 품질을 높이는 생성형 AI 실무 마스터',
        purpose: '온AI 및 상용 초거대 AI를 활용하여 정책 보고서 초안 구조화, 요약, 다국어 번역 시간을 단축한다.',
        targetType: '실무자(사무관·주무관)',
        topic: '생성형 AI 활용',
        instructorName: '이수진',
        instructorOrg: '공공AX교육연구소',
        instructorTitle: '대표강사',
        date: '2026-04-15',
        startTime: '13:30',
        endTime: '17:30',
        place: '정부세종청사 13동 전산교육장 A',
        capacity: 80,
        applyStart: '2026-04-01',
        applyEnd: '2026-04-12',
        required: false,
        allowWalkIn: true,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-04-01 10:00'
      },
      {
        seq: 3,
        id: 'CRS-003',
        title: '정책 기획자를 위한 고급 프롬프트 엔지니어링 워크숍',
        purpose: '역할·맥락·제약조건·출력양식을 체계화한 구조화 프롬프트를 설계하고 법령·해외정책 검토 정확도를 높인다.',
        targetType: '전직원',
        topic: '프롬프트 엔지니어링',
        instructorName: '김도윤',
        instructorOrg: 'KAIST 김재철AI대학원',
        instructorTitle: '겸임교수',
        date: '2026-05-20',
        startTime: '13:00',
        endTime: '17:00',
        place: '정부세종청사 12동 다목적홀',
        capacity: 90,
        applyStart: '2026-05-06',
        applyEnd: '2026-05-17',
        required: false,
        allowWalkIn: false,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-05-06 09:15'
      },
      {
        seq: 4,
        id: 'CRS-004',
        title: '공공데이터·산업통계 AI 데이터 분석 실습',
        purpose: '수출입·산업동향 엑셀 데이터를 AI 기반으로 정제·시각화하고 정책 시사점을 신속히 도출한다.',
        targetType: '실무자(사무관·주무관)',
        topic: '데이터 분석',
        instructorName: '정하늘',
        instructorOrg: '산업연구원(KIET)',
        instructorTitle: '데이터분석팀장',
        date: '2026-06-17',
        startTime: '10:00',
        endTime: '16:00',
        place: '정부세종청사 13동 전산교육장 B',
        capacity: 60,
        applyStart: '2026-06-02',
        applyEnd: '2026-06-14',
        required: false,
        allowWalkIn: true,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-06-02 11:00'
      },
      {
        seq: 5,
        id: 'CRS-005',
        title: '과장급 간부를 위한 관리자 AI 리더십 및 정책 의사결정',
        purpose: '부서 내 AI 활용 문화를 확산하고 AI 결과물의 정책 리스크 검증 및 조직 AX 과제를 발굴·리드한다.',
        targetType: '간부(과장급 이상)',
        topic: '관리자 AI 리더십',
        instructorName: '최명석',
        instructorOrg: '서울대학교 행정대학원',
        instructorTitle: '교수',
        date: '2026-07-15',
        startTime: '14:00',
        endTime: '17:00',
        place: '정부세종컨벤션센터 중회의실',
        capacity: 50,
        applyStart: '2026-07-01',
        applyEnd: '2026-07-12',
        required: true,
        allowWalkIn: true,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-07-01 09:00'
      },
      {
        seq: 6,
        id: 'CRS-006',
        title: '국가기술표준원 시험·인증 데이터 AI 업무 자동화 특강',
        purpose: '기술표준·인증 심사 문서의 반복 취합·비교 업무를 AI 워크플로우로 자동화하여 심사 리드타임을 절감한다.',
        targetType: '특정 기관·실국·부서 지정',
        targetOrg: '국가기술표준원',
        targetBureau: '',
        targetDept: '',
        topic: 'AI 업무 자동화',
        instructorName: '한승우',
        instructorOrg: '한국표준협회(KSA)',
        instructorTitle: '수석전문위원',
        date: '2026-09-09',
        startTime: '13:30',
        endTime: '17:30',
        place: '국가기술표준원(충북 음성) 대강당',
        capacity: 65,
        applyStart: '2026-08-25',
        applyEnd: '2026-09-06',
        required: false,
        allowWalkIn: true,
        status: '결과보고 완료',
        noticeSent: true,
        noticeSentAt: '2026-08-25 14:00'
      },
      {
        seq: 7,
        id: 'CRS-007',
        title: '반복 행정업무 제로화! AI 에이전트 설계 실전 과정',
        purpose: '법령 검색·민원 분류·회의록 요약을 연계 처리하는 업무형 AI 에이전트 파이프라인을 직접 구성한다.',
        targetType: '전직원',
        topic: 'AI 에이전트',
        instructorName: '오태양',
        instructorOrg: '지능형행정랩',
        instructorTitle: '소장',
        date: '2026-10-29',
        startTime: '13:30',
        endTime: '17:30',
        place: '정부세종청사 13동 전산교육장 A',
        capacity: 70,
        applyStart: '2026-10-12',
        applyEnd: '2026-10-26',
        required: false,
        allowWalkIn: true,
        status: '만족도 조사',
        noticeSent: true,
        noticeSentAt: '2026-10-12 09:20'
      },
      {
        seq: 8,
        id: 'CRS-008',
        title: '산업 AI·제조 AX 정책 동향 및 현장 적용 세미나',
        purpose: '자율제조·산업 파운데이션 모델 등 글로벌 제조 AX 동향을 분석하고 실·국별 산업정책 연계를 모색한다.',
        targetType: '전직원',
        topic: '산업 AI·제조 AX',
        instructorName: '강민철',
        instructorOrg: '한국산업기술기획평가원(KEIT)',
        instructorTitle: '산업AI PD',
        date: '2026-11-01',
        startTime: '14:00',
        endTime: '17:00',
        place: '정부세종청사 13동 대회의실',
        capacity: 90,
        applyStart: '2026-10-15',
        applyEnd: '2026-10-30',
        required: true,
        allowWalkIn: true,
        status: '교육 당일(출석 인증)',
        noticeSent: true,
        noticeSentAt: '2026-10-15 09:00'
      },
      {
        seq: 9,
        id: 'CRS-009',
        title: '비개발자 공직자를 위한 바이브코딩 행정 미니도구 제작',
        purpose: '자연어 지시만으로 취합 양식 검증기·대시보드 등 부서 맞춤형 경량 웹 도구를 직접 구현한다.',
        targetType: '실무자(사무관·주무관)',
        topic: '바이브코딩',
        instructorName: '윤서연',
        instructorOrg: '코드포코리아 아카데미',
        instructorTitle: '수석코치',
        date: '2026-11-18',
        startTime: '13:00',
        endTime: '17:00',
        place: '정부세종청사 13동 전산교육장 B',
        capacity: 55,
        applyStart: '2026-10-26',
        applyEnd: '2026-11-14',
        required: false,
        allowWalkIn: false,
        status: '신청 중',
        noticeSent: true,
        noticeSentAt: '2026-10-26 10:10'
      },
      {
        seq: 10,
        id: 'CRS-010',
        title: '글로벌 AI 거버넌스·통상 규범과 AI 정책·전략 포럼',
        purpose: 'EU AI 법·주요국 AI 통상 규범 변화를 점검하고 산업·통상 정책 수립 시 고려사항을 도출한다.',
        targetType: '리더(팀장·서기관급)',
        topic: 'AI 정책·전략',
        instructorName: '신동혁',
        instructorOrg: '대외경제정책연구원(KIEP)',
        instructorTitle: '선임연구위원',
        date: '2026-11-25',
        startTime: '14:00',
        endTime: '17:00',
        place: '정부세종청사 12동 중회의실',
        capacity: 50,
        applyStart: '2026-10-28',
        applyEnd: '2026-11-20',
        required: false,
        allowWalkIn: true,
        status: '신청 중',
        noticeSent: true,
        noticeSentAt: '2026-10-28 09:40'
      },
      {
        seq: 11,
        id: 'CRS-011',
        title: '공직자 AI 리터러시와 공공 AI 윤리·보안 필수과정 (2기)',
        purpose: '하반기 신규 전입자 및 미이수 직원을 대상으로 공공부문 생성형 AI 안전 활용 수칙과 핵심 역량을 내재화한다.',
        targetType: '전직원',
        topic: 'AI 입문',
        instructorName: '박지훈',
        instructorOrg: '한국지능정보사회진흥원(NIA)',
        instructorTitle: '수석연구원',
        date: '2026-12-04',
        startTime: '14:00',
        endTime: '17:00',
        place: '정부세종청사 13동 대회의실',
        capacity: 110,
        applyStart: '2026-11-05',
        applyEnd: '2026-11-30',
        required: true,
        allowWalkIn: true,
        status: '등록',
        noticeSent: false,
        noticeSentAt: null
      },
      {
        seq: 12,
        id: 'CRS-012',
        title: '실무 현안 해결을 위한 프롬프트 엔지니어링 심화 클리닉',
        purpose: '하반기 AI 역량 진단 결과 프롬프트 설계 보완 희망 직원을 대상으로 실제 기안문·검토보고서 첨삭 실습을 진행한다.',
        targetType: '전직원',
        topic: '프롬프트 엔지니어링',
        instructorName: '김도윤',
        instructorOrg: 'KAIST 김재철AI대학원',
        instructorTitle: '겸임교수',
        date: '2026-12-11',
        startTime: '13:30',
        endTime: '17:30',
        place: '정부세종청사 13동 전산교육장 A',
        capacity: 60,
        applyStart: '2026-11-10',
        applyEnd: '2026-12-07',
        required: false,
        allowWalkIn: true,
        status: '등록',
        noticeSent: false,
        noticeSentAt: null
      }
    ];

    const courses = [];
    const qr_codes = [];
    const course_reports = [];
    const enrollments = [];
    const attendances = [];
    const completions = [];
    const satisfaction_responses = [];
    const notices = [];

    const positiveComments = [
      '실제 산업통상부 보고서 양식을 예시로 실습해서 업무에 바로 적용할 수 있었습니다.',
      '프롬프트 구조화 전후 결과 비교가 매우 명확했고 보안 유의사항 정리가 유익했습니다.',
      '현장 QR로 출석과 만족도까지 10초 만에 처리되어 종이 서명부가 없어 편리했습니다.',
      '강사님의 공공기관 사례 설명이 풍부해 실무 활용 아이디어를 많이 얻었습니다.',
      '엑셀 통계자료를 AI로 검증하는 실습 시간을 조금 더 늘려주시면 좋겠습니다.',
      '부서 동료들에게도 적극 추천하고 싶은 알찬 실습 중심 강의였습니다.'
    ];

    rawCourses.forEach((rc) => {
      const hours = calcDurationHours(rc.startTime, rc.endTime);
      const course = Object.assign({}, rc, {
        hours,
        completionRule: '현장 QR 출석 인증',
        createdAt: '2026-02-20 09:00'
      });
      const tplNotice = buildNoticeTemplates(course);
      course.messengerText = tplNotice.messenger;
      course.emailText = tplNotice.email;
      courses.push(course);

      // QR 코드 3종 자동 생성
      qr_codes.push(
        { id: `QR-${course.id}-APPLY`, courseId: course.id, type: 'apply', label: '신청 QR', token: `AI360://qr?type=apply&course=${course.id}` },
        { id: `QR-${course.id}-ATTEND`, courseId: course.id, type: 'attend', label: '출석(장소 인증) QR', token: `AI360://qr?type=attend&course=${course.id}` },
        { id: `QR-${course.id}-SATIS`, courseId: course.id, type: 'satisfaction', label: '만족도 QR', token: `AI360://qr?type=satisfaction&course=${course.id}` }
      );

      // 계획서 + 결과보고서 문서 엔티티 생성
      const planDoc = buildPlanDocTemplate(course);
      const isDone = course.status === '결과보고 완료';
      course_reports.push({
        courseId: course.id,
        plan: planDoc,
        report: {
          docNo: `정보관리담당관-${202650 + course.seq}호`,
          title: `${course.title} 운영 결과보고`,
          achievements: `○ QR 기반 원스톱 신청·출결 운영으로 수기 명부 대조 업무를 100% 자동화하고 정확한 이수 실적 집계 달성\n○ ${course.topic} 분야 실무 실습을 통해 참석 직원의 현업 문서·데이터 활용 자신감 제고`,
          implications: `○ 실습 비중 확대 요구가 높아 차기 과정에서는 부서별 실제 공개용 샘플 과제를 사전 접수하여 클리닉 형태로 고도화 필요\n○ 미수료 인원에 대해서는 차기 동일 주제 과정 안내 시 우선 추천 연계`,
          futurePlan: `○ 수료생 대상 상시학습(${course.hours}시간) 일괄 반영 및 부서별 AI 활용 우수사례 공유\n○ 하반기 AI 역량 진단 결과와 연계하여 심화과정 후속 추천 실시`,
          photos: isDone || course.status === '만족도 조사'
            ? [
                createSamplePhotoDataURL(0, course.title, course.place),
                createSamplePhotoDataURL(1, course.title, course.place)
              ]
            : []
        }
      });

      // 대상자 추출 후 샘플 신청·출석·수료·만족도 생성
      const eligible = employees.filter((e) => isEmployeeEligibleForCourse(e, course));

      if (course.status === '등록') {
        // 아직 안내 미발송 (신청자 0명)
        return;
      }

      // 안내 알림 생성 (시연용 대표 알림)
      notices.push({
        id: `NTC-${course.id}`,
        type: 'course_guide',
        courseId: course.id,
        title: `[교육 안내] 「${course.title}」 참가 신청 안내`,
        body: `${course.date} (${course.place}, ${course.hours}시간) 운영 예정 · 신청기한 ${course.applyEnd}까지`,
        targetType: course.targetType,
        targetOrg: course.targetOrg || null,
        createdAt: course.noticeSentAt || '2026-10-15 09:00',
        readBy: []
      });

      // 신청률 설정 (완료/마감/당일/만족도는 정원의 76~98%, 신청 중은 45~68%)
      let fillRatio;
      if (course.status === '신청 중') {
        fillRatio = 0.48 + rand() * 0.22;
      } else {
        fillRatio = 0.76 + rand() * 0.22;
      }
      const targetEnrollCount = Math.min(eligible.length, Math.round(course.capacity * fillRatio));

      // 고정 시드 셔플로 신청자 선택
      const shuffled = eligible.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      const picked = shuffled.slice(0, targetEnrollCount);

      // 시연 대표 교육생(EMP-0085 박선하, EMP-0084 정형석)이 핵심 시연 코스에 포함되도록 보장
      const ensureEnrolled = (empId) => {
        const empObj = eligible.find((e) => e.id === empId);
        if (empObj && !picked.some((p) => p.id === empId)) {
          if (picked.length >= course.capacity) picked.pop();
          picked.unshift(empObj);
        }
      };
      if (['CRS-001', 'CRS-003', 'CRS-007', 'CRS-008'].includes(course.id)) {
        ensureEnrolled('EMP-0085');
      }
      if (['CRS-001', 'CRS-008'].includes(course.id)) {
        ensureEnrolled('EMP-0084');
      }

      const completionRate = 0.82 + rand() * 0.12; // 82% ~ 94%
      const satResponseRate = 0.64 + rand() * 0.16; // 64% ~ 80%
      const courseQualityBias = 3.95 + rand() * 0.55; // 평균 3.9~4.6점 유도

      picked.forEach((emp, idx) => {
        enrollments.push({
          id: `ENR-${course.id}-${emp.id}`,
          courseId: course.id,
          employeeId: emp.id,
          enrolledAt: `${course.applyStart} ${String(9 + (idx % 8)).padStart(2, '0')}:${String((idx * 7) % 60).padStart(2, '0')}`,
          channel: idx % 4 === 0 ? 'QR신청' : '포털신청',
          status: 'active'
        });

        // 출석·수료 데이터 생성
        if (course.status === '결과보고 완료' || course.status === '만족도 조사') {
          const isDemoMustComplete = emp.id === 'EMP-0085' && ['CRS-001', 'CRS-003', 'CRS-007'].includes(course.id);
          const attended = isDemoMustComplete || rand() < completionRate;
          if (attended) {
            const minStr = String(Math.floor(rand() * 25) + 35).padStart(2, '0');
            const hourNum = Math.max(8, parseInt(course.startTime.split(':')[0], 10) - 1);
            const checkedAt = `${course.date} ${String(hourNum).padStart(2, '0')}:${minStr}`;
            attendances.push({
              id: `ATT-${course.id}-${emp.id}`,
              courseId: course.id,
              employeeId: emp.id,
              checkedAt,
              method: 'QR인증',
              manualReason: null
            });
            completions.push({
              id: `CMP-${course.id}-${emp.id}`,
              courseId: course.id,
              employeeId: emp.id,
              hours: course.hours,
              completedAt: `${course.date} ${course.endTime}`
            });

            // 만족도 응답 (CRS-007에서 EMP-0085는 직접 응답 시연 가능하도록 미응답 상태로 비워둠!)
            const skipForLiveDemo = course.id === 'CRS-007' && emp.id === 'EMP-0085';
            if (!skipForLiveDemo && rand() < satResponseRate) {
              const mkScore = () => {
                const raw = courseQualityBias + (rand() - 0.45) * 1.3;
                return Math.max(2, Math.min(5, Math.round(raw)));
              };
              const s1 = mkScore();
              const s2 = mkScore();
              const s3 = mkScore();
              const s4 = mkScore();
              const s5 = mkScore();
              satisfaction_responses.push({
                id: `SAT-${course.id}-${emp.id}`,
                courseId: course.id,
                employeeId: emp.id,
                scores: { S1: s1, S2: s2, S3: s3, S4: s4, S5: s5 },
                comment: rand() < 0.28 ? positiveComments[Math.floor(rand() * positiveComments.length)] : '',
                submittedAt: `${course.date} 17:${String(10 + Math.floor(rand() * 45)).padStart(2, '0')}`
              });
            }
          }
        } else if (course.status === '교육 당일(출석 인증)') {
          // 당일 진행 중: 신청자 중 약 42%는 이미 QR 출석 완료, EMP-0085/0084는 현장 스캔 시연용으로 미출석 대기!
          if (emp.id !== 'EMP-0085' && emp.id !== 'EMP-0084' && rand() < 0.42) {
            const checkedAt = `${course.date} 13:${String(40 + Math.floor(rand() * 19)).padStart(2, '0')}`;
            attendances.push({
              id: `ATT-${course.id}-${emp.id}`,
              courseId: course.id,
              employeeId: emp.id,
              checkedAt,
              method: 'QR인증',
              manualReason: null
            });
            completions.push({
              id: `CMP-${course.id}-${emp.id}`,
              courseId: course.id,
              employeeId: emp.id,
              hours: course.hours,
              completedAt: checkedAt
            });
          }
        }
      });
    });

    // 마감 임박 / 진단 안내 알림 추가
    notices.unshift(
      {
        id: 'NTC-ASSESS-H2',
        type: 'assessment',
        roundId: 'RND-2026-H2',
        title: '[역량 진단] 2026년 하반기 AI 역량 진단 실시 안내 (진행 중)',
        body: '전 직원 대상 7문항 자가진단 진행 중 (2026-10-19 ~ 2026-11-20) · 진단 즉시 맞춤 교육 추천 연결',
        targetType: '전직원',
        targetOrg: null,
        createdAt: '2026-10-19 09:00',
        readBy: []
      },
      {
        id: 'NTC-DEADLINE-008',
        type: 'deadline',
        courseId: 'CRS-008',
        title: '[당일 출석 안내] 「산업 AI·제조 AX 정책 동향 및 현장 적용 세미나」 현장 QR 출석 진행 중',
        body: '오늘 14:00 정부세종청사 13동 대회의실 · 입실 시 현장 출석 QR을 스캔해 주세요.',
        targetType: '전직원',
        targetOrg: null,
        createdAt: '2026-11-01 09:00',
        readBy: []
      }
    );

    // 4. AI 역량 진단 2회차 및 응답 생성 (교육 수료자는 하반기 점수 상승 반영!)
    const assessment_rounds = [
      {
        id: 'RND-2026-H1',
        title: '2026년 상반기 AI 역량 진단',
        periodStart: '2026-03-02',
        periodEnd: '2026-03-27',
        targetType: '전직원',
        status: 'closed',
        createdAt: '2026-02-25 10:00'
      },
      {
        id: 'RND-2026-H2',
        title: '2026년 하반기 AI 역량 진단',
        periodStart: '2026-10-19',
        periodEnd: '2026-11-20',
        targetType: '전직원',
        status: 'open',
        createdAt: '2026-10-15 09:00'
      }
    ];

    // 개인별 수료 과정 수 집계
    const completedCountByEmp = new Map();
    completions.forEach((c) => {
      completedCountByEmp.set(c.employeeId, (completedCountByEmp.get(c.employeeId) || 0) + 1);
    });

    const assessment_responses = [];

    employees.forEach((emp) => {
      // 개인 고유 성향 벡터
      const baseAbility = 2.3 + rand() * 1.45; // 1~5 척도 중심값 (약 35~72점 분포)
      const compCnt = completedCountByEmp.get(emp.id) || 0;

      // 상반기 응답 (~75%)
      const isDemoRespondH1 = emp.id === 'EMP-0085' || emp.id === 'EMP-0084' || emp.id === 'EMP-0081' || emp.id === 'EMP-0053' || emp.id === 'EMP-0001';
      if (isDemoRespondH1 || rand() < 0.75) {
        let answersH1;
        if (emp.id === 'EMP-0085') {
          // 박선하 사무관 상반기: 기초(57.1점)
          answersH1 = { Q1: 4, Q2: 3, Q3: 4, Q4: 2, Q5: 3, Q6: 2, Q7: 5 };
        } else {
          answersH1 = {};
          ASSESSMENT_ITEMS.forEach((it, qIdx) => {
            const domainBias = qIdx === 6 ? 0.45 : (qIdx === 3 || qIdx === 5 ? -0.25 : 0);
            const raw = baseAbility + domainBias + (rand() - 0.5) * 1.3;
            answersH1[it.id] = Math.max(1, Math.min(5, Math.round(raw)));
          });
        }
        assessment_responses.push(createAssessmentRecord('RND-2026-H1', emp.id, answersH1, '2026-03-12 10:30'));
      }

      // 하반기 응답 (~60%, 교육 수료자는 역량 상승 보너스!)
      // EMP-0086(정보관리담당관 주무관)은 미응답 상태로 두어 현장 진단 응시 시연 가능하게 처리
      const forceUnanswered = emp.id === 'EMP-0086';
      const isDemoRespondH2 = !forceUnanswered && (emp.id === 'EMP-0085' || emp.id === 'EMP-0084' || emp.id === 'EMP-0081' || emp.id === 'EMP-0053' || emp.id === 'EMP-0001');
      if (!forceUnanswered && (isDemoRespondH2 || rand() < 0.60)) {
        let answersH2;
        if (emp.id === 'EMP-0085') {
          // 박선하 사무관 하반기: 상반기 교육 3과정 수료 후 심화(75.0점)로 성장! (단, 프롬프트 설계 Q4=3, 데이터 활용 Q6=3 보완 필요)
          answersH2 = { Q1: 5, Q2: 4, Q3: 5, Q4: 3, Q5: 4, Q6: 3, Q7: 5 };
        } else {
          const growthBoost = compCnt > 0 ? Math.min(0.95, 0.38 + compCnt * 0.22) : 0.06;
          answersH2 = {};
          ASSESSMENT_ITEMS.forEach((it, qIdx) => {
            const domainBias = qIdx === 6 ? 0.5 : (qIdx === 3 || qIdx === 5 ? -0.18 : 0.05);
            const raw = baseAbility + growthBoost + domainBias + (rand() - 0.48) * 1.2;
            answersH2[it.id] = Math.max(1, Math.min(5, Math.round(raw)));
          });
        }
        assessment_responses.push(createAssessmentRecord('RND-2026-H2', emp.id, answersH2, '2026-10-24 14:20'));
      }
    });

    // 5. 초기 독려 이력 & 감사 로그 샘플
    const reminders = [
      {
        id: 'RMD-001',
        actorId: 'EMP-0081',
        actorName: '김진솔 과장',
        actorRoleLabel: '부서 담당자 (정보관리담당관)',
        targetCategory: '진단 미응답자',
        targetCount: 6,
        unitLabel: '산업통상부 > 기획조정실 > 정보관리담당관',
        messagePreview: '[AI 360 독려] 2026년 하반기 AI 역량 진단 미응답 직원 참여 독려 안내',
        createdAt: '2026-10-28 15:20'
      },
      {
        id: 'RMD-002',
        actorId: 'EMP-0053',
        actorName: '차태빈 과장',
        actorRoleLabel: '실·국 담당자 (기획조정실)',
        targetCategory: '필수교육 미신청자',
        targetCount: 18,
        unitLabel: '산업통상부 > 기획조정실',
        messagePreview: '[AI 360 독려] 하반기 필수 집합교육 신청 안내 및 부서별 참여 독려',
        createdAt: '2026-10-30 11:05'
      }
    ];

    const audit_logs = [
      {
        id: 'LOG-001',
        createdAt: '2026-10-15 09:00',
        actor: '정형석 사무관 (총괄 관리자)',
        action: '역량 진단 회차 개설',
        detail: '「2026년 하반기 AI 역량 진단」 회차 개설 및 전 직원 알림 발송'
      },
      {
        id: 'LOG-002',
        createdAt: '2026-10-28 09:40',
        actor: '정형석 사무관 (총괄 관리자)',
        action: '교육 안내 발송',
        detail: '「글로벌 AI 거버넌스·통상 규범과 AI 정책·전략 포럼」 대상자 안내 발송 완료'
      }
    ];

    return {
      meta: {
        version: 'v3.0-demo',
        seededAt: '2026-11-01 09:00',
        seedNumber: 20261101
      },
      employees,
      orgs,
      org_managers,
      courses,
      qr_codes,
      course_reports,
      notices,
      enrollments,
      attendances,
      completions,
      satisfaction_responses,
      assessment_rounds,
      assessment_items: ASSESSMENT_ITEMS,
      satisfaction_items: SATISFACTION_ITEMS,
      assessment_responses,
      recommendations: [], // 동적 계산 + 캐시 가능하도록 store에서 실시간 평가 지원
      reminders,
      audit_logs,
      defaultPersonas: {
        student: 'EMP-0085', // 박선하 사무관 (정보관리담당관)
        dept: 'EMP-0081',    // 김진솔 과장 (정보관리담당관)
        bureau: 'EMP-0053',  // 차태빈 과장 (기획조정실)
        org: 'EMP-0001',     // 성현연 과장 (산업통상부)
        admin: defaultAdminEmp.id // 정형석 사무관 (총괄 관리자)
      }
    };
  }

  function createAssessmentRecord(roundId, employeeId, answers, submittedAt) {
    const domainScores = {};
    let sum = 0;
    ASSESSMENT_ITEMS.forEach((it) => {
      const ans = Number(answers[it.id] || 3);
      const sc = ((ans - 1) / 4) * 100;
      domainScores[it.id] = sc;
      sum += sc;
    });
    const totalScore = Math.round((sum / ASSESSMENT_ITEMS.length) * 10) / 10;
    const g = getGradeInfo(totalScore);
    return {
      id: `ASR-${roundId}-${employeeId}`,
      roundId,
      employeeId,
      answers,
      domainScores,
      totalScore,
      grade: g.grade,
      submittedAt
    };
  }

  window.AI360Seed = {
    TOPICS,
    COURSE_STATUS_ORDER,
    SATISFACTION_ITEMS,
    ASSESSMENT_ITEMS,
    getGradeInfo,
    buildPlanDocTemplate,
    buildNoticeTemplates,
    formatTargetSummary,
    isEmployeeEligibleForCourse,
    createAssessmentRecord,
    buildSeedDatabase
  };
})();


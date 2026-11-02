/**
 * AI 360 — 총괄 관리자 화면 Part 2
 * ③ 역량 진단 회차 관리 · ④ 명단 관리 · ⑤ 담당자 지정 · ⑥ 성과 분석 및 기관장 1페이지 보고
 */
(function () {
  'use strict';

  const { esc, downloadExcel, parseExcelFile, showToast } = window.AI360Utils;
  const { TOPICS, ASSESSMENT_ITEMS, getGradeInfo } = window.AI360Seed;
  const Store = window.AI360Store;
  const Charts = window.AI360Charts;

  let selectedRoundId = 'RND-2026-H2';
  let rosterOrgFilter = 'ALL';
  let rosterRankFilter = 'ALL';
  let rosterSearch = '';
  let lastUploadPreview = null;

  let mgrLevelTab = 'dept'; // 'org' | 'bureau' | 'dept'
  let mgrOnlyUnassigned = false;
  let mgrSearch = '';

  function renderAdminExtraMenu(menuId, container) {
    switch (menuId) {
      case 'admin-assessments':
        renderAdminAssessments(container);
        break;
      case 'admin-roster':
        renderAdminRoster(container);
        break;
      case 'admin-managers':
        renderAdminManagers(container);
        break;
      case 'admin-analytics':
        renderAdminAnalytics(container);
        break;
      default:
        break;
    }
  }

  /* =========================================================================
   * ③ 역량 진단 회차 관리 (Section 5, 7)
   * ========================================================================= */
  function renderAdminAssessments(container) {
    const db = Store.getDB();
    if (!db.assessment_rounds.some((r) => r.id === selectedRoundId)) {
      selectedRoundId = db.assessment_rounds[db.assessment_rounds.length - 1]?.id;
    }
    const curRound = db.assessment_rounds.find((r) => r.id === selectedRoundId);
    const curRes = db.assessment_responses.filter((r) => r.roundId === selectedRoundId);
    const totalEmp = db.employees.length;
    const respRate = totalEmp ? ((curRes.length / totalEmp) * 100).toFixed(1) : '0.0';
    const avgScore = curRes.length
      ? (curRes.reduce((a, r) => a + r.totalScore, 0) / curRes.length).toFixed(1)
      : '0.0';

    // 상반기 vs 하반기 전사 7개 영역 평균 비교
    const h1Res = db.assessment_responses.filter((r) => r.roundId === 'RND-2026-H1');
    const h2Res = db.assessment_responses.filter((r) => r.roundId === 'RND-2026-H2');
    const calcDomainAvg = (list, qid) => list.length
      ? Math.round((list.reduce((a, r) => a + (r.domainScores[qid] || 0), 0) / list.length) * 10) / 10
      : 0;

    const labels = ASSESSMENT_ITEMS.map((i) => i.domain);
    const radarSeries = [
      {
        name: '2026년 하반기 평균',
        values: ASSESSMENT_ITEMS.map((i) => calcDomainAvg(h2Res, i.id)),
        color: '#2563eb',
        fillOpacity: 0.22
      },
      {
        name: '2026년 상반기 평균',
        values: ASSESSMENT_ITEMS.map((i) => calcDomainAvg(h1Res, i.id)),
        color: '#94a3b8',
        fillOpacity: 0.06,
        dashed: true
      }
    ];

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">역량 진단</span>
          <h1 class="page-title">AI 역량 진단 회차 관리</h1>
          <p class="page-desc">진단 회차 운영 및 기관별 응답·역량 변화 분석</p>
        </div>
        <div class="head-actions">
          <button id="btn-new-round-modal" class="btn btn-primary">+ 신규 진단 회차 개설</button>
        </div>
      </div>

      <!-- 회차 목록 카드 -->
      <div class="round-cards-row mb-16">
        ${db.assessment_rounds.map((rnd) => {
          const rList = db.assessment_responses.filter((x) => x.roundId === rnd.id);
          const rate = ((rList.length / totalEmp) * 100).toFixed(1);
          const rAvg = rList.length ? (rList.reduce((a, x) => a + x.totalScore, 0) / rList.length).toFixed(1) : '-';
          const isSel = rnd.id === selectedRoundId;
          return `
            <div class="round-card ${isSel ? 'selected' : ''}" data-sel-round="${esc(rnd.id)}">
              <div class="flex-between mb-6">
                <span class="status-badge ${rnd.status === 'open' ? 'status-open' : ''}">${rnd.status === 'open' ? '● 진행 중 (열림)' : '마감됨'}</span>
                <button class="btn btn-xs btn-outline" data-toggle-round="${esc(rnd.id)}">${rnd.status === 'open' ? '회차 마감하기' : '다시 열기'}</button>
              </div>
              <h3>${esc(rnd.title)}</h3>
              <p class="text-muted">실시 기간: ${esc(rnd.periodStart)} ~ ${esc(rnd.periodEnd)} · 대상: ${esc(rnd.targetType)}</p>
              <div class="round-stat-line">
                <span>응답 <strong>${rList.length.toLocaleString()} / ${totalEmp.toLocaleString()}명 (${rate}%)</strong></span>
                <span>평균 <strong>${rAvg}점</strong></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="grid-2-cols mb-16">
        <!-- 소속기관별 선택 회차 응답률 집계 -->
        <div class="card">
          <div class="card-header">
            <h3>「${esc(curRound.title)}」 소속기관별 응답률 · 평균 점수</h3>
            <span class="badge-subtle">전체 ${respRate}% · ${avgScore}점</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>소속기관명</th><th>정원</th><th>응답 인원</th><th>미응답</th><th>응답률</th><th>평균 점수</th></tr>
              </thead>
              <tbody>
                ${db.orgs.map((o) => {
                  const oEmps = db.employees.filter((e) => e.org === o.name);
                  const oIds = new Set(oEmps.map((e) => e.id));
                  const oRes = curRes.filter((r) => oIds.has(r.employeeId));
                  const oRate = ((oRes.length / oEmps.length) * 100).toFixed(1);
                  const oAvg = oRes.length ? (oRes.reduce((a, r) => a + r.totalScore, 0) / oRes.length).toFixed(1) : '-';
                  return `
                    <tr>
                      <td><strong>${esc(o.name)}</strong></td>
                      <td>${oEmps.length}명</td>
                      <td>${oRes.length}명</td>
                      <td class="text-danger">${oEmps.length - oRes.length}명</td>
                      <td><strong>${oRate}%</strong></td>
                      <td>${oAvg}점</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 상반기 vs 하반기 회차 간 비교 레이더 및 문항 테이블 -->
        <div class="card">
          <div class="card-header">
            <h3>회차 간 영역별 역량 변화 (상반기 vs 하반기)</h3>
            <span class="badge-subtle">7개 진단 영역 비교</span>
          </div>
          <div class="chart-box center">
            ${Charts.renderRadarChartSVG(labels, radarSeries, 280)}
          </div>
          <div class="table-wrap mt-8">
            <table class="data-table compact">
              <thead>
                <tr><th>영역</th><th>상반기 평균</th><th>하반기 평균</th><th>증감(Δ)</th></tr>
              </thead>
              <tbody>
                ${ASSESSMENT_ITEMS.map((it) => {
                  const v1 = calcDomainAvg(h1Res, it.id);
                  const v2 = calcDomainAvg(h2Res, it.id);
                  const diff = Math.round((v2 - v1) * 10) / 10;
                  return `
                    <tr>
                      <td><strong>${esc(it.id)}. ${esc(it.domain)}</strong></td>
                      <td>${v1}점</td>
                      <td><strong>${v2}점</strong></td>
                      <td class="${diff >= 0 ? 'text-success font-bold' : 'text-danger'}">${diff >= 0 ? `+${diff}점 ▲` : `${diff}점 ▼`}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-sel-round]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-round]')) return;
        selectedRoundId = card.dataset.selRound;
        renderAdminAssessments(container);
      });
    });

    container.querySelectorAll('[data-toggle-round]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.toggleAssessmentRoundStatus(btn.dataset.toggleRound);
        showToast('진단 회차 개설/마감 상태가 변경되었습니다.', 'info');
      });
    });

    container.querySelector('#btn-new-round-modal')?.addEventListener('click', () => {
      const html = `
        <div class="modal-header">
          <h3>신규 AI 역량 진단 회차 개설</h3>
          <button type="button" class="modal-close-btn" data-close-modal="1">✕</button>
        </div>
        <form id="new-round-form" class="modal-body">
          <label class="form-label">진단 회차명 *</label>
          <input name="title" required class="form-input mb-12" value="2027년 상반기 AI 역량 진단">
          <div class="form-grid-2 mb-12">
            <div>
              <label class="form-label">실시 시작일 *</label>
              <input type="date" name="periodStart" value="2027-03-02" required class="form-input">
            </div>
            <div>
              <label class="form-label">실시 종료일 *</label>
              <input type="date" name="periodEnd" value="2027-03-31" required class="form-input">
            </div>
          </div>
          <label class="form-label">진단 대상</label>
          <select name="targetType" class="form-select mb-16">
            <option value="전직원">전직원 (산업통상부 및 소속기관 전체)</option>
          </select>
          <div class="modal-footer-bar">
            <button type="button" class="btn btn-ghost" data-close-modal="1">취소</button>
            <button type="submit" class="btn btn-primary">개설 및 알림함 안내 발송</button>
          </div>
        </form>
      `;
      const m = window.AI360App.openModal(html);
      m.querySelector('#new-round-form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const rnd = Store.createAssessmentRound({
          title: fd.get('title'),
          periodStart: fd.get('periodStart'),
          periodEnd: fd.get('periodEnd'),
          targetType: fd.get('targetType')
        });
        selectedRoundId = rnd.id;
        window.AI360App.closeModal();
        showToast(`「${rnd.title}」 회차가 개설되고 교육생 알림함에 안내가 발송되었습니다.`, 'success');
      });
    });
  }

  /* =========================================================================
   * ④ 명단 관리 (샘플 1,000명 조회 + 양식 다운로드 + 엑셀 업로드 검증·미리보기·적용)
   * ========================================================================= */
  function renderAdminRoster(container) {
    const db = Store.getDB();

    const filtered = db.employees.filter((e) => {
      if (rosterOrgFilter !== 'ALL' && e.org !== rosterOrgFilter) return false;
      if (rosterRankFilter !== 'ALL' && e.rank !== rosterRankFilter) return false;
      if (rosterSearch) {
        const q = rosterSearch.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.dept.toLowerCase().includes(q) && !e.bureau.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">인사 명부</span>
          <h1 class="page-title">교육 대상자 명부 관리</h1>
          <p class="page-desc">전체 직원 명부 조회 및 엑셀 일괄 동기화</p>
        </div>
        <div class="head-actions">
          <button id="btn-dl-roster-template" class="btn btn-outline">📥 명단양식 다운로드 (6컬럼+예시 3행)</button>
          <button id="btn-dl-full-roster" class="btn btn-outline">📥 전체 등록명단 다운로드 (${db.employees.length}명)</button>
        </div>
      </div>

      <!-- 엑셀 업로드 및 검증 미리보기 카드 -->
      <div class="card mb-16">
        <div class="card-header">
          <div>
            <h3>📤 명단 엑셀 업로드 (.xlsx / .csv) 및 사전 검증</h3>
            <p class="text-muted">필수 컬럼 순서: <code>연번 / 소속기관명 / 실국명 / 부서명(팀명) / 직급명 / 이름</code> (소규모 직속기관은 실국명 <code>-</code> 입력 시 자동 <code>(기관 직속)</code> 처리)</p>
          </div>
          <button id="btn-demo-upload-sim" class="btn btn-xs btn-accent">✨ 시연용 샘플 파일(신규 3·변경 2·오류 1) 즉시 검증 체험</button>
        </div>

        <div class="upload-drop-bar">
          <input type="file" id="roster-excel-input" accept=".xlsx,.csv" class="form-input" style="max-width:420px">
          <span class="text-muted">※ <code>data/교육대상자_명단양식.xlsx</code> 또는 수정한 엑셀 파일을 직접 선택해 업로드할 수 있습니다.</span>
        </div>

        <div id="roster-preview-mount">
          ${lastUploadPreview ? renderUploadPreviewHTML(lastUploadPreview) : ''}
        </div>
      </div>

      <!-- 현재 등록 인원 조회 필터 & 테이블 -->
      <div class="filter-bar card">
        <input id="roster-search-input" type="search" class="form-input" style="max-width:250px" placeholder="이름, 실·국, 부서 검색..." value="${esc(rosterSearch)}">
        <select id="roster-org-sel" class="form-select">
          <option value="ALL">전체 7개 소속기관</option>
          ${db.orgs.map((o) => `<option value="${esc(o.name)}" ${rosterOrgFilter === o.name ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
        </select>
        <select id="roster-rank-sel" class="form-select">
          <option value="ALL">전체 직급</option>
          ${['과장', '서기관', '사무관', '주무관'].map((rk) => `<option value="${rk}" ${rosterRankFilter === rk ? 'selected' : ''}>${rk}</option>`).join('')}
        </select>
        <span class="ml-auto text-muted">검색 결과: <strong>${filtered.length.toLocaleString()}명</strong></span>
      </div>

      <div class="card">
        <div class="table-wrap" style="max-height:420px;overflow:auto">
          <table class="data-table">
            <thead>
              <tr><th>연번</th><th>소속기관명</th><th>실·국명</th><th>부서명(팀명)</th><th>직급명</th><th>이름</th><th>구분</th></tr>
            </thead>
            <tbody>
              ${filtered.slice(0, 150).map((e) => `
                <tr>
                  <td>${e.seq}</td>
                  <td>${esc(e.org)}</td>
                  <td>${esc(e.bureau)}</td>
                  <td>${esc(e.dept)}</td>
                  <td>${esc(e.rank)}</td>
                  <td><button class="link-btn" data-emp-modal="${esc(e.id)}"><strong>${esc(e.name)}</strong></button></td>
                  <td><span class="badge-subtle">기본</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${filtered.length > 150 ? `<div class="table-more-note">상위 150명까지 화면에 표시됩니다 (전체 ${filtered.length.toLocaleString()}명).</div>` : ''}
        </div>
      </div>
    `;

    // 양식 다운로드 (PDF p.6 명시: 6개 컬럼 + 예시 3행 엑셀!)
    container.querySelector('#btn-dl-roster-template')?.addEventListener('click', () => {
      const templateRows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름'],
        [1, '산업통상부', '대변인', '홍보담당관', '과장', '성현연'],
        [2, '산업통상부', '대변인', '홍보담당관', '서기관', '최은빈'],
        [3, '동부광산안전사무소', '-', '동부광산안전사무소', '주무관', '신정아']
      ];
      downloadExcel('AI360_교육대상자_명단양식.xlsx', '명단', templateRows);
      showToast('표준 명단양식(6개 컬럼 + 예시 3행) 엑셀이 다운로드되었습니다.', 'success');
    });

    container.querySelector('#btn-dl-full-roster')?.addEventListener('click', () => {
      const rows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름'],
        ...db.employees.map((e) => [e.seq, e.org, e.rawBureau || e.bureau, e.dept, e.rank, e.name])
      ];
      downloadExcel('AI360_전체등록명단_1000명.xlsx', '인원현황', rows);
      showToast('전체 인원 명단 엑셀이 다운로드되었습니다.', 'success');
    });

    container.querySelector('#roster-excel-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const rows = await parseExcelFile(file);
        lastUploadPreview = Store.previewRosterUpload(rows);
        renderAdminRoster(container);
        showToast(lastUploadPreview.ok ? '엑셀 컬럼 검증 및 미리보기 완료!' : lastUploadPreview.error, lastUploadPreview.ok ? 'success' : 'error');
      } catch (err) {
        showToast('파일 파싱 오류: ' + err.message, 'error');
      }
    });

    // 원클릭 시연용 검증 샘플 버튼
    container.querySelector('#btn-demo-upload-sim')?.addEventListener('click', () => {
      const sampleRows = [
        ['연번', '소속기관명', '실국명', '부서명(팀명)', '직급명', '이름'],
        ['1', '산업통상부', '기획조정실', '정보관리담당관', '주무관', '한미래'], // 신규 1
        ['2', '산업통상부', '산업성장실', '산업인공지능정책과', '사무관', '강지성'], // 신규 2
        ['3', '국가기술표준원', '-', '국가기술표준원지원팀', '주무관', '오세봄'], // 신규 3
        ['4', '산업통상부', '기획조정실', '혁신행정담당관', '서기관', '박선하'], // 기존 박선하(사무관->서기관, 부서 변경)
        ['5', '산업통상부', '대변인', '디지털소통팀', '사무관', '최은빈'], // 기존 최은빈 부서·직급 변경
        ['6', '산업통상부', '대변인', '홍보담당관', '과장', '성현연'], // 동일
        ['7', '산업통상부', '기획조정실', '정보관리담당관', '인턴', '김오류'] // 직급 오류!
      ];
      lastUploadPreview = Store.previewRosterUpload(sampleRows);
      renderAdminRoster(container);
      showToast('시연용 샘플 업로드 검증 완료: 신규 3건, 변경 2건, 동일 1건, 오류 1건 감지', 'info');
    });

    bindPreviewActionButtons(container);

    const sInput = container.querySelector('#roster-search-input');
    sInput?.addEventListener('input', () => {
      rosterSearch = sInput.value;
      renderAdminRoster(container);
      const next = container.querySelector('#roster-search-input');
      if (next) {
        next.focus();
        next.setSelectionRange(rosterSearch.length, rosterSearch.length);
      }
    });
    container.querySelector('#roster-org-sel')?.addEventListener('change', (e) => {
      rosterOrgFilter = e.target.value;
      renderAdminRoster(container);
    });
    container.querySelector('#roster-rank-sel')?.addEventListener('change', (e) => {
      rosterRankFilter = e.target.value;
      renderAdminRoster(container);
    });
    container.querySelectorAll('[data-emp-modal]').forEach((b) => {
      b.addEventListener('click', () => window.AI360App.openEmployeeDetailModal(b.dataset.empModal));
    });
  }

  function renderUploadPreviewHTML(prev) {
    if (!prev.ok) {
      return `<div class="info-Banner danger mt-12">✕ ${esc(prev.error)}</div>`;
    }
    return `
      <div class="upload-preview-panel mt-14">
        <div class="flex-between mb-10">
          <div>
            <strong>✓ 컬럼 검증 통과! 업로드 반영 전 미리보기</strong>
            <span class="ml-8 badge-subtle">총 ${prev.totalRows}행 분석</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-sm btn-ghost" id="btn-cancel-preview">미리보기 닫기</button>
            <button class="btn btn-sm btn-primary" id="btn-apply-merge" ${prev.validCount === 0 ? 'disabled' : ''}>➕ 「추가·갱신」 반영 (권장)</button>
            <button class="btn btn-sm btn-danger-outline" id="btn-apply-replace" ${prev.validCount === 0 ? 'disabled' : ''}>🔄 「전체 교체」 반영</button>
          </div>
        </div>

        <div class="preview-counters mb-10">
          <div class="p-cnt new">신규 <strong>${prev.newCount}건</strong></div>
          <div class="p-cnt upd">변경 <strong>${prev.updatedCount}건</strong></div>
          <div class="p-cnt same">동일 <strong>${prev.unchangedCount}건</strong></div>
          <div class="p-cnt err">오류(제외) <strong>${prev.errorCount}건</strong></div>
        </div>

        ${prev.errors.length > 0 ? `
          <div class="info-Banner warn mb-10">
            <strong>⚠️ 검증 제외 오류 행 (${prev.errors.length}건):</strong>
            ${prev.errors.slice(0, 3).map((er) => `<div>• ${er.rowNum}행 [${esc(er.raw.join(' / '))}] → ${esc(er.reason)}</div>`).join('')}
          </div>
        ` : ''}

        <div class="table-wrap" style="max-height:200px;overflow:auto">
          <table class="data-table compact">
            <thead>
              <tr><th>행</th><th>판정</th><th>소속기관명</th><th>실·국명</th><th>부서명(팀명)</th><th>직급명</th><th>이름</th></tr>
            </thead>
            <tbody>
              ${prev.items.slice(0, 30).map((it) => `
                <tr>
                  <td>${it.rowNum}행</td>
                  <td><span class="chg-tag type-${it.changeType}">${esc(it.changeType)}</span></td>
                  <td>${esc(it.org)}</td>
                  <td>${esc(it.bureau)}</td>
                  <td>${esc(it.dept)}</td>
                  <td>${esc(it.rank)}</td>
                  <td><strong>${esc(it.name)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bindPreviewActionButtons(container) {
    container.querySelector('#btn-cancel-preview')?.addEventListener('click', () => {
      lastUploadPreview = null;
      renderAdminRoster(container);
    });
    container.querySelector('#btn-apply-merge')?.addEventListener('click', () => {
      const res = Store.applyRosterUpload(lastUploadPreview, 'merge');
      if (res.ok) {
        showToast(`명단 「추가·갱신」 완료! 현재 총 인원 ${res.total.toLocaleString()}명`, 'success');
        lastUploadPreview = null;
      }
    });
    container.querySelector('#btn-apply-replace')?.addEventListener('click', () => {
      if (!confirm(`현재 명단을 업로드된 유효 인원(${lastUploadPreview.validCount}명)으로 「전체 교체」하시겠습니까?\n(언제든 상단 [샘플 데이터 초기화] 버튼으로 복원 가능합니다.)`)) return;
      const res = Store.applyRosterUpload(lastUploadPreview, 'replace');
      if (res.ok) {
        showToast(`명단 「전체 교체」 완료! 현재 총 인원 ${res.total.toLocaleString()}명`, 'warning');
        lastUploadPreview = null;
      }
    });
  }

  /* =========================================================================
   * ⑤ 담당자 지정 (소속기관 7 / 실·국 22 / 부서 56 · 단위당 1명 · 미지정 경고)
   * ========================================================================= */
  function renderAdminManagers(container) {
    const db = Store.getDB();
    const unassignedAll = db.org_managers.filter((m) => !m.employeeId);

    const list = db.org_managers.filter((m) => {
      if (m.level !== mgrLevelTab) return false;
      if (mgrOnlyUnassigned && m.employeeId) return false;
      if (mgrSearch) {
        const emp = m.employeeId ? Store.getEmployeeById(m.employeeId) : null;
        const q = mgrSearch.toLowerCase();
        const inUnit = m.unitLabel.toLowerCase().includes(q);
        const inName = emp ? emp.name.toLowerCase().includes(q) : false;
        if (!inUnit && !inName) return false;
      }
      return true;
    });

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">권한 관리</span>
          <h1 class="page-title">조직별 담당자 지정</h1>
          <p class="page-desc">기관·실국·부서별 AI 교육 담당자 권한 설정</p>
        </div>
      </div>

      ${unassignedAll.length > 0 ? `
        <div class="info-Banner danger mb-16 flex-between">
          <div>
            <strong>⚠️ 담당자 미지정 단위 경고 (${unassignedAll.length}곳):</strong>
            ${unassignedAll.slice(0, 4).map((u) => `[${esc(u.unitLabel)}]`).join(', ')} 단위에 현재 담당자가 지정되지 않았습니다!
          </div>
          <button class="btn btn-xs btn-danger-outline" id="btn-filter-unassigned">${mgrOnlyUnassigned ? '전체 보기' : '미지정 단위만 보기'}</button>
        </div>
      ` : `
        <div class="info-Banner ok mb-16">
          ✓ 모든 조직 단위(소속기관 7개, 실·국 22개, 부서 56개)에 담당자가 정상 지정되어 있습니다. (시연 중 [해제] 버튼을 누르면 미지정 단위 경고가 즉시 표시됩니다.)
        </div>
      `}

      <div class="filter-bar card">
        <div class="seg-group">
          <button class="seg-btn ${mgrLevelTab === 'org' ? 'active' : ''}" data-mgr-lv="org">D. 소속기관 담당자 (${db.org_managers.filter((m) => m.level === 'org').length})</button>
          <button class="seg-btn ${mgrLevelTab === 'bureau' ? 'active' : ''}" data-mgr-lv="bureau">C. 실·국 담당자 (${db.org_managers.filter((m) => m.level === 'bureau').length})</button>
          <button class="seg-btn ${mgrLevelTab === 'dept' ? 'active' : ''}" data-mgr-lv="dept">B. 부서 담당자 (${db.org_managers.filter((m) => m.level === 'dept').length})</button>
        </div>
        <input id="mgr-unit-search" type="search" class="form-input ml-auto" style="max-width:260px" placeholder="조직명 또는 담당자명 검색..." value="${esc(mgrSearch)}">
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>조직 단위 경로</th>
                <th>현재 지정 담당자</th>
                <th>지정 구분</th>
                <th>지정 일시</th>
                <th>담당자 변경 지정 (소속 구성원 선택)</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((m) => {
                const curEmp = m.employeeId ? Store.getEmployeeById(m.employeeId) : null;
                const unitCandidates = Store.filterEmployeesByScope({
                  org: m.org,
                  bureau: m.bureau,
                  dept: m.dept
                });
                return `
                  <tr class="${!curEmp ? 'row-warn-bg' : ''}">
                    <td><strong>${esc(m.unitLabel)}</strong></td>
                    <td>
                      ${curEmp
                        ? `<strong>${esc(curEmp.name)}</strong> ${esc(curEmp.rank)} <small class="text-muted">(${esc(curEmp.dept)})</small>`
                        : '<span class="warn-chip">⚠️ 미지정 경고</span>'}
                    </td>
                    <td>
                      ${!curEmp
                        ? '<span class="text-danger">미지정</span>'
                        : m.autoAssigned
                          ? '<span class="auto-assign-badge">샘플 자동지정</span>'
                          : '<span class="manual-assign-badge">관리자 지정</span>'}
                    </td>
                    <td>${esc(m.assignedAt)}</td>
                    <td>
                      <div class="btn-row">
                        <select class="form-select select-xs" data-cand-select="${esc(m.id)}" style="max-width:210px">
                          ${unitCandidates.slice(0, 60).map((c) => `
                            <option value="${esc(c.id)}" ${c.id === m.employeeId ? 'selected' : ''}>
                              [${esc(c.rank)}] ${esc(c.name)} (${esc(c.dept)})
                            </option>
                          `).join('')}
                        </select>
                        <button class="btn btn-xs btn-primary" data-assign-mgr="${esc(m.id)}">변경 지정</button>
                      </div>
                    </td>
                    <td>
                      ${curEmp ? `<button class="btn btn-xs btn-danger-outline" data-unassign-mgr="${esc(m.id)}">해제</button>` : '-'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-mgr-lv]').forEach((b) => {
      b.addEventListener('click', () => {
        mgrLevelTab = b.dataset.mgrLv;
        renderAdminManagers(container);
      });
    });

    container.querySelector('#btn-filter-unassigned')?.addEventListener('click', () => {
      mgrOnlyUnassigned = !mgrOnlyUnassigned;
      renderAdminManagers(container);
    });

    const sEl = container.querySelector('#mgr-unit-search');
    sEl?.addEventListener('input', () => {
      mgrSearch = sEl.value;
      renderAdminManagers(container);
      const next = container.querySelector('#mgr-unit-search');
      if (next) {
        next.focus();
        next.setSelectionRange(mgrSearch.length, mgrSearch.length);
      }
    });

    container.querySelectorAll('[data-assign-mgr]').forEach((b) => {
      b.addEventListener('click', () => {
        const mid = b.dataset.assignMgr;
        const sel = container.querySelector(`[data-cand-select="${mid}"]`);
        if (!sel) return;
        const res = Store.assignOrgManager(mid, sel.value);
        showToast(res.message, res.ok ? 'success' : 'warning');
      });
    });

    container.querySelectorAll('[data-unassign-mgr]').forEach((b) => {
      b.addEventListener('click', () => {
        const res = Store.assignOrgManager(b.dataset.unassignMgr, null);
        showToast(res.message, 'warning');
      });
    });
  }

  /* =========================================================================
   * ⑥ 성과 분석 · 보고 (교육 전후 역량 변화 실증 + 기관장 보고용 1페이지 요약)
   * ========================================================================= */
  function renderAdminAnalytics(container) {
    const db = Store.getDB();
    const wholeStats = Store.computeUnitAnalytics({});

    // 교육 수료 건수별 상반기 -> 하반기 역량 점수 성장폭 실증 계산!
    const h1Map = new Map();
    const h2Map = new Map();
    db.assessment_responses.forEach((r) => {
      if (r.roundId === 'RND-2026-H1') h1Map.set(r.employeeId, r.totalScore);
      if (r.roundId === 'RND-2026-H2') h2Map.set(r.employeeId, r.totalScore);
    });

    const buckets = {
      zero: { label: '교육 미수료군 (0건)', cnt: 0, h1Sum: 0, h2Sum: 0 },
      one: { label: '1개 과정 수료군', cnt: 0, h1Sum: 0, h2Sum: 0 },
      multi: { label: '2개 과정 이상 수료군', cnt: 0, h1Sum: 0, h2Sum: 0 }
    };

    db.employees.forEach((e) => {
      if (!h1Map.has(e.id) || !h2Map.has(e.id)) return;
      const cCnt = db.completions.filter((c) => c.employeeId === e.id).length;
      const b = cCnt === 0 ? buckets.zero : cCnt === 1 ? buckets.one : buckets.multi;
      b.cnt++;
      b.h1Sum += h1Map.get(e.id);
      b.h2Sum += h2Map.get(e.id);
    });

    const effectRows = Object.values(buckets).map((b) => {
      const h1Avg = b.cnt ? Math.round((b.h1Sum / b.cnt) * 10) / 10 : 0;
      const h2Avg = b.cnt ? Math.round((b.h2Sum / b.cnt) * 10) / 10 : 0;
      const delta = Math.round((h2Avg - h1Avg) * 10) / 10;
      return { label: b.label, cnt: b.cnt, h1Avg, h2Avg, delta };
    });

    // 기관별 실적 요약
    const orgPerfRows = db.orgs.map((o) => {
      const st = Store.computeUnitAnalytics({ org: o.name });
      return { org: o.name, st };
    });

    const execReportHTML = buildExecutiveOnePageHTML(wholeStats, orgPerfRows, effectRows);

    container.innerHTML = `
      <div class="page-head">
        <div>
          <span class="section-eyebrow">성과 분석</span>
          <h1 class="page-title">교육 성과 분석 및 보고</h1>
          <p class="page-desc">기관별 운영 실적 및 사전·사후 역량 상승 분석</p>
        </div>
        <div class="head-actions">
          <button id="btn-dl-perf-excel" class="btn btn-outline">📥 전사 성과 분석 엑셀 다운로드</button>
          <button id="btn-print-exec-report" class="btn btn-primary btn-lg">🖨️ 기관장 1페이지 요약 인쇄 / PDF</button>
          <button id="btn-open-dash-download" class="btn btn-accent btn-lg">📥 대시보드 다운로드 (기간 설정)</button>
        </div>
      </div>

      <!-- 교육 전후 역량 변화 분석 (핵심 성과 연결!) -->
      <div class="card mb-16">
        <div class="card-header">
          <div>
            <h3>📈 집합교육 수료 여부에 따른 교육 전·후 AI 역량 점수 변화 (상·하반기 동시 응답자 분석)</h3>
            <p class="text-muted">교육 이수 횟수가 많을수록 하반기 역량 진단 점수가 뚜렷하게 상승함을 확인합니다.</p>
          </div>
          <span class="badge-subtle">시연용 샘플 분석</span>
        </div>
        <div class="effect-cards-grid">
          ${effectRows.map((er, idx) => `
            <div class="effect-card ${idx === 2 ? 'best' : ''}">
              <div class="effect-label">${esc(er.label)} (${er.cnt}명)</div>
              <div class="effect-scores">
                <span>상반기 ${er.h1Avg}점</span>
                <span class="arrow">→</span>
                <strong>하반기 ${er.h2Avg}점</strong>
              </div>
              <div class="effect-delta ${er.delta > 3 ? 'high' : ''}">
                평균 ${er.delta >= 0 ? '+' : ''}${er.delta}점 상승 ▲
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 기관장 보고용 1페이지 요약 보고서 미리보기 -->
      <div class="card mb-16">
        <div class="card-header">
          <h3>📄 기관장 보고용 1페이지 요약 보고서 미리보기 (A4 규격)</h3>
          <div class="btn-row"><button id="btn-print-exec-report-2" class="btn btn-sm btn-primary">🖨️ A4 인쇄 / PDF</button><button id="btn-open-dash-download-2" class="btn btn-sm btn-accent">📥 대시보드 다운로드</button></div>
        </div>
        <div class="a4-preview-wrapper wide">
          ${execReportHTML}
        </div>
      </div>

      <!-- 감사 로그 (audit_logs) -->
      <div class="card">
        <div class="card-header">
          <h3>시스템 주요 처리 이력 (Audit Logs · 최근 ${Math.min(15, db.audit_logs.length)}건)</h3>
          <span class="badge-subtle">실시간 반영 기록</span>
        </div>
        <div class="table-wrap">
          <table class="data-table compact">
            <thead>
              <tr><th>일시</th><th>실행자 (권한)</th><th>업무 구분</th><th>상세 내역</th></tr>
            </thead>
            <tbody>
              ${db.audit_logs.slice(0, 15).map((lg) => `
                <tr>
                  <td>${esc(lg.createdAt)}</td>
                  <td><strong>${esc(lg.actor)}</strong></td>
                  <td><span class="badge-subtle">${esc(lg.action)}</span></td>
                  <td>${esc(lg.detail)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const doOpenExecDl = () => window.AI360App.openReportDownloadModal('exec');
    const doOpenDashDl = () => window.AI360App.openReportDownloadModal('dashboard');
    container.querySelector('#btn-print-exec-report')?.addEventListener('click', doOpenExecDl);
    container.querySelector('#btn-print-exec-report-2')?.addEventListener('click', doOpenExecDl);
    container.querySelector('#btn-open-dash-download')?.addEventListener('click', doOpenDashDl);
    container.querySelector('#btn-open-dash-download-2')?.addEventListener('click', doOpenDashDl);

    container.querySelector('#btn-dl-perf-excel')?.addEventListener('click', () => {
      const rows = [
        ['[시연용 샘플 데이터] 산업통상부 AI 360 소속기관별 교육·역량 성과 총괄표'],
        ['소속기관명', '정원(명)', '신청건수', '수료건수', '수료율(%)', '누적이수시간(h)', '필수교육이수율(%)', '하반기진단응답률(%)', '평균역량점수', '평균등급'],
        ...orgPerfRows.map(({ org, st }) => [
          org, st.headcount, st.totalEnrollments, st.totalCompletions, st.completionRate,
          st.totalHours, st.reqCompletionRate, st.diagResponseRate, st.avgCompetencyScore, st.avgGradeInfo.grade
        ]),
        [],
        ['교육 수료군 구분', '분석 인원(명)', '상반기 평균(점)', '하반기 평균(점)', '평균 상승폭(점)'],
        ...effectRows.map((r) => [r.label, r.cnt, r.h1Avg, r.h2Avg, r.delta])
      ];
      downloadExcel('AI360_전사성과분석_보고자료.xlsx', '성과분석총괄', rows);
      showToast('전사 성과 분석 엑셀 파일이 다운로드되었습니다.', 'success');
    });
  }

  function buildExecutiveOnePageHTML(wholeStats, orgPerfRows, effectRows) {
    const db = Store.getDB();
    const allSats = db.satisfaction_responses;
    const avgSat = allSats.length
      ? (allSats.reduce((a, s) => a + (s.scores.S1 + s.scores.S2 + s.scores.S3 + s.scores.S4 + s.scores.S5) / 5, 0) / allSats.length).toFixed(2)
      : '-';

    return `
      <div class="official-doc-sheet exec-summary-sheet">
        <div class="doc-sample-watermark">[시연용 샘플 경영보고서 · 가상 샘플 데이터 기반]</div>
        <div class="doc-header-org">산 업 통 상 부 · AI 역량 육성 종합보고</div>
        <h1 class="doc-main-title">2026년도 「AI 360」 교육 운영 실적 및 직원 역량 성장 보고 (요약)</h1>
        <div class="doc-sub-meta">
          <span>보고 기준일: 2026. 11. 01.</span>
          <span>대상: 산업통상부 본부 및 6개 소속기관 (${wholeStats.headcount.toLocaleString()}명)</span>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">1. 핵심 총괄 지표 (Key Highlights)</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr>
                <th>총 관리 인원</th>
                <th>개설 집합교육</th>
                <th>누적 수료 실적</th>
                <th>신청 대비 수료율</th>
                <th>평균 교육 만족도</th>
                <th>전사 평균 AI 역량</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${wholeStats.headcount.toLocaleString()}명</strong></td>
                <td><strong>${db.courses.length}개 과정</strong></td>
                <td><strong>${wholeStats.totalCompletions.toLocaleString()}건 (${wholeStats.totalHours}h)</strong></td>
                <td><strong>${wholeStats.completionRate}%</strong></td>
                <td><strong>${avgSat} / 5.0점</strong></td>
                <td><strong>${wholeStats.avgCompetencyScore}점 (${esc(wholeStats.avgGradeInfo.grade)})</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">2. 소속기관별 집합교육 이수 및 AI 역량 현황</div>
          <table class="doc-table compact">
            <thead>
              <tr>
                <th>소속기관명</th>
                <th>인원</th>
                <th>수료 건수 (수료율)</th>
                <th>필수교육 이수율</th>
                <th>하반기 진단 응답률</th>
                <th>평균 역량 점수 (등급)</th>
              </tr>
            </thead>
            <tbody>
              ${orgPerfRows.map(({ org, st }) => `
                <tr>
                  <td><strong>${esc(org)}</strong></td>
                  <td class="text-center">${st.headcount}명</td>
                  <td class="text-center">${st.totalCompletions}건 (${st.completionRate}%)</td>
                  <td class="text-center">${st.reqCompletionRate}%</td>
                  <td class="text-center">${st.diagResponseRate}%</td>
                  <td class="text-center"><strong>${st.avgCompetencyScore}점</strong> (${esc(st.avgGradeInfo.grade)})</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">3. 집합교육 전·후 직원 AI 역량 향상 효과 분석</div>
          <table class="doc-table compact text-center">
            <thead>
              <tr><th>수료 구분</th><th>분석 대상</th><th>2026 상반기 평균</th><th>2026 하반기 평균</th><th>역량 향상폭 (Δ)</th></tr>
            </thead>
            <tbody>
              ${effectRows.map((r) => `
                <tr>
                  <td><strong>${esc(r.label)}</strong></td>
                  <td>${r.cnt}명</td>
                  <td>${r.h1Avg}점</td>
                  <td><strong>${r.h2Avg}점</strong></td>
                  <td><strong>${r.delta >= 0 ? '+' : ''}${r.delta}점</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="doc-section">
          <div class="doc-sec-title">4. 주요 성과 및 향후 추진 계획</div>
          <div class="doc-pre">○ (운영 혁신) 단일 과정 등록만으로 QR 3종(신청·출석·만족도), 계획서, 안내문, 결과보고서까지 자동 생성하여 교육 행정 소요 시간 대폭 절감
○ (역량 성장) 2과정 이상 수료 직원의 역량 점수가 미수료군 대비 뚜렷하게 상승하여 현장 실습형 집합교육의 실효성 입증
○ (향후 계획) 하반기 진단 보완 영역(프롬프트 설계·데이터 분석) 중심 맞춤형 클리닉 과정 확대 및 미이수·미응답 단위 집중 독려 추진</div>
        </div>
      </div>
    `;
  }

  window.AI360AdminExtraViews = {
    renderAdminExtraMenu
  };
})();


"use strict";

const DEMO = new URLSearchParams(location.search).has("demo");
const API = window.API_BASE ?? "";
const OFFICIAL = "https://www.gg.go.kr/gg_insure";
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const won = n => Number(n).toLocaleString("ko-KR") + "원";
const uid = () => crypto.randomUUID();
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem("cheonguri." + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem("cheonguri." + key, JSON.stringify(value)); } catch { /* Private browsing still works for this session. */ } }
};

// Each person owns independent cases. Demonstrations never read or save personal cases.
const saved = DEMO ? null : store.get("workspace.v2", null);
const S = saved && Array.isArray(saved.cases) && Array.isArray(saved.family) ? saved : {
  region: DEMO ? "부천시" : store.get("region", "부천시"),
  family: DEMO ? [] : store.get("family", []), cases: [], activePersonId: "self", activeCaseByPerson: {}
};
S.card = {weather:"", exposure:"", hours:"", symptoms:""};
S.cardResult = null;
S.catalog = {items:[], infections:[]};
S.showRegion = false;
S.activeCaseByPerson ||= {};
const save = () => { if (!DEMO) { const {card, cardResult, catalog, showRegion, ...data} = S; store.set("workspace.v2", data); } };
const person = id => id === "self" ? {id:"self", name:"본인", age:null, vulnerable:false} : S.family.find(p => String(p.id) === String(id));
if (!person(S.activePersonId)) S.activePersonId = "self";
const blankCheck = p => ({event_date:today(), sigungu:p.sigungu || S.region, diagnosis_codes:[], infection:null,
  er_visit:false, hospital_days:0, vulnerable:!!p.vulnerable, clinic_visits_on_alert_days:0,
  disaster_injury_weeks:0, disaster_related:null, death:false, age:p.age ?? null,
  resident_on_event:null, diagnosis_already_paid:false});
function newCase(personId = S.activePersonId) {
  const c = {id:uid(), personId, check:blankCheck(person(personId)), result:null, docs:{},
    claimForm:{name:"", phone:"", bank:"", account:""}, codeInput:""};
  S.cases.push(c); S.activeCaseByPerson[personId] = c.id; save(); return c;
}
function currentCase() {
  return S.cases.find(c => c.id === S.activeCaseByPerson[S.activePersonId] && c.personId === S.activePersonId) || newCase();
}
// Keep old input as a separate self case; never migrate results or completed documents across people.
if (!saved && !DEMO) {
  const old = store.get("check", null);
  if (old) {
    const c = newCase("self"); Object.assign(c.check, old, {resident_on_event:null});
    c.codeInput = (c.check.diagnosis_codes || []).join(", ");
  }
}
if (DEMO) {
  S.family = [{id:"demo-mother", name:"가상 어머니", age:72, vulnerable:true, sigungu:"부천시"}];
  S.activePersonId = "demo-mother";
  const c = newCase();
  Object.assign(c.check, {event_date:"2026-12-16", diagnosis_codes:["T68"], er_visit:true,
    hospital_days:2, clinic_visits_on_alert_days:1, resident_on_event:true});
  c.codeInput = "T68";
}
save();

async function api(path, body) {
  const response = await fetch(API + path, body ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)} : {});
  const data = await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg.replace(/^Value error, /, "")).join(" / ") : data.detail;
    throw new Error(detail || "연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return data;
}
const officialLink = () => `<a class="btn ghost" href="${OFFICIAL}" target="_blank" rel="noopener noreferrer">공식 보장·청구 양식 확인 ↗</a>`;
const capabilityNotice = () => `<aside class="notice no-print"><b>${DEMO ? "가상 사례 시연 중" : "1차 시제품 안내"}</b><p>${DEMO ? "샘플 특보와 가정한 진료로 계산합니다. 실제 지급 가능액이 아니며 개인 기록에 저장되지 않습니다." : "특보는 아직 실제 데이터와 연결되지 않았습니다. 사진 글자 인식·자동 알림은 개발 예정입니다."}</p>${DEMO ? '<a href="/">실제 입력 화면으로 돌아가기</a>' : '<a href="/?demo=1#result">가상 사례 시연 보기</a>'}</aside>`;
function caseContext() {
  const c = currentCase();
  const people = [{id:"self",name:"본인"}, ...S.family];
  const cases = S.cases.filter(x => x.personId === S.activePersonId);
  return `<section class="card no-print"><label for="person-select">누구의 청구 준비인가요?</label>
    <select id="person-select">${people.map(p => `<option value="${esc(p.id)}" ${String(p.id) === S.activePersonId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
    <label for="case-select">진료·사고 건</label><select id="case-select">${cases.map((x,i) => `<option value="${esc(x.id)}" ${x.id === c.id ? "selected" : ""}>${i+1}번째 · ${esc(x.check.event_date || "날짜 미입력")}</option>`).join("")}</select>
    <button class="btn ghost" id="new-case" type="button">새 진료·사고 건 시작</button>
    <p class="small muted">진료 정보·서류 체크·요약서는 사람과 진료 건마다 따로 보관합니다.</p></section>`;
}
async function viewHome() {
  const weather = await api(`/api/alerts?sigungu=${encodeURIComponent(S.region)}&on=${today()}`);
  return `<h1>자동가입된 기후보험,<br>청구 준비를 함께해요</h1>
    <p class="lead">입력한 진료 조건으로 예상 보장과 필요한 서류를 확인하세요. 실제 청구는 보험사의 공식 절차로 진행합니다.</p>
    ${capabilityNotice()}
    ${S.showRegion ? `<form id="region-form" class="card"><label for="region-input">안내를 볼 지역</label><input id="region-input" value="${esc(S.region)}" required maxlength="30"><button class="btn primary" type="submit">지역 저장</button></form>` : ""}
    <div class="alert none"><span class="tag">실제 특보 확인 필요</span><p>현재 ${esc(S.region)}의 특보 유무를 판단할 수 없어요.</p><p class="small muted">${esc(weather.notice)}</p></div>
    <a class="btn primary" href="#check">내 진료 조건으로 예상 보장 확인</a>
    <a class="btn ghost" href="#card">진료 상황 전달 카드 만들기</a>
    <h2>청구 준비는 이렇게 진행해요</h2><div class="card"><ol><li>사람과 진료 건 선택</li><li>진단서·사고 조건 입력</li><li>예상 항목과 확인 대기 항목 확인</li><li>서류 준비 후 공식 채널에서 청구</li></ol></div>
    ${officialLink()}`;
}
function viewCard() {
  const c = S.card;
  return `<h1>진료 상황 전달 카드</h1><p class="lead">직접 경험한 내용만 입력하세요. 입력·확인 전에는 카드를 만들지 않습니다.</p>
    <form id="doctor-form" class="card"><label for="card-weather">경험한 환경</label><select id="card-weather" data-card="weather" required>
      <option value="">선택해 주세요</option>${["폭염","한파","기타"].map(w => `<option ${c.weather === w ? "selected" : ""}>${w}</option>`).join("")}</select>
      <label for="card-exposure">무엇을 하다가</label><input id="card-exposure" data-card="exposure" value="${esc(c.exposure)}" placeholder="직접 경험한 활동이나 장소" required maxlength="100">
      <label for="card-hours">노출 시간 (시간)</label><input id="card-hours" data-card="hours" type="number" value="${esc(c.hours)}" min="0.1" max="24" step="0.1" required>
      <label for="card-symptoms">직접 느낀 증상 (선택)</label><input id="card-symptoms" data-card="symptoms" value="${esc(c.symptoms)}" placeholder="여러 증상은 쉼표로 구분">
      <p class="small muted">위 내용이 실제 경험과 일치하는지 확인한 뒤 만들어 주세요. 특보 발령이나 질병을 자동 판단하지 않습니다.</p>
      <button class="btn primary" type="submit">입력 내용을 확인하고 카드 만들기</button><p class="error" id="card-error" role="alert"></p></form>
    <div id="doctor-preview">${doctorPreview()}</div>`;
}
function doctorPreview() {
  const c = S.cardResult;
  return c ? `<div class="doctor"><h3>${esc(c.title)}</h3>${c.lines.map(l => `<p>${esc(l)}</p>`).join("")}<p class="req">${esc(c.request)}</p><p class="note">${esc(c.notice)}</p></div>` : '<p class="muted">아직 작성된 카드가 없어요.</p>';
}
function field(id, title, type, value, attrs="") {
  return `<label for="${id}">${title}</label><input id="${id}" data-field="${id}" type="${type}" value="${esc(value)}" ${attrs}>`;
}
function toggle(id, title, value) {
  return `<label class="switch" for="${id}"><span>${title}</span><input id="${id}" data-field="${id}" type="checkbox" ${value ? "checked" : ""}></label>`;
}
function triSelect(id, title, value) {
  return `<label for="${id}">${title}</label><select id="${id}" data-field="${id}"><option value="unknown" ${value === null ? "selected" : ""}>모르겠어요 / 확인 필요</option><option value="true" ${value === true ? "selected" : ""}>예</option><option value="false" ${value === false ? "selected" : ""}>아니요</option></select>`;
}
function viewCheck() {
  const item = currentCase(), c = item.check;
  return `<h1>예상 보장 확인</h1>${capabilityNotice()}${caseContext()}
    <div class="notice"><b>사진 글자 인식은 개발 예정이에요</b><p>현재는 진단서에 적힌 코드를 직접 입력합니다. 증상만으로 질병코드를 고르지 마세요.</p></div>
    <form id="check-form"><section class="card">
      ${field("event_date","진료·사고 날짜","date",c.event_date,`required ${DEMO ? "" : `max="${today()}"`}`)}
      ${field("sigungu","진료·사고가 발생한 시군 (거주지와 다를 수 있어요)","text",c.sigungu,'required maxlength="30"')}
      ${triSelect("resident_on_event","사고 당일 경기도 가입 대상이었나요?",c.resident_on_event)}
      <p class="small muted">당시 경기도 주민등록·등록외국인 등 공식 가입 조건을 확인해 주세요.</p>
      <label for="diagnosis-input">진단서의 질병코드 (선택)</label><input id="diagnosis-input" value="${esc(item.codeInput)}" placeholder="예: T67.0, T68" autocomplete="off">
      <p class="small muted">온열 T67 / 한랭 T33·T34·T35·T68·T69. 세부코드도 그대로 입력할 수 있어요.</p>
      <label for="infection">진단받은 특정 감염병 (선택)</label><select id="infection" data-field="infection"><option value="">해당 없음 / 모름</option>${S.catalog.infections.map(n => `<option ${c.infection === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      ${toggle("diagnosis_already_paid","해당 온열·한랭 진단비를 이번 보험기간에 이미 받았어요",c.diagnosis_already_paid)}
      ${toggle("er_visit","이 진료·사고로 응급실을 이용했어요",c.er_visit)}
      ${field("hospital_days","온열·한랭질환 입원 일수","number",c.hospital_days,'min="0" step="1" required')}
      ${toggle("vulnerable","방문건강관리사업 대상 또는 임산부예요",c.vulnerable)}
      ${field("clinic_visits_on_alert_days","특보 발령일 통원 횟수 (취약계층, 실제 특보 확인 필요)","number",c.clinic_visits_on_alert_days,'min="0" step="1" required')}
      ${field("age","사고 당시 나이 (선택)","number",c.age ?? "",'min="0" max="130" step="1"')}
    </section><details class="card"><summary>기후재해 상해·유족 청구 조건 입력</summary>
      ${field("disaster_injury_weeks","기후재해 상해 진단 주수","number",c.disaster_injury_weeks,'min="0" step="1" required')}
      ${triSelect("disaster_related","해당 기상현상으로 발생한 사고인가요?",c.disaster_related)}
      ${toggle("death","해당 질환·사고로 사망한 경우의 유족 청구예요",c.death)}
      <p class="small muted">상해 위로금은 일반 4주·취약계층 2주 이상 조건을 확인합니다. 실제 특보가 확인되지 않으면 판정을 보류합니다.</p>
    </details><p class="privacy">날짜·코드·조건은 판정 서버로 전송하지만 저장하지 않습니다. 청구인·계좌 정보는 이 브라우저에만 보관합니다.</p>
    <button class="btn primary" type="submit">입력한 조건으로 확인하기</button><p class="error" id="check-error" role="alert"></p></form>`;
}
function viewResult() {
  const c = currentCase(), r = c.result;
  if (!r) return `<h1>새로 확인이 필요해요</h1><p>아직 확인하지 않았거나 입력 조건이 변경됐어요.</p><a class="btn primary" href="#check">조건 확인하기</a>`;
  const pending = r.pending_items || [];
  return `<h1>${DEMO ? "가상 사례 결과" : "예상 보장 안내"}</h1>${capabilityNotice()}${caseContext()}
    ${r.eligible ? `<div class="card total"><div class="muted">${DEMO ? "시연 조건으로 계산한 금액" : "입력 조건 기준 예상 합계"}</div><div class="num">${won(r.total_amount)}</div><p class="small">확인 대기 항목은 합계에서 제외됩니다.</p><p class="small">계산상 청구 기한 ${esc(r.claim_deadline)}</p></div>` : `<div class="card"><b>${pending.length ? "추가 확인이 필요한 보장이 있어요" : "현재 입력에서 예상 항목을 찾지 못했어요"}</b><p>실제 지급 여부를 확정한 결과가 아닙니다.</p></div>`}
    ${r.items.length ? `<section class="card">${r.items.map(i => `<div class="item"><div><b>${esc(i.name)}</b><div class="why">${esc(i.reason)}</div></div><div class="amt">${won(i.amount)}</div></div>`).join("")}</section>` : ""}
    ${pending.length ? `<h2>확인 대기 · 미대상 확정 아님</h2><section class="card">${pending.map(i => `<p><b>${esc(i.name)}</b><br>${esc(i.reason)}</p>`).join("")}</section>` : ""}
    ${r.required_docs.length ? `<h2>이 진료 건의 서류 준비</h2><section class="card">${r.required_docs.map(d => `<label class="check"><input type="checkbox" data-doc="${esc(d)}" ${c.docs[d] ? "checked" : ""}>${esc(d)}</label>`).join("")}<p class="small muted">체크는 준비 여부 기록이며 서류의 유효성을 검증하지 않습니다.</p></section>` : ""}
    ${r.notes.map(n => `<p class="note">${esc(n)}</p>`).join("")}<p class="small muted">${esc(r.disclaimer)}</p>
    ${r.can_prepare_summary ? '<a class="btn primary" href="#claim">청구 준비 요약서 만들기</a>' : '<p class="notice">요약서를 만들려면 사고 당일 가입 대상 여부와 입력 조건을 확인해 주세요.</p>'}
    <a class="btn ghost" href="#check">조건 수정하기</a>${officialLink()}`;
}
function claimPreview() {
  const c = currentCase(), r = c.result, f = c.claimForm;
  return `<h3>경기 기후보험 청구 준비 요약서</h3><p><b>${DEMO ? "가상 사례 · 실제 청구에 사용하지 마세요." : "공식 보험금청구서를 대신하지 않는 준비용 문서입니다."}</b></p>
    <p>대상: ${esc(person(c.personId).name)} / 진료 건: ${esc(c.id.slice(0,8))}</p><table>
    <tr><th>청구인</th><td>${esc(f.name) || "미입력"} · ${esc(f.phone) || "연락처 미입력"}</td></tr>
    <tr><th>진료·사고</th><td>${esc(c.check.event_date)} · ${esc(c.check.sigungu)}</td></tr>
    <tr><th>예상 항목</th><td>${r.items.map(i => `${esc(i.name)} ${won(i.amount)}`).join("<br>")}</td></tr>
    <tr><th>예상 합계</th><td>${won(r.total_amount)} (지급 확정 아님)</td></tr>
    <tr><th>확인 대기</th><td>${r.pending_items.map(i => esc(i.name)).join(", ") || "없음"}</td></tr>
    <tr><th>입금 계좌</th><td>${esc(f.bank) || "미입력"} ${esc(f.account)}</td></tr>
    <tr><th>준비할 서류</th><td>${r.required_docs.map(esc).join(", ")}</td></tr></table>
    <p>이 문서만 보내면 접수가 완료되는 것이 아닙니다. 공식 청구서·동의서 작성과 서명, 증빙서류 준비 후 보험사 공식 접수 채널을 이용하세요.</p>
    <p>${esc(r.disclaimer)}</p><p>공식 안내: ${OFFICIAL}</p>`;
}
async function viewClaim() {
  const c = currentCase();
  if (!c.result?.can_prepare_summary) return '<h1>먼저 조건을 확인해 주세요</h1><a class="btn primary" href="#check">예상 보장 확인</a>';
  const channels = await api("/api/claim-channels");
  return `<h1>청구 준비 요약서</h1><p class="lead">작성 내용을 정리하는 보조 문서예요. 공식 청구서 작성·서명과 증빙 준비는 별도로 필요합니다.</p>${capabilityNotice()}
    <section class="card no-print">${[["name","청구인 이름"],["phone","연락처"],["bank","은행"],["account","계좌번호"]].map(([k,label]) => `<label for="claim-${k}">${label} (선택)</label><input id="claim-${k}" data-claim="${k}" value="${esc(c.claimForm[k])}" type="text" maxlength="100">`).join("")}</section>
    <div class="claim-doc" id="claim-doc">${claimPreview()}</div><button class="btn primary no-print" id="print">요약서 인쇄 / PDF 저장</button>
    <h2 class="no-print">공식 접수까지 남은 단계</h2><section class="card no-print"><ol><li>공식 보험금청구서와 동의서 확인·작성·서명</li><li>항목별 증빙서류 준비</li><li>보험사 공식 채널에서 직접 접수</li></ol>${officialLink()}</section>
    <section class="card no-print">${c.result.policy_year === "2025" ? '<p>2025년 사고의 접수처와 서류는 당시 계약 보험사에 확인해 주세요. 아래 공식 안내에서 해당 연도의 안내를 선택하세요.</p>' + officialLink() : channels.channels.map(ch => `<p><b>${esc(ch.type)}</b><br>${esc(ch.how)}</p>`).join("") + `<p>보험사 문의: ${esc(channels.call_center)}</p>`}</section>`;
}
function viewFamily() {
  return `<h1>가족별 청구 준비</h1><p class="lead">가족과 진료 건을 구분해 기록합니다. 처음에는 등록된 가족이 없습니다.</p>
    <div class="notice"><b>자동 특보 알림 · 개발 예정</b><p>자동 알림은 아직 지원하지 않습니다. 가족별 진료 기록과 서류 준비 기능을 이용해 주세요.</p></div>
    ${S.family.length ? S.family.map(m => `<section class="card"><b>${esc(m.name)}</b><p>${esc(m.sigungu)} · ${m.age === null ? "나이 미입력" : esc(m.age)+"세"}</p><button class="btn ghost" data-person="${esc(m.id)}">${esc(m.name)} 청구 준비하기</button></section>`).join("") : '<p class="muted">가족을 추가하면 본인 기록과 따로 준비할 수 있어요.</p>'}
    <form id="family-form" class="card"><h2>가족 추가</h2><label for="fm-name">호칭</label><input id="fm-name" required maxlength="30" placeholder="예: 어머니">
    <label for="fm-age">나이 (선택)</label><input id="fm-age" type="number" min="0" max="130" step="1">
    <label for="fm-region">사는 시군</label><input id="fm-region" required maxlength="30" placeholder="예: 안양시">
    <label class="check"><input id="fm-vul" type="checkbox">방문건강관리사업 대상 또는 임산부</label>
    <button class="btn primary" type="submit">가족 추가</button></form>
    <p class="privacy">가족 정보는 이 브라우저에만 저장됩니다. 실제 대리 청구에는 보험사의 위임 절차가 필요합니다.</p>`;
}
const VIEWS = {home:viewHome, card:viewCard, check:viewCheck, result:viewResult, claim:viewClaim, family:viewFamily};
let renderVersion = 0;
async function render() {
  const version = ++renderVersion, route = (location.hash || "#home").slice(1);
  const main = document.getElementById("view");
  document.body.dataset.route = route;
  document.getElementById("region").textContent = `${S.region} ▾`;
  for (const a of document.querySelectorAll(".tabbar a")) {
    const active = a.dataset.tab === (["result","claim"].includes(route) ? "check" : route);
    if (active) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
  }
  try {
    const html = await (VIEWS[route] || viewHome)();
    if (version !== renderVersion) return;
    main.innerHTML = html;
  } catch (error) {
    if (version !== renderVersion) return;
    main.innerHTML = `<h1>연결을 확인해 주세요</h1><p class="error">${esc(error.message)}</p><button class="btn ghost" id="retry">다시 불러오기</button>`;
  }
  main.focus({preventScroll:true}); window.scrollTo(0,0);
}
function selectPerson(id) {
  if (!person(id)) return;
  S.activePersonId = String(id); currentCase(); save();
  if (location.hash === "#check") render(); else location.hash = "#check";
}
function updateInput(t) {
  if (t.id === "diagnosis-input") {
    const c = currentCase(); c.codeInput = t.value; c.result = null; save();
  } else if (t.dataset.field) {
    const c = currentCase(), key = t.dataset.field;
    let value = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" && key === "age" ? null : Number(t.value)) : t.value;
    if (["resident_on_event","disaster_related"].includes(key)) value = t.value === "unknown" ? null : t.value === "true";
    if (key === "infection" && !value) value = null;
    if (key === "event_date" && value !== c.check.event_date) c.docs = {};
    c.check[key] = value; c.result = null; save();
  } else if (t.dataset.claim) {
    currentCase().claimForm[t.dataset.claim] = t.value; save();
    document.getElementById("claim-doc").innerHTML = claimPreview();
  } else if (t.dataset.doc) {
    currentCase().docs[t.dataset.doc] = t.checked; save();
  } else if (t.dataset.card) {
    S.card[t.dataset.card] = t.value; S.cardResult = null;
    document.getElementById("doctor-preview").innerHTML = doctorPreview();
  }
}
document.addEventListener("input", e => updateInput(e.target));
document.addEventListener("change", e => {
  updateInput(e.target);
  if (e.target.id === "person-select") selectPerson(e.target.value);
  else if (e.target.id === "case-select") {
    const c = S.cases.find(c => c.id === e.target.value && c.personId === S.activePersonId);
    if (c) { S.activeCaseByPerson[S.activePersonId] = c.id; save(); render(); }
  }
});
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "region") { S.showRegion = !S.showRegion; if (location.hash === "#home" || !location.hash) render(); else location.hash = "#home"; }
  else if (t.id === "retry") render();
  else if (t.id === "new-case") { newCase(); if (location.hash === "#check") render(); else location.hash = "#check"; }
  else if (t.dataset.person) selectPerson(t.dataset.person);
  else if (t.id === "print") window.print();
});
document.addEventListener("submit", async e => {
  if (!["check-form","doctor-form","family-form","region-form"].includes(e.target.id)) return;
  e.preventDefault();
  if (!e.target.reportValidity()) return;
  if (e.target.id === "check-form") {
    const c = currentCase(), button = e.target.querySelector('button[type="submit"]');
    c.check.diagnosis_codes = c.codeInput.split(/[,\s]+/).filter(Boolean);
    const signature = JSON.stringify([c.check, c.codeInput]);
    const error = document.getElementById("check-error"); error.textContent = "";
    button.disabled = true; button.textContent = "조건 확인 중…";
    try {
      const result = await api("/api/eligibility", {...c.check, demo_mode:DEMO});
      if (signature !== JSON.stringify([c.check, c.codeInput])) {
        if (error.isConnected) error.textContent = "입력 내용이 바뀌었습니다. 변경된 조건으로 다시 확인해 주세요.";
        return;
      }
      // A response belongs to its original case even if the user switches people meanwhile.
      c.result = result; save();
      if (currentCase().id === c.id) location.hash = "#result";
    } catch (err) { if (error.isConnected) error.textContent = err.message; }
    finally { if (button.isConnected) { button.disabled = false; button.textContent = "입력한 조건으로 확인하기"; } }
  } else if (e.target.id === "doctor-form") {
    const snapshot = JSON.stringify(S.card);
    try {
      const result = await api("/api/doctor-card", {weather:S.card.weather, exposure:S.card.exposure,
        hours:Number(S.card.hours), symptoms:S.card.symptoms.split(",").map(s => s.trim()).filter(Boolean)});
      if (snapshot === JSON.stringify(S.card)) S.cardResult = result;
      const preview = document.getElementById("doctor-preview"); if (preview) preview.innerHTML = doctorPreview();
    } catch (err) { const error = document.getElementById("card-error"); if (error) error.textContent = err.message; }
  } else if (e.target.id === "family-form") {
    const value = id => document.getElementById(id).value.trim();
    const name = value("fm-name"), region = value("fm-region"); if (!name || !region) return;
    S.family.push({id:uid(), name, sigungu:region, age:value("fm-age") === "" ? null : Number(value("fm-age")), vulnerable:document.getElementById("fm-vul").checked});
    save(); render();
  } else {
    S.region = document.getElementById("region-input").value.trim() || S.region;
    S.showRegion = false; save(); render();
  }
});
window.addEventListener("hashchange", render);
(async function start() {
  try { S.catalog = await api("/api/coverages"); } catch { /* Main view provides connection feedback. */ }
  if (DEMO) { const c = currentCase(); try { c.result = await api("/api/eligibility", {...c.check, demo_mode:true}); } catch { /* The form can retry. */ } }
  render();
})();

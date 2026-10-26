"use strict";
// 청구리 프론트엔드: 화면 6개(홈, 진료 카드, 보험금 확인, 결과, 청구서, 가족)를 해시 주소로 전환한다.
// 이름·연락처·계좌·가족 정보는 이 기기(localStorage)에만 저장하고 서버로 보내지 않는다.

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
const API = window.API_BASE || "http://localhost:8000";

const store = {
  get(k, d) { try { const v = localStorage.getItem("cheonguri." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("cheonguri." + k, JSON.stringify(v)); } catch { /* 저장 못 해도 동작 */ } },
};

// 시연(?demo)에서는 한파주의보가 발령된 날로 가정한다
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const TODAY = DEMO ? "2026-12-16" : localToday();
const DEMO_CHECK = { event_date: "2026-12-16", sigungu: "부천시", diagnosis_codes: ["T68"], er_visit: true,
  hospital_days: 2, vulnerable: true, clinic_visits_on_alert_days: 1, age: 72 };

const S = {
  region: store.get("region", "부천시"),
  check: store.get("check", { event_date: TODAY, sigungu: "부천시", diagnosis_codes: [], er_visit: false,
    hospital_days: 0, vulnerable: false, clinic_visits_on_alert_days: 0, age: null }),
  result: store.get("result", null),
  claimForm: store.get("claimForm", { name: "", phone: "", bank: "", account: "" }),
  docs: store.get("docs", {}),
  family: store.get("family", [
    { id: 1, name: "어머니", age: 72, sigungu: "부천시", vulnerable: true, alert: true },
  ]),
  card: { weather: null, exposure: "야외 작업", hours: 2, symptoms: ["어지러움"] },
};

const CODE_CHIPS = [
  ["T67", "온열질환 (열사병·열탈진 등)"], ["T68", "저체온증"], ["T69", "기타 저온 영향"], ["T33", "동상 (T33~T35)"],
];
const SYMPTOMS = ["어지러움", "두통", "구역질", "근육 경련", "의식 흐림", "손발 저림", "오한·떨림"];
const EXPOSURES = ["야외 작업", "야외 활동·산책", "난방 없는 실내", "냉방 없는 실내", "출퇴근 이동"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = n => n.toLocaleString("ko-KR") + "원";
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

async function api(path, body) {
  const r = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`서버 오류 (${r.status})`);
  return r.json();
}

function alertKind(type) { return type && type.includes("폭염") ? "heat" : type && type.includes("한파") ? "cold" : "none"; }

// ---------------- 화면 ----------------

async function viewHome() {
  const { alerts } = await api(`/api/alerts?sigungu=${encodeURIComponent(S.region)}&on=${TODAY}`);
  const a = alerts[0];
  const kind = alertKind(a && a.type);
  const banner = a
    ? `<div class="alert ${kind}"><span class="tag">${esc(a.type)} 발령 중</span>
        <p>오늘 ${kind === "heat" ? "더위" : "추위"} 때문에 병원에 가셨다면, 경기 기후보험금을 받을 수 있어요.</p>
        <p class="small muted" style="font-weight:400;margin-top:6px">${esc(S.region)} · ${esc(a.start)} ~ ${esc(a.end)}</p></div>`
    : `<div class="alert none"><span class="tag">오늘 특보 없음</span>
        <p>지난 진료도 사고일부터 3년 안이면 청구할 수 있어요.</p></div>`;
  return `
    <h1>자동가입된 기후보험,<br>받을 권리까지 챙겨드려요</h1>
    <p class="lead">경기도민이면 모두 가입돼 있지만, 보험금은 직접 청구해야 받을 수 있어요. 날씨가 변하면 청구리가 먼저 알려드려요.</p>
    ${banner}
    <a class="btn primary" href="#card">병원 가기 전: 진료 카드 보여주기</a>
    <a class="btn ghost" href="#check">받을 수 있는 보험금 확인하기</a>
    <h2>이런 분들이 많이 놓쳐요</h2>
    <div class="tiles">
      <a class="tile" href="#check"><b>작년 여름 병원</b><span>2025.4.11 이후 진료는 지금도 청구 가능</span></a>
      <a class="tile" href="#family"><b>부모님 대신</b><span>보호자가 서류를 대신 준비</span></a>
      <a class="tile wide" href="#check"><b>응급실에 다녀왔다면</b><span>온열·한랭질환 응급실 내원비 10만 원이 따로 있어요</span></a>
    </div>`;
}

async function viewCard() {
  if (!S.card.weather) {
    const { alerts } = await api(`/api/alerts?sigungu=${encodeURIComponent(S.region)}&on=${TODAY}`);
    S.card.alert = alerts[0] ? alerts[0].type : null;
    S.card.weather = alertKind(S.card.alert) === "heat" ? "폭염" : "한파";
  }
  const c = await api("/api/doctor-card", { weather: S.card.weather, exposure: S.card.exposure, hours: Number(S.card.hours) || 0,
    symptoms: S.card.symptoms, alert_type: S.card.alert || null });
  return `
    <h1>진료 전 카드</h1>
    <p class="lead">진료실에서 이 화면을 의사 선생님께 보여주세요. 상황을 정확히 전하고, 청구에 필요한 서류를 요청해요.</p>
    <div class="doctor" id="doctor-card">
      <h3>${esc(c.title)}</h3>
      ${c.lines.map(l => `<p>${esc(l)}</p>`).join("")}
      <p class="req">${esc(c.request)}</p>
      <p class="note">${esc(c.notice)}</p>
    </div>
    <div class="card no-print" style="margin-top:14px">
      <label>날씨</label>
      <div class="chips">${["폭염", "한파"].map(w => `<button class="chip" data-weather="${w}" aria-pressed="${S.card.weather === w}">${w}</button>`).join("")}</div>
      <label for="exposure">무엇을 하다가</label>
      <select id="exposure">${EXPOSURES.map(e => `<option ${e === S.card.exposure ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>
      <label for="hours">얼마나 (시간)</label>
      <input id="hours" type="number" min="0" max="24" step="0.5" value="${esc(S.card.hours)}">
      <label>증상</label>
      <div class="chips">${SYMPTOMS.map(s => `<button class="chip" data-symptom="${esc(s)}" aria-pressed="${S.card.symptoms.includes(s)}">${esc(s)}</button>`).join("")}</div>
    </div>`;
}

function viewCheck() {
  const c = S.check;
  return `
    <h1>받을 수 있는 보험금 확인</h1>
    <p class="lead">진단서나 소견서를 찍으면 질병코드를 찾아 판정해요.</p>
    <label class="photo" for="photo"><b>📷 진단서·소견서 찍기</b>
      <span class="small muted">사진은 휴대폰 안에서만 읽고 서버로 보내지 않아요</span></label>
    <input id="photo" type="file" accept="image/*" capture="environment" hidden>
    <p class="small muted" id="photo-msg">사진 글자 인식은 기기 안에서 처리하도록 개발 중이에요. 지금은 아래에서 코드를 골라 주세요.</p>
    <div class="card">
      <label for="event_date">진료·사고 날짜</label>
      <input id="event_date" type="date" value="${esc(c.event_date)}">
      <label>진단서의 질병코드</label>
      <div class="chips">${CODE_CHIPS.map(([code, name]) => `<button class="chip" data-code="${code}" aria-pressed="${c.diagnosis_codes.includes(code)}">${code} ${esc(name)}</button>`).join("")}</div>
      <div class="switch" style="margin-top:12px"><span>응급실에서 진료받았어요</span><input id="er_visit" type="checkbox" ${c.er_visit ? "checked" : ""}></div>
      <div class="switch"><span>입원 일수</span><input id="hospital_days" type="number" min="0" style="width:90px" value="${esc(c.hospital_days)}"></div>
      <div class="switch"><span>방문건강관리 대상이거나 임산부예요</span><input id="vulnerable" type="checkbox" ${c.vulnerable ? "checked" : ""}></div>
      <div class="switch"><span>특보 날 병원 간 횟수 (취약계층)</span><input id="clinic_visits_on_alert_days" type="number" min="0" style="width:90px" value="${esc(c.clinic_visits_on_alert_days)}"></div>
      <div class="switch"><span>나이</span><input id="age" type="number" min="0" style="width:90px" value="${esc(c.age ?? "")}"></div>
    </div>
    <div class="privacy">이름이나 주민번호 없이 날짜·코드만 서버로 보내 판정해요.</div>
    <button class="btn primary" id="run-check">판정하기</button>
    <p class="error" id="check-error"></p>`;
}

function viewResult() {
  const r = S.result;
  if (!r) return `<h1>아직 판정 결과가 없어요</h1><a class="btn primary" href="#check">보험금 확인하기</a>`;
  const left = daysBetween(TODAY, r.claim_deadline);
  const total = r.eligible
    ? `<div class="card total"><div class="muted">받을 수 있는 예상 보험금</div><div class="num">${won(r.total_amount)}</div>
        <div class="small">청구 기한 ${esc(r.claim_deadline)} <span class="dday">D-${left}</span></div></div>`
    : `<div class="card total"><div class="muted">해당하는 보장을 찾지 못했어요</div></div>`;
  return `
    <h1>판정 결과</h1>
    ${total}
    ${r.items.length ? `<div class="card">${r.items.map(i => `<div class="item"><div><b>${esc(i.name)}</b>
        <div class="why">${esc(i.reason)}</div></div><div class="amt">${won(i.amount)}</div></div>`).join("")}</div>` : ""}
    <h2>필요한 서류 <span class="small muted">${r.required_docs.filter(d => S.docs[d]).length}/${r.required_docs.length} 준비</span></h2>
    <div class="card">${r.required_docs.map(d => `<label class="check" style="margin:0;font-weight:500"><input type="checkbox" data-doc="${esc(d)}" ${S.docs[d] ? "checked" : ""}> ${esc(d)}</label>`).join("")}</div>
    ${r.notes.map(n => `<p class="note">※ ${esc(n)}</p>`).join("")}
    <p class="small muted">${esc(r.disclaimer)}</p>
    ${r.eligible ? `<a class="btn primary" href="#claim">청구서 만들기</a>` : ""}
    <a class="btn ghost" href="#check">다시 확인하기</a>`;
}

async function viewClaim() {
  const r = S.result;
  if (!r || !r.eligible) return `<h1>먼저 보험금을 확인해 주세요</h1><a class="btn primary" href="#check">보험금 확인하기</a>`;
  const ch = await api("/api/claim-channels");
  const f = S.claimForm;
  return `
    <h1>청구서 만들기</h1>
    <p class="lead">입력한 내용은 이 휴대폰에만 저장돼요. 완성된 청구서를 PDF로 저장해 보험사에 보내면 끝이에요.</p>
    <div class="card no-print">
      <label for="name">청구인 이름</label><input id="name" type="text" value="${esc(f.name)}" autocomplete="name">
      <label for="phone">연락처</label><input id="phone" type="text" value="${esc(f.phone)}" autocomplete="tel">
      <label for="bank">은행</label><input id="bank" type="text" value="${esc(f.bank)}">
      <label for="account">계좌번호</label><input id="account" type="text" value="${esc(f.account)}">
    </div>
    <div class="claim-doc" id="claim-doc">
      <h3>경기 기후보험 보험금 청구서 (작성 보조)</h3>
      <table>
        <tr><th>청구인</th><td>${esc(f.name) || "(이름)"} · ${esc(f.phone) || "(연락처)"}</td></tr>
        <tr><th>사고(진료)일</th><td>${esc(S.check.event_date)} · ${esc(S.check.sigungu)}</td></tr>
        <tr><th>청구 항목</th><td>${r.items.map(i => `${esc(i.name)} ${won(i.amount)}`).join("<br>")}</td></tr>
        <tr><th>합계(예상)</th><td><b>${won(r.total_amount)}</b></td></tr>
        <tr><th>입금 계좌</th><td>${esc(f.bank) || "(은행)"} ${esc(f.account) || "(계좌번호)"}</td></tr>
        <tr><th>첨부 서류</th><td>${r.required_docs.map(esc).join(", ")}</td></tr>
      </table>
      <p class="small" style="margin:10px 0 0">※ 보험사 공식 청구서 양식과 함께 제출하세요. 지급 여부는 보험사 심사로 결정됩니다.</p>
    </div>
    <button class="btn primary no-print" id="print" style="margin-top:14px">PDF로 저장하기</button>
    <h2 class="no-print">어디로 보내나요</h2>
    <div class="card no-print">
      ${ch.channels.map(c => `<div class="item"><b>${esc(c.type)}</b><div class="why" style="text-align:right">${esc(c.how)}</div></div>`).join("")}
      <p class="small muted" style="margin:10px 0 0">${esc(ch.insurer)} · 콜센터 ${esc(ch.call_center)} · ${esc(ch.payout)}</p>
    </div>`;
}

function viewFamily() {
  return `
    <h1>가족 대신 챙기기</h1>
    <p class="lead">부모님 지역에 특보가 나면 알려드리고, 보험금 서류를 대신 준비할 수 있어요.</p>
    ${S.family.map(m => `
      <div class="card">
        <div class="member"><div><b>${esc(m.name)}</b> <span class="muted small">${esc(m.age)}세 · ${esc(m.sigungu)}</span></div>
          ${m.vulnerable ? `<span class="badge">취약계층 특약</span>` : ""}</div>
        <div class="switch" style="margin-top:8px"><span>특보 알림 받기</span><input type="checkbox" data-alert="${m.id}" ${m.alert ? "checked" : ""}></div>
        <button class="btn ghost" data-proxy="${m.id}">대신 보험금 확인하기</button>
      </div>`).join("")}
    <div class="card">
      <b>가족 추가</b>
      <label for="fm-name">호칭</label><input id="fm-name" type="text" placeholder="예: 아버지">
      <label for="fm-age">나이</label><input id="fm-age" type="number" min="0">
      <label for="fm-region">사는 시군</label><input id="fm-region" type="text" placeholder="예: 안양시">
      <div class="switch" style="margin-top:8px"><span>방문건강관리 대상 또는 임산부</span><input id="fm-vul" type="checkbox"></div>
      <button class="btn primary" id="fm-add">추가하기</button>
    </div>
    <div class="privacy">가족 정보는 이 휴대폰에만 저장돼요. 실제 청구는 본인 명의로, 보험사가 정한 위임 절차에 따라 진행해요.</div>`;
}

const VIEWS = { home: viewHome, card: viewCard, check: viewCheck, result: viewResult, claim: viewClaim, family: viewFamily };
const TAB_OF = { result: "check", claim: "check" };

async function render() {
  const route = (location.hash || "#home").slice(1);
  const view = VIEWS[route] || viewHome;
  const main = document.getElementById("view");
  document.getElementById("region").textContent = `${S.region} ▾`;
  for (const a of document.querySelectorAll(".tabbar a")) {
    a.toggleAttribute("aria-current", a.dataset.tab === (TAB_OF[route] || route));
    if (a.hasAttribute("aria-current")) a.setAttribute("aria-current", "page");
  }
  try {
    main.innerHTML = await view();
  } catch (e) {
    main.innerHTML = `<h1>서버에 연결하지 못했어요</h1><p class="error">${esc(e.message)}</p>
      <p class="muted">backend 폴더에서 <code>uvicorn app.main:app</code>을 실행했는지 확인해 주세요.</p>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------------- 동작 ----------------

function readCheckForm() {
  const v = id => document.getElementById(id);
  S.check.event_date = v("event_date").value;
  S.check.sigungu = S.region;
  S.check.er_visit = v("er_visit").checked;
  S.check.hospital_days = Number(v("hospital_days").value) || 0;
  S.check.vulnerable = v("vulnerable").checked;
  S.check.clinic_visits_on_alert_days = Number(v("clinic_visits_on_alert_days").value) || 0;
  S.check.age = v("age").value === "" ? null : Number(v("age").value);
  store.set("check", S.check);
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "region") {
    const r = prompt("사는 시군을 입력하세요 (예: 부천시)", S.region);
    if (r) { S.region = r.trim(); store.set("region", S.region); S.card.weather = null; render(); }
  } else if (t.dataset.weather) {
    S.card.weather = t.dataset.weather; render();
  } else if (t.dataset.symptom) {
    const s = t.dataset.symptom;
    S.card.symptoms = S.card.symptoms.includes(s) ? S.card.symptoms.filter(x => x !== s) : [...S.card.symptoms, s];
    render();
  } else if (t.dataset.code) {
    readCheckForm();
    const c = t.dataset.code;
    S.check.diagnosis_codes = S.check.diagnosis_codes.includes(c) ? S.check.diagnosis_codes.filter(x => x !== c) : [...S.check.diagnosis_codes, c];
    store.set("check", S.check); render();
  } else if (t.id === "run-check") {
    readCheckForm();
    try {
      S.result = await api("/api/eligibility", S.check);
      store.set("result", S.result);
      location.hash = "#result";
    } catch (err) { document.getElementById("check-error").textContent = err.message; }
  } else if (t.id === "print") {
    window.print();
  } else if (t.dataset.proxy) {
    const m = S.family.find(x => String(x.id) === t.dataset.proxy);
    S.region = m.sigungu;
    Object.assign(S.check, { vulnerable: m.vulnerable, age: m.age, sigungu: m.sigungu });
    store.set("check", S.check);
    location.hash = "#check";
  } else if (t.id === "fm-add") {
    const name = document.getElementById("fm-name").value.trim();
    if (!name) return;
    S.family.push({ id: Date.now(), name, age: Number(document.getElementById("fm-age").value) || null,
      sigungu: document.getElementById("fm-region").value.trim() || S.region,
      vulnerable: document.getElementById("fm-vul").checked, alert: true });
    store.set("family", S.family); render();
  }
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "exposure") { S.card.exposure = t.value; render(); }
  else if (t.id === "hours") { S.card.hours = t.value; render(); }
  else if (t.dataset.doc) { S.docs[t.dataset.doc] = t.checked; store.set("docs", S.docs); render(); }
  else if (t.dataset.alert) {
    const m = S.family.find(x => String(x.id) === t.dataset.alert);
    m.alert = t.checked; store.set("family", S.family);
  } else if (["name", "phone", "bank", "account"].includes(t.id)) {
    S.claimForm[t.id] = t.value; store.set("claimForm", S.claimForm); render();
  } else if (t.id === "photo" && t.files[0]) {
    document.getElementById("photo-msg").textContent = `'${t.files[0].name}'을(를) 기기 안에서만 열었어요. 코드를 아래에서 확인해 주세요.`;
  }
});

window.addEventListener("hashchange", render);

(async function start() {
  if (DEMO) {  // 시연·화면 캡처용 예시 상태
    S.check = { ...DEMO_CHECK };
    S.claimForm = { name: "김경기", phone: "010-0000-0000", bank: "농협", account: "000-0000-0000-00" };
    S.docs = { "보험금 청구서": true, "개인정보처리동의서": true, "통장사본": true };
    S.card = { weather: "한파", alert: "한파주의보", exposure: "야외 활동·산책", hours: 1.5, symptoms: ["오한·떨림", "손발 저림"] };
    try { S.result = await api("/api/eligibility", S.check); } catch { /* render가 오류를 보여준다 */ }
  }
  render();
})();

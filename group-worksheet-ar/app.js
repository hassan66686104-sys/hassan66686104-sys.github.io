/* ورقة العمل الجماعية — واجهة الطالب ولوحة المعلم (Supabase) */
const SUPABASE_URL = "https://pqkaotqtwdaoolbjzpyk.supabase.co";
const SUPABASE_KEY = "sb_publishable_6TUp8IMl-Br4lmWOxZ-JHQ_hVFHr85v";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const GROUP_NAMES = { 1: "المجموعة الأولى", 2: "المجموعة الثانية", 3: "المجموعة الثالثة", 4: "المجموعة الرابعة" };
const LEVELS = { low: "أساسي", mid: "متوسط", high: "متقدم" };
const STARS = { low: "★", mid: "★★", high: "★★★" };
const KINDS = { write: "كتابة", fill: "أكمل الفراغ", mcq: "اختيار من متعدد", tf: "صح أو خطأ", why: "علّل", compare: "قارن", classify: "صنّف", other: "أخرى" };
const KIND_ORDER = ["mcq", "fill", "tf", "why", "compare", "classify", "write"];
const ESSAY_KINDS = ["write", "why", "compare", "classify"];
const TF = ["صح", "خطأ"];
const ITEM_PROMPTS = { mcq: "اختر الإجابة الصحيحة لكل مما يأتي:", tf: "ضع (صح) أمام العبارة الصحيحة و(خطأ) أمام العبارة الخاطئة:" };
// الطالب الأساسي يأخذ اختيارًا من متعدد أو صح وخطأ بعدة نقاط، والمتوسط والمتقدم يأخذان سؤالًا مقاليًا
const kindForLevel = (level, i) => (level === "low" ? (i % 2 ? "tf" : "mcq") : ESSAY_KINDS[i % ESSAY_KINDS.length]);
const MARKS = { correct: "صحيحة", partial: "صحيحة جزئيًا", wrong: "تحتاج تصحيح" };
const ARABIC_NUM = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن"];

const $app = document.getElementById("app");
const $nav = document.getElementById("nav");

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, area = localStorage) { try { return JSON.parse(area.getItem(k)); } catch { return null; } },
  set(k, v, area = localStorage) { try { v == null ? area.removeItem(k) : area.setItem(k, JSON.stringify(v)); } catch {} },
};
let deviceMemo = null;
function deviceKey() {
  if (deviceMemo) return deviceMemo;
  deviceMemo = store.get("ws_device");
  if (!deviceMemo) { deviceMemo = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set("ws_device", deviceMemo); }
  return deviceMemo;
}
function logLogin(student) {
  sb.rpc("ws_log_login", { p_device: deviceKey(), p_student: student.id }).then(() => {}, () => {});
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
function errMsg(e) { return (e && (e.message || e.error_description)) || "حدث خطأ، حاول مرة أخرى"; }
function avatar(st, size = "") {
  const cls = `av ${size} g${st?.group_no || 1}`;
  // لا صور للطلاب: تظهر الدائرة برقم الطالب
  const nm = String(st?.name || "؟").trim();
  const initial = (nm.match(/[0-9٠-٩]+/) || [nm.charAt(0)])[0];
  return `<span class="${cls}" aria-hidden="true">${esc(initial)}</span>`;
}
function levelFrom(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(low|منخفض|ضعيف|أساسي|اساسي|1|١)$/.test(t)) return "low";
  if (/^(high|مرتفع|عالي|متقدم|ممتاز|متميز|3|٣)$/.test(t)) return "high";
  return "mid";
}
function groupFrom(text) {
  const t = String(text || "").trim().replace(/[١٢٣٤]/g, (d) => "١٢٣٤".indexOf(d) + 1 + "");
  const m = t.match(/[1-4]/);
  if (m) return +m[0];
  if (/أولى|الاولى|الأولى/.test(t)) return 1;
  if (/ثاني/.test(t)) return 2;
  if (/ثالث/.test(t)) return 3;
  if (/رابع/.test(t)) return 4;
  return 1;
}

/* ---------- data ---------- */
const S = {
  classes: [], students: [], sheets: [], questions: [], answers: {}, comments: [], results: [], solutions: {},
  me: store.get("ws_me"), pin: store.get("ws_pin", sessionStorage),
  tab: store.get("ws_tab") || "students", tClass: store.get("ws_tclass"), tGroup: 1,
  drafts: {}, cDrafts: {}, gen: null, busy: false, showSol: store.get("ws_showsol") === true,
};

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}
async function teacher(action, data = {}) {
  const { data: res, error } = await sb.rpc("ws_teacher", { p_pin: S.pin, p_action: action, p_data: data });
  if (error) throw error;
  return res;
}
async function loadClasses() {
  S.classes = await q(sb.from("ws_classes").select("id,name,sort,archived,is_open").eq("archived", false).order("sort").order("created_at"));
}
async function loadStudents(classId) {
  S.students = classId ? await q(sb.from("ws_students").select("*").eq("class_id", classId).eq("archived", false).order("group_no").order("sort").order("name")) : [];
}
async function loadSheets(classId) {
  S.sheets = classId ? await q(sb.from("ws_sheets").select("*").eq("class_id", classId).eq("archived", false).order("created_at", { ascending: false })) : [];
}
function activeSheet() { return S.sheets.find((s) => s.active) || null; }
// the teacher keeps seeing (and grading/printing) the latest sheet even while it is stopped
function teacherSheet() { return activeSheet() || S.sheets[0] || null; }
async function loadSheetData(sheet, groupNo) {
  if (!sheet) { S.questions = []; S.answers = {}; S.comments = []; S.results = []; S.solutions = {}; return; }
  let qq = sb.from("ws_questions").select("*").eq("sheet_id", sheet.id).order("group_no").order("ordinal");
  if (groupNo) qq = qq.eq("group_no", groupNo);
  S.questions = await q(qq);
  const ids = S.questions.map((x) => x.id);
  const [ans, cm, res] = await Promise.all([
    ids.length ? q(sb.from("ws_answers").select("*").in("question_id", ids)) : [],
    ids.length ? q(sb.from("ws_comments").select("*").in("question_id", ids).eq("hidden", false).order("created_at")) : [],
    q(sb.from("ws_group_results").select("*").eq("sheet_id", sheet.id)),
  ]);
  S.answers = Object.fromEntries(ans.map((a) => [a.question_id, a]));
  S.comments = cm;
  S.results = res;
  S.solutions = {};
  if (S.pin && location.hash.startsWith("#/teacher")) {
    try { S.solutions = await teacher("solutions", { sheet_id: sheet.id }); } catch {}
  } else if (groupNo && res.find((r) => r.group_no === groupNo && r.revealed)) {
    const sol = await q(sb.rpc("ws_revealed_solutions", { p_sheet: sheet.id, p_group: groupNo }));
    S.solutions = Object.fromEntries(sol.map((r) => [r.question_id, r.solution]));
  }
}

/* ---------- live updates ---------- */
let reloadTimer;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => route(true), 450); }
sb.channel("ws-live")
  .on("postgres_changes", { event: "*", schema: "public" }, (p) => { if (String(p.table).startsWith("ws_")) scheduleReload(); })
  .subscribe();
setInterval(() => { if (!document.hidden) route(true); }, 20000);

/* keep focus and typed text across re-renders */
function render(html) {
  const a = document.activeElement;
  const keep = a && a.id ? { id: a.id, start: a.selectionStart, end: a.selectionEnd } : null;
  $app.innerHTML = html;
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus(); try { el.setSelectionRange(keep.start, keep.end); } catch {} }
  }
}
function setNav() {
  const parts = [];
  if (S.me) parts.push(`<button class="ghost small" data-act="logout-student">تغيير الطالب</button>`);
  if (location.hash.startsWith("#/teacher")) {
    if (S.pin) parts.push(`<button class="ghost small" data-act="logout-teacher">خروج المعلم</button>`);
  } else parts.push(`<a class="btn ghost small" href="#/teacher">دخول المعلم</a>`);
  $nav.innerHTML = parts.join("");
}

/* ---------- router ---------- */
let routing = false, again = false;
async function route(silent) {
  if (routing) { again = true; return; }
  routing = true;
  try {
    const h = location.hash || "#/";
    setNav();
    if (!silent && !h.startsWith("#/teacher")) render(`<p class="muted">جارٍ التحميل…</p>`);
    if (h.startsWith("#/teacher")) await viewTeacher();
    else if (h.startsWith("#/class/")) await viewPickStudent(h.split("/")[2]);
    else if (S.me) await viewSheet();
    else await viewClasses();
  } catch (e) {
    console.error(e);
    if (!silent) render(`<div class="paper"><h2>تعذّر التحميل</h2><p class="muted">${esc(errMsg(e))}</p><button data-act="reload">إعادة المحاولة</button></div>`);
  } finally {
    routing = false;
    if (again) { again = false; route(true); }
  }
}
window.addEventListener("hashchange", () => route());

/* ---------- student: choose class ---------- */
async function viewClasses() {
  await loadClasses();
  S.classes = S.classes.filter((c) => c.is_open);
  render(`
    <section class="hero">
      <h1>اختر صفّك</h1>
      <p class="muted">بعد اختيار الصف تظهر أسماء الطلاب. اختر اسمك وستنضم إلى مجموعتك تلقائيًا.</p>
    </section>
    ${S.classes.length ? `<div class="grid-cards">${S.classes.map((c, ci) => `
      <a class="pick" data-n="${ci + 1}" href="#/class/${c.id}" style="text-decoration:none"><span class="big">${esc(c.name)}</span><span class="muted small">اضغط لعرض الأسماء</span></a>`).join("")}</div>`
      : `<div class="paper empty-state"><h2>لا توجد صفوف مفتوحة الآن</h2><p class="muted">ستظهر صفوفك هنا عندما يفتحها المعلم.</p></div>`}
  `);
}

/* ---------- student: choose name ---------- */
async function viewPickStudent(classId) {
  await loadClasses();
  await loadStudents(classId);
  const cls = S.classes.find((c) => c.id === classId);
  if (!cls || !cls.is_open) { render(closedView()); return; }
  const groups = [1, 2, 3, 4].map((g) => ({ g, list: S.students.filter((s) => s.group_no === g) }));
  render(`
    <section class="hero">
      <a href="#/" class="small muted">→ كل الصفوف</a>
      <h1>${esc(cls?.name || "الصف")}</h1>
      <p class="muted">اضغط على اسمك.</p>
    </section>
    ${S.students.length ? `<div class="groups-pick">${groups.map(({ g, list }) => `
      <div class="gcol g${g}">
        <h3>${GROUP_NAMES[g]}</h3>
        ${list.map((s) => `<button class="stu-btn g${g}" data-act="choose-student" data-id="${s.id}">${avatar(s)}<span>${esc(s.name)}</span></button>`).join("") || `<span class="muted small">لا يوجد طلاب</span>`}
      </div>`).join("")}</div>`
      : `<div class="paper empty-state"><h2>لا يوجد طلاب في هذا الصف</h2><p class="muted">يضيفهم المعلم من لوحة المعلم.</p></div>`}
  `);
}

function closedView() {
  return `<div class="paper empty-state"><h2>الصف مغلق الآن</h2><p class="muted">انتظر حتى يفتح المعلم الصف، وستظهر الورقة تلقائيًا.</p></div>`;
}

/* ---------- student: group worksheet ---------- */
async function viewSheet() {
  const me = S.me;
  const meRow = await q(sb.from("ws_students").select("*").eq("id", me.id).maybeSingle());
  if (!meRow || meRow.archived) { S.me = null; store.set("ws_me", null); return viewClasses(); }
  S.me = meRow; store.set("ws_me", meRow);
  const myClass = await q(sb.from("ws_classes").select("is_open").eq("id", meRow.class_id).maybeSingle());
  if (!myClass?.is_open) { render(closedView()); return; }
  await loadStudents(meRow.class_id);
  await loadSheets(meRow.class_id);
  const sheet = activeSheet();
  await loadSheetData(sheet, meRow.group_no);
  const g = meRow.group_no;
  const members = S.students.filter((s) => s.group_no === g);
  const byId = Object.fromEntries(S.students.map((s) => [s.id, s]));
  const result = S.results.find((r) => r.group_no === g);
  const revealed = !!result?.revealed;

  const head = `
    <div class="sheet-head g${g}">
      <div class="sheet-band">
        <div><span class="tag">${GROUP_NAMES[g]}</span><h1>${sheet ? esc(sheet.lesson) : "ورقة العمل"}</h1></div>
        <span class="muted small">${sheet ? `${S.questions.length} أسئلة` : ""}</span>
      </div>
      ${sheet?.objectives?.[g] ? `<div class="objective"><b>هدف مجموعتكم:</b> ${esc(sheet.objectives[g])}</div>` : ""}
      <div class="sheet-meta">
        ${members.map((s) => `<span class="member ${s.id === meRow.id ? "me" : ""}">${avatar(s, "sm")} ${esc(s.name)} ${s.id === meRow.id ? `<span class="you">أنت</span>` : ""}</span>`).join("")}
      </div>
    </div>`;

  if (!sheet || !S.questions.length) {
    const stopped = !sheet && S.sheets.length;
    render(`<div class="stack">${head}<div class="paper empty-state"><h2>${stopped ? "ورقة العمل متوقفة الآن" : "لم تُنشر ورقة العمل بعد"}</h2><p class="muted">${stopped ? "ستظهر هنا تلقائيًا عندما يفعّلها المعلم." : "ستظهر هنا تلقائيًا عندما ينشرها المعلم."}</p></div></div>`);
    return;
  }

  const resultCard = result && (revealed || result.score || result.feedback) ? `
    <div class="result-card g${g}">
      <div class="row" style="justify-content:space-between">
        <h2>نتيجة المجموعة</h2>
        ${result.score ? `<span class="score">${esc(result.score)}</span>` : ""}
      </div>
      ${result.feedback ? `<p style="margin:6px 0 0">${esc(result.feedback)}</p>` : ""}
      ${revealed ? `<p class="small muted" style="margin:6px 0 0">صحّح المعلم الورقة، والحل النموذجي ظاهر تحت كل سؤال.</p>` : ""}
    </div>` : "";

  const qs = S.questions.map((qq, i) => {
    const owner = byId[qq.student_id];
    const mine = qq.student_id === meRow.id;
    const a = S.answers[qq.id];
    const answerText = a?.answer || "";
    const draft = S.drafts[qq.id];
    const cms = S.comments.filter((c) => c.question_id === qq.id);
    const mark = a?.mark ? `<span class="mark ${a.mark}">${MARKS[a.mark]}</span>` : "";
    return `
      <article class="q g${g} ${mine ? "mine" : ""}">
        <div class="q-head">
          <div class="q-owner"><span class="num-badge">${i + 1}</span>${owner ? avatar(owner) : avatar({ name: "؟", group_no: g })}
            <div><span class="q-num">السؤال ${ARABIC_NUM[i + 1] || i + 1}</span><br><span class="small">${owner ? esc(owner.name) : "غير مُسند"}${mine ? " · سؤالك" : ""}</span></div>
          </div>
          <div class="row"><span class="kind">${KINDS[qq.kind] || ""}</span><span class="lvl ${qq.level}" title="مستوى السؤال">${STARS[qq.level]}</span>${mark}</div>
        </div>
        <p class="q-prompt">${esc(qq.prompt)}</p>
        ${!mine && !revealed ? `<p class="small muted" style="margin:0">هذا سؤال زميلك ${owner ? esc(owner.name.split(" ")[0]) : ""}، يجيب عنه بنفسه، ويمكنك التعليق على إجابته بالأسفل.</p>` : ""}
        ${mine && !revealed && itemsFor(qq) ? `
          <div>
            ${itemsBlock(qq, draft ?? answerText, true)}
            <span class="save-state" id="st-${qq.id}">${progressText(qq, draft ?? answerText)}</span>
          </div>`
        : mine && !revealed ? `
          <div>
            <label for="ans-${qq.id}">إجابتك</label>
            <textarea id="ans-${qq.id}" data-input="answer" data-q="${qq.id}" placeholder="اكتب إجابتك هنا…">${esc(draft ?? answerText)}</textarea>
            <div class="row" style="justify-content:space-between;margin-top:6px">
              <span class="save-state" id="st-${qq.id}">${a?.answer ? "محفوظة" : "لم تُحفظ بعد"}</span>
              <button class="primary" data-act="save-answer" data-q="${qq.id}">حفظ الإجابة</button>
            </div>
          </div>`
        : itemsFor(qq) ? `${itemsBlock(qq, answerText, false)}${isAnswered(qq, answerText) ? "" : `<div class="answer-box empty">لم يُجب بعد</div>`}`
        : `<div class="answer-box ${answerText ? "" : "empty"}">${answerText ? esc(answerText) : "لم تُكتب إجابة بعد"}</div>`}
        ${a?.note ? `<div class="small"><b>ملاحظة المعلم:</b> ${esc(a.note)}</div>` : ""}
        ${revealed && S.solutions[qq.id] ? `<div class="solution"><b>الحل:</b> ${esc(S.solutions[qq.id])}</div>` : ""}
        ${cms.length || (!mine && !revealed) ? `
          <div class="comments">
            ${cms.map((c) => { const by = byId[c.student_id]; return `<div class="cmt">${avatar(by || { name: "؟", group_no: g }, "sm")}<div class="cmt-body"><b>${esc(by?.name || "طالب")}</b><br>${esc(c.body)}</div></div>`; }).join("")}
            ${!mine && !revealed ? `
              <form class="cmt-form" data-form="comment" data-q="${qq.id}">
                <input id="cmt-${qq.id}" data-input="comment" data-q="${qq.id}" value="${esc(S.cDrafts[qq.id] || "")}" placeholder="سطر التعديل: علّق على إجابة زميلك أو صحّحها" maxlength="600" autocomplete="off">
                <button type="submit">إرسال</button>
              </form>` : ""}
          </div>` : ""}
      </article>`;
  }).join("");

  const gs = groupStatus(g, byId);
  const doneCard = `<div class="paper done-board small">${gs.complete ? `<span class="mark correct">✓ أكمل جميع أفراد مجموعتكم الحل</span>` : `<b>تقدّم المجموعة: ${gs.done} من ${gs.total}</b><br><span class="muted">لم يُكمل بعد: ${gs.missing.map((m) => esc(m)).join("، ")}</span>`}</div>`;
  render(`<div class="sheet-layout"><aside class="side stack">${head}${doneCard}${resultCard}</aside><div class="q-grid">${qs}</div></div>`);
}

/* أسئلة الاختيار وصح وخطأ: عدة نقاط، كل نقطة لها خياراتها، والإجابة مصفوفة JSON */
function itemsFor(qq) {
  if (qq.kind !== "mcq" && qq.kind !== "tf") return null;
  const ch = Array.isArray(qq.choices) ? qq.choices : [];
  if (ch.length && typeof ch[0] === "object") return ch.map((it) => ({ q: it.q || "", options: qq.kind === "tf" ? TF : (it.options || []).map(String) }));
  if (qq.kind === "tf") return [{ q: "", options: TF }];
  return ch.length ? [{ q: "", options: ch.map(String) }] : null;
}
const singleItem = (its) => its.length === 1 && !its[0].q;
function answersOf(qq, text) {
  const its = itemsFor(qq);
  if (!its) return [];
  if (singleItem(its)) return [text || ""];
  try { const v = JSON.parse(text || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function encodeAnswers(qq, arr) {
  const its = itemsFor(qq);
  return singleItem(its) ? arr[0] || "" : JSON.stringify(its.map((_, i) => arr[i] || ""));
}
function isAnswered(qq, text) {
  return itemsFor(qq) ? answersOf(qq, text).some(Boolean) : !!(text || "").trim();
}
function itemsBlock(qq, text, editable) {
  const its = itemsFor(qq);
  const arr = answersOf(qq, text);
  return `<ol class="items ${singleItem(its) ? "single" : ""}">${its.map((it, ii) => `
    <li>${it.q ? `<p class="item-q">${esc(it.q)}</p>` : ""}
      <div class="choices ${editable ? "" : "ro"}" ${editable ? 'role="radiogroup"' : ""}>${it.options.map((c) => editable
        ? `<label class="choice ${arr[ii] === c ? "on" : ""}"><input type="radio" name="ch-${qq.id}-${ii}" data-input="choice" data-q="${qq.id}" data-i="${ii}" value="${esc(c)}" ${arr[ii] === c ? "checked" : ""}> ${esc(c)}</label>`
        : `<span class="choice ${arr[ii] === c ? "on" : ""}">${esc(c)}</span>`).join("")}</div></li>`).join("")}</ol>`;
}
// نص التحرير: صح وخطأ عبارة في كل سطر، والاختيار سؤال ثم خياراته وسطر فارغ بين الأسئلة
function itemsToText(qq) {
  const ch = Array.isArray(qq.choices) ? qq.choices : [];
  if (ch.length && typeof ch[0] === "object") return qq.kind === "tf" ? ch.map((it) => it.q).join("\n") : ch.map((it) => [it.q, ...(it.options || [])].join("\n")).join("\n\n");
  return ch.length ? [qq.prompt, ...ch].join("\n") : "";
}
function textToItems(kind, text) {
  if (kind === "tf") return text.split("\n").map((x) => x.trim()).filter(Boolean).map((q) => ({ q }));
  if (kind === "mcq") return text.split(/\n\s*\n/).map((b) => b.split("\n").map((x) => x.trim()).filter(Boolean)).filter((l) => l.length).map(([q, ...options]) => ({ q, options }));
  return [];
}
const ITEMS_HINT = { mcq: "الأسئلة: اكتب السؤال في سطر ثم خياراته كل خيار في سطر، واترك سطرًا فارغًا بين الأسئلة", tf: "العبارات: عبارة في كل سطر" };
function progressText(qq, text) {
  const its = itemsFor(qq);
  if (singleItem(its)) return text ? "محفوظة" : "لم تُحفظ بعد";
  return `أجبت عن ${answersOf(qq, text).filter(Boolean).length} من ${its.length}`;
}
const saveTimers = {};
async function saveAnswer(qid, quiet) {
  const text = S.drafts[qid];
  if (text == null) return;
  const st = document.getElementById("st-" + qid);
  if (st) st.textContent = "جارٍ الحفظ…";
  try {
    const { error } = await sb.rpc("ws_save_answer", { p_question: qid, p_student: S.me.id, p_answer: text });
    if (error) throw error;
    if (S.answers[qid]) S.answers[qid].answer = text; else S.answers[qid] = { answer: text };
    if (S.drafts[qid] === text) delete S.drafts[qid];
    const st2 = document.getElementById("st-" + qid);
    const qq = S.questions.find((x) => x.id === qid);
    if (st2) st2.textContent = qq && itemsFor(qq) ? progressText(qq, text) : "محفوظة";
    if (!quiet) toast("حُفظت إجابتك");
  } catch (e) {
    const st2 = document.getElementById("st-" + qid);
    if (st2) st2.textContent = "لم تُحفظ";
    toast(errMsg(e));
  }
}

/* ---------- teacher ---------- */
async function viewTeacher() {
  if (!S.pin) {
    render(`
      <div class="paper stack" style="max-width:420px;margin:24px auto">
        <h1>لوحة المعلم</h1>
        <form class="stack" data-form="pin">
          <div><label for="pin-in">رمز المعلم</label><input id="pin-in" class="pin-mask" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
          <button class="primary" type="submit">دخول</button>
        </form>
      </div>`);
    return;
  }
  await loadClasses();
  if (!S.classes.find((c) => c.id === S.tClass)) S.tClass = S.classes[0]?.id || null;
  await loadStudents(S.tClass);
  await loadSheets(S.tClass);
  const sheet = teacherSheet();
  if (S.tab === "grade") await loadSheetData(sheet, null);
  if (S.tab === "students") {
    const { data, error } = await sb.rpc("ws_teacher_logins", { p_pin: S.pin, p_class: S.tClass });
    S.logins = error ? [] : data || [];
  }

  const tabs = [["students", "الصفوف والطلاب"], ["sheet", "ورقة العمل"], ["grade", "المتابعة والتصحيح"], ["settings", "الإعدادات"]];
  const classOpts = S.classes.map((c) => `<option value="${c.id}" ${c.id === S.tClass ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  let body = "";
  if (S.tab === "students") body = tStudents();
  else if (S.tab === "sheet") body = tSheet(sheet);
  else if (S.tab === "grade") body = tGrade(sheet);
  else body = tSettings();

  render(`
    <div class="stack">
      <div class="row" style="justify-content:space-between">
        <h1>لوحة المعلم</h1>
        ${S.classes.length ? `<div class="row"><label for="t-class" style="margin:0">الصف</label><select id="t-class" data-input="t-class" style="width:auto">${classOpts}</select>${(() => { const c = S.classes.find((x) => x.id === S.tClass); return c ? `<button class="small ${c.is_open ? "" : "primary"}" data-act="toggle-open" data-id="${c.id}" data-open="${c.is_open ? "0" : "1"}">${c.is_open ? "إغلاق الصف" : "فتح الصف للطلاب"}</button>` : ""; })()}</div>` : ""}
      </div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join("")}</div>
      ${body}
    </div>`);
}

function loginsPanel() {
  const rows = (S.logins || []).filter((r) => r.name);
  const byDevice = {};
  rows.forEach((r) => { (byDevice[r.device_key] ||= []).push(r); });
  const when = (t) => new Date(t).toLocaleString("ar-QA", { dateStyle: "short", timeStyle: "short" });
  const body = Object.entries(byDevice).map(([key, list]) => {
    const multi = list.some((r) => r.names_on_device > 1);
    return `<tr class="${multi ? "warn-row" : ""}"><td class="small">جهاز ${esc(key.slice(-4))}</td>
      <td>${list.map((r) => `${esc(r.name)} <span class="muted small">(${GROUP_NAMES[r.group_no]?.replace("المجموعة ", "") || ""})</span>`).join("<br>")}</td>
      <td class="small">${list.map((r) => when(r.last_seen)).join("<br>")}</td>
      <td>${multi ? `<span class="mark wrong">أكثر من اسم على جهاز واحد</span>` : `<span class="mark correct">اسم واحد</span>`}</td></tr>`;
  }).join("");
  return `
    <div class="paper stack">
      <div class="row" style="justify-content:space-between"><h2>سجل الدخول من الأجهزة</h2><button class="small" data-act="reload">تحديث</button></div>
      <p class="muted small" style="margin:0">يظهر هنا الاسم الذي اختاره الطالب عند الدخول من كل جهاز. إذا ظهر أكثر من اسم على جهاز واحد فراجع الطلاب المعنيين.</p>
      ${body ? `<div class="table-wrap"><table><thead><tr><th>الجهاز</th><th>الاسم المختار</th><th>آخر دخول</th><th>الحالة</th></tr></thead><tbody>${body}</tbody></table></div>`
        : `<p class="muted small" style="margin:0">لم يسجّل أي طالب دخوله بعد.</p>`}
    </div>`;
}

function tStudents() {
  const list = S.students;
  const row = (s) => `
    <tr data-sid="${s.id}">
      <td><div class="photo-cell">${avatar(s)}</div></td>
      <td><input id="sn-${s.id}" value="${esc(s.name)}" data-input="stu-field" data-field="name" data-id="${s.id}" aria-label="رقم الطالب"></td>
      <td><select id="sg-${s.id}" data-input="stu-field" data-field="group_no" data-id="${s.id}" aria-label="المجموعة">${[1, 2, 3, 4].map((g) => `<option value="${g}" ${s.group_no === g ? "selected" : ""}>${GROUP_NAMES[g].replace("المجموعة ", "")}</option>`).join("")}</select></td>
      <td><select id="sl-${s.id}" data-input="stu-field" data-field="level" data-id="${s.id}" aria-label="المستوى">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${s.level === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
      <td><button class="ghost small" data-act="archive-student" data-id="${s.id}">إزالة</button></td>
    </tr>`;
  const lvlCount = (arr) => Object.entries(LEVELS).map(([k, l]) => `${l} ${arr.filter((s) => s.level === k).length}`).join("، ");
  const cls = S.classes.find((c) => c.id === S.tClass);
  const groupTables = [1, 2, 3, 4].map((g) => {
    const members = list.filter((s) => s.group_no === g);
    return `<div class="gtable g${g}"><h3>${GROUP_NAMES[g]} <span class="small">(${members.length} طلاب: ${lvlCount(members)})</span></h3>
      ${members.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>الرقم</th><th>المجموعة</th><th>المستوى</th><th></th></tr></thead><tbody>${members.map(row).join("")}</tbody></table></div>` : `<p class="muted small">لا يوجد طلاب.</p>`}</div>`;
  }).join("");
  return `
    <div class="paper stack">
      <h2>الصفوف</h2>
      <p class="muted small" style="margin:0">لا يرى الطلاب إلا الصفوف المفتوحة. أغلق الصف بعد انتهاء الحصة.</p>
      <div class="stack" style="gap:8px">${S.classes.map((c) => `
        <div class="row" style="justify-content:space-between;border:1px solid var(--rule);border-radius:8px;padding:8px 12px">
          <b>${esc(c.name)}</b>
          <div class="row"><span class="mark ${c.is_open ? "correct" : "wrong"}">${c.is_open ? "مفتوح للطلاب" : "مغلق"}</span>
          <button class="small ${c.is_open ? "" : "primary"}" data-act="toggle-open" data-id="${c.id}" data-open="${c.is_open ? "0" : "1"}">${c.is_open ? "إغلاق" : "فتح"}</button></div>
        </div>`).join("")}</div>
      <form class="row" data-form="add-class">
        <input id="new-class" placeholder="اسم الصف، مثل: الصف الخامس أ" required style="flex:1;min-width:200px">
        <button type="submit">إضافة صف</button>
      </form>
      ${S.tClass ? `<div class="row small"><span class="muted">الصف الحالي:</span>
        <input id="rename-class" value="${esc(S.classes.find((c) => c.id === S.tClass)?.name || "")}" style="width:auto;flex:1;min-width:160px">
        <button class="small" data-act="rename-class">حفظ الاسم</button>
        <button class="ghost small" data-act="archive-class">إزالة الصف</button></div>` : ""}
    </div>
    ${S.tClass ? `
    <div class="paper stack">
      <div class="row" style="justify-content:space-between"><h2>طلاب الصف ${esc(cls?.name || "")}</h2><span class="small">${list.length} طالبًا: ${lvlCount(list)}</span></div>
      <div class="class-tabs" role="tablist" aria-label="اختر الصف">${S.classes.map((c) => `<button role="tab" aria-selected="${c.id === S.tClass}" data-act="pick-class" data-id="${c.id}">${esc(c.name)}</button>`).join("")}</div>
      <p class="muted small" style="margin:0">اختر الصف أعلاه لتعديل مستويات طلابه فقط. التعديلات تُحفظ تلقائيًا. الأساسي يأخذ أسئلة اختيار وصح وخطأ، والمتوسط والمتقدم أسئلة مقالية.</p>
      ${list.length ? `<div class="gtables">${groupTables}</div>`
      : `<div class="notice">لا يوجد طلاب في هذا الصف. أضفهم بالأسفل، أو أنشئ 16 طالبًا تجريبيًا وعدّل أرقامهم لاحقًا. <button class="small" data-act="seed-students">إنشاء 4 مجموعات × 4 طلاب</button></div>`}
      <form class="row" data-form="add-student">
        <input id="ns-name" placeholder="رقم الطالب، مثل: طالب 17" required style="flex:2;min-width:160px">
        <select id="ns-group" style="flex:1;min-width:130px">${[1, 2, 3, 4].map((g) => `<option value="${g}">${GROUP_NAMES[g]}</option>`).join("")}</select>
        <select id="ns-level" style="flex:1;min-width:110px">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${k === "mid" ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button type="submit">إضافة طالب</button>
      </form>
    </div>
    ${S.tClass ? loginsPanel() : ""}
    <div class="paper stack">
      <h2>إضافة قائمة طلاب دفعة واحدة</h2>
      <p class="muted small" style="margin:0">سطر لكل طالب بالشكل: رقم الطالب، رقم المجموعة، المستوى (أساسي أو متوسط أو متقدم). مثال: <b>طالب 17، 2، متقدم</b></p>
      <textarea id="bulk" rows="6" placeholder="طالب 17، 1، متوسط&#10;طالب 18، 1، أساسي"></textarea>
      <div><button data-act="bulk-add">إضافة الأسماء</button></div>
    </div>` : `<div class="paper empty-state"><p class="muted">أضف صفًا أولًا.</p></div>`}`;
}

function draftFromStudents() {
  return [1, 2, 3, 4].map((g) => ({
    group_no: g,
    objective: "",
    questions: (() => { let lo = 0, hi = g - 1; return S.students.filter((s) => s.group_no === g).map((s) => ({ student_id: s.id, level: s.level, kind: kindForLevel(s.level, s.level === "low" ? lo++ : hi++), choices: [], prompt: "", solution: "" })); })(),
  }));
}

function tSheet(sheet) {
  if (!S.tClass) return `<div class="paper empty-state"><p class="muted">أضف صفًا وطلابًا أولًا من تبويب «الصفوف والطلاب».</p></div>`;
  const byId = Object.fromEntries(S.students.map((s) => [s.id, s]));
  const gen = S.gen;
  const stuOpts = (g, sel) => `<option value="">بدون طالب</option>` + S.students.filter((s) => s.group_no === g).map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  const editor = gen ? `
    <div class="paper stack">
      <div class="row" style="justify-content:space-between"><h2>مسودة: ${esc(gen.lesson)}</h2>
        <div class="row"><button class="ghost" data-act="discard-gen">إلغاء</button><button class="primary" data-act="publish-gen" ${S.busy ? "disabled" : ""}>نشر الورقة للطلاب</button></div></div>
      <p class="muted small" style="margin:0">كل مجموعة لها أسئلة مختلفة، وكل سؤال مُسند لطالب بحسب مستواه: الأساسي اختيار من متعدد أو صح وخطأ بعدة نقاط، والمتوسط والمتقدم سؤال مقالي. عدّل ما تريد قبل النشر.</p>
      <div><span class="label">انشر الورقة في الصفوف:</span><div class="row">${S.classes.map((c) => `<label class="choice" style="width:auto"><input type="checkbox" data-input="pub-class" value="${c.id}" ${(S.pubClasses || [S.tClass]).includes(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}</div>
      <p class="muted small" style="margin:6px 0 0">${gen.pool ? "في الصفوف الأخرى تُوزّع أسئلة القالب على كل طالب حسب مستواه." : "في الصفوف الأخرى تُسند أسئلة كل مجموعة لطلاب المجموعة نفسها بالترتيب."}</p></div>
      <div class="gen-grid">${gen.groups.map((grp, gi) => `
        <div class="gen-group g${grp.group_no}">
          <h3 style="color:var(--gc)">${GROUP_NAMES[grp.group_no]}</h3>
          <div><label for="gobj-${gi}">هدف المجموعة من الدرس</label><input id="gobj-${gi}" data-input="gen-obj" data-g="${gi}" value="${esc(grp.objective || "")}" placeholder="مثال: أن يميّز الطالب بين…"></div>
          ${grp.questions.map((qq, qi) => `
            <div class="gen-q">
              <div class="row" style="justify-content:space-between">
                <span class="q-num">السؤال ${ARABIC_NUM[qi + 1] || qi + 1}</span>
                <select id="gl-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="level" style="width:auto">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${qq.level === k ? "selected" : ""}>${l}</option>`).join("")}</select>
              </div>
              <div class="row"><select id="gs-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="student_id" style="flex:2;min-width:140px">${stuOpts(grp.group_no, qq.student_id)}</select>
              <select id="gk-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="kind" style="flex:1;min-width:120px">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${qq.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
              <textarea id="gp-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="prompt" rows="${ITEMS_HINT[qq.kind] ? 1 : 3}" placeholder="${ITEMS_HINT[qq.kind] ? ITEM_PROMPTS[qq.kind] : "نص السؤال"}">${esc(qq.prompt)}</textarea>
              ${ITEMS_HINT[qq.kind] ? `<textarea id="gc-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="choices" rows="8" placeholder="${ITEMS_HINT[qq.kind]}">${esc(qq.itemsText ?? itemsToText(qq))}</textarea>` : ""}
              <textarea id="gsol-${gi}-${qi}" data-input="gen" data-g="${gi}" data-q="${qi}" data-field="solution" rows="2" placeholder="الحل النموذجي (يظهر للطلاب بعد التصحيح)">${esc(qq.solution)}</textarea>
              <button class="ghost small" data-act="gen-del" data-g="${gi}" data-q="${qi}" style="align-self:flex-start">حذف السؤال</button>
            </div>`).join("")}
          <button class="small" data-act="gen-add" data-g="${gi}" style="align-self:flex-start">إضافة سؤال</button>
        </div>`).join("")}</div>
    </div>` : "";

  const list = S.sheets;
  const manage = `
    <div class="paper stack">
      <h2>أوراق العمل</h2>
      <div class="all-sheets">
        <span><b>كل الصفوف:</b> <span class="muted small">يوقف أو يفعّل أوراق العمل في جميع الصفوف دفعة واحدة.</span></span>
        <div class="row"><button class="small" data-act="all-sheets" data-on="0">إيقاف جميع أوراق العمل</button><button class="small primary" data-act="all-sheets" data-on="1">تفعيل جميع أوراق العمل</button></div>
      </div>
      ${list.length ? list.map((x) => `
        <div class="sheet-row ${x.active ? "on" : ""}">
          <div><b>${esc(x.lesson)}</b> <span class="muted small">${new Date(x.created_at).toLocaleDateString("ar-QA-u-nu-latn")}</span></div>
          <div class="row">
            <span class="mark ${x.active ? "correct" : "wrong"}">${x.active ? "مفعّلة للطلاب" : "متوقفة"}</span>
            ${x.active ? `<button class="small" data-act="stop-sheet" data-id="${x.id}">إيقاف</button>` : `<button class="small primary" data-act="activate-sheet" data-id="${x.id}">تفعيل</button>`}
            <button class="ghost small" data-act="archive-sheet" data-id="${x.id}">إزالة</button>
          </div>
        </div>`).join("") : `<p class="muted small" style="margin:0">لا توجد أوراق عمل في هذا الصف بعد.</p>`}
      <p class="muted small" style="margin:0">ورقة واحدة فقط تكون مفعّلة في الصف. عند إيقافها يرى الطلاب «ورقة العمل متوقفة» ولا يستطيعون الحل، ويبقى تصحيحها وطباعتها متاحًا لك.</p>
    </div>`;

  return `
    ${!gen ? `<div class="paper stack">
      <h2>ورقة عمل جديدة</h2>
      <div class="row">
        <div style="flex:2;min-width:220px"><label for="lesson">الدرس</label><input id="lesson" placeholder="مثال: الكسور المتكافئة" value="${esc(S.lessonDraft || "")}" data-input="lesson-draft"></div>
        <div style="flex:1;min-width:160px"><label for="grade-lvl">المادة والصف (اختياري)</label><input id="grade-lvl" placeholder="رياضيات، الصف الخامس" value="${esc(S.gradeDraft || "")}" data-input="grade-draft"></div>
      </div>
      <div><label for="notes">ملاحظات للأسئلة (اختياري)</label><input id="notes" placeholder="مثال: ركّز على المسائل الحياتية" value="${esc(S.notesDraft || "")}" data-input="notes-draft"></div>
      <p class="muted small" style="margin:0">الطلاب الحاليون: ${S.students.length}. يُنشأ سؤال لكل طالب بمستواه، وتختلف الأسئلة بين المجموعات.</p>
      <div class="row">
        <button class="primary" data-act="ai-gen" ${S.busy || !S.students.length ? "disabled" : ""}>${S.busy ? "جارٍ توليد الأسئلة…" : "توليد الأسئلة تلقائيًا"}</button>
        <button data-act="manual-gen" ${!S.students.length ? "disabled" : ""}>كتابة الأسئلة بنفسي</button>
      </div>
      <div class="import-box">
        <div><b>استيراد الأسئلة من قالب Excel</b><br><span class="muted small">املأ القالب بأسئلة كل مجموعة ومستوى، ثم ارفعه. يأخذ كل طالب سؤالًا من مستواه في مجموعته.</span></div>
        <div class="row">
          <a class="btn" href="templates/question-template.xlsx" download="قالب-استيراد-الأسئلة.xlsx">تحميل القالب</a>
          <label class="btn primary file-btn">رفع الملف واستيراده<input type="file" accept=".xlsx,.xls,.csv" data-input="import-file"></label>
        </div>
      </div>
    </div>` : ""}
    ${editor}
    ${manage}`;
}

function groupStatus(n, byId) {
  const list = S.questions.filter((x) => x.group_no === n);
  const pending = list.filter((x) => !isAnswered(x, S.answers[x.id]?.answer));
  const missing = [...new Set(pending.map((x) => byId[x.student_id]?.name || "سؤال غير مُسند"))];
  return { n, total: list.length, done: list.length - pending.length, complete: list.length > 0 && !pending.length, missing };
}

function tGrade(sheet) {
  if (!sheet) return `<div class="paper empty-state"><h2>لا توجد ورقة منشورة</h2><p class="muted">أنشئ ورقة من تبويب «ورقة العمل».</p></div>`;
  const g = S.tGroup;
  const byId = Object.fromEntries(S.students.map((s) => [s.id, s]));
  const qs = S.questions.filter((x) => x.group_no === g);
  const res = S.results.find((r) => r.group_no === g) || {};
  const stats = [1, 2, 3, 4].map((n) => groupStatus(n, byId));
  const progress = stats.map((st) => {
    const n = st.n;
    const r = S.results.find((rr) => rr.group_no === n);
    return `<button class="g${n} ${st.complete ? "g-done" : ""}" data-act="tgroup" data-g="${n}" aria-pressed="${n === g}" style="${n === g ? "border-color:var(--accent);background:var(--accent-wash);color:var(--accent)" : ""}">${st.complete ? "✓ " : ""}${GROUP_NAMES[n]} <span class="muted small">${st.done}/${st.total}${r?.revealed ? " · صُحّحت" : ""}</span></button>`;
  }).join("");
  const summary = stats.filter((st) => st.total).map((st) => `
      <div class="done-row ${st.complete ? "ok" : ""}">
        <b>${GROUP_NAMES[st.n]}</b>
        ${st.complete ? `<span class="mark correct">✓ أكمل جميع الأفراد الحل</span>`
          : `<span class="small">لم يُكمل بعد: ${st.missing.map((m) => esc(m)).join("، ")}</span>`}
      </div>`).join("");
  return `
    <div class="row" style="justify-content:space-between">
      <div class="row">${progress}</div>
      <button class="${S.showSol ? "" : "primary"}" data-act="toggle-sol">${S.showSol ? "🙈 إخفاء الحل النموذجي" : "👁 إظهار الحل النموذجي"}</button>
    </div>
    <div class="paper done-board">
      <h2 style="margin:0 0 8px">متابعة إكمال المجموعات <span class="muted small">(${stats.filter((st) => st.complete).length} من ${stats.filter((st) => st.total).length} أكملت)</span></h2>
      ${summary || `<p class="muted small" style="margin:0">لا توجد أسئلة بعد.</p>`}
    </div>
    <div class="paper g${g} stack"><h2>${esc(sheet.lesson)} · ${GROUP_NAMES[g]}</h2>
      <div class="row"><input id="obj-edit" value="${esc(sheet.objectives?.[g] || "")}" placeholder="هدف المجموعة من الدرس" style="flex:1;min-width:200px"><button class="small" data-act="save-objective">حفظ الهدف</button></div>
      <div class="print-bar">
        <b>طباعة ورقة ${GROUP_NAMES[g]}</b>
        <select id="pr-mode" data-input="pr-mode" style="width:auto">
          <option value="graded" ${S.prMode !== "blank" ? "selected" : ""}>مع إجابات الطلاب وتصحيح المعلم</option>
          <option value="blank" ${S.prMode === "blank" ? "selected" : ""}>ورقة فارغة يحلّها الطلاب</option>
        </select>
        <label class="choice" style="width:auto"><input type="checkbox" id="pr-sol" data-input="pr-sol" ${S.prSol !== false ? "checked" : ""}> الحل النموذجي</label>
        <button class="primary" data-act="print-group">طباعة</button>
        <button data-act="pdf-group" ${S.busy ? "disabled" : ""}>${S.busy === "pdf" ? "جارٍ تجهيز الملف…" : "تحميل PDF"}</button>
      </div></div>
    <div class="q-grid">${qs.map((qq, i) => {
      const a = S.answers[qq.id] || {};
      const owner = byId[qq.student_id];
      const cms = S.comments.filter((c) => c.question_id === qq.id);
      return `
      <article class="q g${g}">
        <div class="q-head">
          <div class="q-owner"><span class="num-badge">${i + 1}</span>${owner ? avatar(owner) : avatar({ name: "؟", group_no: g })}<div><span class="q-num">السؤال ${ARABIC_NUM[i + 1] || i + 1}</span><br><span class="small">${owner ? esc(owner.name) : "غير مُسند"}</span></div></div>
          <div class="row"><span class="kind">${KINDS[qq.kind] || ""}</span><span class="lvl ${qq.level}">${LEVELS[qq.level]}</span></div>
        </div>
        <details>
          <summary class="small muted">تعديل السؤال${S.showSol ? " والحل" : ""}</summary>
          <div class="stack" style="margin-top:8px">
            <textarea id="eq-${qq.id}" rows="3">${esc(qq.prompt)}</textarea>
            <select id="ek-${qq.id}">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${qq.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select>
            <textarea id="ec-${qq.id}" rows="6" placeholder="للاختيار: السؤال ثم خياراته كل خيار في سطر وسطر فارغ بين الأسئلة. لصح وخطأ: عبارة في كل سطر">${esc(itemsToText(qq))}</textarea>
            <textarea id="es-${qq.id}" rows="2" placeholder="الحل النموذجي" ${S.showSol ? "" : 'style="display:none"'}>${esc(S.solutions[qq.id] || "")}</textarea>
            <select id="eo-${qq.id}">${`<option value="">بدون طالب</option>` + S.students.filter((s) => s.group_no === g).map((s) => `<option value="${s.id}" ${s.id === qq.student_id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
            <div><button class="small" data-act="save-question" data-q="${qq.id}">حفظ التعديل</button></div>
          </div>
        </details>
        <p class="q-prompt">${esc(qq.prompt)}</p>
        ${itemsFor(qq) ? `${itemsBlock(qq, a.answer, false)}${isAnswered(qq, a.answer) ? "" : `<div class="answer-box empty">لم يُجب بعد</div>`}`
          : `<div class="answer-box ${a.answer ? "" : "empty"}">${a.answer ? esc(a.answer) : "لم يُجب بعد"}</div>`}
        ${S.showSol && S.solutions[qq.id] ? `<div class="solution"><b>الحل النموذجي:</b> ${esc(S.solutions[qq.id])}</div>` : ""}
        <div class="mark-btns">${Object.entries(MARKS).map(([k, l]) => `<button class="${k} ${a.mark === k ? "on" : ""}" data-act="mark" data-q="${qq.id}" data-mark="${k}">${l}</button>`).join("")}</div>
        <div class="row"><input id="note-${qq.id}" placeholder="ملاحظة للطالب (اختياري)" value="${esc(S.cDrafts["note-" + qq.id] ?? a.note ?? "")}" data-input="note" data-q="${qq.id}" style="flex:1;min-width:180px"><button class="small" data-act="save-note" data-q="${qq.id}">حفظ الملاحظة</button></div>
        ${cms.length ? `<div class="comments">${cms.map((c) => { const by = byId[c.student_id]; return `<div class="cmt">${avatar(by || { name: "؟", group_no: g }, "sm")}<div class="cmt-body"><b>${esc(by?.name || "طالب")}</b><br>${esc(c.body)}</div><button class="ghost small" data-act="hide-comment" data-id="${c.id}" title="إخفاء التعليق">إخفاء</button></div>`; }).join("")}</div>` : ""}
      </article>`;
    }).join("")}</div>
    <div class="result-card g${g} stack">
      <h2>تصحيح ${GROUP_NAMES[g]}</h2>
      <div class="row">
        <div style="flex:1;min-width:120px"><label for="score">الدرجة</label><input id="score" value="${esc(S.cDrafts["score-" + g] ?? res.score ?? "")}" data-input="score" placeholder="مثال: 9 من 10"></div>
        <div style="flex:3;min-width:220px"><label for="feedback">رسالة للمجموعة</label><input id="feedback" value="${esc(S.cDrafts["fb-" + g] ?? res.feedback ?? "")}" data-input="feedback" placeholder="أحسنتم في…"></div>
      </div>
      <div class="row">
        <button class="primary" data-act="save-result" data-reveal="true">حفظ وإظهار الحل للمجموعة</button>
        <button data-act="save-result" data-reveal="false">حفظ بدون إظهار الحل</button>
        ${res.revealed ? `<span class="mark correct">الحل ظاهر لهذه المجموعة</span>` : ""}
      </div>
      <p class="small muted" style="margin:0">بعد إظهار الحل تُقفل الإجابات والتعليقات لهذه المجموعة. اختر «حفظ بدون إظهار الحل» لإعادة فتحها.</p>
    </div>`;
}

function tSettings() {
  const link = location.origin + location.pathname;
  return `
    <div class="paper stack">
      <h2>رابط الطلاب</h2>
      <p class="muted" style="margin:0">أرسل هذا الرابط للطلاب. يختار الطالب صفه ثم اسمه.</p>
      <div class="row"><input id="share-link" value="${esc(link)}" readonly style="flex:1;min-width:220px"><button data-act="copy-link">نسخ</button></div>
    </div>
    <div class="paper stack">
      <h2>تغيير رمز المعلم</h2>
      <p class="muted small" style="margin:0">أدخل الرمز الجديد مرتين للتأكد، ثم احفظه. يُستخدم الرمز الجديد في الدخول من الآن.</p>
      <form class="stack" data-form="new-pin">
        <input id="new-pin" class="pin-mask" type="text" inputmode="numeric" minlength="4" placeholder="الرمز الجديد (4 خانات على الأقل)" required autocomplete="off" autocapitalize="off" spellcheck="false">
        <input id="new-pin2" class="pin-mask" type="text" inputmode="numeric" minlength="4" placeholder="أعد كتابة الرمز الجديد" required autocomplete="off" autocapitalize="off" spellcheck="false">
        <div><button type="submit">حفظ الرمز الجديد</button></div>
      </form>
    </div>`;
}

/* ---------- AI generation ---------- */
async function aiGenerate() {
  const lesson = (S.lessonDraft || "").trim();
  if (!lesson) { toast("اكتب اسم الدرس أولًا"); document.getElementById("lesson")?.focus(); return; }
  const base = draftFromStudents();
  S.busy = true; route(true);
  try {
    // one request per group, in parallel, so each stays well under the function time limit
    const parts = await Promise.all(base.filter((g) => g.questions.length).map(async (g) => {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: S.pin, lesson, grade: S.gradeDraft || "", notes: S.notesDraft || "",
          groups: [{ group_no: g.group_no, levels: g.questions.map((x) => x.level) }],
          avoid: `هذه ورقة المجموعة ${g.group_no} من 4 مجموعات؛ اجعل أسئلتها مختلفة عن بقية المجموعات بالتركيز على جانب مختلف من الدرس.` }),
      });
      const raw = await res.text();
      let d = {};
      try { d = JSON.parse(raw); } catch {}
      const grp = Array.isArray(d.groups) ? d.groups[0] : Array.isArray(d.questions) ? d : null;
      if (!res.ok || !grp) {
        console.warn("generate", g.group_no, res.status, raw.slice(0, 300));
        throw new Error((d.error || "تعذّر توليد الأسئلة الآن. يمكنك كتابتها بنفسك.") + ` (${res.status})`);
      }
      return { ...grp, group_no: g.group_no };
    }));
    const data = { groups: parts.filter(Boolean) };
    base.forEach((g) => {
      const got = data.groups.find((x) => +x.group_no === g.group_no)?.questions || [];
      const grp = data.groups.find((x) => +x.group_no === g.group_no) || {};
      g.objective = grp.objective || "";
      g.questions.forEach((qq, i) => {
        const x = got[i] || {};
        qq.prompt = x.prompt || ""; qq.solution = x.solution || "";
        qq.kind = KINDS[x.type] ? x.type : (KINDS[x.kind] ? x.kind : qq.kind);
        const items = Array.isArray(x.items) ? x.items : null;
        if (items && (qq.kind === "mcq" || qq.kind === "tf"))
          qq.choices = items.map((it) => (qq.kind === "tf" ? { q: String(it.q || it.prompt || it) } : { q: String(it.q || it.prompt || ""), options: (it.choices || it.options || []).map(String) }));
        else qq.choices = Array.isArray(x.choices) ? x.choices.map(String) : [];
        if (!qq.prompt && ITEM_PROMPTS[qq.kind]) qq.prompt = ITEM_PROMPTS[qq.kind];
      });
    });
    S.gen = { lesson, groups: base };
    toast("جاهزة للمراجعة");
  } catch (e) {
    toast(errMsg(e));
  } finally {
    S.busy = false; route(true);
  }
}

/* ---------- import questions from the Excel template ---------- */
const KIND_FROM_AR = { "اختيار من متعدد": "mcq", "اختياري": "mcq", "اختيار": "mcq", "صح أو خطأ": "tf", "صح او خطأ": "tf", "صح وخطأ": "tf", "صح او خطا": "tf", "صح وخطا": "tf",
  "كتابة": "write", "مقالي": "write", "اكتب": "write", "اشرح": "write", "علل": "why", "علّل": "why", "قارن": "compare", "صنف": "classify", "صنّف": "classify", "أكمل الفراغ": "fill", "اكمل الفراغ": "fill", "أخرى": "other" };
const kindFrom = (t) => { const v = String(t || "").trim(); return KIND_FROM_AR[v] || (KINDS[v.toLowerCase()] ? v.toLowerCase() : null); };
const LEVEL_FALLBACK = { low: ["low", "mid", "high"], mid: ["mid", "high", "low"], high: ["high", "mid", "low"] };
// pool[g][level] = [question...]; each student takes the next question of their level in their group
function assignByLevel(pool, students, objectives) {
  return [1, 2, 3, 4].map((g) => {
    const members = students.filter((s) => s.group_no === g);
    const byLvl = pool[g] || {};
    const used = { low: 0, mid: 0, high: 0 };
    let questions;
    if (!members.length) questions = ["low", "mid", "high"].flatMap((l) => byLvl[l] || []).map((x) => ({ ...x, student_id: "" }));
    else questions = members.map((st) => {
      const lvl = byLvl[st.level]?.length ? st.level : LEVEL_FALLBACK[st.level].find((l) => byLvl[l]?.length);
      if (!lvl) return null;
      const list = byLvl[lvl];
      const src = list[used[lvl]++ % list.length];
      return { ...src, choices: JSON.parse(JSON.stringify(src.choices || [])), student_id: st.id };
    }).filter(Boolean);
    return { group_no: g, objective: objectives[g] || "", questions };
  });
}
async function importQuestions(file) {
  const lesson = (S.lessonDraft || "").trim() || file.name.replace(/\.[^.]+$/, "");
  await loadScript("vendor/xlsx.mini.min.js");
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets["الأسئلة"] || wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  const errors = [];
  const objectives = {};
  const qmap = new Map(); // key g|level|no -> question
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const cell = (k) => String(r[k] ?? "").trim();
    if (!r.some((v) => String(v).trim())) return;
    const g = parseInt(cell(0).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)), 10);
    if (!(g >= 1 && g <= 4)) { errors.push(`السطر ${line}: رقم المجموعة يجب أن يكون من 1 إلى 4`); return; }
    const level = levelFrom(cell(1));
    const kind = kindFrom(cell(3));
    if (!kind) { errors.push(`السطر ${line}: نوع السؤال «${cell(3)}» غير معروف`); return; }
    const text = cell(4);
    if (!text) { errors.push(`السطر ${line}: نص السؤال فارغ`); return; }
    if (cell(10) && !objectives[g]) objectives[g] = cell(10);
    const opts = [5, 6, 7, 8].map(cell).filter(Boolean);
    const key = `${g}|${level}|${cell(2) || "r" + line}|${kind}`;
    if (kind === "mcq" || kind === "tf") {
      if (kind === "mcq" && opts.length < 2) { errors.push(`السطر ${line}: الاختيار من متعدد يحتاج خيارين على الأقل`); return; }
      let qq = qmap.get(key);
      if (!qq) { qq = { group_no: g, level, kind, prompt: ITEM_PROMPTS[kind], choices: [], sols: [] }; qmap.set(key, qq); }
      qq.choices.push(kind === "mcq" ? { q: text, options: opts } : { q: text });
      qq.sols.push(cell(9));
    } else {
      qmap.set(key + "|" + line, { group_no: g, level, kind, prompt: text, choices: [], sols: [cell(9)] });
    }
  });
  const pool = {};
  for (const qq of qmap.values()) {
    const solution = qq.choices.length ? qq.sols.map((x, i) => `${i + 1}) ${x}`).join("\n") : qq.sols[0] || "";
    const item = { level: qq.level, kind: qq.kind, prompt: qq.prompt, choices: qq.choices, solution };
    ((pool[qq.group_no] ||= {})[qq.level] ||= []).push(item);
  }
  const count = qmap.size;
  if (!count) { toast(errors[0] || "لم أجد أسئلة في الملف. استخدم القالب."); return; }
  S.gen = { lesson, groups: assignByLevel(pool, S.students, objectives), pool, objectives };
  S.lessonDraft = lesson;
  const missing = [1, 2, 3, 4].filter((g) => !pool[g]).map((g) => GROUP_NAMES[g].replace("المجموعة ", ""));
  toast(`استُورد ${count} سؤالًا${missing.length ? `، ولا توجد أسئلة للمجموعة ${missing.join(" و")}` : ""}${errors.length ? `، وتُجوهل ${errors.length} سطرًا: ${errors[0]}` : ""}. راجعها ثم انشر.`);
  route(true);
}

/* ---------- print / PDF of one group's sheet on the school letterhead ---------- */
const TEACHER_NAME = "الأستاذ الحسن علي";
const PAGE = { w: 794, h: 1123, top: 132, bottom: 140, side: 56 }; // A4 at 96dpi; letterhead header/footer bands
function loadScript(src) {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = () => bad(new Error("تعذّر تحميل أداة PDF"));
    document.head.appendChild(el);
  });
}
function printBlocks(sheet, g, mode, withSol) {
  const byId = Object.fromEntries(S.students.map((s) => [s.id, s]));
  const cls = S.classes.find((c) => c.id === sheet.class_id);
  const qs = S.questions.filter((x) => x.group_no === g);
  const members = S.students.filter((s) => s.group_no === g);
  const res = S.results.find((r) => r.group_no === g) || {};
  const graded = mode !== "blank";
  const date = new Date().toLocaleDateString("ar-QA-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const blocks = [];
  blocks.push(`
    <div class="p-title"><h1>ورقة عمل جماعية</h1><span>${esc(sheet.lesson)}</span></div>
    <table class="p-meta">
      <tr><th>الدرس</th><td colspan="3">${esc(sheet.lesson)}</td></tr>
      <tr><th>الصف</th><td>${esc(cls?.name || "")}</td><th>المجموعة</th><td>${GROUP_NAMES[g]}</td></tr>
      <tr><th>التاريخ</th><td>${esc(date)}</td><th>إعداد</th><td>${TEACHER_NAME}</td></tr>
      ${graded ? `<tr><th>درجة المجموعة</th><td>${esc(res.score || "")}</td><th>عدد الأسئلة</th><td>${qs.length}</td></tr>` : ""}
    </table>
    ${sheet.objectives?.[g] ? `<div class="p-obj"><b>هدف المجموعة:</b> ${esc(sheet.objectives[g])}</div>` : ""}
    <div class="p-members"><b>أعضاء المجموعة:</b> ${members.map((m) => esc(m.name)).join("، ")}</div>`);
  const qBlocks = [];
  qs.forEach((qq, i) => {
    const owner = byId[qq.student_id];
    const a = S.answers[qq.id] || {};
    const its = itemsFor(qq);
    const arr = graded ? answersOf(qq, a.answer) : [];
    const cms = graded ? S.comments.filter((c) => c.question_id === qq.id) : [];
    const body = its
      ? `<div class="p-items">${its.map((it, ii) => `<div class="p-item">${it.q ? `<div class="p-iq">${ii + 1}) ${esc(it.q)}</div>` : ""}<div class="p-opts">${it.options.map((c) => `<span class="${arr[ii] === c ? "on" : ""}">${arr[ii] === c ? "◉" : "○"} ${esc(c)}</span>`).join("")}</div></div>`).join("")}</div>`
      : graded ? `<div class="p-ans">${a.answer ? esc(a.answer) : "<i>لم يُجب</i>"}</div>` : `<div class="p-lines">${"<i></i>".repeat(4)}</div>`;
    qBlocks.push(`
      <div class="p-q">
        <div class="p-qh"><span class="p-num">${i + 1}</span><b>السؤال ${ARABIC_NUM[i + 1] || i + 1}</b><span class="p-kind">${KINDS[qq.kind] || ""}</span><span class="p-owner">الطالب: ${owner ? esc(owner.name) : "—"}</span>
          ${graded && a.mark ? `<span class="p-mark ${a.mark}">${MARKS[a.mark]}</span>` : ""}</div>
        <div class="p-prompt">${esc(qq.prompt)}</div>
        ${body}
        ${graded && a.note ? `<div class="p-note"><b>ملاحظة المعلم:</b> ${esc(a.note)}</div>` : ""}
        ${cms.length ? `<div class="p-cmts"><b>تعليقات الزملاء:</b>${cms.map((c) => `<div>• ${esc(byId[c.student_id]?.name || "طالب")}: ${esc(c.body)}</div>`).join("")}</div>` : ""}
        ${withSol && S.solutions[qq.id] ? `<div class="p-sol"><b>الحل النموذجي:</b> ${esc(S.solutions[qq.id])}</div>` : ""}
      </div>`);
  });
  blocks.push(`<div class="p-grid">${qBlocks.join("")}</div>`);
  blocks.push(`
    <div class="p-end">
      ${graded ? `<div><b>درجة المجموعة:</b> ${esc(res.score || "............")}</div><div><b>ملاحظات المعلم:</b> ${esc(res.feedback || "")}</div>` : `<div><b>الدرجة:</b> ............</div>`}
      <div class="p-sign"><span>المعلم: ${TEACHER_NAME}</span><span>التوقيع: ....................</span></div>
    </div>`);
  return { blocks, title: `ورقة عمل - ${sheet.lesson} - ${cls?.name || ""} - ${GROUP_NAMES[g]}` };
}
const PRINT_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #e5e7eb; }
body { font-family: "Readex Pro", "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #111827; font-size: 13px; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${PAGE.w}px; height: ${PAGE.h}px; position: relative; overflow: hidden; background: #fff; margin: 0 auto 16px; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.page > img.lh { position: absolute; inset: 0; width: 100%; height: 100%; }
.content { position: absolute; top: ${PAGE.top}px; bottom: ${PAGE.bottom}px; left: ${PAGE.side}px; right: ${PAGE.side}px; overflow: hidden; }
.fit { display: flex; flex-direction: column; gap: 8px; width: 100%; transform-origin: top right; }
.p-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
.p-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 3px solid #1c2b4a; padding-bottom: 4px; }
.p-title h1 { margin: 0; font-size: 22px; color: #1c2b4a; }
.p-title span { color: #4b5563; font-weight: 600; }
.p-meta { width: 100%; border-collapse: collapse; margin-top: 6px; }
.p-meta th, .p-meta td { border: 1px solid #cbd2e0; padding: 4px 8px; text-align: start; }
.p-meta th { background: #eef1f7; color: #1c2b4a; width: 15%; white-space: nowrap; }
.p-obj { background: #fff8e1; border-inline-start: 4px solid #f5b301; padding: 6px 10px; margin-top: 8px; }
.p-members { margin-top: 6px; color: #374151; }
.p-q { border: 1px solid #cbd2e0; border-radius: 8px; padding: 8px 12px; background: rgba(255,255,255,.92); }
.p-qh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-bottom: 1px dashed #cbd2e0; padding-bottom: 5px; margin-bottom: 6px; }
.p-num { width: 26px; height: 26px; border-radius: 50%; background: #f5b301; color: #1c2b4a; display: inline-grid; place-items: center; font-weight: 700; }
.p-kind { background: #eef1f7; color: #1c2b4a; border-radius: 999px; padding: 0 8px; font-size: 12px; }
.p-owner { color: #4b5563; font-size: 12.5px; }
.p-mark { margin-inline-start: auto; border-radius: 999px; padding: 0 10px; font-size: 12px; font-weight: 700; }
.p-mark.correct { background: #dcfce7; color: #166534; } .p-mark.partial { background: #fef9c3; color: #854d0e; } .p-mark.wrong { background: #fee2e2; color: #991b1b; }
.p-prompt { font-weight: 600; white-space: pre-wrap; }
.p-ans { border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 6px; padding: 5px 10px; margin-top: 4px; white-space: pre-wrap; }
.p-lines { margin-top: 4px; } .p-lines i { display: block; height: 28px; border-bottom: 1px dotted #9aa5bb; }
.p-items { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
.p-opts { padding-inline-start: 18px; }
.p-iq { font-weight: 600; }
.p-opts { display: flex; flex-wrap: wrap; gap: 4px 18px; }
.p-opts span.on { font-weight: 700; color: #1c2b4a; text-decoration: underline; }
.p-note { margin-top: 5px; color: #1e3a8a; }
.p-cmts { margin-top: 5px; font-size: 12.5px; color: #374151; }
.p-sol { margin-top: 5px; background: #ecfdf3; border-radius: 6px; padding: 5px 10px; white-space: pre-wrap; }
.p-sol b { color: #166534; }
.p-end { border-top: 2px solid #1c2b4a; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.p-sign { display: flex; justify-content: space-between; margin-top: 14px; font-weight: 600; }
@media print { html, body { background: #fff; } .page { margin: 0; } }
`;
async function printGroup(sheet, g, how) {
  if (!sheet) return;
  const { blocks, title } = printBlocks(sheet, g, S.prMode || "graded", S.prSol !== false);
  document.getElementById("print-frame")?.remove();
  const fr = document.createElement("iframe");
  fr.id = "print-frame";
  fr.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE.w + 40}px;height:${PAGE.h}px;border:0;`;
  document.body.appendChild(fr);
  const doc = fr.contentDocument;
  const base = new URL(".", location.href).href;
  doc.open();
  doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><base href="${base}"><title>${esc(title)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&display=swap"><style>${PRINT_CSS}</style></head><body><div id="pages"></div></body></html>`);
  doc.close();
  await new Promise((r) => (doc.readyState === "complete" ? r() : fr.addEventListener("load", r, { once: true })));
  try { await doc.fonts.ready; } catch {}
  // one group = one A4 page: lay everything out, then shrink the content until it fits the letterhead's writing area
  const pages = doc.getElementById("pages");
  const page = doc.createElement("div"); page.className = "page";
  page.innerHTML = `<img class="lh" src="brand/letterhead.jpg" alt=""><div class="content"><div class="fit">${blocks.join("")}</div></div>`;
  pages.appendChild(page);
  const area = page.querySelector(".content");
  const fit = page.querySelector(".fit");
  const availH = area.clientHeight, availW = area.clientWidth;
  const fits = (k) => { fit.style.width = availW / k + "px"; fit.style.transform = `scale(${k})`; return fit.scrollHeight * k <= availH * 0.96; };
  if (!fits(1)) {
    let lo = 0.3, hi = 1; // largest scale that still fits
    for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    fits(lo);
  }
  await Promise.all([...doc.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  if (how === "print") {
    fr.contentWindow.focus();
    fr.contentWindow.print();
    return;
  }
  await loadScript("vendor/html2canvas.min.js");
  await loadScript("vendor/jspdf.umd.min.js");
  const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const list = [...doc.querySelectorAll(".page")];
  for (let i = 0; i < list.length; i++) {
    const canvas = await window.html2canvas(list[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: PAGE.w + 40 });
    if (i) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
  }
  const url = URL.createObjectURL(pdf.output("blob"));
  const link = document.createElement("a");
  link.href = url; link.download = title.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast("نُزّل ملف PDF");
}

/* ---------- events ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  try {
    switch (act) {
      case "reload": route(); break;
      case "choose-student": {
        const s = S.students.find((x) => x.id === b.dataset.id);
        S.me = s; store.set("ws_me", s); S.drafts = {}; S.cDrafts = {};
        logLogin(s);
        location.hash = "#/sheet"; break;
      }
      case "logout-student": S.me = null; store.set("ws_me", null); location.hash = "#/"; route(); break;
      case "logout-teacher": S.pin = null; store.set("ws_pin", null, sessionStorage); route(); break;
      case "save-answer": clearTimeout(saveTimers[b.dataset.q]); await saveAnswer(b.dataset.q); break;
      case "toggle-sol": S.showSol = !S.showSol; store.set("ws_showsol", S.showSol); route(); break;
      case "tab": S.tab = b.dataset.tab; store.set("ws_tab", S.tab); route(); break;
      case "pick-class": S.tClass = b.dataset.id; store.set("ws_tclass", S.tClass); S.gen = null; S.pubClasses = null; route(); break;
      case "print-group": await printGroup(teacherSheet(), S.tGroup, "print"); break;
      case "pdf-group": S.busy = "pdf"; route(true); try { await printGroup(teacherSheet(), S.tGroup, "pdf"); } finally { S.busy = false; route(true); } break;
      case "stop-sheet": await teacher("deactivate_sheet", { id: b.dataset.id }); toast("أُوقفت ورقة العمل"); route(true); break;
      case "all-sheets": {
        const on = b.dataset.on === "1";
        if (!on && b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "اضغط مرة أخرى للتأكيد"; return; }
        await teacher("set_all_sheets", { active: on });
        toast(on ? "فُعّلت أحدث ورقة في كل صف" : "أُوقفت جميع أوراق العمل"); route(true); break;
      }
      case "tgroup": S.tGroup = +b.dataset.g; route(true); break;
      case "rename-class": await teacher("save_class", { id: S.tClass, name: document.getElementById("rename-class").value.trim() }); toast("حُفظ اسم الصف"); break;
      case "archive-class":
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "اضغط مرة أخرى للتأكيد"; return; }
        await teacher("save_class", { id: S.tClass, archived: true }); S.tClass = null; toast("أُزيل الصف"); route(true); break;
      case "archive-student":
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "تأكيد الإزالة"; return; }
        await teacher("save_student", { id: b.dataset.id, archived: true }); toast("أُزيل الطالب"); route(true); break;
      case "seed-students": {
        const lv = ["high", "mid", "mid", "low"];
        for (let g = 1; g <= 4; g++) for (let i = 0; i < 4; i++)
          await teacher("save_student", { class_id: S.tClass, name: `طالب ${(g - 1) * 4 + i + 1}`, group_no: g, level: lv[i], sort: i });
        toast("أُنشئ 16 طالبًا تجريبيًا"); route(true); break;
      }
      case "bulk-add": {
        const lines = document.getElementById("bulk").value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
        let n = 0;
        for (const line of lines) {
          const [name, grp, lvl] = line.split(/[،,\t;؛]+/).map((x) => x.trim());
          if (!name) continue;
          await teacher("save_student", { class_id: S.tClass, name, group_no: groupFrom(grp), level: levelFrom(lvl), sort: n });
          n++;
        }
        toast(`أُضيف ${n} طالبًا`); route(true); break;
      }
      case "ai-gen": aiGenerate(); break;
      case "manual-gen": {
        const lesson = (S.lessonDraft || "").trim();
        if (!lesson) { toast("اكتب اسم الدرس أولًا"); return; }
        S.gen = { lesson, groups: draftFromStudents() }; route(true); break;
      }
      case "discard-gen": S.gen = null; route(true); break;
      case "gen-add": { const g = S.gen.groups[+b.dataset.g]; g.questions.push({ student_id: "", level: "mid", kind: "write", choices: [], prompt: "", solution: "" }); route(true); break; }
      case "gen-del": S.gen.groups[+b.dataset.g].questions.splice(+b.dataset.q, 1); route(true); break;
      case "publish-gen": {
        S.gen.groups.forEach((g) => g.questions.forEach((qq) => { if (!qq.prompt.trim() && ITEM_PROMPTS[qq.kind]) qq.prompt = ITEM_PROMPTS[qq.kind]; }));
        const empty = S.gen.groups.some((g) => g.questions.some((qq) => !qq.prompt.trim()
          || (qq.kind === "mcq" && !(itemsFor(qq) || []).every((it) => it.options.length >= 2))
          || (qq.kind === "mcq" && !itemsFor(qq))));
        if (empty) { toast("بعض الأسئلة فارغة أو أسئلة اختيار بلا خيارات. أكملها أو احذفها قبل النشر"); return; }
        const targets = S.pubClasses && S.pubClasses.length ? S.pubClasses : [S.tClass];
        S.busy = true;
        for (const cid of targets) {
          let groups = S.gen.groups;
          if (cid !== S.tClass && S.gen.pool) {
            const studs = await q(sb.from("ws_students").select("id,group_no,level,sort,name").eq("class_id", cid).eq("archived", false).order("sort").order("name"));
            groups = assignByLevel(S.gen.pool, studs, S.gen.objectives);
          } else if (cid !== S.tClass) {
            const studs = await q(sb.from("ws_students").select("id,group_no,level,sort,name").eq("class_id", cid).eq("archived", false).order("sort").order("name"));
            groups = S.gen.groups.map((g) => {
              const members = studs.filter((x) => x.group_no === g.group_no);
              const n = Math.max(members.length, g.questions.length);
              const qs = [];
              for (let i = 0; i < n && g.questions.length; i++) {
                const src = g.questions[i % g.questions.length];
                const st = members[i];
                if (!st && i >= g.questions.length) break;
                qs.push({ ...src, student_id: st ? st.id : "", level: st ? st.level : src.level });
              }
              return { ...g, questions: qs };
            });
          }
          await teacher("create_sheet", { class_id: cid, lesson: S.gen.lesson, groups });
        }
        S.gen = null; S.busy = false; S.lessonDraft = ""; S.pubClasses = null;
        toast(targets.length > 1 ? `نُشرت الورقة في ${targets.length} صفوف` : "نُشرت الورقة للطلاب");
        S.tab = "grade"; store.set("ws_tab", S.tab); route(true); break;
      }
      case "activate-sheet": await teacher("activate_sheet", { id: b.dataset.id }); toast("فُعّلت ورقة العمل للطلاب"); route(true); break;
      case "archive-sheet":
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "تأكيد الإزالة"; return; }
        await teacher("archive_sheet", { id: b.dataset.id }); route(true); break;
      case "mark": {
        const qid = b.dataset.q; const cur = S.answers[qid]?.mark;
        const note = document.getElementById("note-" + qid)?.value ?? S.answers[qid]?.note ?? "";
        await teacher("mark", { question_id: qid, mark: cur === b.dataset.mark ? "" : b.dataset.mark, note });
        route(true); break;
      }
      case "save-note": {
        const qid = b.dataset.q;
        await teacher("mark", { question_id: qid, mark: S.answers[qid]?.mark || "", note: document.getElementById("note-" + qid).value });
        delete S.cDrafts["note-" + qid]; toast("حُفظت الملاحظة"); route(true); break;
      }
      case "save-question": {
        const qid = b.dataset.q;
        await teacher("update_question", { id: qid, prompt: document.getElementById("eq-" + qid).value, solution: document.getElementById("es-" + qid).value, student_id: document.getElementById("eo-" + qid).value,
          kind: document.getElementById("ek-" + qid).value, choices: textToItems(document.getElementById("ek-" + qid).value, document.getElementById("ec-" + qid).value) });
        toast("حُفظ السؤال"); route(true); break;
      }
      case "save-objective": await teacher("set_objective", { sheet_id: teacherSheet().id, group_no: S.tGroup, objective: document.getElementById("obj-edit").value }); toast("حُفظ الهدف"); route(true); break;
      case "toggle-open": {
        const { error } = await sb.rpc("ws_set_class_open", { p_pin: S.pin, p_class: b.dataset.id, p_open: b.dataset.open === "1" });
        if (error) throw error;
        toast(b.dataset.open === "1" ? "فُتح الصف للطلاب" : "أُغلق الصف"); route(true); break;
      }
      case "hide-comment": await teacher("hide_comment", { id: b.dataset.id }); route(true); break;
      case "save-result": {
        const g = S.tGroup; const sheet = teacherSheet();
        await teacher("group_result", { sheet_id: sheet.id, group_no: g, score: document.getElementById("score").value, feedback: document.getElementById("feedback").value, revealed: b.dataset.reveal === "true" });
        delete S.cDrafts["score-" + g]; delete S.cDrafts["fb-" + g];
        toast(b.dataset.reveal === "true" ? "ظهر الحل للمجموعة" : "حُفظ التصحيح"); route(true); break;
      }
      case "copy-link": {
        const inp = document.getElementById("share-link");
        try { await navigator.clipboard.writeText(inp.value); toast("نُسخ الرابط"); } catch { inp.select(); toast("انسخ الرابط المحدد"); }
        break;
      }
    }
  } catch (e) { S.busy = false; toast(errMsg(e)); }
});

document.addEventListener("input", (ev) => {
  const el = ev.target; const k = el.dataset?.input;
  if (!k) return;
  if (k === "answer") {
    const qid = el.dataset.q; S.drafts[qid] = el.value;
    const st = document.getElementById("st-" + qid); if (st) st.textContent = "تعديلات غير محفوظة";
    clearTimeout(saveTimers[qid]); saveTimers[qid] = setTimeout(() => saveAnswer(qid, true), 1500);
  } else if (k === "comment") S.cDrafts[el.dataset.q] = el.value;
  else if (k === "note") S.cDrafts["note-" + el.dataset.q] = el.value;
  else if (k === "score") S.cDrafts["score-" + S.tGroup] = el.value;
  else if (k === "feedback") S.cDrafts["fb-" + S.tGroup] = el.value;
  else if (k === "lesson-draft") S.lessonDraft = el.value;
  else if (k === "grade-draft") S.gradeDraft = el.value;
  else if (k === "notes-draft") S.notesDraft = el.value;
  else if (k === "gen") {
    const qq = S.gen.groups[+el.dataset.g].questions[+el.dataset.q];
    if (el.dataset.field === "prompt" || el.dataset.field === "solution") qq[el.dataset.field] = el.value;
    if (el.dataset.field === "choices") { qq.itemsText = el.value; qq.choices = textToItems(qq.kind, el.value); }
  } else if (k === "gen-obj") S.gen.groups[+el.dataset.g].objective = el.value;
});

document.addEventListener("change", async (ev) => {
  const el = ev.target; const k = el.dataset?.input;
  if (!k) return;
  try {
    if (k === "choice") {
      const qq = S.questions.find((x) => x.id === el.dataset.q);
      const arr = answersOf(qq, S.drafts[qq.id] ?? S.answers[qq.id]?.answer);
      arr[+el.dataset.i || 0] = el.value;
      S.drafts[qq.id] = encodeAnswers(qq, arr);
      await saveAnswer(qq.id, true); route(true); return;
    }
    if (k === "pr-mode") { S.prMode = el.value; return; }
    if (k === "pr-sol") { S.prSol = el.checked; return; }
    if (k === "pub-class") { S.pubClasses = [...document.querySelectorAll('[data-input="pub-class"]:checked')].map((x) => x.value); return; }
    if (k === "t-class") { S.tClass = el.value; store.set("ws_tclass", S.tClass); S.gen = null; S.pubClasses = null; route(); }
    else if (k === "gen") {
      const qq = S.gen.groups[+el.dataset.g].questions[+el.dataset.q];
      qq[el.dataset.field] = el.value;
      if (el.dataset.field === "student_id" && el.value) { const s = S.students.find((x) => x.id === el.value); if (s) qq.level = s.level; }
      if (el.dataset.field === "student_id" || el.dataset.field === "level") {
        const essay = !["mcq", "tf"].includes(qq.kind);
        if (qq.level === "low" && essay) qq.kind = "mcq";
        if (qq.level !== "low" && !essay) qq.kind = "write";
        route(true);
      }
      if (el.dataset.field === "kind") { if (qq.itemsText != null) qq.choices = textToItems(qq.kind, qq.itemsText); route(true); }
    } else if (k === "stu-field") {
      const v = el.dataset.field === "group_no" ? +el.value : el.value.trim();
      if (el.dataset.field === "name" && !v) return;
      await teacher("save_student", { id: el.dataset.id, [el.dataset.field]: v });
      toast("حُفظ");
    } else if (k === "import-file" && el.files?.[0]) {
      await importQuestions(el.files[0]); el.value = "";
    }
  } catch (e) { toast(errMsg(e)); }
});

document.addEventListener("submit", async (ev) => {
  const f = ev.target; const k = f.dataset?.form;
  if (!k) return;
  ev.preventDefault();
  try {
    if (k === "comment") {
      const qid = f.dataset.q; const inp = document.getElementById("cmt-" + qid);
      const body = inp.value.trim(); if (!body) return;
      const { error } = await sb.rpc("ws_add_comment", { p_question: qid, p_student: S.me.id, p_body: body });
      if (error) throw error;
      delete S.cDrafts[qid]; inp.value = ""; toast("أُرسل التعليق"); route(true);
    } else if (k === "pin") {
      const pin = document.getElementById("pin-in").value.trim();
      const { error } = await sb.rpc("ws_teacher", { p_pin: pin, p_action: "check", p_data: {} });
      if (error) throw error;
      S.pin = pin; store.set("ws_pin", pin, sessionStorage); route();
    } else if (k === "add-class") {
      const name = document.getElementById("new-class").value.trim();
      const r = await teacher("save_class", { name, sort: S.classes.length });
      S.tClass = r.id; store.set("ws_tclass", r.id); toast("أُضيف الصف"); route(true);
    } else if (k === "add-student") {
      await teacher("save_student", { class_id: S.tClass, name: document.getElementById("ns-name").value.trim(), group_no: +document.getElementById("ns-group").value, level: document.getElementById("ns-level").value, sort: S.students.length });
      toast("أُضيف الطالب"); route(true);
    } else if (k === "new-pin") {
      const np = document.getElementById("new-pin").value.trim();
      if (np !== document.getElementById("new-pin2").value.trim()) { toast("الرمزان غير متطابقين"); return; }
      await teacher("set_pin", { new_pin: np });
      S.pin = np; store.set("ws_pin", np, sessionStorage); toast("تغيّر رمز المعلم"); f.reset();
    }
  } catch (e) { toast(errMsg(e)); }
});

route();

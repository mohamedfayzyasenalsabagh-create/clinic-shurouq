// واجهة الطبيبة والسكرتارية
import {
  db, P, C, list, one, doc, getDoc, setDoc, updateDoc, addDoc, query, where, getDocs, onSnapshot,
  serverTimestamp, runTransaction, arrayUnion, orderBy, limit, Timestamp, registerPatient, audit,
  createStaff, resetStaffPassword, normPhone
} from "./fb.js";
import { COPYRIGHT,
  $, $$, esc, ymd, addDays, parseYmd, fmtDate, fmtTime, tsDate, money, toast, errMsg, modal, confirmBox, info,
  field, select, logoHtml, waLink, debounce, download, empty, compressImage, pickFile, DAYS, MONTHS, daysBetween
} from "./ui.js";
import { S, logout, showChangePassword } from "./app.js";

export const isDoctor = () => S.profile.role === "doctor";
export const STATUS = {
  confirmed: "مؤكد", arrived: "حضرت", in: "لدى الطبيبة", done: "منتهٍ", noshow: "لم تحضر", cancelled: "ملغى"
};
const cur = () => S.clinic?.currency || "ل.س";

// ---------- كاش المريضات ----------
export const PC = { list: [], byId: {} };
function watchPatients() {
  S.unsub.push(onSnapshot(P.patients(), (s) => {
    PC.list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    PC.byId = Object.fromEntries(PC.list.map((p) => [p.id, p]));
    if (routeName() === "patients") renderPatients();
  }));
}

// ---------- الهيكل والتنقل ----------
const main = () => $("#main");
function routeName() { return (location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]) || "home"; }
function params() { return new URLSearchParams(location.hash.split("?")[1] || ""); }

export function start() {
  const nav = [
    ["home", "الرئيسية", "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"],
    ["appts", "المواعيد", "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
    ["patients", "المريضات", "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15 3.1a3.5 3.5 0 0 1 0 6.8"],
    ["money", "المالية", "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
    ["more", "المزيد", "M5 12h.01M12 12h.01M19 12h.01"],
  ];
  $("#app").innerHTML = `
    <header class="topbar">
      <a href="#/" class="tb-brand">${logoHtml(S.pub, 36)}<span>${esc(S.pub.name || "العيادة")}</span></a>
      <div class="tb-user"><span class="muted small">${esc(S.profile.name || "")} · ${isDoctor() ? "الطبيبة" : "السكرتارية"}</span></div>
    </header>
    <main id="main" class="page"></main>
    <nav class="bottomnav" aria-label="التنقل">
      ${nav.map(([k, t, d]) => `<a href="#/${k === "home" ? "" : k}" data-r="${k}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg><span>${t}</span><b class="badge hidden" data-badge="${k}"></b></a>`).join("")}
    </nav>`;
  watchPatients();
  watchBadges();
  window.onhashchange = render;
  render();
}

function watchBadges() {
  S.unsub.push(onSnapshot(query(P.col("requests"), where("status", "==", "new")), (s) => {
    setBadge("more", s.size + (S._msgCount || 0));
    S._reqCount = s.size;
  }));
  S.unsub.push(onSnapshot(query(P.patients(), where("lastMsgFrom", "==", "patient")), (s) => {
    S._msgCount = s.size;
    setBadge("more", s.size + (S._reqCount || 0));
  }));
}
function setBadge(k, n) {
  const b = $(`[data-badge="${k}"]`);
  if (!b) return;
  b.textContent = n > 9 ? "9+" : n;
  b.classList.toggle("hidden", !n);
}

async function render() {
  const r = routeName();
  $$(".bottomnav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r || (r === "p" && a.dataset.r === "patients")));
  window.scrollTo(0, 0);
  const m = main();
  if (!m) return;
  m.innerHTML = `<div class="loading">جارٍ التحميل…</div>`;
  try {
    switch (r) {
      case "home": return await renderHome();
      case "appts": return await renderAppts();
      case "patients": return renderPatients();
      case "p": { const m2 = await import("./card.js"); return await m2.renderCard(); }
      case "money": return await renderMoney();
      case "more": return renderMore();
      case "requests": return await renderRequests();
      case "waitlist": return await renderWaitlist();
      case "messages": return await renderMessages();
      case "tv": return renderTv();
      case "settings": return isDoctor() ? await renderSettings() : renderMore();
      case "staff": return isDoctor() ? await renderStaff() : renderMore();
      case "reports": return isDoctor() ? await renderReports() : renderMore();
      case "audit": return isDoctor() ? await renderAudit() : renderMore();
      case "backup": return isDoctor() ? renderBackup() : renderMore();
      case "password": return showChangePassword(false);
      default: return await renderHome();
    }
  } catch (e) {
    console.error(e);
    m.innerHTML = `<div class="card"><p class="alert">${esc(errMsg(e))}</p></div>`;
  }
}
export const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

// ---------- الرئيسية ----------
async function renderHome() {
  const today = ymd();
  const appts = (await list(query(P.col("appointments"), where("date", "==", today))))
    .filter((a) => a.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const week = (await list(query(P.col("appointments"), where("date", ">", today), where("date", "<=", addDays(today, 7)))))
    .filter((a) => a.status !== "cancelled").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const waiting = appts.filter((a) => a.status === "arrived").length;
  const done = appts.filter((a) => a.status === "done").length;

  let doctorBits = "";
  if (isDoctor()) {
    const pays = await list(query(P.col("payments"), where("date", "==", today)));
    const income = pays.reduce((s, p) => s + (p.paid || 0), 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const newPts = PC.list.filter((p) => p.createdAt?.toDate && p.createdAt.toDate() >= monthStart).length;
    const alerts = await list(query(P.col("pregAlerts"), where("active", "==", true)));
    const soon = alerts.filter((a) => a.edd && daysBetween(today, a.edd) <= 28 && daysBetween(today, a.edd) >= -14);
    const risky = alerts.filter((a) => a.highRisk);
    const inbox = await list(query(P.col("inbox"), where("seen", "==", false)));
    doctorBits = `
      <div class="stats">
        <div class="stat"><b>${money(income, cur())}</b><span>دخل اليوم</span></div>
        <div class="stat"><b>${newPts}</b><span>مرضى جدد هذا الشهر</span></div>
      </div>
      ${(soon.length || risky.length || inbox.length) ? `<section class="card">
        <h3>تنبيهات</h3>
        <ul class="plain">
          ${soon.map((a) => `<li><a href="#/p/${a.patientId}/preg">🤰 ${esc(a.patientName)}: موعد الولادة المتوقع ${esc(fmtDate(a.edd, false))} (${daysBetween(today, a.edd) >= 0 ? "بعد " + daysBetween(today, a.edd) + " يوم" : "تجاوزت الموعد"})</a></li>`).join("")}
          ${risky.map((a) => `<li><a href="#/p/${a.patientId}/preg"><span class="chip danger">حمل عالي الخطورة</span> ${esc(a.patientName)}</a></li>`).join("")}
          ${inbox.map((i) => `<li><a href="#/p/${i.patientId}/files">📎 ${esc(i.patientName)} رفعت ${esc(i.label || "ملف")}</a></li>`).join("")}
        </ul></section>` : ""}`;
  }

  main().innerHTML = `
    <h2 class="page-title">${esc(fmtDate(today))}</h2>
    <div class="stats">
      <div class="stat"><b>${appts.length}</b><span>مواعيد اليوم</span></div>
      <div class="stat"><b>${waiting}</b><span>منتظرات</span></div>
      <div class="stat"><b>${done}</b><span>انتهت</span></div>
    </div>
    ${doctorBits}
    <section class="card">
      <div class="row-between"><h3>مواعيد اليوم</h3><a class="btn small" href="#/appts">جميع المواعيد</a></div>
      ${appts.length ? `<ul class="appt-list">${appts.map(apptRow).join("")}</ul>` : empty("لا توجد مواعيد اليوم")}
    </section>
    <section class="card">
      <h3>الأسبوع القادم</h3>
      ${week.length ? `<ul class="appt-list compact">${week.map((a) => `<li><button class="appt" data-a="${a.id}">
        <span class="t">${esc(DAYS[parseYmd(a.date).getDay()])} ${parseYmd(a.date).getDate()}/${parseYmd(a.date).getMonth() + 1} · ${esc(fmtTime(a.time))}</span>
        <span class="n">${esc(a.patientName)}</span><span class="chip">${esc(a.type || "")}</span></button></li>`).join("")}</ul>` : empty("لا توجد مواعيد")}
    </section>`;
  bindApptButtons([...appts, ...week]);
}

function apptRow(a) {
  return `<li><button class="appt st-${a.status}" data-a="${a.id}">
    <span class="t">${esc(fmtTime(a.time))}${a.queueNo ? ` <span class="q">#${a.queueNo}</span>` : ""}</span>
    <span class="n">${esc(a.patientName)}<small>${esc(a.type || "")}</small></span>
    <span class="chip st">${esc(STATUS[a.status] || a.status)}</span></button></li>`;
}
function bindApptButtons(arr) {
  const map = Object.fromEntries(arr.map((a) => [a.id, a]));
  $$("[data-a]").forEach((b) => b.onclick = () => apptActions(map[b.dataset.a]));
}

// ---------- إجراءات الموعد ----------
export async function apptActions(a) {
  const p = PC.byId[a.patientId] || {};
  const doc_ = isDoctor();
  const w = await new Promise((resolve) => {
    modal(`${a.patientName}`, `
      <p class="muted">${esc(fmtDate(a.date))} · ${esc(fmtTime(a.time))} · ${esc(a.type || "")}</p>
      ${a.note ? `<p>${esc(a.note)}</p>` : ""}
      <p>الحالة: <span class="chip">${esc(STATUS[a.status])}</span></p>
      <div class="btn-grid">
        ${a.status === "confirmed" ? `<button class="btn" data-act="arrived">حضرت ✓</button>` : ""}
        ${["confirmed", "arrived"].includes(a.status) ? `<button class="btn" data-act="in">دخلت إلى الطبيبة</button>` : ""}
        ${["arrived", "in", "confirmed"].includes(a.status) ? `<button class="btn" data-act="done">انتهت</button>` : ""}
        ${a.status === "confirmed" ? `<button class="btn" data-act="noshow">لم تحضر</button>` : ""}
        ${doc_ ? `<button class="btn primary" data-act="visit">تسجيل زيارة</button>` : ""}
        ${doc_ ? `<button class="btn" data-act="card">بطاقة المريضة</button>` : `<button class="btn" data-act="card">بيانات المريضة</button>`}
        <button class="btn" data-act="pay">تسجيل دفعة</button>
        <a class="btn" target="_blank" rel="noopener" href="${esc(waLink(a.phone || p.phone, reminderText(a)))}">تذكير عبر واتساب</a>
        <a class="btn" href="tel:${esc(a.phone || p.phone || "")}">اتصال</a>
        ${!["done", "cancelled"].includes(a.status) ? `<button class="btn" data-act="move">تأجيل</button><button class="btn danger" data-act="cancel">إلغاء الموعد</button>` : ""}
      </div>`, { ok: null, cancel: "إغلاق", onOpen: (wrap) => resolve(wrap) });
  });
  w.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
    const act = b.dataset.act;
    w.remove();
    try {
      if (["arrived", "in", "done", "noshow"].includes(act)) {
        const patch = { status: act, updatedAt: serverTimestamp() };
        if (act === "arrived" && !a.queueNo) patch.queueNo = await nextQueueNo(a.date);
        await updateDoc(P.colDoc("appointments", a.id), patch);
        await audit(`تغيير حالة موعد إلى ${STATUS[act]}`, a.patientName);
        toast("تم");
        if (act === "in") await callNumber(patch.queueNo || a.queueNo);
      } else if (act === "visit") {
        const m = await import("./card.js");
        return m.visitModal(a.patientId, a);
      } else if (act === "card") {
        return go(`#/p/${a.patientId}/${doc_ ? "summary" : "info"}`);
      } else if (act === "pay") {
        return paymentModal(a.patientId, a.type);
      } else if (act === "move") {
        const nb = await bookModal({ pid: a.patientId, type: a.type, note: a.note, title: "تأجيل الموعد" });
        if (nb) {
          await updateDoc(P.colDoc("appointments", a.id), { status: "cancelled", cancelReason: "تأجيل", updatedAt: serverTimestamp() });
          offerNotify(a.phone || p.phone, `مرحباً ${a.patientName}، تم تغيير موعدك في ${S.pub.name} إلى ${fmtDate(nb.date)} الساعة ${fmtTime(nb.time)}.`);
        }
      } else if (act === "cancel") {
        if (!(await confirmBox("إلغاء الموعد", `إلغاء موعد ${a.patientName}؟`, "إلغاء الموعد", true))) return;
        await updateDoc(P.colDoc("appointments", a.id), { status: "cancelled", updatedAt: serverTimestamp() });
        await audit("إلغاء موعد", a.patientName);
        const wl = await list(query(P.col("waitlist"), where("status", "==", "waiting")));
        offerNotify(a.phone || p.phone, `مرحباً ${a.patientName}، نعتذر، تم إلغاء موعدك في ${S.pub.name} بتاريخ ${fmtDate(a.date)}. يرجى التواصل معنا لتحديد موعد جديد.`,
          wl.length ? `<p class="alert">في ${wl.length} في قائمة الانتظار الاحتياطية. <a href="#/waitlist">افتحها</a> لإعطاء الموعد لإحداهن.</p>` : "");
      }
    } catch (e) { toast(errMsg(e), true); }
    render();
  });
}
function reminderText(a) {
  return `مرحباً ${a.patientName}، تذكير بموعدك في ${S.pub.name} يوم ${fmtDate(a.date)} الساعة ${fmtTime(a.time)}.${S.pub.address ? " العنوان: " + S.pub.address : ""}`;
}
function offerNotify(phone, text, extra = "") {
  info("إبلاغ المريضة", `${extra}<p>${esc(text)}</p><a class="btn primary" target="_blank" rel="noopener" href="${esc(waLink(phone, text))}">إرسال على واتساب</a>`);
}
async function nextQueueNo(date) {
  const arr = await list(query(P.col("appointments"), where("date", "==", date)));
  return arr.reduce((m, x) => Math.max(m, x.queueNo || 0), 0) + 1;
}
async function callNumber(n) {
  if (!n) return;
  try { await setDoc(P.colDoc("live", "queue"), { number: n, at: serverTimestamp() }); } catch {}
}

// ---------- الحجز ----------
export function slotsFor(date) {
  const c = S.clinic || {};
  const h = c.hours?.[parseYmd(date).getDay()];
  if (!h || !h.on) return [];
  const step = Number(c.slotMinutes) || 20;
  const toMin = (t) => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };
  const out = [];
  for (let m = toMin(h.from); m + step <= toMin(h.to); m += step)
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
}
const slotId = (date, time) => `${date}_${time.replace(":", "")}`;

export async function bookAppointment({ pid, date, time, type, note = "" }) {
  const p = PC.byId[pid] || (await one(P.patient(pid)));
  const ref = P.colDoc("appointments", slotId(date, time));
  await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    if (s.exists() && s.data().status !== "cancelled") throw new Error(`الوقت ${fmtTime(time)} محجوز باسم ${s.data().patientName}`);
    tx.set(ref, {
      patientId: pid, patientName: p.name, phone: p.phone, date, time, type: type || "", note,
      status: "confirmed", queueNo: null, createdAt: serverTimestamp(), createdBy: S.user.uid
    });
  });
  await audit("حجز موعد", `${p.name} ${date} ${time}`);
  return { id: ref.id, date, time };
}

export async function bookModal({ pid = "", date = ymd(), time = "", type = "", note = "", title = "موعد جديد", requestId = null } = {}) {
  const services = S.clinic?.services || [];
  if (!type && services.length) type = services[0].name;
  const booked = async (d) => new Set((await list(query(P.col("appointments"), where("date", "==", d))))
    .filter((a) => a.status !== "cancelled").map((a) => a.time));
  const body = `<form class="stack">
    ${pid ? `<input type="hidden" name="pid" value="${esc(pid)}"><p><b>${esc(PC.byId[pid]?.name || "")}</b></p>` : `
      <label class="field"><span>المريضة</span><input class="pt-search" placeholder="اكتبي الاسم أو الرقم" autocomplete="off"><input type="hidden" name="pid" required></label>
      <div class="pt-results"></div>`}
    ${field("التاريخ", "date", { type: "date", value: date, required: true })}
    <div class="field"><span>الوقت</span><div class="slots"></div></div>
    ${field("أو أدخلي وقتاً يدوياً", "manual", { type: "time", value: "" })}
    ${select("نوع الموعد", "type", [["", "—"], ...services.map((s) => [s.name, s.name])], type)}
    ${field("ملاحظة", "note", { value: note })}
    <input type="hidden" name="time" value="${esc(time)}">
  </form>`;
  return modal(title, body, {
    ok: "حجز",
    onOpen: (w) => {
      const form = w.querySelector("form");
      const drawSlots = async () => {
        const d = form.date.value;
        const taken = await booked(d);
        const sl = slotsFor(d);
        w.querySelector(".slots").innerHTML = sl.length
          ? sl.map((t) => `<button type="button" class="slot ${taken.has(t) ? "taken" : ""} ${t === form.time.value ? "on" : ""}" data-t="${t}" ${taken.has(t) ? "disabled" : ""}>${esc(fmtTime(t))}</button>`).join("")
          : `<span class="muted">العيادة مغلقة في هذا اليوم (يمكنكِ إدخال وقت يدوياً)</span>`;
        w.querySelectorAll(".slot").forEach((b) => b.onclick = () => {
          form.time.value = b.dataset.t; form.manual.value = "";
          w.querySelectorAll(".slot").forEach((x) => x.classList.toggle("on", x === b));
        });
      };
      form.date.onchange = drawSlots;
      drawSlots();
      const s = w.querySelector(".pt-search");
      if (s) {
        s.oninput = debounce(() => {
          const q = s.value.trim();
          const res = q ? searchPatients(q).slice(0, 6) : [];
          w.querySelector(".pt-results").innerHTML = res.map((p) => `<button type="button" class="pt-pick" data-id="${p.id}">${esc(p.name)} <span class="muted" dir="ltr">${esc(p.phone)}</span></button>`).join("");
          w.querySelectorAll(".pt-pick").forEach((b) => b.onclick = () => {
            form.pid.value = b.dataset.id; s.value = PC.byId[b.dataset.id].name;
            w.querySelector(".pt-results").innerHTML = "";
          });
        }, 150);
      }
    },
    onOk: async (f) => {
      const t = f.manual || f.time;
      if (!f.pid) { toast("اختاري المريضة", true); return false; }
      if (!t) { toast("اختاري الوقت", true); return false; }
      const r = await bookAppointment({ pid: f.pid, date: f.date, time: t, type: f.type, note: f.note });
      if (requestId) await updateDoc(P.colDoc("requests", requestId), { status: "done", apptId: r.id });
      toast("تم الحجز");
      const p = PC.byId[f.pid];
      if (p) offerNotify(p.phone, `مرحباً ${p.name}، تم تثبيت موعدك في ${S.pub.name} يوم ${fmtDate(f.date)} الساعة ${fmtTime(t)}.`);
      setTimeout(render, 100);
      return r;
    }
  });
}

export function searchPatients(q) {
  const n = normPhone(q);
  const t = q.toLowerCase();
  return PC.list.filter((p) => !p.archived && (p.name.toLowerCase().includes(t) || (n.length >= 3 && p.phone.includes(n))));
}

// ---------- المواعيد ----------
async function renderAppts() {
  const d = params().get("d") || ymd();
  const appts = (await list(query(P.col("appointments"), where("date", "==", d)))).sort((a, b) => a.time.localeCompare(b.time));
  const byTime = {};
  appts.filter((a) => a.status !== "cancelled").forEach((a) => byTime[a.time] = a);
  const slots = slotsFor(d);
  const extra = appts.filter((a) => a.status !== "cancelled" && !slots.includes(a.time));
  const cancelled = appts.filter((a) => a.status === "cancelled" && !byTime[a.time]);
  main().innerHTML = `
    <div class="row-between">
      <a class="icon-btn" href="#/appts?d=${addDays(d, -1)}" aria-label="اليوم السابق">→</a>
      <label class="date-pick"><b>${esc(fmtDate(d))}</b><input type="date" value="${d}" aria-label="اختيار التاريخ"></label>
      <a class="icon-btn" href="#/appts?d=${addDays(d, 1)}" aria-label="اليوم التالي">←</a>
    </div>
    <div class="row gap"><a class="btn small" href="#/appts?d=${ymd()}">اليوم</a><button class="btn primary small new">+ موعد</button></div>
    <section class="card">
      ${slots.length ? `<ul class="slot-list">${slots.map((t) => byTime[t]
        ? `<li>${apptRow(byTime[t])}</li>`
        : `<li><button class="appt free" data-free="${t}"><span class="t">${esc(fmtTime(t))}</span><span class="n muted">متاح · اضغطي للحجز</span></button></li>`).join("")}</ul>`
        : empty("العيادة مغلقة في هذا اليوم وفق أوقات الدوام")}
      ${extra.length ? `<h4>مواعيد خارج الجدول</h4><ul class="appt-list">${extra.map(apptRow).join("")}</ul>` : ""}
      ${cancelled.length ? `<details><summary class="muted">ملغاة (${cancelled.length})</summary><ul class="appt-list">${cancelled.map(apptRow).join("")}</ul></details>` : ""}
    </section>`;
  $(".date-pick input").onchange = (e) => go(`#/appts?d=${e.target.value}`);
  $(".new").onclick = () => bookModal({ date: d });
  $$("[data-free]").forEach((b) => b.onclick = () => bookModal({ date: d, time: b.dataset.free }));
  bindApptButtons(appts);
}

// ---------- المريضات ----------
let ptFilter = "", showArchived = false;
function renderPatients() {
  if (routeName() !== "patients") return;
  const q = ptFilter.trim();
  let arr = q ? PC.list.filter((p) => p.name.includes(q) || p.phone.includes(normPhone(q) || q)) : PC.list;
  arr = arr.filter((p) => !!p.archived === showArchived);
  const existing = $("#pt-q");
  const html = `<ul class="pt-list">${arr.slice(0, 300).map((p) => `<li><a href="#/p/${p.id}/${isDoctor() ? "summary" : "info"}">
      <span class="avatar">${esc(p.name.trim()[0] || "؟")}</span>
      <span class="n">${esc(p.name)}<small dir="ltr">${esc(p.phone)}</small></span>
      ${p.age ? `<span class="muted small">${esc(p.age)} سنة</span>` : ""}</a></li>`).join("")}</ul>
      ${arr.length ? "" : empty(q ? "لا توجد نتائج" : "لا توجد مريضات بعد")}`;
  if (existing) { $("#pt-results").innerHTML = html; return; }
  main().innerHTML = `
    <div class="row-between"><h2 class="page-title">المريضات <span class="muted small">(${PC.list.filter((p) => !p.archived).length})</span></h2>
      <button class="btn primary new">+ مريضة جديدة</button></div>
    <input id="pt-q" class="search" type="search" placeholder="البحث بالاسم أو رقم الجوال" value="${esc(ptFilter)}" aria-label="بحث">
    <label class="check small"><input type="checkbox" class="arch" ${showArchived ? "checked" : ""}><span>عرض المؤرشفات</span></label>
    <div id="pt-results">${html}</div>`;
  $("#pt-q").oninput = debounce((e) => { ptFilter = e.target.value; renderPatients(); }, 120);
  $(".arch").onchange = (e) => { showArchived = e.target.checked; renderPatients(); };
  $(".new").onclick = newPatientModal;
}

export async function newPatientModal() {
  const r = await modal("مريضة جديدة", `<form class="stack">
    ${field("الاسم الكامل", "name", { required: true })}
    ${field("رقم الجوال", "phone", { required: true, attrs: 'dir="ltr" inputmode="tel"', placeholder: "09xxxxxxxx" })}
    <div class="grid2">
      ${field("العمر", "age", { type: "number", attrs: 'min="0" max="120"' })}
      ${select("فصيلة الدم", "bloodType", ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])}
    </div>
    ${field("العنوان", "address")}
    <p class="muted small">سيُنشأ للمريضة حساب تلقائياً برقم جوالها.</p>
  </form>`, {
    ok: "تسجيل",
    onOk: async (f) => {
      const dup = PC.list.find((p) => p.phone === normPhone(f.phone) && p.name.trim() === f.name.trim());
      if (dup && !(await confirmBox("توجد مريضة بالاسم والرقم نفسيهما", "هل تريدين تسجيلها مرة أخرى؟", "تسجيل"))) return false;
      return await registerPatient(f);
    }
  });
  if (!r) return;
  showCredentials(r.phone, r.tempPassword, PC.byId[r.pid]?.name || "", r.shared);
  go(`#/p/${r.pid}/${isDoctor() ? "summary" : "info"}`);
}

export function showCredentials(phone, temp, name, shared = false) {
  const url = location.origin + location.pathname;
  if (shared) {
    return info("تم التسجيل", `<p>لهذا الرقم حساب سابق (رقم مشترك). أُضيفت المريضة الجديدة إلى الحساب نفسه، وتختار ملفها عند الدخول.</p>`);
  }
  const text = `أهلاً ${name}، هذا حسابك في تطبيق ${S.pub.name}:\nالرابط: ${url}\nرقم الجوال: ${phone}\nكلمة المرور المؤقتة: ${temp}\nسيُطلب منكِ تغييرها عند أول دخول.`;
  info("حساب المريضة جاهز", `
    <div class="cred"><div>رقم الدخول: <b dir="ltr">${esc(phone)}</b></div><div>كلمة المرور المؤقتة: <b class="big" dir="ltr">${esc(temp)}</b></div></div>
    <p class="muted small">سلّميها للمريضة، وسيُطلب منها تغييرها عند أول دخول. لن تتمكني من رؤيتها مرة أخرى.</p>
    <a class="btn primary block" target="_blank" rel="noopener" href="${esc(waLink(phone, text))}">إرسال على واتساب</a>`);
}

// ---------- الدفعات ----------
export async function paymentModal(pid, service = "") {
  const p = PC.byId[pid];
  const services = S.clinic?.services || [];
  const price = services.find((s) => s.name === service)?.price || "";
  return modal(`دفعة · ${p?.name || ""}`, `<form class="stack">
    ${select("الخدمة", "service", [["", "—"], ...services.map((s) => [s.name, `${s.name}${s.price ? " · " + money(s.price, cur()) : ""}`]), ["أخرى", "أخرى"]], service)}
    <div class="grid2">
      ${field("المبلغ المطلوب", "total", { type: "number", value: price, required: true, attrs: 'min="0" inputmode="numeric"' })}
      ${field("المدفوع", "paid", { type: "number", value: price, required: true, attrs: 'min="0" inputmode="numeric"' })}
    </div>
    ${field("التاريخ", "date", { type: "date", value: ymd(), required: true })}
    ${field("ملاحظة", "note")}
  </form>`, {
    ok: "حفظ الدفعة",
    onOpen: (w) => {
      const f = w.querySelector("form");
      f.service.onchange = () => {
        const pr = services.find((s) => s.name === f.service.value)?.price;
        if (pr) { f.total.value = pr; f.paid.value = pr; }
      };
    },
    onOk: async (f) => {
      const ref = await addDoc(P.col("payments"), {
        patientId: pid, patientName: p?.name || "", service: f.service, total: f.total || 0, paid: f.paid || 0,
        date: f.date, note: f.note, by: S.user.uid, byName: S.profile.name || "", createdAt: serverTimestamp()
      });
      await audit("تسجيل دفعة", `${p?.name} ${f.paid}`);
      toast("حُفظت الدفعة");
      if (await confirmBox("إيصال", "هل تريدين طباعة إيصال؟", "طباعة")) printReceipt({ id: ref.id, ...f, patientName: p?.name });
      setTimeout(render, 100);
    }
  });
}
export function printReceipt(r) {
  import("./ui.js").then(({ printDoc }) => printDoc(S.pub, "إيصال دفع", `
    <table class="kv"><tr><th>رقم الإيصال</th><td dir="ltr">${esc(String(r.id).slice(0, 8).toUpperCase())}</td></tr>
    <tr><th>المريضة</th><td>${esc(r.patientName)}</td></tr>
    <tr><th>التاريخ</th><td>${esc(fmtDate(r.date, false))}</td></tr>
    <tr><th>الخدمة</th><td>${esc(r.service || "")}</td></tr>
    <tr><th>المبلغ المطلوب</th><td>${esc(money(r.total, cur()))}</td></tr>
    <tr><th>المدفوع</th><td>${esc(money(r.paid, cur()))}</td></tr>
    <tr><th>المتبقي</th><td>${esc(money((r.total || 0) - (r.paid || 0), cur()))}</td></tr></table>`));
}

async function renderMoney() {
  const pr = params();
  const doc_ = isDoctor();
  const from = pr.get("from") || ymd(), to = pr.get("to") || ymd();
  const pays = (await list(query(P.col("payments"), where("date", ">=", doc_ ? from : ymd()), where("date", "<=", doc_ ? to : ymd()))))
    .sort((a, b) => (b.date + (b.createdAt?.seconds || 0)).localeCompare(a.date + (a.createdAt?.seconds || 0)));
  const total = pays.reduce((s, p) => s + (p.total || 0), 0), paid = pays.reduce((s, p) => s + (p.paid || 0), 0);
  let debts = "";
  if (doc_) {
    const all = await list(P.col("payments"));
    const per = {};
    all.forEach((p) => { per[p.patientId] = per[p.patientId] || { name: p.patientName, d: 0 }; per[p.patientId].d += (p.total || 0) - (p.paid || 0); });
    const owing = Object.entries(per).filter(([, v]) => v.d > 0).sort((a, b) => b[1].d - a[1].d);
    debts = `<section class="card"><h3>الديون المستحقة</h3>${owing.length ? `<ul class="plain">${owing.map(([id, v]) => `<li class="row-between"><a href="#/p/${id}/money">${esc(v.name)}</a><b>${esc(money(v.d, cur()))}</b></li>`).join("")}</ul>` : empty("لا توجد ديون")}</section>`;
  }
  const monthStart = ymd().slice(0, 8) + "01";
  main().innerHTML = `
    <div class="row-between"><h2 class="page-title">المالية</h2></div>
    ${doc_ ? `<div class="row gap wrap">
      <a class="btn small" href="#/money">اليوم</a>
      <a class="btn small" href="#/money?from=${monthStart}&to=${ymd()}">هذا الشهر</a>
      <label class="field inline"><span>من</span><input type="date" class="f" value="${from}"></label>
      <label class="field inline"><span>إلى</span><input type="date" class="t" value="${to}"></label>
    </div>` : `<p class="muted">دفعات اليوم</p>`}
    <div class="stats">
      <div class="stat"><b>${esc(money(paid, cur()))}</b><span>المقبوض</span></div>
      <div class="stat"><b>${esc(money(total - paid, cur()))}</b><span>المتبقي</span></div>
      <div class="stat"><b>${pays.length}</b><span>عدد الدفعات</span></div>
    </div>
    <section class="card">
      ${pays.length ? `<table class="tbl"><thead><tr><th>المريضة</th><th>الخدمة</th><th>المدفوع</th><th>التاريخ</th><th></th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td><a href="#/p/${p.patientId}/money">${esc(p.patientName)}</a></td><td>${esc(p.service || "")}</td><td>${esc(money(p.paid, cur()))}${p.total > p.paid ? ` <span class="chip warn">المتبقي ${esc(money(p.total - p.paid, cur()))}</span>` : ""}</td><td>${esc(p.date)}</td>
      <td><button class="icon-btn rc" data-id="${p.id}" aria-label="إيصال">🧾</button></td></tr>`).join("")}</tbody></table>` : empty("لا توجد دفعات")}
    </section>${debts}`;
  if (doc_) {
    const upd = () => go(`#/money?from=${$(".f").value}&to=${$(".t").value}`);
    $(".f").onchange = upd; $(".t").onchange = upd;
  }
  $$(".rc").forEach((b) => b.onclick = () => printReceipt(pays.find((p) => p.id === b.dataset.id)));
}

// ---------- المزيد ----------
function renderMore() {
  const d = isDoctor();
  const items = [
    ["#/requests", "طلبات المواعيد من التطبيق", S._reqCount],
    ["#/messages", "رسائل المريضات", S._msgCount],
    ["#/waitlist", "قائمة الانتظار الاحتياطية"],
    ["#/tv", "شاشة الانتظار (للتلفاز)"],
    ...(d ? [["#/reports", "التقارير"], ["#/staff", "الموظفون"], ["#/settings", "إعدادات العيادة"], ["#/audit", "سجل التعديلات"], ["#/backup", "النسخة الاحتياطية"]] : []),
    ["#/password", "تغيير كلمة المرور"],
  ];
  main().innerHTML = `<h2 class="page-title">المزيد</h2>
    <ul class="menu">${items.map(([h, t, n]) => `<li><a href="${h}"><span>${esc(t)}</span>${n ? `<b class="badge">${n}</b>` : ""}<span class="chev">‹</span></a></li>`).join("")}
    <li><button class="out"><span>تسجيل الخروج</span></button></li></ul>
    <p class="copyright">${esc(COPYRIGHT)}</p>`;
  $(".out").onclick = logout;
}

// ---------- طلبات المواعيد ----------
async function renderRequests() {
  const reqs = (await list(query(P.col("requests"), where("status", "==", "new")))).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  main().innerHTML = `<h2 class="page-title">طلبات المواعيد</h2>
    <section class="card">${reqs.length ? `<ul class="plain">${reqs.map((r) => `<li class="req">
      <div><b>${esc(r.patientName)}</b> <span class="muted" dir="ltr">${esc(r.phone || "")}</span></div>
      <div>تطلب موعداً: ${esc(fmtDate(r.date))} · ${esc(r.period || "")} ${r.type ? "· " + esc(r.type) : ""}</div>
      ${r.note ? `<div class="muted">${esc(r.note)}</div>` : ""}
      <div class="row gap"><button class="btn primary small ok" data-id="${r.id}">تثبيت موعد</button><button class="btn small no" data-id="${r.id}">اعتذار</button></div>
    </li>`).join("")}</ul>` : empty("لا توجد طلبات جديدة")}</section>`;
  $$(".req .ok").forEach((b) => b.onclick = () => {
    const r = reqs.find((x) => x.id === b.dataset.id);
    bookModal({ pid: r.patientId, date: r.date, type: r.type, note: r.note, requestId: r.id, title: "تثبيت الطلب" });
  });
  $$(".req .no").forEach((b) => b.onclick = async () => {
    const r = reqs.find((x) => x.id === b.dataset.id);
    await updateDoc(P.colDoc("requests", r.id), { status: "rejected" });
    offerNotify(r.phone, `مرحباً ${r.patientName}، نعتذر، لا يوجد موعد متاح في التاريخ الذي طلبتِه (${fmtDate(r.date)}). يرجى التواصل معنا لإيجاد وقت آخر.`);
    render();
  });
}

// ---------- قائمة الانتظار الاحتياطية ----------
async function renderWaitlist() {
  const wl = (await list(query(P.col("waitlist"), where("status", "==", "waiting")))).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  main().innerHTML = `<div class="row-between"><h2 class="page-title">قائمة الانتظار الاحتياطية</h2><button class="btn primary add">+ إضافة</button></div>
    <p class="muted">مريضات يرغبن في أقرب موعد. عند إلغاء أي موعد، اتصلي بالأولى في القائمة.</p>
    <section class="card">${wl.length ? `<ol class="plain num">${wl.map((w) => `<li class="req">
      <div><b>${esc(w.patientName)}</b> <span class="muted" dir="ltr">${esc(w.phone)}</span></div>
      ${w.note ? `<div class="muted">${esc(w.note)}</div>` : ""}
      <div class="row gap"><a class="btn small" href="tel:${esc(w.phone)}">اتصال</a>
      <button class="btn primary small bk" data-id="${w.id}">حجز موعد</button><button class="btn small rm" data-id="${w.id}">إزالة</button></div></li>`).join("")}</ol>` : empty("القائمة فارغة")}</section>`;
  $(".add").onclick = async () => {
    await modal("إضافة لقائمة الانتظار", `<form class="stack">
      <label class="field"><span>المريضة</span><input class="pt-search" autocomplete="off" placeholder="اكتبي الاسم أو الرقم"><input type="hidden" name="pid" required></label>
      <div class="pt-results"></div>${field("ملاحظة (الأيام أو الأوقات المناسبة)", "note")}</form>`, {
      onOpen: (w) => {
        const s = w.querySelector(".pt-search"), f = w.querySelector("form");
        s.oninput = debounce(() => {
          const res = s.value.trim() ? searchPatients(s.value.trim()).slice(0, 6) : [];
          w.querySelector(".pt-results").innerHTML = res.map((p) => `<button type="button" class="pt-pick" data-id="${p.id}">${esc(p.name)}</button>`).join("");
          w.querySelectorAll(".pt-pick").forEach((b) => b.onclick = () => { f.pid.value = b.dataset.id; s.value = PC.byId[b.dataset.id].name; w.querySelector(".pt-results").innerHTML = ""; });
        }, 150);
      },
      onOk: async (f) => {
        if (!f.pid) { toast("اختاري المريضة", true); return false; }
        const p = PC.byId[f.pid];
        await addDoc(P.col("waitlist"), { patientId: p.id, patientName: p.name, phone: p.phone, note: f.note, status: "waiting", createdAt: serverTimestamp() });
      }
    });
    render();
  };
  $$(".rm").forEach((b) => b.onclick = async () => { await updateDoc(P.colDoc("waitlist", b.dataset.id), { status: "done" }); render(); });
  $$(".bk").forEach((b) => b.onclick = async () => {
    const w = wl.find((x) => x.id === b.dataset.id);
    const r = await bookModal({ pid: w.patientId });
    if (r) { await updateDoc(P.colDoc("waitlist", w.id), { status: "done" }); render(); }
  });
}

// ---------- الرسائل ----------
async function renderMessages() {
  const unread = PC.list.filter((p) => p.lastMsgFrom === "patient");
  const recent = PC.list.filter((p) => p.lastMsgAt && p.lastMsgFrom !== "patient")
    .sort((a, b) => (b.lastMsgAt?.seconds || 0) - (a.lastMsgAt?.seconds || 0)).slice(0, 30);
  const row = (p, bold) => `<li><a href="#/p/${p.id}/msgs"><span class="avatar">${esc(p.name[0])}</span><span class="n">${bold ? `<b>${esc(p.name)}</b>` : esc(p.name)}<small>${esc(tsDate(p.lastMsgAt))}</small></span>${bold ? `<b class="badge">جديد</b>` : ""}</a></li>`;
  main().innerHTML = `<h2 class="page-title">رسائل المريضات</h2>
    <section class="card"><h3>بانتظار رد</h3>${unread.length ? `<ul class="pt-list">${unread.map((p) => row(p, true)).join("")}</ul>` : empty("لا توجد رسائل جديدة")}</section>
    ${recent.length ? `<section class="card"><h3>محادثات سابقة</h3><ul class="pt-list">${recent.map((p) => row(p, false)).join("")}</ul></section>` : ""}`;
}

// ---------- شاشة الانتظار ----------
function renderTv() {
  main().innerHTML = `<div class="tv">
    <div class="tv-brand">${logoHtml(S.pub, 90)}<div><h1>${esc(S.pub.name)}</h1><p>${esc(S.pub.title || "")}</p></div></div>
    <div class="tv-label">الدور الحالي</div><div class="tv-num">—</div>
    <div class="row gap no-tv"><button class="btn primary next">استدعاء الدور التالي</button><button class="btn fs">ملء الشاشة</button></div>
  </div>`;
  S.unsub.push(onSnapshot(P.colDoc("live", "queue"), (s) => {
    const el = $(".tv-num");
    if (el) { el.textContent = s.data()?.number ?? "—"; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
  }));
  $(".next").onclick = async () => {
    const today = ymd();
    const arr = (await list(query(P.col("appointments"), where("date", "==", today)))).filter((a) => a.status === "arrived" && a.queueNo).sort((a, b) => a.queueNo - b.queueNo);
    if (!arr.length) return toast("لا توجد مريضات في الانتظار");
    const a = arr[0];
    await updateDoc(P.colDoc("appointments", a.id), { status: "in" });
    await callNumber(a.queueNo);
  };
  $(".fs").onclick = () => document.documentElement.requestFullscreen?.();
}

// ---------- الإعدادات ----------
async function renderSettings() {
  const c = S.clinic || {};
  const hours = c.hours || {};
  const services = (c.services || []).slice();
  main().innerHTML = `<h2 class="page-title">إعدادات العيادة</h2>
  <form id="set" class="stack">
    <section class="card stack"><h3>الهوية</h3>
      <div class="logo-edit"><div class="lg">${logoHtml(c, 88)}</div>
        <div class="stack"><button type="button" class="btn small up">تغيير الشعار</button>${c.logo ? `<button type="button" class="btn small ghost rst">العودة إلى الشعار الأساسي</button>` : ""}</div></div>
      ${field("اسم العيادة", "name", { value: c.name, required: true })}
      ${field("اسم الطبيبة", "doctorName", { value: c.doctorName, required: true })}
      ${field("اللقب", "title", { value: c.title })}
      ${field("العنوان", "address", { value: c.address })}
      ${field("هاتف العيادة", "phone", { value: c.phone, attrs: 'dir="ltr"' })}
      <div class="grid2">${field("لون الواجهة", "accent", { type: "color", value: c.accent || "#6B3FA0" })}${field("العملة", "currency", { value: c.currency || "ل.س" })}</div>
    </section>
    <section class="card stack"><h3>أوقات الدوام</h3>
      <p class="muted small">يُقبل الحجز ضمن هذه الأوقات فقط.</p>
      ${[6, 0, 1, 2, 3, 4, 5].map((d) => { const h = hours[d] || { on: false, from: "10:00", to: "17:00" }; return `<div class="hours-row">
        <label class="check"><input type="checkbox" name="on${d}" ${h.on ? "checked" : ""}><span>${DAYS[d]}</span></label>
        <input type="time" name="from${d}" value="${esc(h.from)}" aria-label="من"><span>—</span><input type="time" name="to${d}" value="${esc(h.to)}" aria-label="إلى"></div>`; }).join("")}
      ${select("مدة الموعد الافتراضية", "slotMinutes", [[10, "10 دقائق"], [15, "15 دقيقة"], [20, "20 دقيقة"], [30, "30 دقيقة"], [45, "45 دقيقة"], [60, "ساعة"]], c.slotMinutes || 20)}
    </section>
    <section class="card stack"><h3>الخدمات والأسعار</h3>
      <div class="svc-list"></div><button type="button" class="btn small add-svc">+ خدمة</button>
    </section>
    <section class="card stack"><h3>نصوص جاهزة</h3>
      ${field("نص موافقة الإجراءات التجميلية", "consentText", { type: "textarea", value: c.consentText || "أقرّ بأنني اطّلعت على طبيعة الإجراء وفوائده ومخاطره المحتملة، وأجبت الطبيبة عن جميع أسئلتي، وأوافق على إجرائه بإرادتي." })}
      ${field("ملاحظة أسفل الوصفة", "rxFooter", { value: c.rxFooter || "" })}
    </section>
    <button class="btn primary block" type="submit">حفظ الإعدادات</button>
  </form>`;
  const drawSvcs = () => {
    $(".svc-list").innerHTML = services.map((s, i) => `<div class="svc-row">
      <input value="${esc(s.name)}" data-i="${i}" data-k="name" aria-label="اسم الخدمة" placeholder="الخدمة">
      <input type="number" value="${esc(s.price)}" data-i="${i}" data-k="price" aria-label="السعر" placeholder="السعر" min="0">
      <input type="number" value="${esc(s.duration)}" data-i="${i}" data-k="duration" aria-label="المدة بالدقائق" placeholder="دقيقة" min="5">
      <select data-i="${i}" data-k="kind" aria-label="النوع"><option value="general" ${s.kind !== "cosmetic" ? "selected" : ""}>عام</option><option value="cosmetic" ${s.kind === "cosmetic" ? "selected" : ""}>تجميلي</option></select>
      <button type="button" class="icon-btn del" data-i="${i}" aria-label="حذف">✕</button></div>`).join("");
    $$(".svc-row [data-k]").forEach((el) => el.onchange = () => {
      const s = services[el.dataset.i];
      s[el.dataset.k] = ["price", "duration"].includes(el.dataset.k) ? Number(el.value) : el.value;
    });
    $$(".svc-row .del").forEach((b) => b.onclick = () => { services.splice(b.dataset.i, 1); drawSvcs(); });
  };
  drawSvcs();
  $(".add-svc").onclick = () => { services.push({ id: Math.random().toString(36).slice(2, 8), name: "", price: 0, duration: c.slotMinutes || 20, kind: "general" }); drawSvcs(); };
  let newLogo = undefined;
  $(".up").onclick = async () => {
    const f = await pickFile("image/*"); if (!f) return;
    try { newLogo = await compressImage(f, 400, 0.85); $(".lg").innerHTML = `<img class="logo-img" src="${newLogo}" width="88" height="88" alt="">`; }
    catch (e) { toast(errMsg(e), true); }
  };
  $(".rst")?.addEventListener("click", () => { newLogo = null; $(".lg").innerHTML = logoHtml({}, 88); });
  $("#set").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const h = {};
    for (let d = 0; d < 7; d++) h[d] = { on: f[`on${d}`].checked, from: f[`from${d}`].value || "10:00", to: f[`to${d}`].value || "17:00" };
    const brand = {
      name: f.name.value.trim(), doctorName: f.doctorName.value.trim(), title: f.title.value.trim(),
      address: f.address.value.trim(), phone: f.phone.value.trim(), accent: f.accent.value,
      logo: newLogo === undefined ? (c.logo || null) : newLogo
    };
    try {
      await updateDoc(P.clinic(), {
        ...brand, currency: f.currency.value.trim() || "ل.س", hours: h, slotMinutes: Number(f.slotMinutes.value),
        services: services.filter((s) => s.name.trim()), consentText: f.consentText.value, rxFooter: f.rxFooter.value
      });
      await setDoc(P.pub(), brand);
      await audit("تعديل إعدادات العيادة");
      toast("حُفظت الإعدادات");
      setTimeout(() => {
        const b = $(".tb-brand");
        if (b) b.innerHTML = `${logoHtml(S.pub, 36)}<span>${esc(S.pub.name || "")}</span>`;
        render();
      }, 400);
    } catch (err) { toast(errMsg(err), true); }
  };
}

// ---------- الموظفين ----------
async function renderStaff() {
  const staff = await list(query(P.users(), where("clinicId", "==", C), where("role", "==", "secretary")));
  const act = staff.filter((s) => s.active);
  main().innerHTML = `<div class="row-between"><h2 class="page-title">الموظفون</h2><button class="btn primary add">+ حساب سكرتارية</button></div>
    <section class="card">${act.length ? `<ul class="plain">${act.map((s) => `<li class="req">
      <div><b>${esc(s.name)}</b> <span class="muted" dir="ltr">${esc(s.phone)}</span></div>
      <div class="row gap"><button class="btn small rp" data-id="${s.id}">كلمة مرور جديدة</button><button class="btn small danger off" data-id="${s.id}">إيقاف الحساب</button></div></li>`).join("")}</ul>` : empty("لا يوجد موظفون")}</section>
    <p class="muted small">يسري الإيقاف فوراً، ولا يمكن للحساب الدخول بعده.</p>`;
  $(".add").onclick = async () => {
    const r = await modal("حساب سكرتارية جديد", `<form class="stack">${field("الاسم", "name", { required: true })}${field("رقم الجوال", "phone", { required: true, attrs: 'dir="ltr" inputmode="tel"' })}</form>`, {
      ok: "إنشاء", onOk: async (f) => ({ temp: await createStaff(f.name, f.phone), phone: normPhone(f.phone), name: f.name })
    });
    if (r) staffCred(r.phone, r.temp, r.name);
    render();
  };
  $$(".rp").forEach((b) => b.onclick = async () => {
    const s = staff.find((x) => x.id === b.dataset.id);
    if (!(await confirmBox("كلمة مرور جديدة", `كلمة المرور القديمة لـ ${s.name} ستتوقف.`, "متابعة"))) return;
    try { staffCred(s.phone, await resetStaffPassword(s.id), s.name); } catch (e) { toast(errMsg(e), true); }
    render();
  });
  $$(".off").forEach((b) => b.onclick = async () => {
    const s = staff.find((x) => x.id === b.dataset.id);
    if (!(await confirmBox("إيقاف الحساب", `إيقاف حساب ${s.name}؟`, "إيقاف", true))) return;
    await updateDoc(P.user(s.id), { active: false });
    await audit("إيقاف حساب موظف", s.name);
    render();
  });
}
function staffCred(phone, temp, name) {
  const url = location.origin + location.pathname;
  const text = `أهلاً ${name}، حسابك في نظام ${S.pub.name}:\nالرابط: ${url}\nاختاري "فريق العيادة"\nالرقم: ${phone}\nكلمة المرور المؤقتة: ${temp}`;
  info("الحساب جاهز", `<div class="cred"><div>الرقم: <b dir="ltr">${esc(phone)}</b></div><div>كلمة المرور المؤقتة: <b class="big" dir="ltr">${esc(temp)}</b></div></div>
    <a class="btn primary block" target="_blank" rel="noopener" href="${esc(waLink(phone, text))}">إرسال على واتساب</a>`);
}

// ---------- التقارير ----------
async function renderReports() {
  const m = params().get("m") || ymd().slice(0, 7);
  const from = m + "-01", to = m + "-31";
  const appts = await list(query(P.col("appointments"), where("date", ">=", from), where("date", "<=", to)));
  const pays = await list(query(P.col("payments"), where("date", ">=", from), where("date", "<=", to)));
  const stats = await list(query(P.col("stats"), where("date", ">=", from), where("date", "<=", to)));
  const cnt = (s) => appts.filter((a) => a.status === s).length;
  const real = appts.filter((a) => a.status !== "cancelled");
  const noshowRate = real.length ? Math.round(cnt("noshow") / real.length * 100) : 0;
  const [y, mo] = m.split("-").map(Number);
  const mStart = new Date(y, mo - 1, 1), mEnd = new Date(y, mo, 1);
  const newPts = PC.list.filter((p) => p.createdAt?.toDate && p.createdAt.toDate() >= mStart && p.createdAt.toDate() < mEnd).length;
  const diag = {};
  stats.forEach((s) => (s.diagnosis || "").split(/[،,]/).map((x) => x.trim()).filter(Boolean).forEach((d) => diag[d] = (diag[d] || 0) + 1));
  const topDiag = Object.entries(diag).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const rated = appts.filter((a) => a.rating);
  const avgRating = rated.length ? (rated.reduce((s, a) => s + a.rating, 0) / rated.length).toFixed(1) : "—";
  const byType = {};
  real.forEach((a) => byType[a.type || "دون نوع"] = (byType[a.type || "دون نوع"] || 0) + 1);
  const maxT = Math.max(1, ...Object.values(byType));
  main().innerHTML = `<div class="row-between"><h2 class="page-title">التقارير</h2><input type="month" class="mp" value="${m}" aria-label="الشهر"></div>
    <div class="stats">
      <div class="stat"><b>${cnt("done")}</b><span>زيارات منجزة</span></div>
      <div class="stat"><b>${newPts}</b><span>مرضى جدد</span></div>
      <div class="stat"><b>${noshowRate}%</b><span>نسبة الغياب</span></div>
      <div class="stat"><b>${esc(money(pays.reduce((s, p) => s + (p.paid || 0), 0), cur()))}</b><span>المقبوض</span></div>
      <div class="stat"><b>${esc(money(pays.reduce((s, p) => s + (p.total || 0) - (p.paid || 0), 0), cur()))}</b><span>ديون الشهر</span></div>
      <div class="stat"><b>${avgRating}</b><span>متوسط التقييم (${rated.length})</span></div>
    </div>
    <section class="card"><h3>المواعيد حسب النوع</h3>
      ${Object.keys(byType).length ? `<div class="bars">${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div class="bar-row"><span>${esc(t)}</span><div class="bar"><i style="width:${n / maxT * 100}%"></i></div><b>${n}</b></div>`).join("")}</div>` : empty("لا توجد بيانات")}
    </section>
    <section class="card"><h3>أكثر التشخيصات</h3>
      ${topDiag.length ? `<ol class="plain num">${topDiag.map(([d, n]) => `<li class="row-between"><span>${esc(d)}</span><b>${n}</b></li>`).join("")}</ol>` : empty("لا توجد تشخيصات مسجلة")}
    </section>
    <section class="card"><h3>تقييمات المريضات</h3>
      ${rated.filter((a) => a.ratingNote).slice(0, 20).map((a) => `<p>${"★".repeat(a.rating)}${"☆".repeat(5 - a.rating)} ${esc(a.ratingNote)}</p>`).join("") || empty("لا توجد تعليقات")}
    </section>`;
  $(".mp").onchange = (e) => go(`#/reports?m=${e.target.value}`);
}

// ---------- سجل التعديلات ----------
async function renderAudit() {
  const rows = await list(query(P.col("audit"), orderBy("at", "desc"), limit(300)));
  main().innerHTML = `<h2 class="page-title">سجل التعديلات</h2>
    <section class="card">${rows.length ? `<table class="tbl"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td dir="ltr">${esc(tsDate(r.at))}</td><td>${esc(r.byName)}</td><td>${esc(r.action)}${r.target ? ` · <span class="muted">${esc(r.target)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : empty("السجل فارغ")}</section>`;
}

// ---------- النسخة الاحتياطية ----------
function renderBackup() {
  main().innerHTML = `<h2 class="page-title">النسخة الاحتياطية</h2>
    <section class="card stack">
      <p>يُنزَّل ملف يحتوي جميع بيانات العيادة (المريضات، الملفات الطبية، المواعيد، المالية). احفظيه في مكان آمن، مثل Google Drive.</p>
      <p class="muted small">يُنصح بنسخة أسبوعية. يحتوي الملف بيانات طبية حساسة، فلا ترسليه لأحد.</p>
      <button class="btn primary go">تنزيل نسخة احتياطية الآن</button>
      <div class="prog muted"></div>
    </section>`;
  $(".go").onclick = async () => {
    const prog = $(".prog"), btn = $(".go");
    btn.disabled = true;
    try {
      const out = { exportedAt: new Date().toISOString(), clinic: S.clinic, patients: [] };
      for (const k of ["appointments", "payments", "requests", "waitlist", "pregAlerts", "stats", "inbox"]) {
        prog.textContent = `جارٍ: ${k}…`;
        out[k] = await list(P.col(k));
      }
      const subs = ["medical", "visits", "prescriptions", "pregnancies", "fertility", "labs", "private", "procedures", "files", "messages"];
      let i = 0;
      for (const p of PC.list) {
        i++; prog.textContent = `المريضات ${i}/${PC.list.length}`;
        const rec = { ...p };
        for (const s of subs) rec[s] = await list(P.sub(p.id, s));
        out.patients.push(rec);
      }
      download(`clinic-backup-${ymd()}.json`, JSON.stringify(out, (k, v) => (v && typeof v === "object" && "seconds" in v && "nanoseconds" in v) ? new Date(v.seconds * 1000).toISOString() : v));
      await audit("تنزيل نسخة احتياطية");
      prog.textContent = "تم ✓";
    } catch (e) { toast(errMsg(e), true); prog.textContent = ""; }
    btn.disabled = false;
  };
}

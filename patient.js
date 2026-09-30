// تطبيق المريضة
import { P, list, one, updateDoc, addDoc, query, where, serverTimestamp, onSnapshot, audit } from "./fb.js";
import {
  $, $$, esc, ymd, addDays, fmtDate, fmtTime, tsDate, money, toast, errMsg, modal, confirmBox, info, field, select,
  logoHtml, empty, compressImage, pickFile
} from "./ui.js";
import { S, logout, showChangePassword } from "./app.js";
import { pregCalc, gaText, activeMeds } from "./card.js";

const T = { me: null, pid: null, patients: [] };
const main = () => $("#main");
const STATUS = { confirmed: "مؤكد", arrived: "حضرتِ", in: "لدى الطبيبة", done: "تمت", noshow: "لم تحضري", cancelled: "ملغى" };

// ---------- الموافقة على الخصوصية (أول مرة) ----------
export function showConsent() {
  $("#app").innerHTML = `<div class="center-page"><div class="card narrow stack">
    <div class="brand-block small">${logoHtml(S.pub, 64)}<h2>مرحباً بكِ في تطبيق ${esc(S.pub.name || "العيادة")}</h2></div>
    <p>قبل البدء، إليكِ كيف نتعامل مع معلوماتك:</p>
    <ul class="plain dots">
      <li>لا يطّلع على ملفك الطبي سواكِ والطبيبة.</li>
      <li>تطّلع السكرتارية على اسمك ورقمك ومواعيدك فقط، دون أي تفاصيل طبية.</li>
      <li>لا نشارك معلوماتك مع أي جهة دون إذنك.</li>
      <li>إذا كان الرقم مشتركاً مع أحد أفراد أسرتك، يمكنكِ إخفاء التفاصيل الطبية من الإعدادات.</li>
    </ul>
    <label class="check"><input type="checkbox" class="ag"><span>قرأتُ وأوافق</span></label>
    <button class="btn primary block go" disabled>متابعة</button>
    <button class="link-btn out">خروج</button></div></div>`;
  $(".ag").onchange = (e) => $(".go").disabled = !e.target.checked;
  $(".go").onclick = async () => {
    try {
      await updateDoc(P.user(S.user.uid), { consentAt: serverTimestamp() });
      S.profile.consentAt = new Date();
      start();
    } catch (e) { toast(errMsg(e), true); }
  };
  $(".out").onclick = logout;
}

// ---------- البداية ----------
export async function start() {
  T.me = S.profile;
  try { S.clinic = (await one(P.clinic())) || {}; } catch { S.clinic = {}; }
  const ids = T.me.patientIds || [];
  T.patients = (await Promise.all(ids.map((id) => one(P.patient(id)).catch(() => null)))).filter(Boolean);
  if (!T.patients.length) {
    $("#app").innerHTML = `<div class="center-page"><div class="card narrow"><p>لم يُعثر على ملفك. يرجى التواصل مع العيادة.</p><button class="btn out">خروج</button></div></div>`;
    $(".out").onclick = logout; return;
  }
  const saved = sessionStorage.getItem("pid");
  T.pid = T.patients.some((p) => p.id === saved) ? saved : (T.patients.length === 1 ? T.patients[0].id : null);
  if (!T.pid) return choose();
  shell();
}
function choose() {
  $("#app").innerHTML = `<div class="center-page"><div class="card narrow stack"><h2>اختاري الملف</h2>
    <p class="muted">هذا الرقم مسجّل لأكثر من شخص.</p>
    ${T.patients.map((p) => `<button class="btn block pick" data-id="${p.id}">${esc(p.name)}</button>`).join("")}
    <button class="link-btn out">خروج</button></div></div>`;
  $$(".pick").forEach((b) => b.onclick = () => { T.pid = b.dataset.id; sessionStorage.setItem("pid", T.pid); shell(); });
  $(".out").onclick = logout;
}
const me = () => T.patients.find((p) => p.id === T.pid);

function shell() {
  const nav = [
    ["home", "الرئيسية", "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"],
    ["appts", "مواعيدي", "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
    ["meds", "أدويتي", "M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 7l7 7"],
    ["file", "ملفي", "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"],
    ["msgs", "رسائل", "M4 5h16v11H8l-4 4z"],
  ];
  $("#app").innerHTML = `
    <header class="topbar"><div class="tb-brand">${logoHtml(S.pub, 36)}<span>${esc(S.pub.name || "")}</span></div>
      <a href="#/settings" class="icon-btn" aria-label="الإعدادات">⚙︎</a></header>
    <main id="main" class="page"></main>
    <nav class="bottomnav" aria-label="التنقل">${nav.map(([k, t, d]) => `<a href="#/${k === "home" ? "" : k}" data-r="${k}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg><span>${t}</span></a>`).join("")}</nav>`;
  window.onhashchange = render;
  render();
  scheduleDoseReminders();
}
function routeName() { return (location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]) || "home"; }

async function render() {
  const r = routeName();
  $$(".bottomnav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  window.scrollTo(0, 0);
  if (!main()) return;
  main().innerHTML = `<div class="loading">جارٍ التحميل…</div>`;
  try {
    const V = { home, appts, meds, file, msgs, settings, learn };
    await (V[r] || home)();
  } catch (e) { console.error(e); main().innerHTML = `<div class="card"><p class="alert">${esc(errMsg(e))}</p></div>`; }
}

// ---------- قراءات مشتركة ----------
const myAppts = async () => (await list(query(P.col("appointments"), where("patientId", "==", T.pid))))
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const upcoming = (arr) => arr.filter((a) => a.date >= ymd() && ["confirmed", "arrived", "in"].includes(a.status));

// ---------- الرئيسية ----------
async function home() {
  const [apps, rxs, pregs, procs] = await Promise.all([
    myAppts(), list(P.sub(T.pid, "prescriptions")), list(P.sub(T.pid, "pregnancies")), list(P.sub(T.pid, "procedures"))
  ]);
  const next = upcoming(apps)[0];
  const doses = todayDoses(activeMeds(rxs));
  const nowHm = new Date().toTimeString().slice(0, 5);
  const nextDose = doses.find((d) => d.time >= nowHm);
  const g = pregs.find((x) => x.status === "active");
  const gc = g ? pregCalc(g) : null;
  const needSign = procs.filter((x) => !x.consentSignedAt);
  const after = procs.filter((x) => x.aftercare && x.date >= addDays(ymd(), -30));
  const toRate = apps.filter((a) => a.status === "done" && !a.rating && a.date >= addDays(ymd(), -14)).at(-1);
  const hide = !!T.me.hideSensitive;
  main().innerHTML = `
    <h2 class="page-title">أهلاً ${esc(me().name.split(" ")[0])}</h2>
    <section class="card hero">
      <h3>موعدك القادم</h3>
      ${next ? `<div class="big-date">${esc(fmtDate(next.date))}</div><div class="big-time">${esc(fmtTime(next.time))}</div><p>${esc(next.type || "")}</p>
        <div class="row gap"><button class="btn small cx" data-id="${next.id}">إلغاء الموعد</button><a class="btn small" href="#/appts">جميع المواعيد</a></div>`
      : `<p class="muted">لا يوجد لديكِ موعد حالياً.</p><button class="btn primary ask-appt">طلب موعد</button>`}
    </section>
    ${needSign.length ? needSign.map((x) => `<section class="card alert-card"><h3>موافقة بانتظار توقيعك</h3><p>${esc(x.name)}</p><button class="btn primary small sign" data-id="${x.id}">قراءة وتوقيع</button></section>`).join("") : ""}
    ${toRate ? `<section class="card"><h3>كيف كانت زيارتك يوم ${esc(fmtDate(toRate.date, false))}؟</h3><div class="stars" role="group" aria-label="التقييم">${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-n="${n}" data-id="${toRate.id}" aria-label="${n} من 5">★</button>`).join("")}</div></section>` : ""}
    ${g ? (hide ? `<section class="card"><button class="btn block show-s">إظهار متابعة الحمل</button></section>` : pregCard(g, gc)) : ""}
    <section class="card"><div class="row-between"><h3>أدوية اليوم</h3><a class="btn small" href="#/meds">التفاصيل</a></div>
      ${hide ? `<button class="btn block show-s">إظهار</button>` : doses.length ? `<ul class="dose-list">${doses.map((d) => `<li class="${d === nextDose ? "next" : d.time < nowHm ? "past" : ""}"><span class="t">${esc(fmtTime(d.time))}</span><span><b>${esc(d.drug)}</b> ${esc(d.dose || "")}</span></li>`).join("")}</ul>` : empty("لا توجد أدوية بمواعيد محددة اليوم")}
    </section>
    ${after.length && !hide ? after.map((x) => `<section class="card"><h3>تعليمات بعد ${esc(x.name)}</h3><p class="pre">${esc(x.aftercare)}</p></section>`).join("") : ""}
    <section class="card"><h3>معلومات صحية</h3><a class="btn block" href="#/learn">مقالات قصيرة عن الحمل والصحة النسائية</a></section>
    <section class="card contact"><h3>${esc(S.pub.name || "")}</h3><p class="muted">${esc(S.pub.title || "")}</p>
      ${S.pub.address ? `<p>📍 ${esc(S.pub.address)}</p>` : ""}${S.pub.phone ? `<a class="btn" href="tel:${esc(S.pub.phone)}">📞 <span dir="ltr">${esc(S.pub.phone)}</span></a>` : ""}</section>`;
  $(".ask-appt")?.addEventListener("click", requestModal);
  $$(".cx").forEach((b) => b.onclick = () => cancelAppt(apps.find((a) => a.id === b.dataset.id)));
  $$(".sign").forEach((b) => b.onclick = () => signConsent(procs.find((x) => x.id === b.dataset.id)));
  $$(".show-s").forEach((b) => b.onclick = async () => { T.me.hideSensitive = false; await home(); T.me.hideSensitive = true; });
  $$(".star").forEach((b) => b.onclick = () => rate(b.dataset.id, Number(b.dataset.n)));
}

function pregCard(g, c) {
  const tips = {
    1: "في الثلث الأول: حمض الفوليك مهم، فقلّلي الكافيين، ولا تتناولي أي دواء دون استشارة الطبيبة.",
    2: "في الثلث الثاني: تبدئين غالباً بالشعور بحركة الجنين. حافظي على النشاط الخفيف والغذاء المتوازن.",
    3: "في الثلث الأخير: راقبي حركة الجنين يومياً، وجهّزي حقيبة الولادة، وراجعي فوراً عند حدوث نزيف أو تسرب ماء أو نقص في الحركة.",
  };
  const t = c.w < 14 ? 1 : c.w < 28 ? 2 : 3;
  return `<section class="card preg-card"><h3>🤰 حملك: ${esc(gaText(c))}</h3>
    <div class="preg-bar"><i style="width:${Math.min(100, Math.max(0, c.ga / 280 * 100))}%"></i></div>
    <p>الموعد المتوقع للولادة: <b>${esc(fmtDate(c.edd, false))}</b>${c.left >= 0 ? ` · باقي ${c.left} يوم` : ""}</p>
    <p class="tip">${esc(tips[t])}</p></section>`;
}

// ---------- المواعيد ----------
async function appts() {
  const [apps, reqs] = await Promise.all([myAppts(), list(query(P.col("requests"), where("patientId", "==", T.pid)))]);
  const up = upcoming(apps);
  const past = apps.filter((a) => !up.includes(a)).reverse();
  const pend = reqs.filter((r) => r.status === "new");
  main().innerHTML = `<div class="row-between"><h2 class="page-title">مواعيدي</h2><button class="btn primary ask-appt">طلب موعد</button></div>
    ${pend.length ? `<section class="card"><h3>طلبات بانتظار التأكيد</h3>${pend.map((r) => `<p>${esc(fmtDate(r.date))} · ${esc(r.period || "")}</p>`).join("")}<p class="muted small">ستؤكد العيادة الوقت لكِ.</p></section>` : ""}
    <section class="card"><h3>القادمة</h3>${up.length ? `<ul class="plain">${up.map((a) => `<li class="req"><b>${esc(fmtDate(a.date))}</b> · ${esc(fmtTime(a.time))}<br><span class="muted">${esc(a.type || "")}</span>
      <div><button class="btn small cx" data-id="${a.id}">إلغاء</button></div></li>`).join("")}</ul>` : empty("لا توجد مواعيد قادمة")}</section>
    <section class="card"><h3>السابقة</h3>${past.length ? `<ul class="plain">${past.map((a) => `<li class="row-between"><span>${esc(a.date)} · ${esc(a.type || "")}</span><span class="chip">${esc(STATUS[a.status] || "")}</span></li>`).join("")}</ul>` : empty("لا يوجد")}</section>`;
  $(".ask-appt").onclick = requestModal;
  $$(".cx").forEach((b) => b.onclick = () => cancelAppt(apps.find((a) => a.id === b.dataset.id)));
}

async function requestModal() {
  await modal("طلب موعد", `<form class="stack">
    ${field("اليوم المناسب", "date", { type: "date", value: addDays(ymd(), 1), required: true, attrs: `min="${ymd()}"` })}
    ${select("الوقت المفضل", "period", [["أي وقت", "أي وقت"], ["الصباح", "الصباح"], ["الظهر", "الظهر"], ["المساء", "المساء"]])}
    ${select("سبب الزيارة", "type", [["معاينة", "معاينة"], ["مراجعة", "مراجعة"], ["متابعة حمل", "متابعة حمل"], ["تصوير صوتي", "تصوير صوتي"], ["استشارة تجميلية", "استشارة تجميلية"], ["أخرى", "أخرى"]])}
    ${field("ملاحظة (اختياري)", "note", { type: "textarea" })}
    <p class="muted small">ستتواصل العيادة معكِ لتأكيد الوقت.</p></form>`, {
    ok: "إرسال الطلب",
    onOk: async (f) => {
      const p = me();
      await addDoc(P.col("requests"), { patientId: p.id, patientName: p.name, phone: p.phone, ...f, status: "new", createdAt: serverTimestamp() });
      toast("أُرسل الطلب، وستؤكده العيادة لكِ");
      setTimeout(render, 50);
    }
  });
}

async function cancelAppt(a) {
  if (!(await confirmBox("إلغاء الموعد", `هل تريدين إلغاء موعد ${fmtDate(a.date)} الساعة ${fmtTime(a.time)}؟`, "إلغاء الموعد", true))) return;
  try {
    await updateDoc(P.colDoc("appointments", a.id), { status: "cancelled" });
    await sendMsg(`ألغيت موعدي يوم ${fmtDate(a.date)} الساعة ${fmtTime(a.time)}.`);
    toast("أُلغي الموعد");
    render();
  } catch (e) { toast(errMsg(e), true); }
}

async function rate(id, n) {
  const r = await modal("تقييم الزيارة", `<p class="stars-show">${"★".repeat(n)}${"☆".repeat(5 - n)}</p><form>${field("تعليق (اختياري)", "ratingNote", { type: "textarea" })}</form>`, { ok: "إرسال" });
  if (!r) return;
  await updateDoc(P.colDoc("appointments", id), { rating: n, ratingNote: r.ratingNote || "" });
  toast("شكراً لتقييمك"); render();
}

// ---------- الأدوية ----------
function todayDoses(meds) {
  const out = [];
  meds.forEach((m) => String(m.times || "").split(/[,،\s]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .forEach((t) => out.push({ ...m, time: t.padStart(5, "0") })));
  return out.sort((a, b) => a.time.localeCompare(b.time));
}
async function meds() {
  const rxs = (await list(P.sub(T.pid, "prescriptions"))).sort((a, b) => b.date.localeCompare(a.date));
  const act = activeMeds(rxs);
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  main().innerHTML = `<h2 class="page-title">أدويتي</h2>
    <section class="card">${act.length ? `<ul class="plain">${act.map((m) => `<li class="req"><b>${esc(m.drug)}</b> ${esc(m.dose || "")}
      ${m.times ? `<div>⏰ ${esc(m.times.split(/[,،\s]+/).filter(Boolean).map(fmtTime).join(" · "))}</div>` : ""}
      ${m.note ? `<div class="muted">${esc(m.note)}</div>` : ""}
      <div class="muted small">${m.endDate ? `لغاية ${esc(fmtDate(m.endDate, false))}` : "مستمر"}</div></li>`).join("")}</ul>` : empty("لا توجد أدوية حالية")}</section>
    <section class="card stack"><h3>التذكير</h3>
      ${perm === "granted" ? `<p class="muted">يعمل التذكير ما دام التطبيق مفتوحاً أو في الخلفية.</p>`
        : perm === "unsupported" ? `<p class="muted">جهازك لا يدعم الإشعارات من المتصفح. تابعي الأوقات من هنا.</p>`
        : `<button class="btn primary en">تفعيل تذكير الأدوية</button>`}
    </section>
    <section class="card"><h3>كل الوصفات</h3>${rxs.length ? rxs.map((r) => `<details><summary>${esc(fmtDate(r.date, false))}</summary><ol class="rx-items">${(r.items || []).map((it) => `<li><b>${esc(it.drug)}</b> ${esc(it.dose || "")} ${it.times ? `· ${esc(it.times)}` : ""} ${it.days ? `· ${esc(it.days)} يوم` : ""}</li>`).join("")}</ol></details>`).join("") : empty("لا توجد وصفات")}</section>`;
  $(".en")?.addEventListener("click", async () => { const r = await Notification.requestPermission(); if (r === "granted") { scheduleDoseReminders(); toast("تم تفعيل التذكير"); } meds(); });
}
let doseTimers = [];
async function scheduleDoseReminders() {
  doseTimers.forEach(clearTimeout); doseTimers = [];
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const doses = todayDoses(activeMeds(await list(P.sub(T.pid, "prescriptions"))));
    const now = new Date();
    doses.forEach((d) => {
      const [h, m] = d.time.split(":").map(Number);
      const at = new Date(); at.setHours(h, m, 0, 0);
      const ms = at - now;
      if (ms > 0) doseTimers.push(setTimeout(async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        const opts = { body: `${d.drug} ${d.dose || ""}`, icon: "icon-192.png", tag: d.drug + d.time };
        if (reg) reg.showNotification("وقت الدواء", opts); else new Notification("وقت الدواء", opts);
      }, ms));
    });
  } catch {}
}

// ---------- ملفي ----------
async function file() {
  if (T.me.hideSensitive && !T._revealed) {
    main().innerHTML = `<h2 class="page-title">ملفي</h2><section class="card stack"><p>التفاصيل الطبية مخفية حسب إعداداتك.</p><button class="btn primary rv">إظهار الملف</button></section>`;
    $(".rv").onclick = () => { T._revealed = true; file(); };
    return;
  }
  const [vs, labs, fls, pregs, procs, pays] = await Promise.all([
    list(P.sub(T.pid, "visits")), list(P.sub(T.pid, "labs")), list(P.sub(T.pid, "files")),
    list(P.sub(T.pid, "pregnancies")), list(P.sub(T.pid, "procedures")),
    list(query(P.col("payments"), where("patientId", "==", T.pid)))
  ]);
  vs.sort((a, b) => b.date.localeCompare(a.date)); labs.sort((a, b) => b.date.localeCompare(a.date)); fls.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const g = pregs.find((x) => x.status === "active");
  const cur = S.clinic?.currency || "ل.س";
  const due = pays.reduce((s, x) => s + (x.total || 0) - (x.paid || 0), 0);
  const KIND = { echo: "تصوير صوتي", lab: "تحليل", other: "ملف" };
  main().innerHTML = `<h2 class="page-title">ملفي</h2>
    ${g ? pregCard(g, pregCalc(g)) : ""}
    <section class="card"><h3>الزيارات</h3>${vs.length ? vs.map((v) => `<div class="visit-mini"><b>${esc(fmtDate(v.date, false))}</b>${v.diagnosis ? `<div>${esc(v.diagnosis)}</div>` : ""}${v.treatment ? `<div class="muted">${esc(v.treatment)}</div>` : ""}${v.publicNote ? `<div class="note-pub">${esc(v.publicNote)}</div>` : ""}</div>`).join("") : empty("لا توجد زيارات")}</section>
    <section class="card"><h3>التحاليل</h3>${labs.length ? `<table class="tbl"><thead><tr><th>التاريخ</th><th>التحليل</th><th>النتيجة</th></tr></thead><tbody>${labs.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.test)}</td><td dir="ltr">${esc(l.value)} ${esc(l.unit || "")}</td></tr>`).join("")}</tbody></table>` : empty("لا توجد تحاليل")}</section>
    <section class="card"><div class="row-between"><h3>التصوير الصوتي والملفات</h3><button class="btn small up">+ رفع تحليل</button></div>
      <p class="muted small">إذا أجريتِ تحليلاً في مختبر خارجي، صوّريه وارفعيه لتطّلع عليه الطبيبة.</p>
      ${fls.length ? `<div class="file-grid">${fls.map((f) => `<button class="file-tile" data-id="${f.id}">${f.data?.startsWith("data:image") ? `<img src="${f.data}" alt="">` : `<span class="pdf">PDF</span>`}<span>${esc(KIND[f.kind] || "ملف")} · ${esc(f.date || "")}</span></button>`).join("")}</div>` : empty("لا توجد ملفات")}</section>
    ${procs.length ? `<section class="card"><h3>الإجراءات</h3>${procs.map((x) => `<div class="visit-mini"><b>${esc(x.name)}</b> · ${esc(fmtDate(x.date, false))}<div>الجلسات: ${x.sessionsDone || 0} / ${x.sessionsTotal || 1}</div>${x.aftercare ? `<div class="pre muted">${esc(x.aftercare)}</div>` : ""}<div>${x.consentSignedAt ? `<span class="chip ok">الموافقة موقّعة</span>` : `<button class="btn small primary sign" data-id="${x.id}">توقيع الموافقة</button>`}</div></div>`).join("")}</section>` : ""}
    <section class="card"><h3>الفواتير</h3>${pays.length ? `<table class="tbl"><thead><tr><th>التاريخ</th><th>الخدمة</th><th>المدفوع</th></tr></thead><tbody>${pays.sort((a, b) => b.date.localeCompare(a.date)).map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.service || "")}</td><td>${esc(money(x.paid, cur))}</td></tr>`).join("")}</tbody></table>${due > 0 ? `<p class="alert">المبلغ المتبقي عليكِ: ${esc(money(due, cur))}</p>` : ""}` : empty("لا توجد فواتير")}</section>`;
  $(".up").onclick = uploadLab;
  $$(".sign").forEach((b) => b.onclick = () => signConsent(procs.find((x) => x.id === b.dataset.id)));
  $$(".file-tile").forEach((b) => b.onclick = () => {
    const f = fls.find((x) => x.id === b.dataset.id);
    info(`${KIND[f.kind] || "ملف"} · ${f.date}`, f.data.startsWith("data:image") ? `<img src="${f.data}" alt="" class="full">` : `<a class="btn primary" href="${f.data}" download="file.pdf">تنزيل</a>`);
  });
}

async function uploadLab() {
  const r = await modal("رفع تحليل", `<form class="stack">${select("النوع", "kind", [["lab", "تحليل"], ["echo", "تصوير صوتي"], ["other", "ملف آخر"]])}${field("تاريخ التحليل", "date", { type: "date", value: ymd(), required: true })}${field("ملاحظة", "note")}</form>`, { ok: "اختيار الصورة" });
  if (!r) return;
  const f = await pickFile("image/*,application/pdf"); if (!f) return;
  try {
    toast("جارٍ الرفع…");
    const data = await compressImage(f);
    const p = me();
    const ref = await addDoc(P.sub(T.pid, "files"), { ...r, data, uploadedBy: "patient", createdAt: serverTimestamp() });
    await addDoc(P.col("inbox"), { patientId: p.id, patientName: p.name, label: r.kind === "echo" ? "تصوير صوتي" : "تحليل", fileId: ref.id, seen: false, at: serverTimestamp() });
    toast("تم الرفع، وستطّلع عليه الطبيبة");
    file();
  } catch (e) { toast(errMsg(e), true); }
}

async function signConsent(x) {
  const r = await modal(`موافقة: ${x.name}`, `<div class="consent-text pre">${esc(x.consentText || "أقرّ بأنني اطّلعت على طبيعة الإجراء وأوافق على إجرائه.")}</div>
    ${x.details ? `<p class="muted">${esc(x.details)}</p>` : ""}
    <form class="stack">${field("اكتبي اسمك الكامل كتوقيع", "name", { required: true, value: me().name })}${field("قرأتُ النص وأوافق", "ok", { type: "checkbox" })}</form>`, {
    ok: "توقيع",
    onOk: async (f) => {
      if (!f.ok) { toast("يجب الموافقة على النص", true); return false; }
      await updateDoc(P.subDoc(T.pid, "procedures", x.id), { consentSignedAt: serverTimestamp(), consentName: f.name });
      await audit("توقيع موافقة من التطبيق", x.name);
    }
  });
  if (r) { toast("تم التوقيع"); render(); }
}

// ---------- الرسائل ----------
async function sendMsg(text) {
  const p = me();
  await addDoc(P.sub(p.id, "messages"), { from: "patient", text, at: serverTimestamp(), byName: p.name });
  await updateDoc(P.patient(p.id), { lastMsgAt: serverTimestamp(), lastMsgFrom: "patient" });
}
async function msgs() {
  main().innerHTML = `<h2 class="page-title">رسائل العيادة</h2>
    <section class="card chat"><div class="msgs" aria-live="polite"></div>
    <form class="send row gap"><input name="t" placeholder="اكتبي سؤالك…" required aria-label="الرسالة" class="grow"><button class="btn primary">إرسال</button></form>
    <p class="muted small">للحالات الطارئة اتصلي مباشرة${S.pub.phone ? `: <a href="tel:${esc(S.pub.phone)}" dir="ltr">${esc(S.pub.phone)}</a>` : ""}.</p></section>`;
  const box = $(".msgs");
  const un = onSnapshot(P.sub(T.pid, "messages"), (s) => {
    if (!document.body.contains(box)) return un();
    const arr = s.docs.map((d) => d.data()).sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
    box.innerHTML = arr.length ? arr.map((m) => `<div class="bubble ${m.from === "patient" ? "me" : ""}"><div>${esc(m.text)}</div><small>${esc(m.from === "clinic" ? (m.byName || "العيادة") : "")} ${esc(tsDate(m.at))}</small></div>`).join("") : empty("اكتبي لنا إن كان لديكِ سؤال");
    box.scrollTop = box.scrollHeight;
  });
  S.unsub.push(un);
  $(".send").onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim(); if (!t) return;
    e.target.t.value = "";
    try { await sendMsg(t); } catch (err) { toast(errMsg(err), true); }
  };
}

// ---------- الإعدادات ----------
async function settings() {
  main().innerHTML = `<h2 class="page-title">الإعدادات</h2>
    <ul class="menu">
      <li><label class="menu-check"><span>إخفاء التفاصيل الطبية</span><input type="checkbox" class="hs" ${T.me.hideSensitive ? "checked" : ""}></label></li>
      ${T.patients.length > 1 ? `<li><button class="sw"><span>تبديل الملف (${esc(me().name)})</span><span class="chev">‹</span></button></li>` : ""}
      <li><a href="#/learn"><span>معلومات صحية</span><span class="chev">‹</span></a></li>
      <li><button class="cp"><span>تغيير كلمة المرور</span><span class="chev">‹</span></button></li>
      <li><button class="out"><span>تسجيل الخروج</span></button></li>
    </ul>
    <p class="muted small">مفيد إذا كان الجوال مشتركاً: تبقى التفاصيل مخفية حتى تضغطي «إظهار».</p>`;
  $(".hs").onchange = async (e) => {
    try { await updateDoc(P.user(S.user.uid), { hideSensitive: e.target.checked }); T.me.hideSensitive = e.target.checked; T._revealed = false; toast("تم الحفظ"); }
    catch (err) { toast(errMsg(err), true); }
  };
  $(".sw")?.addEventListener("click", () => { sessionStorage.removeItem("pid"); T.pid = null; choose(); });
  $(".cp").onclick = () => showChangePassword(false);
  $(".out").onclick = logout;
}

// ---------- مقالات ----------
const ARTICLES = [
  ["علامات تستدعي مراجعة الطبيبة فوراً أثناء الحمل", ["نزيف مهبلي بأي كمية.", "ألم بطن شديد أو مستمر.", "صداع شديد مع تشوش في الرؤية أو تورم مفاجئ في الوجه واليدين.", "نقص واضح في حركة الجنين بعد الأسبوع 28.", "تسرب ماء من المهبل.", "حرارة عالية أو قشعريرة.", "تقيؤ شديد لا يتوقف."]],
  ["تغذية الحامل", ["نوّعي غذاءك: خضار، فواكه، بروتين، حبوب كاملة، وألبان مبسترة.", "قلّلي الكافيين، وتجنّبي اللحوم والبيض غير المطهوّة جيداً والأجبان غير المبسترة.", "اشربي كمية كافية من الماء خلال النهار.", "الفيتامينات والحديد وحمض الفوليك وفق وصفة الطبيبة."]],
  ["الثلث الأول (حتى الأسبوع 13)", ["الغثيان والتعب شائعان، وتساعد الوجبات الصغيرة المتكررة.", "حمض الفوليك مهم لنمو الجهاز العصبي للجنين.", "لا تتناولي أي دواء أو أعشاب دون استشارة الطبيبة."]],
  ["الثلث الثاني (الأسابيع 14–27)", ["غالباً تعود الطاقة ويخف الغثيان.", "قد تبدئين بالشعور بحركة الجنين.", "المشي والنشاط الخفيف مفيدان ما لم توصِ الطبيبة بغير ذلك."]],
  ["الثلث الأخير (من الأسبوع 28)", ["راقبي حركة الجنين يومياً.", "جهّزي حقيبة الولادة وأوراقك.", "النوم على الجانب أكثر راحة غالباً."]],
  ["بعد الولادة", ["يخف النزيف تدريجياً خلال أسابيع، وإذا زاد فجأة أو ظهرت رائحة أو حرارة فراجعي الطبيبة.", "خذي قسطاً من الراحة وتغذّي جيداً، واطلبي المساعدة من المقربين.", "قد يحدث حزن أو قلق شديد بعد الولادة، فتحدثي مع الطبيبة إذا استمر."]],
  ["الرضاعة الطبيعية", ["ابدئي الرضاعة في أقرب وقت بعد الولادة.", "الرضاعة حسب الطلب.", "راجعي الطبيبة عند وجود ألم شديد أو احمرار أو حرارة في الثدي."]],
  ["مسحة عنق الرحم", ["فحص بسيط يكشف تغيرات خلايا عنق الرحم مبكراً.", "تحدد لكِ الطبيبة كم مرة يجب إجراؤه.", "يذكّرك التطبيق بموعدها إذا كان مسجلاً في ملفك."]],
];
function learn() {
  main().innerHTML = `<h2 class="page-title">معلومات صحية</h2>
    ${ARTICLES.map(([t, items]) => `<details class="card article"><summary><b>${esc(t)}</b></summary><ul class="plain dots">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></details>`).join("")}
    <p class="muted small">هذه معلومات عامة ولا تغني عن استشارة الطبيبة.</p>`;
}

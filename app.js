// نقطة البداية: الدخول، الإعداد الأول، وتوجيه كل دور لواجهته
import {
  configured, auth, db, P, one, login, firstSetup, onAuthStateChanged, signOut,
  updatePassword, sendPasswordResetEmail, updateDoc, serverTimestamp, setActor, onSnapshot, audit
} from "./fb.js";
import { COPYRIGHT, $, esc, toast, errMsg, field, logoHtml, info } from "./ui.js";

export const S = { user: null, profile: null, pub: null, clinic: null, unsub: [] };
const root = () => $("#app");

function applyBrand(pub) {
  S.pub = pub || {};
  const accent = S.pub.accent || "#6B3FA0";
  document.documentElement.style.setProperty("--accent", accent);
  document.title = S.pub.name || "عيادة";
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = accent;
}

async function boot() {
  if (!configured) {
    root().innerHTML = `<div class="center-page"><div class="card narrow">
      <h2>يحتاج النظام إلى إعدادات Firebase</h2>
      <p>افتح ملف <b>config.js</b> والصق إعدادات مشروع Firebase وفق دليل التشغيل.</p></div></div>`;
    return;
  }
  try { applyBrand(await one(P.pub())); } catch { applyBrand({}); }

  onAuthStateChanged(auth, onUser);
}

let setupInProgress = false;
async function onUser(user) {
  if (setupInProgress) return;
  {
    S.unsub.forEach((u) => { try { u(); } catch {} });
    S.unsub = [];
    S.user = user;
    if (!user) {
      const setup = await one(P.setup()).catch(() => null);
      return setup ? showLogin() : showSetup();
    }
    let prof = null;
    try { prof = await one(P.user(user.uid)); } catch (e) { console.error(e); }
    if (!prof) { await signOut(auth); return showLogin("لم يُعثر على الحساب"); }
    if (!prof.active) {
      await signOut(auth);
      return showLogin("هذا الحساب موقوف. إذا حصلتِ على كلمة مرور جديدة فاستخدميها.");
    }
    S.profile = prof;
    setActor({ uid: user.uid, name: prof.name || prof.phone });
    if (prof.mustChangePassword) return showChangePassword(true);
    route();
  }
}

export async function route() {
  const prof = S.profile;
  S.unsub.forEach((u) => { try { u(); } catch {} });
  S.unsub = [];
  if (prof.role === "patient") {
    const m = await import("./patient.js");
    if (!prof.consentAt) return m.showConsent();
    return m.start();
  }
  // الطبيبة والسكرتارية
  S.unsub.push(onSnapshot(P.clinic(), (s) => {
    S.clinic = s.data() || {};
    applyBrand({ ...S.pub, ...pickBrand(S.clinic) });
  }));
  startIdleTimer();
  const m = await import("./staff.js");
  m.start();
}
function pickBrand(c) {
  const { name, doctorName, title, address, phone, accent, logo } = c;
  return { name, doctorName, title, address, phone, accent, logo };
}

// ---------- شاشة الدخول ----------
function showLogin(msg = "") {
  let kind = "p";
  const render = () => {
    root().innerHTML = `<div class="center-page login-page">
      <div class="brand-block">
        ${logoHtml(S.pub, 96)}
        <h1>${esc(S.pub.doctorName ? "د. " + S.pub.doctorName : S.pub.name || "العيادة")}</h1>
        <p>${esc(S.pub.title || "")}</p>
      </div>
      <div class="card narrow">
        <div class="seg" role="tablist">
          <button role="tab" class="${kind === "p" ? "on" : ""}" data-k="p" aria-selected="${kind === "p"}">دخول المريضة</button>
          <button role="tab" class="${kind === "s" ? "on" : ""}" data-k="s" aria-selected="${kind === "s"}">فريق العيادة</button>
        </div>
        <form id="lf" class="stack">
          ${field(kind === "p" ? "رقم الجوال" : "رقم الجوال أو البريد الإلكتروني", "id", { required: true, attrs: `inputmode="${kind === "p" ? "tel" : "text"}" autocomplete="username" dir="ltr"`, placeholder: "09xxxxxxxx" })}
          ${field("كلمة المرور", "pw", { type: "password", required: true, attrs: 'autocomplete="current-password" dir="ltr"' })}
          ${msg ? `<div class="alert">${esc(msg)}</div>` : ""}
          <button class="btn primary block" type="submit">دخول</button>
          <button class="link-btn forgot" type="button">نسيت كلمة المرور؟</button>
        </form>
      </div>
      <p class="muted small">${esc(S.pub.address || "")} ${S.pub.phone ? `· <span dir="ltr">${esc(S.pub.phone)}</span>` : ""}</p>
      <p class="copyright">${esc(COPYRIGHT)}</p>
    </div>`;
    root().querySelectorAll(".seg button").forEach((b) => b.onclick = () => { kind = b.dataset.k; msg = ""; render(); });
    $("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "يرجى الانتظار…";
      try { await login(e.target.id.value, e.target.pw.value, kind); }
      catch (err) { msg = errMsg(err); render(); }
    };
    $(".forgot").onclick = async () => {
      const v = $("#lf").id.value.trim();
      if (kind === "s" && v.includes("@")) {
        try { await sendPasswordResetEmail(auth, v); toast("أُرسل رابط تغيير كلمة المرور إلى بريدك الإلكتروني"); }
        catch (e) { toast(errMsg(e), true); }
        return;
      }
      info("نسيت كلمة المرور", kind === "p"
        ? `<p>تواصلي مع العيادة للحصول على كلمة مرور جديدة.</p>${S.pub.phone ? `<p><a class="btn primary" href="tel:${esc(S.pub.phone)}">اتصال بالعيادة</a></p>` : ""}`
        : `<p>السكرتارية: تمنحكِ الطبيبة كلمة مرور جديدة من قسم الموظفين.</p><p>الطبيبة: إذا سجّلتِ بريداً إلكترونياً عند الإعداد، فاكتبيه في خانة الدخول واضغطي "نسيت كلمة المرور" ليصلك رابط التغيير.</p>`);
    };
  };
  render();
}

// ---------- الإعداد الأول (مرة وحدة بس) ----------
function showSetup() {
  root().innerHTML = `<div class="center-page">
    <div class="brand-block">${logoHtml(null, 88)}<h1>إعداد العيادة لأول مرة</h1><p>يتم هذا الإعداد مرة واحدة فقط، ومنه يُنشأ حساب الطبيبة (المسؤولة).</p></div>
    <form id="sf" class="card narrow stack">
      <h3>بيانات العيادة</h3>
      ${field("اسم العيادة", "clinicName", { value: "عيادة د. شروق صليبي", required: true })}
      ${field("اسم الطبيبة", "doctorName", { value: "شروق محمد ساطع صليبي", required: true })}
      ${field("اللقب", "title", { value: "أخصائية توليد وتجميل نسائي (بورد أميركي)", required: true })}
      ${field("العنوان", "address", { value: "باب مصلى، باتجاه مشفى المجتهد، بعد صيدلية بيور كير" })}
      ${field("هاتف العيادة", "clinicPhone", { value: "0932793051", attrs: 'dir="ltr" inputmode="tel"' })}
      <h3>حساب الطبيبة</h3>
      ${field("رقم جوال الطبيبة (لتسجيل الدخول)", "phone", { required: true, attrs: 'dir="ltr" inputmode="tel"', placeholder: "09xxxxxxxx" })}
      ${field("البريد الإلكتروني للطوارئ (اختياري)", "email", { type: "email", attrs: 'dir="ltr"', hint: "عند إدخاله يصبح الدخول بالبريد الإلكتروني، ويمكنكِ استعادة كلمة المرور إن نسيتِها." })}
      ${field("كلمة المرور", "password", { type: "password", required: true, attrs: 'minlength="6" dir="ltr" autocomplete="new-password"' })}
      ${field("تأكيد كلمة المرور", "password2", { type: "password", required: true, attrs: 'minlength="6" dir="ltr" autocomplete="new-password"' })}
      <button class="btn primary block" type="submit">إنشاء العيادة</button>
    </form></div>`;
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.password !== f.password2) return toast("كلمتا المرور غير متطابقتين", true);
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "جارٍ الإعداد…";
    setupInProgress = true;
    try {
      await firstSetup(f);
      applyBrand({ name: f.clinicName, doctorName: f.doctorName, title: f.title, address: f.address, phone: f.clinicPhone });
      toast("تم إنشاء العيادة");
      setupInProgress = false;
      onUser(auth.currentUser);
    } catch (err) {
      setupInProgress = false;
      console.error(err); toast(errMsg(err), true); btn.disabled = false; btn.textContent = "إنشاء العيادة";
      if (auth.currentUser) { try { await auth.currentUser.delete(); } catch {} }
    }
  };
}

// ---------- تغيير كلمة المرور ----------
export function showChangePassword(forced = false) {
  root().innerHTML = `<div class="center-page"><form id="cp" class="card narrow stack">
    <h2>${forced ? "مرحباً بكِ! اختاري كلمة مرور جديدة" : "تغيير كلمة المرور"}</h2>
    <p class="muted">${forced ? "يجب تغيير كلمة المرور المؤقتة التي حصلتِ عليها قبل المتابعة." : ""}</p>
    ${field("كلمة المرور الجديدة", "p1", { type: "password", required: true, attrs: 'minlength="6" dir="ltr" autocomplete="new-password"' })}
    ${field("تأكيدها", "p2", { type: "password", required: true, attrs: 'minlength="6" dir="ltr" autocomplete="new-password"' })}
    <button class="btn primary block" type="submit">حفظ</button>
    ${forced ? `<button class="link-btn out" type="button">خروج</button>` : `<button class="link-btn back" type="button">رجوع</button>`}
  </form></div>`;
  $("#cp").onsubmit = async (e) => {
    e.preventDefault();
    const { p1, p2 } = e.target;
    if (p1.value !== p2.value) return toast("كلمتا المرور غير متطابقتين", true);
    try {
      await updatePassword(auth.currentUser, p1.value);
      await updateDoc(P.user(auth.currentUser.uid), { mustChangePassword: false });
      S.profile.mustChangePassword = false;
      toast("تم تغيير كلمة المرور");
      route();
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        toast("لأسباب أمنية، سجّلي الخروج ثم الدخول مجدداً، ثم غيّري كلمة المرور", true);
      } else toast(errMsg(err), true);
    }
  };
  $(".out")?.addEventListener("click", logout);
  $(".back")?.addEventListener("click", route);
}

export async function logout() {
  try { await audit("تسجيل خروج"); } catch {}
  window.onhashchange = null;
  await signOut(auth);
  history.replaceState(null, "", location.pathname);
}

// خروج تلقائي لحسابات الفريق بعد 30 دقيقة بدون استخدام
let idleT, idleOn = false;
function startIdleTimer() {
  const reset = () => {
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (S.profile && S.profile.role !== "patient") { toast("تم تسجيل الخروج تلقائياً"); logout(); } }, 30 * 60 * 1000);
  };
  if (!idleOn) {
    ["click", "keydown", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    idleOn = true;
  }
  reset();
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot();

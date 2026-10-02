// أدوات الواجهة المشتركة
// رابط تنزيل تطبيق أندرويد (آخر نسخة دائماً)
// صفحة تنزيل تتعرف على نوع الجوال (أندرويد: ينزّل التطبيق، آيفون: يفتح النظام مع الشرح)
export const APP_URL = "https://mohamedfayzyasenalsabagh-create.github.io/clinic-shurouq/app.html";
export const COPYRIGHT = "© 2026 جميع الحقوق محفوظة · mohamedfayzyasenalsabagh@gmail.com";
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- التواريخ ----------
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
export const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
export function fmtDate(s, withDay = true) {
  if (!s) return "";
  const d = parseYmd(s);
  return `${withDay ? DAYS[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtTime(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const pm = h >= 12;
  const hh = h % 12 || 12;
  return `${hh}:${pad(m)} ${pm ? "م" : "ص"}`;
}
export function tsDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const money = (n, cur = "ل.س") => `${Number(n || 0).toLocaleString("en-US")} ${cur}`;

// ---------- رسائل ----------
export function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
}

export function errMsg(e) {
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "الرقم أو كلمة المرور غير صحيحة";
  if (c.includes("too-many-requests")) return "محاولات كثيرة، يرجى المحاولة بعد قليل";
  if (c.includes("network")) return "لا يوجد اتصال بالإنترنت";
  if (c.includes("permission-denied")) return "ليست لديك صلاحية لهذا الإجراء";
  if (c.includes("weak-password")) return "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل";
  if (c.includes("email-already-in-use")) return "الحساب موجود مسبقاً";
  if (c.includes("invalid-email")) return "البريد الإلكتروني غير صحيح";
  return e?.message || "حدث خطأ، يرجى المحاولة مجدداً";
}

// ---------- نوافذ ----------
export function modal(title, bodyHtml, { ok = "حفظ", cancel = "إلغاء", onOk, onOpen, wide = false, danger = false } = {}) {
  return new Promise((resolve) => {
    const w = document.createElement("div");
    w.className = "modal-wrap";
    w.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn x" aria-label="إغلاق">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-foot">
        ${ok ? `<button class="btn ${danger ? "danger" : "primary"} ok">${esc(ok)}</button>` : ""}
        ${cancel ? `<button class="btn ghost cancel">${esc(cancel)}</button>` : ""}
      </div></div>`;
    document.body.appendChild(w);
    const close = (v) => { w.remove(); resolve(v); };
    w.querySelector(".x").onclick = () => close(null);
    w.querySelector(".cancel")?.addEventListener("click", () => close(null));
    w.addEventListener("click", (e) => { if (e.target === w) close(null); });
    const okBtn = w.querySelector(".ok");
    okBtn?.addEventListener("click", async () => {
      const form = w.querySelector("form");
      if (form && !form.reportValidity()) return;
      const data = form ? formData(form) : true;
      if (onOk) {
        okBtn.disabled = true;
        try {
          const r = await onOk(data, w);
          if (r === false) { okBtn.disabled = false; return; }
          close(r ?? data);
        } catch (e) { console.error(e); toast(errMsg(e), true); okBtn.disabled = false; }
      } else close(data);
    });
    const first = w.querySelector("input,select,textarea");
    if (first) setTimeout(() => first.focus(), 50);
    if (typeof onOpen === "function") onOpen(w);
  });
}
export const confirmBox = (title, text, ok = "تأكيد", danger = false) =>
  modal(title, `<p>${esc(text)}</p>`, { ok, danger });
export function info(title, html) { return modal(title, html, { ok: "حسناً", cancel: null }); }

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (el.type === "number") o[el.name] = el.value === "" ? null : Number(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}

// ---------- حقول ----------
export function field(label, name, { type = "text", value = "", required = false, placeholder = "", attrs = "", hint = "" } = {}) {
  const id = "f_" + name + "_" + Math.random().toString(36).slice(2, 7);
  if (type === "textarea")
    return `<label class="field" for="${id}"><span>${esc(label)}</span><textarea id="${id}" name="${name}" ${required ? "required" : ""} placeholder="${esc(placeholder)}" ${attrs}>${esc(value)}</textarea>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
  if (type === "checkbox")
    return `<label class="check" for="${id}"><input id="${id}" type="checkbox" name="${name}" ${value ? "checked" : ""} ${attrs}><span>${esc(label)}</span></label>`;
  return `<label class="field" for="${id}"><span>${esc(label)}</span><input id="${id}" type="${type}" name="${name}" value="${esc(value)}" ${required ? "required" : ""} placeholder="${esc(placeholder)}" ${attrs}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
}
export function select(label, name, options, value = "", { required = false } = {}) {
  const id = "s_" + name + "_" + Math.random().toString(36).slice(2, 7);
  const opts = options.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`;
  }).join("");
  return `<label class="field" for="${id}"><span>${esc(label)}</span><select id="${id}" name="${name}" ${required ? "required" : ""}>${opts}</select></label>`;
}

// ---------- الصور ----------
export function pickFile(accept = "image/*") {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}
export function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
// بتصغّر الصورة لحتى تنحفظ بقاعدة البيانات (أقل من ~900KB)
export async function compressImage(file, maxSide = 1400, quality = 0.72) {
  if (file.type === "application/pdf") {
    const d = await fileToDataUrl(file);
    if (d.length > 950000) throw new Error("ملف PDF كبير جداً، يرجى تصويره كصورة بدلاً منه");
    return d;
  }
  const url = await fileToDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  let q = quality, side = maxSide, out;
  for (let tries = 0; tries < 6; tries++) {
    const s = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);
    if (out.length < 900000) return out;
    q -= 0.1; side = Math.round(side * 0.8);
  }
  throw new Error("الصورة كبيرة جداً");
}

// ---------- الشعار الافتراضي ----------
export function logoSvg(size = 48, body = "var(--accent)", baby = "#E9D8F4", ring = "#EFE6F7") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
  ${ring ? `<circle cx="60" cy="60" r="56" fill="${ring}"/>` : ""}
  <circle cx="55" cy="26" r="10.5" fill="${body}"/>
  <path d="M47 40 C38 43 33 52 33 64 C33 80 31 92 29 101 Q57 110 85 101 C82 91 80 82 80 72 C80 58 72 45 60 40 C56 39 51 39 47 40 Z" fill="${body}"/>
  <ellipse cx="61" cy="62" rx="18" ry="10" transform="rotate(-20 61 62)" fill="${baby}"/>
  <circle cx="76.5" cy="53" r="7" fill="${baby}"/>
  <path d="M41 57 C44 73 62 78 79 67" fill="none" stroke="${body}" stroke-width="5.5" stroke-linecap="round"/>
</svg>`;
}
export function logoHtml(pub, size = 48) {
  return pub?.logo
    ? `<img class="logo-img" src="${esc(pub.logo)}" alt="" width="${size}" height="${size}">`
    : logoSvg(size);
}

// ---------- واتساب ----------
export function waLink(phone, text) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "963" + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// ---------- طباعة ----------
export function printDoc(pub, title, bodyHtml) {
  const w = document.createElement("div");
  w.className = "print-sheet";
  w.innerHTML = `
    <div class="print-tools no-print">
      <button class="btn primary p-go">طباعة / حفظ PDF</button>
      <button class="btn ghost p-close">إغلاق</button>
    </div>
    <div class="paper">
      <header class="letterhead">
        <div class="lh-logo">${logoHtml(pub, 72)}</div>
        <div class="lh-text">
          <div class="lh-name">${esc(pub?.doctorName ? "د. " + pub.doctorName : pub?.name || "")}</div>
          ${pub?.title ? `<div class="lh-title">${esc(pub.title)}</div>` : ""}
          ${pub?.address ? `<div class="lh-addr">📍 ${esc(pub.address)}</div>` : ""}
        </div>
      </header>
      <h2 class="doc-title">${esc(title)}</h2>
      <div class="doc-body">${bodyHtml}</div>
      <footer class="doc-sign"><div>التاريخ: ${esc(fmtDate(ymd(), false))}</div><div>توقيع الطبيبة: ....................</div></footer>
      ${pub?.phone || pub?.email ? `<div class="lh-foot">${pub?.phone ? `<span>☎ <span dir="ltr">${esc(pub.phone)}</span></span>` : ""}${pub?.email ? `<span>✉ <span dir="ltr">${esc(pub.email)}</span></span>` : ""}</div>` : ""}
    </div>`;
  document.body.appendChild(w);
  document.body.classList.add("printing");
  w.querySelector(".p-go").onclick = () => window.print();
  w.querySelector(".p-close").onclick = () => { w.remove(); document.body.classList.remove("printing"); };
}

// ---------- مساعدات عامة ----------
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const empty = (t) => `<div class="empty">${esc(t)}</div>`;

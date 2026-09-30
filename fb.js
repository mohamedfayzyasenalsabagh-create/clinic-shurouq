// طبقة Firebase: الاتصال، الحسابات، والمساعدات المشتركة
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, sendPasswordResetEmail, setPersistence,
  inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs,
  onSnapshot, serverTimestamp, arrayUnion, runTransaction, writeBatch, limit, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, CLINIC_ID } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");

export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = configured ? getAuth(app) : null;
export const db = configured
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;

export {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, onSnapshot,
  serverTimestamp, arrayUnion, runTransaction, writeBatch, limit, orderBy, Timestamp, onAuthStateChanged,
  signOut, updatePassword, sendPasswordResetEmail
};

export const C = CLINIC_ID;

// ---------- مسارات ----------
export const P = {
  setup: () => doc(db, "config", "setup"),
  pub: () => doc(db, "config", "public"),
  clinic: () => doc(db, "clinics", C),
  user: (uid) => doc(db, "users", uid),
  users: () => collection(db, "users"),
  phone: (ph) => doc(db, "clinics", C, "phones", ph),
  patients: () => collection(db, "clinics", C, "patients"),
  patient: (pid) => doc(db, "clinics", C, "patients", pid),
  sub: (pid, name) => collection(db, "clinics", C, "patients", pid, name),
  subDoc: (pid, name, id) => doc(db, "clinics", C, "patients", pid, name, id),
  col: (name) => collection(db, "clinics", C, name),
  colDoc: (name, id) => doc(db, "clinics", C, name, id),
};

// ---------- أرقام وإيميلات الدخول ----------
export function normPhone(v) {
  let d = String(v || "").replace(/[^\d٠-٩]/g, "")
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
  if (d.startsWith("00963")) d = "0" + d.slice(5);
  else if (d.startsWith("963")) d = "0" + d.slice(3);
  else if (d.length === 9 && d.startsWith("9")) d = "0" + d;
  return d;
}
export const loginEmail = (phone, kind, ver = 1) =>
  `${kind}${phone}${ver > 1 ? "-" + ver : ""}@clinic-${C}.app`;
export const MAX_VER = 5;

export function genPassword() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

// حساب ثانوي لإنشاء حسابات جديدة بدون ما تطلع الطبيبة من حسابها
let secondary = null;
async function secondaryAuth() {
  if (!secondary) {
    const sApp = initializeApp(firebaseConfig, "secondary");
    secondary = getAuth(sApp);
    await setPersistence(secondary, inMemoryPersistence);
  }
  return secondary;
}

// بينشئ حساب دخول بأول نسخة متاحة للإيميل
async function createAuthAt(phone, kind, password, startVer = 1) {
  const sa = await secondaryAuth();
  for (let v = startVer; v <= MAX_VER; v++) {
    try {
      const cred = await createUserWithEmailAndPassword(sa, loginEmail(phone, kind, v), password);
      const uid = cred.user.uid;
      await signOut(sa);
      return { uid, ver: v };
    } catch (e) {
      if (e.code !== "auth/email-already-in-use") throw e;
    }
  }
  throw new Error("بلغ هذا الرقم الحد الأقصى لإعادة التعيين. يرجى التواصل مع الدعم.");
}

// ---------- الدخول ----------
export async function login(idText, password, kind) {
  const id = String(idText || "").trim();
  if (id.includes("@")) {
    return (await signInWithEmailAndPassword(auth, id, password)).user;
  }
  const phone = normPhone(id);
  if (phone.length < 9) throw new Error("رقم الجوال غير صحيح");
  let lastErr = null;
  for (let v = 1; v <= MAX_VER; v++) {
    try {
      return (await signInWithEmailAndPassword(auth, loginEmail(phone, kind, v), password)).user;
    } catch (e) {
      lastErr = e;
      if (e.code === "auth/too-many-requests" || e.code === "auth/network-request-failed") break;
    }
  }
  throw lastErr || new Error("login failed");
}

// ---------- سجل التعديلات ----------
let currentActor = { uid: null, name: "" };
export function setActor(a) { currentActor = a; }
export async function audit(action, target = "") {
  try {
    await addDoc(P.col("audit"), {
      at: serverTimestamp(), by: currentActor.uid, byName: currentActor.name, action, target
    });
  } catch (e) { console.warn("audit", e); }
}

// ---------- الإعداد الأول ----------
export async function firstSetup(f) {
  const phone = normPhone(f.phone);
  const email = f.email ? f.email.trim() : null;
  const cred = email
    ? await createUserWithEmailAndPassword(auth, email, f.password)
    : await createUserWithEmailAndPassword(auth, loginEmail(phone, "s", 1), f.password);
  const uid = cred.user.uid;
  const branding = {
    name: f.clinicName, doctorName: f.doctorName, title: f.title,
    address: f.address, phone: f.clinicPhone, accent: "#6B3FA0", logo: null
  };
  const b = writeBatch(db);
  b.set(P.user(uid), {
    role: "doctor", clinicId: C, name: f.doctorName, phone, email, active: true,
    mustChangePassword: false, ver: 1, createdAt: serverTimestamp()
  });
  b.set(P.clinic(), {
    ...branding, currency: "ل.س", slotMinutes: 20, hours: defaultHours(),
    services: defaultServices(), createdAt: serverTimestamp()
  });
  b.set(P.pub(), branding);
  b.set(P.phone(phone), { staffUid: uid, staffVer: 1 }, { merge: true });
  b.set(P.setup(), { done: true, at: serverTimestamp() });
  await b.commit();
  return uid;
}

export function defaultHours() {
  // 0 = الأحد … 5 = الجمعة، 6 = السبت
  const h = {};
  for (let d = 0; d < 7; d++) h[d] = { on: d !== 5, from: "10:00", to: "17:00" };
  return h;
}
export function defaultServices() {
  return [
    { id: "kashf", name: "معاينة", price: 0, duration: 20, kind: "general" },
    { id: "review", name: "مراجعة", price: 0, duration: 15, kind: "general" },
    { id: "echo", name: "إيكو", price: 0, duration: 20, kind: "general" },
    { id: "preg", name: "متابعة حمل", price: 0, duration: 20, kind: "general" },
    { id: "cosm", name: "استشارة تجميلية", price: 0, duration: 30, kind: "cosmetic" },
  ];
}

// ---------- المريضات ----------
export async function registerPatient(data) {
  const phone = normPhone(data.phone);
  if (phone.length < 9) throw new Error("رقم الجوال غير صحيح");
  const pRef = doc(P.patients());
  const pid = pRef.id;
  const phRef = P.phone(phone);
  const ph = await getDoc(phRef);
  let tempPassword = null, uid, shared = false;

  if (ph.exists() && ph.data().patientUid) {
    uid = ph.data().patientUid;
    await updateDoc(P.user(uid), { patientIds: arrayUnion(pid) });
    shared = true;
  } else {
    tempPassword = genPassword();
    const r = await createAuthAt(phone, "p", tempPassword, 1);
    uid = r.uid;
    await setDoc(P.user(uid), {
      role: "patient", clinicId: C, phone, patientIds: [pid], active: true,
      mustChangePassword: true, ver: r.ver, hideSensitive: false, createdAt: serverTimestamp()
    });
    await setDoc(phRef, { patientUid: uid, patientVer: r.ver }, { merge: true });
  }
  await setDoc(pRef, {
    name: data.name.trim(), phone, age: data.age ? Number(data.age) : null,
    address: data.address || "", bloodType: data.bloodType || "", uid,
    archived: false, createdAt: serverTimestamp(), createdBy: currentActor.uid
  });
  await audit("تسجيل مريضة جديدة", data.name);
  return { pid, tempPassword, shared, phone };
}

// كلمة مرور جديدة للمريضة: بينعمل حساب بنسخة جديدة والقديم بيتوقف
export async function resetPatientPassword(phone) {
  const ph = await getDoc(P.phone(phone));
  if (!ph.exists() || !ph.data().patientUid) throw new Error("لا يوجد حساب لهذا الرقم");
  const oldUid = ph.data().patientUid;
  const old = await getDoc(P.user(oldUid));
  const temp = genPassword();
  const r = await createAuthAt(phone, "p", temp, (ph.data().patientVer || 1) + 1);
  const od = old.data();
  await setDoc(P.user(r.uid), {
    role: "patient", clinicId: C, phone, patientIds: od.patientIds || [], active: true,
    mustChangePassword: true, ver: r.ver, hideSensitive: !!od.hideSensitive,
    consentAt: od.consentAt || null, createdAt: serverTimestamp()
  });
  await updateDoc(P.user(oldUid), { active: false });
  await setDoc(P.phone(phone), { patientUid: r.uid, patientVer: r.ver }, { merge: true });
  for (const pid of od.patientIds || []) await updateDoc(P.patient(pid), { uid: r.uid });
  await audit("إعادة تعيين كلمة مرور مريضة", phone);
  return temp;
}

// ---------- الموظفين ----------
export async function createStaff(name, phoneRaw) {
  const phone = normPhone(phoneRaw);
  if (phone.length < 9) throw new Error("رقم الجوال غير صحيح");
  const ph = await getDoc(P.phone(phone));
  if (ph.exists() && ph.data().staffUid) {
    const u = await getDoc(P.user(ph.data().staffUid));
    if (u.exists() && u.data().active) throw new Error("يوجد موظف مسجّل بهذا الرقم");
  }
  const temp = genPassword();
  const start = ph.exists() && ph.data().staffVer ? ph.data().staffVer + 1 : 1;
  const r = await createAuthAt(phone, "s", temp, start);
  await setDoc(P.user(r.uid), {
    role: "secretary", clinicId: C, name: name.trim(), phone, active: true,
    mustChangePassword: true, ver: r.ver, createdAt: serverTimestamp()
  });
  await setDoc(P.phone(phone), { staffUid: r.uid, staffVer: r.ver }, { merge: true });
  await audit("إنشاء حساب سكرتارية", name);
  return temp;
}

export async function resetStaffPassword(uid) {
  const u = await getDoc(P.user(uid));
  const d = u.data();
  const ph = await getDoc(P.phone(d.phone));
  const temp = genPassword();
  const r = await createAuthAt(d.phone, "s", temp, ((ph.exists() && ph.data().staffVer) || d.ver || 1) + 1);
  await setDoc(P.user(r.uid), {
    role: d.role, clinicId: C, name: d.name, phone: d.phone, active: true,
    mustChangePassword: true, ver: r.ver, createdAt: serverTimestamp()
  });
  await updateDoc(P.user(uid), { active: false });
  await setDoc(P.phone(d.phone), { staffUid: r.uid, staffVer: r.ver }, { merge: true });
  await audit("إعادة تعيين كلمة مرور موظف", d.name);
  return temp;
}

// ---------- مساعدات قراءة ----------
export async function list(q) {
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function one(ref) {
  const s = await getDoc(ref);
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

"use strict";

// Hostel Electricity Tracker. All money rules live in the database; this file
// only shows data and calls the database functions. Text from users is always
// inserted as plain text (never as HTML).

if (CONFIG.SUPABASE_URL.includes("PASTE_") || CONFIG.SUPABASE_ANON_KEY.includes("PASTE_")) {
  document.body.textContent = "Setup needed: open config.js and paste your Supabase project URL and public key.";
  throw new Error("config.js has not been filled in");
}
if (typeof supabase === "undefined") {
  document.body.textContent = "Could not load a required script. Check your connection and reload the page.";
  throw new Error("supabase-js did not load");
}
const db =supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const S = {
  authMode: "signin", userId: null, hostel: null, me: null, isT: false,
  people: {}, byUser: {}, tab: "home", meterId: null, cycles: [], payKey: null,
};

function badgeTone(text) {
  const t = text.trim().toLowerCase();
  if (["approved", "paid", "active", "resolved", "published", "confirmed"].includes(t)) return "ok";
  if (["pending", "part-paid", "open", "draft", "waiting"].includes(t)) return "wait";
  if (["rejected", "reversed", "unpaid", "left", "withdrawn", "not yet"].includes(t)) return "bad";
  return "";
}
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (e.className === "badge") e.dataset.tone = badgeTone(e.textContent);
  return e;
}
const naira = (k) => "₦" + (Number(k) / 100).toLocaleString("en-NG", {
  minimumFractionDigits: Number(k) % 100 ? 2 : 0, maximumFractionDigits: 2 });
// Accepts "1500", "1,500", "₦1500.50". Rejects 1e3, 0x10, more than 2 decimals.
// Works on the text, not on floating point, so 1.005 can never round the wrong way.
function toKobo(text) {
  const t = String(text).replace(/[,₦\s]/g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const k = Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0") || 0);
  return k > 0 ? k : null;
}
function toUnits(text) {
  const t = String(text).trim();
  return /^(?:\d{1,9}(?:\.\d*)?|\.\d+)$/.test(t) ? Number(t) : null;
}
function toSignedKobo(text) {
  const t = String(text).trim();
  const neg = t.startsWith("-");
  const k = toKobo(neg ? t.slice(1) : t);
  return k == null ? null : (neg ? -k : k);
}
// Plain dates ("2026-10-20") are pinned to noon UTC so they never slip a day on phones set to another time zone.
const fmtDate = (v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00Z" : v)
  .toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
const fmtDateTime = (v) => new Date(v).toLocaleString("en-NG", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const iso = (d) => d.toISOString().slice(0, 10);
const parseD = (s) => new Date(s + "T00:00:00Z");
const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monthEnd = (s) => { const d = parseD(s); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); };
const todayLagos = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
// Value for a datetime-local box showing the current Lagos time, e.g. "2026-10-20T21:05".
const nowLagosInput = () => new Date().toLocaleString("sv-SE", { timeZone: "Africa/Lagos" }).slice(0, 16).replace(" ", "T");
const kv = (k, v) => h("div", { class: "kv" }, h("span", null, k), h("span", null, v));
const nameOf = (membershipId) => (S.people[membershipId] || {}).name || "Unknown";

function showMessage(text, kind) {
  const box = $("message");
  box.textContent = text; box.className = "message " + (kind || "ok");
}
function clearMessage() { $("message").className = "message hidden"; $("message").textContent = ""; }
function setTitle(text, sub) {
  $("page-title").textContent = text;
  const p = $("page-sub"); p.textContent = sub || ""; p.classList.toggle("hidden", !sub);
}
const VIEW_TITLES = { "view-loading": "", "view-auth": "Welcome", "view-onboarding": "Get started" };
function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
  const inApp = id === "view-home";
  if (!inApp) setTitle(VIEW_TITLES[id] || "Hostel Electricity");
  $("btn-signout").classList.toggle("hidden", id === "view-auth" || id === "view-loading");
  $("btn-add").classList.toggle("hidden", !inApp);
  $("bottomnav").classList.toggle("hidden", !inApp);
  document.body.classList.toggle("has-nav", inApp);
  if (!inApp) closeMore();
}
async function busy(button, action) {
  if (button) button.disabled = true;
  try { await action(); }
  catch (err) { showMessage(err.message || "Something went wrong. Try again.", "error"); window.scrollTo(0, 0); console.error(err); }
  finally { if (button) button.disabled = false; }
}
async function call(name, args) {
  const { data, error } = await db.rpc(name, args || {});
  if (error) throw new Error(error.message);
  return data;
}
async function fetchRows(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
const onSubmit = (id, fn) => $(id).addEventListener("submit", (e) => {
  e.preventDefault(); busy(e.submitter || e.target.querySelector("button"), fn);
});
function fill(listId, items, emptyText) {
  const ul = $(listId); ul.replaceChildren();
  if (!items.length) ul.append(h("li", { class: "sub" }, emptyText));
  else ul.append(...items);
}
function ask(text) { const v = prompt(text); return v === null ? null : v.trim(); }

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file could not be read as an image.")); };
    img.src = url;
  });
}
async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large (15 MB limit).");
  const img = await loadImage(file);            // decoding also proves it is a real image
  // Capped at 1200px wide and 8M pixels, to stay under phone canvas limits.
  const scale = Math.min(1, 1200 / img.width, Math.sqrt(8e6 / (img.width * img.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  for (const [type, q] of [["image/webp", 0.8], ["image/webp", 0.65], ["image/jpeg", 0.8], ["image/jpeg", 0.6]]) {
    const blob = await toBlob(type, q);
    if (blob && blob.type === type && blob.size <= 1.5 * 1024 * 1024) return blob;
  }
  throw new Error("Could not shrink that image enough. Try a smaller screenshot.");
}
async function uploadImage(file, folder) {
  const blob = await compressImage(file);
  const path = S.hostel.id + "/" + folder + "/" + crypto.randomUUID() + (blob.type === "image/webp" ? ".webp" : ".jpg");
  const { error } = await db.storage.from("receipts").upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error("Upload failed: " + error.message);
  return path;
}
// Runs a save that depends on an uploaded image; if the save fails, the orphaned upload is removed.
async function withUpload(file, folder, save) {
  const path = file ? await uploadImage(file, folder) : null;
  try { return await save(path); }
  catch (err) { if (path) db.storage.from("receipts").remove([path]).catch(() => {}); throw err; }
}
async function viewReceipt(path) {
  const { data, error } = await db.storage.from("receipts").createSignedUrl(path, 120);
  if (error) { showMessage("Could not open the receipt: " + error.message, "error"); return; }
  $("overlay-img").src = data.signedUrl; $("overlay").classList.remove("hidden");
}
$("overlay-close").addEventListener("click", () => { $("overlay").classList.add("hidden"); $("overlay-img").removeAttribute("src"); });
const receiptButton = (path) => path ? h("button", { type: "button", class: "secondary small", onclick: () => viewReceipt(path) }, "View receipt") : null;

function setAuthMode(mode) {
  S.authMode = mode; const up = mode === "signup";
  $("tab-signin").classList.toggle("active", !up); $("tab-signup").classList.toggle("active", up);
  $("tab-signin").setAttribute("aria-selected", String(!up)); $("tab-signup").setAttribute("aria-selected", String(up));
  $("signup-only").classList.toggle("hidden", !up);
  $("auth-submit").textContent = up ? "Create account" : "Sign in";
  $("auth-password").autocomplete = up ? "new-password" : "current-password";
  clearMessage();
}
$("tab-signin").addEventListener("click", () => setAuthMode("signin"));
$("tab-signup").addEventListener("click", () => setAuthMode("signup"));

onSubmit("form-auth", async () => {
  clearMessage();
  const username = $("auth-username").value.trim().toLowerCase();
  const password = $("auth-password").value;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) { showMessage("Username must be 3 to 20 characters: letters, numbers or underscore.", "error"); return; }
  if (password.length < 8) { showMessage("Password must be at least 8 characters.", "error"); return; }
  const email = username + "@" + CONFIG.EMAIL_DOMAIN;
  if (S.authMode === "signup") {
    const display = $("auth-display").value.trim() || username;
    const { data, error } = await db.auth.signUp({ email, password, options: { data: { username, display_name: display } } });
    if (error) { showMessage(/already registered|already exists/i.test(error.message) ? "That username is taken. Pick another." : "Could not create the account: " + error.message, "error"); return; }
    if (!data.session) { showMessage("Account created, but you were not signed in. Turn off email confirmation in Supabase, then sign in.", "error"); return; }
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) { showMessage(/invalid login|credentials/i.test(error.message) ? "Wrong username or password." : "Could not sign in: " + error.message, "error"); return; }
  }
  $("auth-password").value = "";
  await loadApp();
});
function resetSession() {
  S.hostel = null; S.me = null; S.isT = false; S.tab = "home"; S.meterId = null;
  document.querySelectorAll("form").forEach((f) => f.reset());
  $("new-code-box").classList.add("hidden"); $("new-code").textContent = "";
  $("overlay").classList.add("hidden"); $("overlay-img").removeAttribute("src");
  setAuthMode("signin"); showView("view-auth");
}
$("btn-signout").addEventListener("click", async () => {
  S.signingOut = true;
  try { await db.auth.signOut(); } finally { S.signingOut = false; }
  resetSession();
});
// Keep this callback synchronous: supabase-js can deadlock if it awaits other auth calls in here.
db.auth.onAuthStateChange((event) => {
  if (event !== "SIGNED_OUT" || S.signingOut || !S.hostel) return;
  resetSession(); showMessage("You were signed out. Please sign in again.", "error");
});

async function loadApp() {
  const { data: sd } = await db.auth.getSession();
  if (!sd.session) { showView("view-auth"); return; }
  S.userId = sd.session.user.id;
  const rows = await fetchRows(db.from("memberships")
    .select("id, role, hostel_id, hostels!hostel_id(name, schedule_type, backup_membership_id, pending_treasurer_membership_id)")
    .eq("user_id", S.userId).eq("status", "active").order("joined_at", { ascending: true }).limit(1));
  if (!rows.length) { S.hostel = null; showView("view-onboarding"); return; }
  const m = rows[0];
  if (!m.hostels) throw new Error("Could not load your hostel. Ask the treasurer to check your access.");
  S.me = { id: m.id, role: m.role };
  S.isT = m.role === "treasurer";
  S.hostel = { id: m.hostel_id, name: m.hostels.name, schedule: m.hostels.schedule_type,
               backup: m.hostels.backup_membership_id, pendingTransfer: m.hostels.pending_treasurer_membership_id };
  S.payKey = crypto.randomUUID();
  const people = await fetchRows(db.from("memberships")
    .select("id, user_id, role, status, joined_at, profiles(username, display_name)").eq("hostel_id", S.hostel.id));
  S.people = {}; S.byUser = {};
  for (const p of people) {
    const rec = { id: p.id, userId: p.user_id, role: p.role, status: p.status, joined: p.joined_at,
                  name: (p.profiles && p.profiles.display_name) || "Member", username: (p.profiles && p.profiles.username) || "unknown" };
    S.people[p.id] = rec; S.byUser[p.user_id] = rec;
  }
  S.greeting = "Hi, " + firstName((S.byUser[S.userId] || {}).name);
  S.hostelLine = S.hostel.name + (S.isT ? " · Treasurer" : "");
  showView("view-home");
  renderBanner();
  if (!S.isT && ["cycles", "review", "reports"].includes(S.tab)) S.tab = "home";
  await openTab(S.tab);
}

function renderBanner() {
  const box = $("banner"); box.replaceChildren(); box.classList.add("hidden");
  if (S.hostel.pendingTransfer === S.me.id) {
    box.classList.remove("hidden");
    box.append(h("div", null, "The treasurer has offered you the treasurer role."),
      h("button", { type: "button", onclick: (e) => busy(e.target, async () => {
        await call("accept_treasurer_transfer", { p_hostel: S.hostel.id }); await loadApp(); showMessage("You are now the treasurer.", "ok"); }) }, "Accept the role"));
  }
}

const icon = (name) => h("i", { class: "fa-solid fa-" + name, "aria-hidden": "true" });
const TABS = { home: ["Home", "house"], pay: ["Pay", "wallet"], power: ["Light", "bolt"], members: ["People", "users"],
               review: ["Review", "clipboard-check"], cycles: ["Collections", "calendar-days"], reports: ["Reports", "chart-pie"] };
const NAV_MEMBER = ["home", "pay", "power", "members"];
const NAV_TREASURER = ["home", "review", "power", "members"];
const MORE_TREASURER = ["pay", "cycles", "reports"];
function navButton(label, ic, active, onclick) {
  return h("button", { type: "button", class: "nav-item" + (active ? " active" : ""), "aria-current": active ? "page" : null, onclick },
    h("span", { class: "nav-pill" }, icon(ic)), h("span", { class: "nav-label" }, label));
}
function buildTabs() {
  const nav = $("bottomnav"); nav.replaceChildren();
  for (const id of S.isT ? NAV_TREASURER : NAV_MEMBER) nav.append(navButton(TABS[id][0], TABS[id][1], S.tab === id, () => openTab(id)));
  if (S.isT) nav.append(navButton("More", "ellipsis", MORE_TREASURER.includes(S.tab), openMore));
}
function openMore() {
  const list = $("more-list"); list.replaceChildren();
  for (const id of MORE_TREASURER) {
    list.append(h("button", { type: "button", class: "sheet-item" + (S.tab === id ? " active" : ""),
      onclick: () => { closeMore(); openTab(id); } }, h("span", { class: "sheet-ic" }, icon(TABS[id][1])), TABS[id][0]));
  }
  $("sheet").classList.remove("hidden");
}
function closeMore() { $("sheet").classList.add("hidden"); }
$("sheet-backdrop").addEventListener("click", closeMore);
$("btn-add").addEventListener("click", () => openTab("pay"));
function closeOverlay() { $("overlay").classList.add("hidden"); $("overlay-img").removeAttribute("src"); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMore(); closeOverlay(); } });
const RENDER = {};
async function openTab(id, keepMessage) {
  const changed = S.tab !== id;
  S.tab = id; if (!keepMessage) clearMessage(); buildTabs();
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  $("panel-" + id).classList.remove("hidden");
  if (id === "home") setTitle(S.greeting, S.hostelLine); else setTitle(TABS[id][0]);
  $("btn-add").classList.toggle("hidden", id === "pay");
  if (changed) window.scrollTo(0, 0);
  try { await RENDER[id](); } catch (err) { showMessage("Could not load this screen: " + err.message, "error"); console.error(err); }
}
const refresh = (msg) => openTab(S.tab, true).then(() => { if (msg) showMessage(msg, "ok"); });

onSubmit("form-join", async () => {
  clearMessage();
  const data = await call("join_hostel", { p_code: $("join-code").value.trim() });
  if (!data.ok) {
    showMessage({ invalid_code: "That code is not valid. It may be wrong, already used, revoked or expired.",
      too_many_attempts: "Too many wrong tries. Wait 15 minutes and try again.",
      already_member_or_former_member: "You already have a membership in that hostel. Ask the treasurer." }[data.reason] || "Could not join with that code.", "error");
    return;
  }
  $("join-code").value = ""; await loadApp();
});
onSubmit("form-create", async () => {
  clearMessage();
  const name = $("create-name").value.trim();
  if (!name) { showMessage("Enter a hostel name.", "error"); return; }
  await call("create_hostel", { p_name: name, p_schedule_type: $("create-schedule").value });
  $("create-name").value = ""; await loadApp();
});

const SVGNS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "there";
const initials = (n) => { const p = String(n || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const PAY_WORDS = { PENDING: "Waiting", APPROVED: "Confirmed", REJECTED: "Rejected", REVERSED: "Reversed", WITHDRAWN: "Withdrawn" };
const longDate = (key) => new Date(key + "T12:00:00Z").toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayKey = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const tile = (cls, ...kids) => h("div", { class: "tile " + cls }, ...kids);
const tileTitle = (text, ic) => h("p", { class: "tile-title" }, ic ? icon(ic) : null, text);

// opts: wide (full width), tone ("good" | "short"), onclick (makes the whole card tappable), corner (icon name)
function stat(title, value, unit, sub, opts) {
  const o = opts || {};
  const big = h("p", { class: "big" }, value, unit ? h("span", { class: "unit" }, unit) : null);
  const foot = h("div", null, h("p", { class: "stat-title" }, title), sub ? h("p", { class: "sub tone " + (o.subTone || "") }, sub) : null);
  const t = h("div", { class: "tile stat" + (o.wide ? " span2 wide" : "") + (o.tone ? " " + o.tone : "") + (o.onclick ? " tap" : "") },
    h("div", { class: "stat-top" }, big, o.corner ? h("span", { class: "corner" }, icon(o.corner)) : null), foot);
  if (o.onclick) { t.setAttribute("role", "button"); t.tabIndex = 0; t.addEventListener("click", o.onclick);
    t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); o.onclick(); } }); }
  return t;
}

function meterTile(s, wide) {
  const units = s.latest_units == null ? "–" : Number(s.latest_units).toFixed(1);
  let sub = "", subTone = "";
  if (s.days_remaining == null) sub = s.latest_units == null ? "No meter reading yet" : "Needs one more reading to estimate";
  else {
    const d = Math.max(0, Math.round(Number(s.days_remaining)));
    sub = d < 1 ? "Less than a day left" : "About " + d + (d === 1 ? " day" : " days") + " left";
    subTone = d <= 2 ? "low" : d <= 5 ? "warn" : "good";
  }
  return stat("Light left", units, s.latest_units == null ? "" : "kWh", sub, { wide, subTone, corner: "bolt" });
}

const eventsSince = () => { const t = parseD(todayLagos()); return iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 2, 1))); };
async function fetchEventRows() {
  const since = eventsSince();
  const sinceTs = since + "T00:00:00+01:00";
  let payQ = db.from("payment_submissions").select("amount_kobo, payment_date, status, membership_id")
    .eq("hostel_id", S.hostel.id).gte("payment_date", since).order("payment_date", { ascending: false }).limit(300);
  if (!S.isT) payQ = payQ.eq("membership_id", S.me.id);
  const safe = (q) => q.then(({ data, error }) => (error ? [] : data || []), () => []);   // the calendar must never break the home screen
  const [pays, buys, reads] = await Promise.all([safe(payQ),
    safe(db.from("electricity_purchases").select("amount_kobo, units_kwh, purchased_at").eq("hostel_id", S.hostel.id).gte("purchased_at", sinceTs).limit(200)),
    safe(db.from("meter_readings").select("units_remaining, recorded_at, flagged").eq("hostel_id", S.hostel.id).gte("recorded_at", sinceTs).limit(200))]);
  return { pays, buys, reads };
}
function buildEvents({ pays, buys, reads }, me) {
  const since = eventsSince();
  const ev = {};
  const add = (key, t, text) => { if (key >= since) (ev[key] = ev[key] || []).push({ t, text }); };
  for (const p of pays) {
    if (p.status === "WITHDRAWN") continue;
    const who = S.isT ? nameOf(p.membership_id) + " paid " : "You paid ";
    add(dayKey(p.payment_date), ["PENDING", "APPROVED"].includes(p.status) ? "pay" : null, who + naira(p.amount_kobo) + " (" + (PAY_WORDS[p.status] || p.status).toLowerCase() + ")");
  }
  for (const b of buys) add(dayKey(b.purchased_at), "buy", "Tokens bought: " + naira(b.amount_kobo) + " for " + b.units_kwh + " kWh");
  for (const r of reads) add(dayKey(r.recorded_at), "read", "Meter read: " + r.units_remaining + " kWh");
  for (const o of (me.obligations || [])) add(dayKey(o.deadline), "due", "Pay by today: " + o.cycle_name);
  return ev;
}
const CAL_RANK = { pay: 3, buy: 2, read: 1, due: 0 };
function buildCalendar(ev) {
  const today = todayLagos(), base = parseD(today);
  const detail = h("div", { class: "cal-day", "aria-live": "polite" });
  const head = h("div", { class: "cal-head" }), body = h("div");
  let m = 0, selKey = today;                       // m: months back from this month (0 to -2)
  const showDay = (key) => {
    const items = ev[key] || [];
    detail.replaceChildren(h("strong", null, key === today ? "Today, " + longDate(key) : longDate(key)),
      ...(items.length ? items.map((e) => h("div", null, e.t ? h("span", { class: "dot " + e.t }) : null, e.text)) : [h("div", { class: "none" }, "Nothing recorded this day.")]));
  };
  const prev = h("button", { type: "button", "aria-label": "Previous month", onclick: () => { m = Math.max(-2, m - 1); draw(); } }, icon("chevron-left"));
  const next = h("button", { type: "button", "aria-label": "Next month", onclick: () => { m = Math.min(0, m + 1); draw(); } }, icon("chevron-right"));
  function draw() {
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, 1));
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const off = (first.getUTCDay() + 6) % 7;                       // weeks start on Monday
    const weeks = Math.max(5, Math.ceil((off + days) / 7));       // 5 rows, or 6 when the month needs it
    prev.disabled = m <= -2; next.disabled = m >= 0;
    head.replaceChildren(h("strong", null, first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })), h("div", { class: "cal-nav" }, prev, next));
    const week = h("div", { class: "cal-week", "aria-hidden": "true" }, ["M", "T", "W", "T", "F", "S", "S"].map((d) => h("span", null, d)));
    const grid = h("div", { class: "cal-grid" });
    for (let i = 0; i < off; i++) grid.append(h("span", { class: "cal-cell blank" }));
    for (let d = 1; d <= days; d++) {
      const key = iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d)));
      const items = ev[key] || [];
      const types = [...new Set(items.map((e) => e.t).filter(Boolean))].sort((a, b) => CAL_RANK[b] - CAL_RANK[a]).slice(0, 3);
      const btn = h("button", { type: "button", class: "cal-cell" + (key === today ? " today" : "") + (key > today ? " future" : "") + (key === selKey ? " sel" : ""),
        "aria-label": longDate(key) + (items.length ? ": " + items.map((e) => e.text).join("; ") : ": nothing recorded") },
        String(d), h("span", { class: "cal-dots" }, types.map((t) => h("i", { class: t }))));
      btn.addEventListener("click", () => { selKey = key; grid.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel")); btn.classList.add("sel"); showDay(key); });
      grid.append(btn);
    }
    for (let i = off + days; i < weeks * 7; i++) grid.append(h("span", { class: "cal-cell blank" }));
    body.replaceChildren(week, grid);
  }
  draw(); showDay(selKey);
  const key = h("div", { class: "cal-key" }, h("span", null, h("span", { class: "dot pay" }), "Payment"), h("span", null, h("span", { class: "dot buy" }), "Tokens bought"),
    h("span", null, h("span", { class: "dot read" }), "Meter read"), h("span", null, h("span", { class: "dot due" }), "Deadline"));
  return tile("span2", tileTitle("Activity", "calendar-days"), head, body, key, detail);
}

function ringTile(st) {
  if (!st.cycle) return tile("span2", tileTitle("This collection"), h("p", { class: "big" }, "None yet"),
    h("p", { class: "sub" }, S.isT ? "Start one under More › Collections." : "Your treasurer hasn't started one."));
  const pct = st.target_kobo > 0 ? Math.min(100, Math.round((st.collected_kobo / st.target_kobo) * 100)) : 0;
  const C = 2 * Math.PI * 42;
  const ring = svgEl("svg", { viewBox: "0 0 100 100", class: "ring", "aria-hidden": "true" });
  ring.append(svgEl("circle", { cx: 50, cy: 50, r: 42, class: "track" }), svgEl("circle", { cx: 50, cy: 50, r: 42, class: "fill", "stroke-dasharray": C, "stroke-dashoffset": C * (1 - pct / 100) }));
  return tile("span2", h("div", { class: "strip" },
    h("div", { class: "ring-box", role: "img", "aria-label": pct + " percent collected" }, ring, h("span", { class: "ring-pct" }, pct + "%")),
    h("div", { class: "strip-text" }, h("strong", null, st.cycle.name),
      h("p", { class: "sub" }, naira(st.collected_kobo) + " of " + naira(st.target_kobo) + " collected"),
      h("p", { class: "sub" }, "Pay by " + fmtDate(st.cycle.deadline)))));
}
function oweTile(me) {
  const owe = Number(me.total_outstanding_kobo);
  const pending = Number(me.pending_kobo) > 0 ? naira(me.pending_kobo) + " waiting to be confirmed" : "";
  if (owe <= 0) {
    return stat("You owe", "₦0", "", pending || (Number(me.credit_kobo) > 0 ? naira(me.credit_kobo) + " credit carries forward" : "All paid. Thank you."),
      { tone: "good", subTone: pending ? "" : "good", corner: "circle-check" });
  }
  const bits = [];
  if (Number(me.current_due_kobo) > 0) bits.push("This collection " + naira(me.current_due_kobo));
  if (Number(me.arrears_kobo) > 0) bits.push("From before " + naira(me.arrears_kobo));
  if (pending) bits.push(pending);
  return stat("You owe", naira(owe), "", bits.join(" · "), { corner: "arrow-right", onclick: () => openTab("pay") });
}
function peopleTile(st) {
  const members = st.members || [];
  if (!st.cycle || !members.length) return tile("span2", tileTitle("Who has paid", "users"), h("p", { class: "sub" }, "This fills in once a collection is published."));
  const norm = (s) => { s = String(s).toLowerCase(); return s === "paid" ? "paid" : s.startsWith("part") ? "part" : "unpaid"; };
  const word = { paid: "Paid", part: "Part-paid", unpaid: "Not yet" };
  const order = { unpaid: 0, part: 1, paid: 2 };
  const sorted = members.slice().sort((a, b) => order[norm(a.status)] - order[norm(b.status)]);
  return tile("span2", tileTitle("Who has paid", "users"),
    h("div", { class: "legend" }, h("span", null, h("span", { class: "dot paid" }), h("b", null, st.paid_count), " paid"), h("span", null, h("span", { class: "dot part" }), h("b", null, st.part_count), " part-paid"),
      h("span", null, h("span", { class: "dot unpaid" }), h("b", null, st.unpaid_count), " not yet")),
    h("div", { class: "people-dots" }, sorted.map((x) => h("span", { class: "person", "data-s": norm(x.status), title: x.name + ": " + word[norm(x.status)] },
      h("span", { class: "av", "aria-hidden": "true" }, initials(x.name)), h("span", { class: "nm" }, x.name + " · " + word[norm(x.status)])))));
}

RENDER.home = async function () {
  const eventRows = fetchEventRows();
  const [st, me, pw] = await Promise.all([call("hostel_status", { p_hostel: S.hostel.id }), call("my_summary", { p_hostel: S.hostel.id }),
    call("electricity_summary", { p_hostel: S.hostel.id })]);
  const events = buildEvents(await eventRows, me);
  const grid = $("bento"); grid.replaceChildren();
  if (st.treasurer_event) grid.append(h("div", { class: "notice span2" }, st.treasurer_event.action === "treasurer.takeover"
    ? "The backup treasurer took over the role on " + fmtDate(st.treasurer_event.at) + "."
    : "The treasurer role was handed over on " + fmtDate(st.treasurer_event.at) + "."));
  if (S.isT && st.pending_count > 0) grid.append(h("div", { class: "notice span2" }, h("div", null, st.pending_count + (st.pending_count === 1 ? " payment is" : " payments are") + " waiting for you to confirm."),
    h("button", { type: "button", class: "small", onclick: () => openTab("review") }, "Review now")));
  grid.append(meterTile(pw), oweTile(me), buildCalendar(events), ringTile(st), peopleTile(st));
  const hist = h("details", { class: "fold span2" }, h("summary", null, icon("clock-rotate-left"), "Your past collections"), h("ul", { id: "my-obligations", class: "list" }));
  grid.append(hist);
  fill("my-obligations", me.obligations.slice().reverse().map((o) => {
    const total = o.share_kobo + o.adjust_kobo;
    const label = o.due_kobo <= 0 ? "Paid" : o.paid_kobo > 0 ? "Part-paid" : "Unpaid";
    return h("li", null, h("div", { class: "top" }, h("strong", null, o.cycle_name), h("span", { class: "badge" }, label)),
      h("div", { class: "sub" }, "Your share " + naira(total) + (o.adjust_kobo ? " (includes an adjustment of " + naira(o.adjust_kobo) + ")" : "") +
        " · paid " + naira(o.paid_kobo) + " · still due " + naira(o.due_kobo) + " · pay by " + fmtDate(o.deadline)));
  }), "Nothing yet. You'll join from the next collection.");
};


RENDER.pay = async function () {
  $("pay-date").max = todayLagos();
  if (!$("pay-date").value) $("pay-date").value = todayLagos();
  const pays = await fetchRows(db.from("payment_submissions").select("*").eq("membership_id", S.me.id)
    .order("submitted_at", { ascending: false }).limit(30));
  fill("my-payments", pays.map((p) => {
    const reason = p.decision_reason || p.reversal_reason;
    const actions = h("div", { class: "actions" }, receiptButton(p.proof_path));
    if (p.status === "PENDING") actions.append(h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
      if (!confirm("Cancel this payment record?")) return; await call("withdraw_payment", { p_payment: p.id }); await refresh("Payment record cancelled."); }) }, "Cancel"));
    if (["REJECTED", "APPROVED", "REVERSED"].includes(p.status)) actions.append(h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
      const msg = ask("What is wrong with this decision?"); if (!msg) return;
      await call("open_dispute", { p_hostel: S.hostel.id, p_payment: p.id, p_message: msg }); await refresh("Sent to the treasurer."); }) }, "Something's wrong"));
    return h("li", null, h("div", { class: "top" }, h("strong", null, naira(p.amount_kobo)), h("span", { class: "badge" }, PAY_WORDS[p.status] || cap(p.status))),
      h("div", { class: "sub" }, "Paid " + fmtDate(p.payment_date) + (p.reference ? " · ref " + p.reference : "") + (p.note ? " · " + p.note : "")),
      reason ? h("div", { class: "sub" }, "Treasurer's reason: " + reason) : null, actions);
  }), "No payments yet.");
  const ds = await fetchRows(db.from("disputes").select("*").eq("membership_id", S.me.id).order("created_at", { ascending: false }).limit(20));
  fill("my-disputes", ds.map((d) => h("li", null, h("div", { class: "top" }, h("span", null, d.message), h("span", { class: "badge" }, cap(d.status))),
    d.resolution ? h("div", { class: "sub" }, "Outcome: " + d.resolution) : null)), "None.");
};
function syncPayFile() {
  const f = $("pay-file").files[0];
  $("pay-drop").classList.toggle("has-file", !!f);
  $("pay-drop-text").textContent = f ? "Receipt added: " + f.name : "Add a photo of the receipt";
  $("pay-note-wrap").classList.toggle("hidden", !!f);
}
$("pay-file").addEventListener("change", syncPayFile);
$("form-pay").addEventListener("reset", () => setTimeout(syncPayFile));
onSubmit("form-pay", async () => {
  clearMessage();
  const amount = toKobo($("pay-amount").value);
  if (!amount) { showMessage("Enter the amount you paid.", "error"); return; }
  const file = $("pay-file").files[0]; const note = $("pay-note").value.trim();
  if (!file && !note) { showMessage("Add a photo of the receipt, or say why there isn't one.", "error"); return; }
  const date = $("pay-date").value;
  if (date > todayLagos()) { showMessage("The payment date cannot be in the future.", "error"); return; }
  const r = await withUpload(file, S.me.id, (path) => call("submit_payment", { p_hostel: S.hostel.id, p_amount_kobo: amount, p_payment_date: date,
    p_reference: $("pay-ref").value, p_proof_path: path, p_note: note, p_client_key: S.payKey }));
  S.payKey = crypto.randomUUID();
  for (const id of ["pay-amount", "pay-ref", "pay-file", "pay-note"]) $(id).value = ""; syncPayFile();
  await refresh(r.duplicate ? "That payment was already submitted." : "Sent. It counts once the treasurer confirms it.");
});

RENDER.power = async function () {
  const s = await call("electricity_summary", { p_hostel: S.hostel.id });
  S.meterId = s.meter_id;
  const short = s.funds_balance_kobo < 0;
  const c = $("power-card"); c.replaceChildren(meterTile(s, true),
    stat("Used per day", s.avg_daily_kwh == null ? "–" : s.avg_daily_kwh, s.avg_daily_kwh == null ? "" : "kWh", s.avg_daily_kwh == null ? "Needs two readings" : "Whole hostel", { corner: "gauge-high" }),
    stat(short ? "Money short" : "Money in hand", naira(Math.abs(s.funds_balance_kobo)), "", short ? "Spent more than collected" : "Collected minus spent", { tone: short ? "short" : "good", corner: "wallet" }),
    stat("Units bought", s.purchases_units, "kWh", "In total", { corner: "receipt" }),
    stat("Spent on tokens", naira(s.purchases_total_kobo), "", naira(s.collected_kobo) + " collected", { corner: "naira-sign" }));
  const note = s.period_from ? "The estimate uses readings from " + fmtDate(s.period_from) + " to " + fmtDate(s.period_to) + ". It is for the whole hostel, not one person." : (s.estimate_note || "");
  if (note) c.append(h("p", { class: "hint span2" }, note));
  if (s.flagged_count) c.append(h("p", { class: "warn span2" }, s.flagged_count + " reading(s) look odd and are left out of the estimate."));
  $("power-forms").classList.toggle("hidden", !S.isT);
  for (const id of ["pu-when", "rd-when"]) if (!$(id).value) $(id).value = nowLagosInput();
  const [pu, rd] = await Promise.all([
    fetchRows(db.from("electricity_purchases").select("*").eq("hostel_id", S.hostel.id).order("purchased_at", { ascending: false }).limit(20)),
    fetchRows(db.from("meter_readings").select("*").eq("hostel_id", S.hostel.id).order("recorded_at", { ascending: false }).limit(20))]);
  fill("purchase-list", pu.map((p) => h("li", null, h("div", { class: "top" }, h("strong", null, naira(p.amount_kobo) + " · " + p.units_kwh + " kWh"), h("span", { class: "sub" }, fmtDateTime(p.purchased_at))),
    p.reference ? h("div", { class: "sub" }, "Ref " + p.reference) : null, h("div", { class: "actions" }, receiptButton(p.proof_path)))), "No tokens bought yet.");
  fill("reading-list", rd.map((r) => h("li", null, h("div", { class: "top" }, h("strong", null, r.units_remaining + " kWh left"), h("span", { class: "sub" }, fmtDateTime(r.recorded_at))),
    r.is_baseline ? h("div", { class: "sub" }, "Starting point or meter reset") : null,
    r.flagged ? h("div", { class: "warn" }, "Looks odd (" + String(r.flag_reason).replace(/_/g, " ") + "). Left out of the estimate.") : null,
    r.notes ? h("div", { class: "sub" }, r.notes) : null, h("div", { class: "actions" }, receiptButton(r.proof_path)))), "No readings yet.");
};
// The hostel runs on Lagos time (UTC+1, no daylight saving), whatever time zone the phone is set to.
const localToIso = (v) => {
  const d = new Date(v + (v.length === 16 ? ":00" : "") + "+01:00");
  if (Number.isNaN(d.getTime())) throw new Error("Enter a valid date and time.");
  return d.toISOString();
};
onSubmit("form-purchase", async () => {
  clearMessage();
  const amount = toKobo($("pu-amount").value); const units = toUnits($("pu-units").value);
  if (!amount || !(units > 0)) { showMessage("Enter the amount and the units bought.", "error"); return; }
  const file = $("pu-file").files[0]; const when = localToIso($("pu-when").value);
  await withUpload(file, "purchases", (path) => call("record_purchase", { p_hostel: S.hostel.id, p_meter: S.meterId, p_amount_kobo: amount, p_units: units,
    p_purchased_at: when, p_reference: $("pu-ref").value, p_proof_path: path, p_notes: null }));
  for (const id of ["pu-amount", "pu-units", "pu-ref", "pu-file"]) $(id).value = ""; $("pu-when").value = nowLagosInput();
  await refresh("Purchase saved.");
});
onSubmit("form-reading", async () => {
  clearMessage();
  const units = toUnits($("rd-units").value);
  if (units == null) { showMessage("Enter the units remaining as a plain number, for example 42.5.", "error"); return; }
  const file = $("rd-file").files[0]; const when = localToIso($("rd-when").value);
  const r = await withUpload(file, "readings", (path) => call("record_reading", { p_hostel: S.hostel.id, p_meter: S.meterId, p_units: units,
    p_recorded_at: when, p_is_baseline: $("rd-base").checked, p_proof_path: path, p_notes: $("rd-note").value }));
  for (const id of ["rd-units", "rd-file", "rd-note"]) $(id).value = ""; $("rd-when").value = nowLagosInput(); $("rd-base").checked = false;
  await refresh(r.flagged ? "Saved, but flagged (" + r.flag_reason.replace(/_/g, " ") + "). It is left out of the estimate." : "Reading saved.");
});

function codeStatus(c) {
  if (c.used_at) return "Used on " + fmtDate(c.used_at);
  if (c.revoked_at) return "Revoked";
  if (new Date(c.expires_at) <= new Date()) return "Expired";
  return "Active, expires " + fmtDate(c.expires_at);
}
RENDER.members = async function () {
  const active = Object.values(S.people).filter((p) => p.status === "active").sort((a, b) => a.joined.localeCompare(b.joined));
  fill("member-list", active.map((p) => {
    const tags = [p.role === "treasurer" ? "Treasurer" : null, S.hostel.backup === p.id ? "Backup" : null, S.hostel.pendingTransfer === p.id ? "Offered treasurer role" : null].filter(Boolean);
    let manage = null;
    if (S.isT && p.id !== S.me.id) {
      manage = h("details", null, h("summary", null, "Manage"), h("div", { class: "actions" },
        h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
          const pw = ask("Type a temporary password for " + p.name + " (8+ characters). Tell them privately."); if (!pw) return;
          await call("reset_member_password", { p_membership: p.id, p_password: pw }); showMessage("Password reset. Tell " + p.name + " the temporary password.", "ok"); }) }, "Reset password"),
        h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
          await call("set_backup_treasurer", { p_hostel: S.hostel.id, p_membership: p.id }); S.hostel.backup = p.id; await refresh(p.name + " is now the backup treasurer."); }) }, "Make backup"),
        h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
          if (!confirm("Offer the treasurer role to " + p.name + "? They must accept it.")) return;
          await call("offer_treasurer_transfer", { p_hostel: S.hostel.id, p_membership: p.id }); S.hostel.pendingTransfer = p.id; await refresh("Offer sent. " + p.name + " must accept."); }) }, "Offer treasurer role"),
        h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
          const why = ask("Why is " + p.name + " leaving? Their debt stays on record."); if (!why) return;
          await call("remove_member", { p_membership: p.id, p_reason: why }); await loadApp(); showMessage(p.name + " was removed.", "ok"); }) }, "Remove")));
    }
    return h("li", null, h("div", { class: "top" }, h("div", { class: "who" }, h("span", { class: "av", "aria-hidden": "true" }, initials(p.name)),
      h("div", { class: "who-text" }, h("strong", null, p.name + (p.id === S.me.id ? " (you)" : "")), h("div", { class: "sub" }, "@" + p.username + " · joined " + fmtDate(p.joined)))),
      tags.length ? h("span", { class: "badge" }, tags.join(" · ")) : null), manage);
  }), "No members.");

  const gov = $("gov-box"); gov.replaceChildren(); gov.classList.add("hidden");
  const lines = [];
  if (S.hostel.backup) lines.push(h("p", null, "Backup treasurer: " + nameOf(S.hostel.backup)));
  if (S.isT && S.hostel.pendingTransfer) lines.push(h("p", null, "Offer pending to " + nameOf(S.hostel.pendingTransfer) + ". ",
    h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
      await call("offer_treasurer_transfer", { p_hostel: S.hostel.id, p_membership: null }); S.hostel.pendingTransfer = null; await refresh("Offer cancelled."); }) }, "Cancel offer")));
  if (S.hostel.backup === S.me.id) lines.push(h("p", { class: "hint" }, "You are the backup treasurer. Use this only if the treasurer cannot be reached. It is logged and shown to everyone."),
    h("button", { type: "button", class: "danger", onclick: (e) => busy(e.target, async () => {
      const why = ask("Why are you taking over? (shown in the record)"); if (!why) return;
      await call("backup_takeover", { p_hostel: S.hostel.id, p_reason: why }); await loadApp(); showMessage("You are now the treasurer.", "ok"); }) }, "Take over as treasurer"));
  if (lines.length) { gov.append(...lines); gov.classList.remove("hidden"); }

  $("treasurer-panel").classList.toggle("hidden", !S.isT);
  if (S.isT) await loadCodes();
};
async function loadCodes() {
  const codes = await fetchRows(db.from("invite_codes").select("id, created_at, expires_at, used_at, revoked_at")
    .eq("hostel_id", S.hostel.id).order("created_at", { ascending: false }).limit(15));
  fill("code-list", codes.map((c) => {
    const live = !c.used_at && !c.revoked_at && new Date(c.expires_at) > new Date();
    return h("li", null, h("div", { class: "top" }, h("div", null, h("div", null, "Code made " + fmtDate(c.created_at)), h("div", { class: "sub" }, codeStatus(c))),
      live ? h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
        if (!confirm("Revoke this code?")) return; await call("revoke_invite_code", { p_invite_id: c.id }); await refresh("Code revoked."); }) }, "Revoke") : null));
  }), "No codes yet.");
}
$("btn-new-code").addEventListener("click", (e) => busy(e.target, async () => {
  clearMessage(); const code = await call("create_invite_code", { p_hostel_id: S.hostel.id });
  $("new-code").textContent = code; $("new-code-box").classList.remove("hidden"); await loadCodes();
}));
$("btn-copy-code").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("new-code").textContent); showMessage("Code copied.", "ok"); }
  catch (e) { showMessage("Could not copy automatically. Press and hold the code to select it.", "error"); }
});
onSubmit("form-password", async () => {
  const { error } = await db.auth.updateUser({ password: $("pw-new").value });
  if (error) { showMessage("Could not change the password: " + error.message, "error"); return; }
  $("pw-new").value = ""; showMessage("Password changed.", "ok");
});

function syncCycleDates() {
  let start = $("cy-start").value; if (!start) return;
  if (S.hostel.schedule === "monthly") { start = start.slice(0, 8) + "01"; $("cy-start").value = start; $("cy-end").value = monthEnd(start);
    $("cy-name").value = parseD(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }); }
  else { $("cy-end").value = addDays(start, 6); $("cy-name").value = "Week of " + fmtDate(start); }
  $("cy-deadline").value = $("cy-end").value;
}
$("cy-start").addEventListener("change", syncCycleDates);
RENDER.cycles = async function () {
  const cycles = await fetchRows(db.from("billing_cycles").select("*").eq("hostel_id", S.hostel.id).order("start_date", { ascending: false }));
  S.cycles = cycles;
  $("cy-hint").textContent = S.hostel.schedule === "weekly" ? "Weekly: exactly 7 days. Members at the time you publish share the total equally in whole naira; any remainder is absorbed by the treasurer."
    : "Monthly: one whole calendar month. Members at the time you publish share the total equally in whole naira; any remainder is absorbed by the treasurer.";
  $("sch-type").value = S.hostel.schedule === "weekly" ? "monthly" : "weekly";
  if (!$("sch-date").value) $("sch-date").value = addDays(cycles.length ? cycles[0].end_date : todayLagos(), 1);
  if (!$("cy-start").value) { $("cy-start").value = cycles.length ? addDays(cycles[0].end_date, 1) : todayLagos(); syncCycleDates(); }
  fill("cycle-list", cycles.map((c) => {
    const li = h("li", null, h("div", { class: "top" }, h("strong", null, c.name), h("span", { class: "badge" }, c.status === "draft" ? "Draft" : "Published")),
      h("div", { class: "sub" }, fmtDate(c.start_date) + " to " + fmtDate(c.end_date) + " · pay by " + fmtDate(c.deadline) + " · target " + naira(c.target_kobo)));
    if (c.status === "draft") {
      li.append(h("div", { class: "actions" },
        h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
          const p = await call("preview_cycle", { p_cycle: c.id });
          alert(p.members + " members would each owe " + naira(p.share_kobo) + ".\nRemainder you absorb: " + naira(p.remainder_kobo) + ".\n\n" + p.names.join(", ")); }) }, "Preview"),
        h("button", { type: "button", class: "small", onclick: (e) => busy(e.target, async () => {
          const p = await call("preview_cycle", { p_cycle: c.id });
          if (!confirm("Publish this collection? " + p.members + " members will each owe " + naira(p.share_kobo) + ". This cannot be edited afterwards, only adjusted.")) return;
          await call("publish_cycle", { p_cycle: c.id }); await refresh("Collection published."); }) }, "Publish"),
        h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
          if (!confirm("Delete this draft?")) return; await call("delete_draft_cycle", { p_cycle: c.id }); await refresh("Draft deleted."); }) }, "Delete")));
    } else {
      const det = h("details", null, h("summary", null, "Each person's share"));
      const body = h("div"); det.append(body);
      det.addEventListener("toggle", () => busy(null, async () => {
        if (!det.open) return; body.replaceChildren(h("p", { class: "sub" }, "Loading…"));
        const obs = await fetchRows(db.from("member_obligations").select("id, membership_id, share_kobo").eq("cycle_id", c.id));
        body.replaceChildren(...obs.map((o) => h("div", { class: "top mt8" }, h("span", null, nameOf(o.membership_id) + " · " + naira(o.share_kobo)),
          h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
            const amt = ask("Adjustment in ₦ for " + nameOf(o.membership_id) + " (negative to reduce or write off, e.g. -500):"); if (!amt) return;
            const k = toSignedKobo(amt); if (k == null) throw new Error("Enter a number such as 500 or -500.");
            const why = ask("Reason (required, kept in the record):"); if (!why) return;
            await call("adjust_obligation", { p_obligation: o.id, p_amount_kobo: k, p_reason: why }); await refresh("Adjustment recorded."); }) }, "Adjust"))));
      }));
      li.append(det);
    }
    return li;
  }), "No collections yet.");
};
onSubmit("form-cycle", async () => {
  clearMessage();
  const target = toKobo($("cy-target").value);
  if (!target || target % 100) { showMessage("Enter the total as whole naira, for example 24000.", "error"); return; }
  await call("create_cycle", { p_hostel: S.hostel.id, p_name: $("cy-name").value, p_start: $("cy-start").value, p_end: $("cy-end").value,
    p_deadline: $("cy-deadline").value, p_target_kobo: target, p_notes: $("cy-notes").value || null });
  for (const id of ["cy-start", "cy-end", "cy-deadline", "cy-name", "cy-target", "cy-notes"]) $(id).value = "";
  await refresh("Draft saved. Preview it, then publish.");
});
onSubmit("form-schedule", async () => {
  clearMessage();
  if (!confirm("Change to " + $("sch-type").value + " from " + $("sch-date").value + "? Existing cycles stay as they are.")) return;
  await call("set_schedule", { p_hostel: S.hostel.id, p_type: $("sch-type").value, p_effective: $("sch-date").value });
  $("sch-date").value = ""; $("cy-start").value = ""; await loadApp(); showMessage("Schedule changed for future cycles.", "ok");
});

RENDER.review = async function () {
  const [pend, disputes, approved] = await Promise.all([
    call("pending_payments", { p_hostel: S.hostel.id }),
    fetchRows(db.from("disputes").select("*").eq("hostel_id", S.hostel.id).eq("status", "open").order("created_at")),
    fetchRows(db.from("payment_submissions").select("*").eq("hostel_id", S.hostel.id).eq("status", "APPROVED").order("reviewed_at", { ascending: false }).limit(20))]);
  fill("pending-list", pend.map((p) => h("li", null,
    h("div", { class: "top" }, h("strong", null, naira(p.amount_kobo) + " from " + p.name), h("span", { class: "sub" }, fmtDate(p.payment_date))),
    h("div", { class: "sub" }, (p.reference ? "Ref " + p.reference + " · " : "") + (p.note || "")),
    p.duplicate_reference ? h("div", { class: "warn" }, "Another payment uses the same reference. Check the bank record.") : null,
    p.own ? h("div", { class: "warn" }, "This is your own payment. It will be marked as self-reviewed in the record.") : null,
    h("div", { class: "sub" }, "A screenshot is evidence, not proof. Check your bank record before approving."),
    h("div", { class: "actions" }, receiptButton(p.proof_path),
      h("button", { type: "button", class: "small", onclick: (e) => busy(e.target, async () => {
        if (!confirm("Approve " + naira(p.amount_kobo) + " from " + p.name + "?")) return;
        const r = await call("review_payment", { p_payment: p.id, p_approve: true, p_reason: null });
        await refresh(r.ok ? "Approved." : "That payment was already decided."); }) }, "Approve"),
      h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
        const why = ask("Reason for rejecting (the member will see this):"); if (!why) return;
        const r = await call("review_payment", { p_payment: p.id, p_approve: false, p_reason: why });
        await refresh(r.ok ? "Rejected." : "That payment was already decided."); }) }, "Reject")))), "Nothing waiting.");
  fill("dispute-list", disputes.map((d) => h("li", null, h("div", null, nameOf(d.membership_id) + ": " + d.message),
    h("div", { class: "actions" }, h("button", { type: "button", class: "secondary small", onclick: (e) => busy(e.target, async () => {
      const out = ask("Outcome to record:"); if (!out) return; await call("resolve_dispute", { p_dispute: d.id, p_resolution: out }); await refresh("Dispute resolved."); }) }, "Record outcome")))), "No open disputes.");
  fill("approved-list", approved.map((p) => h("li", null, h("div", { class: "top" }, h("strong", null, naira(p.amount_kobo) + " from " + nameOf(p.membership_id)), h("span", { class: "sub" }, fmtDate(p.payment_date))),
    h("div", { class: "actions" }, receiptButton(p.proof_path), h("button", { type: "button", class: "danger small", onclick: (e) => busy(e.target, async () => {
      const why = ask("Why is this approval being reversed? (kept in the record)"); if (!why) return;
      await call("reverse_payment", { p_payment: p.id, p_reason: why }); await refresh("Payment reversed."); }) }, "Reverse")))), "None yet.");
};

RENDER.reports = async function () {
  const [bal, audit] = await Promise.all([call("treasurer_summary", { p_hostel: S.hostel.id }),
    fetchRows(db.from("audit_events").select("*").eq("hostel_id", S.hostel.id).order("id", { ascending: false }).limit(40))]);
  fill("balance-list", bal.map((b) => h("li", null, h("div", { class: "top" }, h("strong", null, b.name + (b.status === "left" ? " (left)" : "")), h("span", { class: "badge" }, naira(b.total_outstanding_kobo))),
    h("div", { class: "sub" }, "This cycle " + naira(b.current_due_kobo) + " · arrears " + naira(b.arrears_kobo) + " · credit " + naira(b.credit_kobo) + " · pending " + naira(b.pending_kobo)))), "No members.");
  fill("audit-list", audit.map((a) => h("li", null, h("div", { class: "top" }, h("span", null, a.action.replace(/[._]/g, " ")), h("span", { class: "sub" }, fmtDateTime(a.created_at))),
    h("div", { class: "sub" }, ((S.byUser[a.actor_id] || {}).name || "Someone") + (a.reason ? " · " + a.reason : "")))), "No activity.");
};
$("btn-reconcile").addEventListener("click", (e) => busy(e.target, async () => {
  const r = await call("reconcile", { p_hostel: S.hostel.id }); const box = $("reconcile-box"); box.classList.remove("hidden");
  box.replaceChildren(h("p", { class: r.ok ? "" : "warn" }, r.ok ? "The books balance: every approved payment matches its allocations." : "Problems found:"),
    ...r.problems.map((p) => h("p", { class: "warn" }, p)),
    kv("Total owed (published cycles)", naira(r.obligated_kobo)), kv("Confirmed collected", naira(r.collected_kobo)), kv("Spent on electricity", naira(r.spent_kobo)));
}));
$("btn-export-image").addEventListener("click", (e) => busy(e.target, async () => {
  const [st, pw, bal, rec] = await Promise.all([call("hostel_status", { p_hostel: S.hostel.id }), call("electricity_summary", { p_hostel: S.hostel.id }),
    call("treasurer_summary", { p_hostel: S.hostel.id }), call("reconcile", { p_hostel: S.hostel.id })]);
  const today = todayLagos();
  const cy = st.cycle;
  const pct = cy && st.target_kobo > 0 ? Math.min(100, Math.round((st.collected_kobo / st.target_kobo) * 100)) : 0;
  const shortfall = pw.funds_balance_kobo < 0;
  const data = {
    hostel: S.hostel.name, asOf: fmtDate(today),
    cycle: cy ? { name: cy.name, range: fmtDate(cy.start_date) + " to " + fmtDate(cy.end_date), deadline: fmtDate(cy.deadline) } : null,
    collected: naira(st.collected_kobo || 0), target: naira(st.target_kobo || 0), pct,
    counts: cy ? [["Paid", st.paid_count, "ok"], ["Part-paid", st.part_count, "wait"], ["Unpaid", st.unpaid_count, st.unpaid_count ? "bad" : "ok"]] : [],
    extra: cy ? [["Still outstanding this cycle", naira(st.outstanding_kobo)], ["Payments waiting for approval", String(st.pending_count)]] : [["Payments waiting for approval", String(st.pending_count || 0)]],
    power: [
      ["Spent on electricity", naira(pw.purchases_total_kobo)],
      ["Units bought", pw.purchases_units + " kWh"],
      ["Collected from members, all time", naira(pw.collected_kobo)],
      [shortfall ? "Funding shortfall" : "Funds in hand", naira(Math.abs(pw.funds_balance_kobo)), shortfall ? "bad" : "ok"],
      ["Meter reading", pw.latest_units == null ? "No reading yet" : pw.latest_units + " kWh" + (pw.latest_at ? ", " + fmtDate(pw.latest_at) : "")],
      ["Estimated days left", pw.days_remaining == null ? "Not enough data" : pw.days_remaining + " days"],
    ],
    members: bal.filter((b) => b.status !== "left" || Number(b.total_outstanding_kobo) !== 0).map((b) => {
      const owes = Number(b.total_outstanding_kobo);
      const parts = [];
      if (Number(b.arrears_kobo) > 0) parts.push("arrears " + naira(b.arrears_kobo));
      if (Number(b.credit_kobo) > 0) parts.push("credit " + naira(b.credit_kobo));
      if (Number(b.pending_kobo) > 0) parts.push("pending " + naira(b.pending_kobo));
      return { name: b.name + (b.status === "left" ? " (left)" : ""), value: owes > 0 ? "Owes " + naira(owes) : "Paid up", tone: owes > 0 ? "bad" : "ok", sub: parts.join("  ·  ") };
    }),
    check: rec.ok ? { ok: true, text: "Books checked: every approved payment matches its allocations." }
      : { ok: false, text: "Books check found problems the treasurer is looking into.", lines: rec.problems },
    footnote: "Only payments the treasurer has approved are counted. Prepared by the treasurer from the Hostel Electricity app.",
    stamp: "Generated " + new Date().toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }),
  };
  const how = await Report.save(data, "hostel-report-" + today + ".png");
  if (how === "downloaded") showMessage("Report image saved to your downloads.", "ok");
}));
function csvCell(v, isNumber) {
  let s = v == null ? "" : String(v);
  if (!isNumber && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheet formulas (never on real numbers, which may be negative)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
$("btn-export").addEventListener("click", (e) => busy(e.target, async () => {
  const rows = await call("export_ledger", { p_hostel: S.hostel.id });
  const head = ["kind", "date", "member", "amount_naira", "status", "reference", "detail"];
  const lines = [head.join(",")].concat(rows.map((r) => [r.kind, r.occurred_on, r.member, (r.amount_kobo / 100).toFixed(2), r.status, r.reference, r.detail]
    .map((v, i) => csvCell(v, i === 3)).join(",")));
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = h("a", { href: url, download: "hostel-ledger-" + todayLagos() + ".csv" }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000); showMessage("Exported " + rows.length + " rows.", "ok");
}));

setAuthMode("signin");
loadApp().catch((err) => { console.error(err); showMessage("Could not reach the server. Check your connection and reload.", "error"); showView("view-auth"); });

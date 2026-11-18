let staff = [];
let now = new Date();
let mode = "generate";     // generate | import
let importData = null;
let jigunUsers = new Set();

const LEADERS = ["김지욱", "장효영"];

const WEEKDAY_NO_SHIFT = ["신민지", "남재현", "유다혜", "김유신", "박수정"];
const WEEKEND_OFFICE_ONLY = ["신민지", "유다혜", "박수정"];
const WEEKEND_OFFICE_OR_GY = ["남재현", "김유신"];
const SW_NO = ["신민지", "남재현", "유다혜", "김유신", "박수정"];
const isSwBanned = (n) => SW_NO.includes(n);
const FAMILY_DAY_EXCLUDE = ["신민지", "남재현", "유다혜", "김유신"];
const isFdExcluded = (n, it) => !!it.familyDay && FAMILY_DAY_EXCLUDE.includes(n);

const GY_BLOCK_ANCHOR = new Date(2026, 10, 15);
const GY_BLOCK_ORDER = ["김민송", "최서락", "서지현", "정의정", "김예빈", "이권재", "조이준", "전성민"];
const SINGLE_GY_ANCHOR = new Date(2026, 10, 14);
const SINGLE_GY_ORDER = ["서지현", "남재현", "김예빈", "조이준", "김유신", "정의정", "최서락", "김민송", "이권재"];

const WORK_OFFICE = "OFFICE";
const OFF_DAY = "휴무";
const GY_REST = "GY휴"; // 6일 GY 블록 종료 후 보장 휴무(내부 표식, 화면엔 '휴무'로 표시/재배정 불가)
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

const $ = (id) => document.getElementById(id);

function sod(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); return t; }
function daysBetween(a, b) { return Math.round((sod(b) - sod(a)) / 86400000); }
function fmtDate(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function isoDate(d) {
const p = (n) => String(n).padStart(2, "0");
return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function esc(s) {
const div = document.createElement("div");
div.textContent = s == null ? "" : String(s);
return div.innerHTML;
}
const mod = (a, n) => ((a % n) + n) % n;

let holidays = new Set();
let personRules = [];

function parseHolidays(text) {
const set = new Set();
const year = now.getFullYear();
(text || "").split(/[\n,，\s]+/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) set.add(tok);
else if (/^\d{1,2}\/\d{1,2}$/.test(tok)) {
const [m, dd] = tok.split("/").map(Number);
set.add(isoDate(new Date(year, m - 1, dd)));
}
});
return set;
}
function normRole(r) {
const u = String(r).toUpperCase();
if (u === "SW") return "SW";
if (u === "DAY") return "DAY";
if (u === "GY") return "GY";
if (r === "당번") return "당번";
return r;
}
function classifyRole(role) {
const s = String(role).trim();
let m = s.match(/^지정\s*:?\s*(SW|DAY|GY|당번)$/i)
|| s.match(/^(SW|DAY|GY|당번)\s*지정$/i)
|| s.match(/^[=!@]\s*(SW|DAY|GY|당번)$/i);
if (m) return { role: normRole(m[1]), assign: true };
const up = s.toUpperCase();
if (up === "SW" || up === "DAY") return { role: up, assign: true };
m = s.match(/^제외\s*:?\s*(SW|DAY)$/i)
|| s.match(/^x\s*(SW|DAY)$/i)
|| s.match(/^[~\-]\s*(SW|DAY)$/i);
if (m) return { role: m[1].toUpperCase(), assign: false };
return { role: s, assign: false };
}
function parsePersonRules(text) {
const rules = [];
(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
let name, targets, role;
if (line.includes("|")) {
const parts = line.split("|").map((s) => s.trim());
if (parts.length < 3) return;
name = parts[0];
targets = parts[1].split(",").map((s) => s.trim()).filter(Boolean);
role = parts[2].trim();
} else {
const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
if (parts.length < 3) return;
name = parts[0];
role = parts[parts.length - 1];
targets = parts.slice(1, parts.length - 1);
}
if (!(name && targets.length && role)) return;
const cls = classifyRole(role);
rules.push({ name, targets, role: cls.role, assign: cls.assign });
});
return rules;
}
function parseDateToken(tok, year) {
let m = tok.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
m = tok.match(/^(\d{1,2})\/(\d{1,2})$/);
if (m) return new Date(year, Number(m[1]) - 1, Number(m[2]));
return null;
}
function matchTarget(tok, date) {
tok = String(tok).trim();
const year = date.getFullYear();
const range = tok.split(/[~～]/);
if (range.length === 2) {
const a = parseDateToken(range[0].trim(), year);
const b = parseDateToken(range[1].trim(), year);
if (a && b) {
const t = sod(date).getTime();
const lo = Math.min(sod(a).getTime(), sod(b).getTime());
const hi = Math.max(sod(a).getTime(), sod(b).getTime());
return t >= lo && t <= hi;
}
}
const exact = parseDateToken(tok, year);
if (exact) return sod(exact).getTime() === sod(date).getTime();
const nth = tok.match(/^([1-5])([일월화수목금토])$/);
if (nth) {
return date.getDay() === WEEKDAY_INDEX[nth[2]] && Math.ceil(date.getDate() / 7) === Number(nth[1]);
}
if (WEEKDAY_INDEX[tok] !== undefined) return date.getDay() === WEEKDAY_INDEX[tok];
return false;
}
function isBlocked(name, role, date) {
for (const r of personRules) {
if (r.name !== name) continue;
if (r.assign) continue;
if (r.role !== "*" && r.role !== role) continue;
for (const t of r.targets) if (matchTarget(t, date)) return true;
}
return false;
}
function offCode(name, date) {
for (const r of personRules) {
if (r.name !== name) continue;
if (r.assign) continue;
if (r.role === "지휴") {
for (const t of r.targets) {
if (matchTarget(t, date)) return "지휴";
}
continue;
}
if (r.role !== "휴무" && r.role !== "연차") continue;
for (const t of r.targets) {
if (matchTarget(t, date)) {
const dow = date.getDay();
const weekendLike = dow === 0 || dow === 6 || holidays.has(isoDate(date));
return weekendLike ? "휴무" : "연차";
}
}
}
return null;
}

function blockOwner(sundayDate) {
const weeks = Math.round(daysBetween(GY_BLOCK_ANCHOR, sundayDate) / 7);
const pool = GY_BLOCK_ORDER.filter((n) => staff.includes(n));
if (!pool.length) return null;
return pool[mod(weeks, pool.length)];
}
function singleOwner(saturdayDate) {
const weeks = Math.round(daysBetween(SINGLE_GY_ANCHOR, saturdayDate) / 7);
const pool = SINGLE_GY_ORDER.filter((n) => staff.includes(n));
if (!pool.length) return null;
return pool[mod(weeks, pool.length)];
}

function generateMonth() {
if (staff.length === 0) throw new Error("직원 명단이 비어 있습니다.");
holidays = parseHolidays($("holidayInput") ? $("holidayInput").value : "");
personRules = parsePersonRules($("rulesInput") ? $("rulesInput").value : "");

const year = now.getFullYear(), month = now.getMonth();
const last = new Date(year, month + 1, 0).getDate();
const dates = [];
for (let dd = 1; dd <= last; dd++) dates.push(new Date(year, month, dd));

const familyDay = (() => {
const d21 = new Date(year, month, 21);
const monday = new Date(d21);
monday.setDate(d21.getDate() - ((d21.getDay() + 6) % 7));
const friday = new Date(monday);
friday.setDate(monday.getDate() + 4);
if (d21.getDay() === 1 && holidays.has(isoDate(d21))) {
friday.setDate(d21.getDate() - 3);
}
let guard = 0;
while (holidays.has(isoDate(friday)) && guard < 4) {
friday.setDate(friday.getDate() - 7);
guard++;
}
return friday;
})();
const familyDayKey = isoDate(familyDay);

const people = staff.map((name) => ({
name, leader: LEADERS.includes(name), roleCount: {}, shiftTotal: 0, lastShift: -99,
}));
const byName = {};
people.forEach((p) => { byName[p.name] = p; });

const shifts = {};
staff.forEach((n) => { shifts[n] = new Array(dates.length).fill(null); });

const place = (name, role, di) => {
const p = byName[name];
if (!p) return;
shifts[name][di] = role;
p.roleCount[role] = (p.roleCount[role] || 0) + 1;
p.shiftTotal += 1;
p.lastShift = di;
};

const info = [];
dates.forEach((date, di) => {
const dow = date.getDay();
const weekend = dow === 0 || dow === 6;
const hol = holidays.has(isoDate(date));
const fd = isoDate(date) === familyDayKey;               // 패밀리데이(월급일 주의 금요일)
const weekendLike = weekend || hol || fd;
let gy = null, gt = null;
if (dow === 0) { gy = blockOwner(date); gt = "block"; }                       // 일요일
else if (dow === 6) { gy = singleOwner(date); gt = "single"; }                // 토요일
else {                                                                        // 월~금: 평일 GY(공휴일 포함, 담당 블록이 이어짐)
const sun = new Date(date); sun.setDate(date.getDate() - dow);
gy = blockOwner(sun); gt = "block";
}
info.push({ date, di, dow, weekendLike, gy, gt, needsGy: false, familyDay: !!fd });
});

const singleGyThismonth = new Set();

const blockGyPeople = new Set();

info.forEach((it) => {
if (it.gy && !offCode(it.gy, it.date)) {
place(it.gy, "GY", it.di);
if (it.dow === 6) singleGyThismonth.add(it.gy);
else if (it.gt === "block") blockGyPeople.add(it.gy); // 일~금 연속 GY 블록 담당자
} else {
it.needsGy = true;
}
});

const forcedRoleSet = new Set();
info.forEach((it) => {
for (const r of personRules) {
if (!r.assign || !staff.includes(r.name)) continue;
if (!r.targets.some((t) => matchTarget(t, it.date))) continue;
if (shifts[r.name][it.di] != null) continue;
if (staff.some((n) => shifts[n][it.di] === r.role)) continue;
if (offCode(r.name, it.date)) continue;
place(r.name, r.role, it.di);
forcedRoleSet.add(it.di + ":" + r.role);
}
});

// 6일 GY 블록(일~금) 종료 후에는 다음 주말(토·일) 2일 휴무 보장 (개별근무제약 지정/휴무 등이 있으면 우선)
blockGyPeople.forEach((nm) => {
for (let di = 0; di < dates.length - 1; di++) {
if (shifts[nm][di] !== "GY" || info[di].gt !== "block") continue;
if (di + 1 < dates.length && shifts[nm][di + 1] === "GY" && info[di + 1].gt === "block") continue;
for (const offDi of [di + 1, di + 2]) {
if (offDi >= dates.length) break;
if (shifts[nm][offDi] != null) continue;
if (offCode(nm, dates[offDi])) continue;
shifts[nm][offDi] = GY_REST;
}
}
});

const groups = new Map();
info.forEach((it) => {
if (!it.weekendLike) return;
let key;
if (it.dow === 6) key = isoDate(it.date);
else if (it.dow === 0) { const s = new Date(it.date); s.setDate(s.getDate() - 1); key = isoDate(s); }
else key = isoDate(it.date);
if (!groups.has(key)) groups.set(key, []);
groups.get(key).push(it);
});
const order = [...groups.keys()].sort((a, b) => groups.get(a)[0].di - groups.get(b)[0].di);

const shiftStaff = staff.filter((n) => !LEADERS.includes(n));
const wdPool = shiftStaff.filter((n) => !WEEKDAY_NO_SHIFT.includes(n));
const swPool = shiftStaff.filter((n) => !WEEKEND_OFFICE_ONLY.includes(n) && !WEEKEND_OFFICE_OR_GY.includes(n));
const dayPool = shiftStaff.slice();
const gyPool = shiftStaff.filter((n) => GY_BLOCK_ORDER.includes(n) || WEEKEND_OFFICE_OR_GY.includes(n));

const blk = {};
shiftStaff.forEach((n) => { blk[n] = 0; });

const friSW = {};
shiftStaff.forEach((n) => { friSW[n] = 0; });

const secPenalty = (n, di) => (Math.abs(di - byName[n].lastShift) === 1 ? 1 : 0);

const hadSwPrev = (n, di) => di > 0 && shifts[n][di - 1] === "SW";

const restAfterPrevGy = (n, di) => di > 0 && shifts[n][di - 1] === "GY";

const weekdaySwInWeek = (n, di) => {
const t0 = sod(dates[di]).getTime();
const mon = t0 - ((dates[di].getDay() + 6) % 7) * 86400000;
let c = 0;
for (let k = 0; k < dates.length; k++) {
if (info[k].weekendLike || shifts[n][k] !== "SW") continue;
const tk = sod(dates[k]).getTime();
if (tk >= mon && tk < mon + 7 * 86400000) c++;
}
return c;
};
const swWeekOk = (n, di) => weekdaySwInWeek(n, di) < 2;

const pickGy = (date, used) => {
let cand = gyPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, "GY", date) && !offCode(n, date));
if (cand.length === 0) cand = dayPool.filter((n) => !used.has(n) && !isBlocked(n, "GY", date) && !offCode(n, date));
if (cand.length === 0) return null;
cand.sort((a, b) => ((byName[a].roleCount["GY"] || 0) - (byName[b].roleCount["GY"] || 0)) || (byName[a].shiftTotal - byName[b].shiftTotal));
return cand[0];
};

for (const key of order) {
const members = groups.get(key);
const full = members.length === 2;
const used = new Set();
members.forEach((it) => { if (it.gy && shifts[it.gy][it.di] === "GY") used.add(it.gy); });
members.forEach((it) => { staff.forEach((n) => { if (shifts[n][it.di] != null) used.add(n); }); });

for (const it of members) {
const roles = [];
if (it.needsGy) roles.push("GY");
roles.push("SW", "DAY");
for (const role of roles) {
if (staff.some((n) => shifts[n][it.di] === role)) continue;
const noSwNext = role === "DAY" ? (n) => !hadSwPrev(n, it.di) : () => true;
let pool = role === "GY" ? gyPool : role === "SW" ? swPool : dayPool;
let cand = pool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && noSwNext(n) && !(role === "SW" && isSwBanned(n)) && !isFdExcluded(n, it) && (role === "GY" || !restAfterPrevGy(n, it.di)));
if (cand.length === 0) {
cand = dayPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && !(role === "SW" && isSwBanned(n)) && !isFdExcluded(n, it) && (role === "GY" || !restAfterPrevGy(n, it.di)));
}
if (cand.length === 0) continue;
const isFriSW = role === "SW" && it.date.getDay() === 5;
const isSatSingle = role === "GY" && it.date.getDay() === 6;
cand.sort((a, b) => isSatSingle
? (((singleGyThismonth.has(a) ? 1 : 0) - (singleGyThismonth.has(b) ? 1 : 0)) || (blk[b] - blk[a]) || (byName[a].shiftTotal - byName[b].shiftTotal))
: (isFriSW
? ((friSW[a] - friSW[b]) || (blk[b] - blk[a]) || (byName[a].shiftTotal - byName[b].shiftTotal))
: ((blk[b] - blk[a]) || (byName[a].shiftTotal - byName[b].shiftTotal))));
const pick = cand[0];
used.add(pick);
place(pick, role, it.di);
if (isFriSW) friSW[pick] += 1;
if (isSatSingle) singleGyThismonth.add(pick);
}
}
if (full) {
for (const n of shiftStaff) if (!used.has(n)) blk[n] += 1;
}
}

for (const it of info) {
if (it.weekendLike) continue;
const used = new Set();
if (it.needsGy) {
const g = pickGy(it.date, used);
if (g) { used.add(g); place(g, "GY", it.di); }
} else if (it.gy) {
used.add(it.gy);
}
staff.forEach((n) => { if (shifts[n][it.di] != null) used.add(n); });
for (const role of ["당번", "SW"]) {
if (staff.some((n) => shifts[n][it.di] === role)) continue;
const noSwNext = role === "당번" ? (n) => !hadSwPrev(n, it.di) : () => true;
let cand = wdPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && noSwNext(n) && !(role === "SW" && isSwBanned(n)) && !restAfterPrevGy(n, it.di) && !(role === "SW" && !swWeekOk(n, it.di)));
if (cand.length === 0) cand = dayPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && !(role === "SW" && isSwBanned(n)) && !restAfterPrevGy(n, it.di) && !(role === "SW" && !swWeekOk(n, it.di)));
if (cand.length === 0 && role === "SW") cand = dayPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && !(role === "SW" && isSwBanned(n)) && !restAfterPrevGy(n, it.di)); // 배정 공백 방지 위해 주간 제한 완화(GY 휴식은 유지)
if (cand.length === 0) continue;
const isFriSW = role === "SW" && it.date.getDay() === 5;
cand.sort((a, b) => isFriSW
? ((friSW[a] - friSW[b]) || ((byName[a].roleCount[role] || 0) - (byName[b].roleCount[role] || 0)) || (byName[a].shiftTotal - byName[b].shiftTotal) || (secPenalty(a, it.di) - secPenalty(b, it.di)))
: (((byName[a].roleCount[role] || 0) - (byName[b].roleCount[role] || 0)) || (byName[a].shiftTotal - byName[b].shiftTotal) || (secPenalty(a, it.di) - secPenalty(b, it.di))));
const pick = cand[0];
used.add(pick);
place(pick, role, it.di);
if (isFriSW) friSW[pick] += 1;
}
}

staff.forEach((n) => {
for (let di = 0; di < dates.length; di++) {
if (shifts[n][di] === null) {
const oc = offCode(n, dates[di]);
if (oc) shifts[n][di] = oc;
else if (restAfterPrevGy(n, di)) shifts[n][di] = OFF_DAY;      // GY 다음날은 무조건 휴무
else if (info[di].familyDay) shifts[n][di] = "F/D";           // 패밀리데이: 휴무 대신 F/D
else shifts[n][di] = info[di].weekendLike ? OFF_DAY : WORK_OFFICE;
}
}
});

balanceRotation(shifts, dates, info, byName);

const blockCount = {};
staff.forEach((n) => { blockCount[n] = countBlocks(shifts[n]); });

function balanceRotation(shifts, dates, info, byName) {
const rotCount = (name) => {
let c = 0;
for (const r of ["DAY", "SW", "GY"]) c += byName[name].roleCount[r] || 0;
return c;
};
const target = (name) => (blockGyPeople.has(name) ? 10 : 6);
const dev = (name) => rotCount(name) - target(name); // 양수=목표 초과, 음수=미달
const holder = (di, role) => staff.find((n) => shifts[n][di] === role);
const apply = (di, role, owner, cand) => {
shifts[cand][di] = role;
shifts[owner][di] = info[di].weekendLike ? OFF_DAY : WORK_OFFICE;
byName[owner].roleCount[role] = (byName[owner].roleCount[role] || 1) - 1;
byName[cand].roleCount[role] = (byName[cand].roleCount[role] || 0) + 1;
};

let moved = true;
while (moved) {
moved = false;
for (let di = 0; di < dates.length && !moved; di++) {
for (const role of ["SW", "DAY"]) {
if (forcedRoleSet.has(di + ":" + role)) continue; // 강제 지정 슬롯 보호
if (role === "DAY" && !info[di].weekendLike) continue; // DAY는 주말·공휴일에만
const owner = holder(di, role);
if (!owner) continue;
if (LEADERS.includes(owner)) continue;

const candidates = shiftStaff.filter((n) =>
n !== owner
&& (shifts[n][di] === WORK_OFFICE || shifts[n][di] === OFF_DAY)
&& !isBlocked(n, role, dates[di])
&& !offCode(n, dates[di])
&& !isFdExcluded(n, info[di])
&& !(role === "SW" && isSwBanned(n)) // SW 제외 인원에게 SW 양도 금지
&& (role === "GY" || !restAfterPrevGy(n, di)) // GY 다음날 근무 금지(연속 GY 예외)
&& !(role === "SW" && !info[di].weekendLike && !swWeekOk(n, di)) // 평일 SW 주간 2회 제한
&& (role !== "DAY" || !(di > 0 && shifts[n][di - 1] === "SW")) // DAY를 받아도 전날 SW면 금지
&& (role !== "SW" || !(di + 1 < dates.length && (shifts[n][di + 1] === "DAY" || shifts[n][di + 1] === "당번"))) // SW 다음날 DAY/당번 금지
);
if (!candidates.length) continue;
const best = candidates.slice().sort((a, b) => dev(a) - dev(b))[0];
if (dev(owner) - dev(best) >= 2) { // 양도 후 목표 편차 합이 줄어드는 경우만
apply(di, role, owner, best);
moved = true;
break;
}
}
}
}

const canTake = (n, di, role) => {
if (LEADERS.includes(n)) return false;
if (isFdExcluded(n, info[di])) return false;
if (!(shifts[n][di] === WORK_OFFICE || shifts[n][di] === OFF_DAY)) return false;
if (isBlocked(n, role, dates[di])) return false;
if (offCode(n, dates[di])) return false;
if (role === "SW" && isSwBanned(n)) return false;
if (role !== "GY" && restAfterPrevGy(n, di)) return false; // GY 다음날 근무 금지(연속 GY 예외)
if (role === "SW" && !info[di].weekendLike && !swWeekOk(n, di)) return false; // 평일 SW 주간 2회 제한
if (role === "DAY" && di > 0 && shifts[n][di - 1] === "SW") return false;
if (role === "SW" && di + 1 < dates.length && (shifts[n][di + 1] === "DAY" || shifts[n][di + 1] === "당번")) return false;
return true;
};
const participants = shiftStaff.filter((n) => blockGyPeople.has(n));
const GOAL = 10;
for (let pass = 0; pass < 200 && participants.length; pass++) {
let changed = false;
for (const p of participants) {
const c = rotCount(p);
if (c === GOAL) continue;

if (c > GOAL) {
let mv = null;
for (let di = 0; di < dates.length && !mv; di++) {
for (const role of ["SW", "DAY"]) {
if (forcedRoleSet.has(di + ":" + role)) continue; // 강제 지정 슬롯 보호
if (shifts[p][di] !== role) continue;
if (role === "DAY" && !info[di].weekendLike) continue;
const recv = shiftStaff.filter((n) => n !== p && canTake(n, di, role));
if (!recv.length) continue;
recv.sort((a, b) => (blockGyPeople.has(a) - blockGyPeople.has(b)) || (rotCount(a) - rotCount(b)));
mv = { di, role, cand: recv[0] };
break;
}
}
if (mv) { apply(mv.di, mv.role, p, mv.cand); changed = true; }
} else {
let mv = null;
for (let di = 0; di < dates.length && !mv; di++) {
if (!(shifts[p][di] === WORK_OFFICE || shifts[p][di] === OFF_DAY)) continue;
const opts = [];
for (const role of ["SW", "DAY"]) {
if (forcedRoleSet.has(di + ":" + role)) continue; // 강제 지정 슬롯 보호
if (role === "DAY" && !info[di].weekendLike) continue;
if (!canTake(p, di, role)) continue;
const owner = holder(di, role);
if (!owner || owner === p || blockGyPeople.has(owner)) continue; // 비참여자에게서만
opts.push({ di, role, owner });
}
if (!opts.length) continue;
opts.sort((a, b) => rotCount(b.owner) - rotCount(a.owner)); // 가장 많이 일한 사람에게서 우선
mv = opts[0];
}
if (mv) { apply(mv.di, mv.role, mv.owner, p); changed = true; }
}
}
if (participants.every((p) => rotCount(p) === GOAL)) break;
if (!changed) break; // 더 이상 조정 불가
}
}

return { dates, info, shifts, people, blockCount, year, month, blockGyPeople };
}

function countBlocks(row) {
let cnt = 0, run = 0;
for (let i = 0; i < row.length; i++) {
if (row[i] === OFF_DAY || row[i] === GY_REST || row[i] === "연차" || row[i] === "F/D" || row[i] === "지휴") { run++; }
else { if (run >= 2) cnt++; run = 0; }
}
if (run >= 2) cnt++;
return cnt;
}

let lastResult = null;

function render() {
parseJigunInput();
const res = generateMonth();
lastResult = res;
mode = "generate";

const thead = $("scheduleTable").querySelector("thead");
const tbody = $("scheduleTable").querySelector("tbody");

let head = `<tr><th>직원</th>`;
res.dates.forEach((date) => {
head += `<th>${date.getDate()}<br><small>${WEEKDAYS[date.getDay()]}</small></th>`;
});
head += `<th>연속휴무</th></tr>`;
thead.innerHTML = head;

let body = "";
const counts = {};
for (const p of res.people) {
const badge = p.leader ? ' <span class="badge-leader">리더</span>' : "";
body += `<tr><td class="shift-name">${esc(p.name)}${badge}</td>`;
const row = res.shifts[p.name];
counts[p.name] = counts[p.name] || {};
for (let di = 0; di < res.dates.length; di++) {
const s = row[di];
const lab = displayShift(p.name, s, di, res.info);
counts[p.name][lab] = (counts[p.name][lab] || 0) + 1;
body += shiftCell(lab, shortLabel(lab));
}
body += `<td>${p.leader ? "-" : res.blockCount[p.name]}</td></tr>`;
}
tbody.innerHTML = body;

renderSummary(counts, res);
$("weekTitle").textContent =
`${res.year}년 ${res.month + 1}월 근무표  ·  GY(일~금) 순환 · 1일 GY(토) 순환`;
$("resultPanel").hidden = false;
}

function baseRole(label) {
if (label === "DAY" || label === "SW" || label === "GY") return label;
return (label === "지D" || label === "특D") ? "DAY" : (label === "지S" || label === "특S") ? "SW" : (label === "지G" || label === "특G") ? "GY" : null;
}
function displayShift(name, code, di, info) {
if (code === GY_REST) return OFF_DAY;
if ((code === "DAY" || code === "SW" || code === "GY") && info[di].weekendLike) {
return (jigunUsers.has(name) ? "지" : "특") + { "DAY": "D", "SW": "S", "GY": "G" }[code];
}
return code;
}
function shortLabel(code) {
switch (code) {
case "당번": return "당번";
case "SW": return "SW";
case "GY": return "GY";
case "DAY": return "DAY";
case "연차": return "연차";
case "OFFICE": return "O";
case "휴무": case "휴": case "": return "휴";
default: return code;
}
}
function codeClass(code) {
switch (code) {
case "당번": return "cell-dang";
case "SW": case "지S": case "특S": return "cell-sw";
case "GY": case "지G": case "특G": return "cell-gy";
case "DAY": case "지D": case "특D": return "cell-day";
case "연차": case "지휴": return "cell-leave";
case "F/D": return "cell-fd";
case "OFFICE": return "cell-office";
case "휴무": case "휴": case "": return "cell-off";
default: return "cell-other";
}
}
function shiftCell(code, label) {
return `<td class="sched ${codeClass(code)}"><div class="cell-label">${esc(label)}</div></td>`;
}

function renderSummary(counts, res) {
const thead = $("summaryTable").querySelector("thead");
const tbody = $("summaryTable").querySelector("tbody");
const codes = [WORK_OFFICE, "당번", "DAY", "SW", "GY", "지D", "지S", "지G", "특D", "특S", "특G", "지휴", OFF_DAY, "연차", "F/D"];

let head = "<tr><th>직원</th>";
codes.forEach((c) => { head += `<th class="cell-label">${esc(c)}</th>`; });
head += "<th>당번제외<br>(DAY+SW+GY)</th><th>금요일 SW</th><th>2일+ 연속휴무</th></tr>";
thead.innerHTML = head;

const friCnt = {};
for (const p of res.people) {
let c = 0;
for (let di = 0; di < res.dates.length; di++) {
if (res.dates[di].getDay() === 5 && baseRole(displayShift(p.name, res.shifts[p.name][di], di, res.info)) === "SW") c++;
}
friCnt[p.name] = c;
}
const rotSum = {};
for (const p of res.people) {
const row = res.shifts[p.name];
let r = 0;
for (let di = 0; di < res.dates.length; di++) {
if (baseRole(displayShift(p.name, row[di], di, res.info))) r++;
}
rotSum[p.name] = r;
}

const shiftStaff = staff.filter((n) => !LEADERS.includes(n));
const distVals = shiftStaff.map((n) => res.blockCount[n]);
const friVals = shiftStaff.map((n) => friCnt[n]);
let distText = "";
if (distVals.length) {
const min = Math.min(...distVals), max = Math.max(...distVals);
const tally = {};
distVals.forEach((v) => { tally[v] = (tally[v] || 0) + 1; });
const parts = Object.keys(tally).sort((a, b) => a - b).map((v) => `${v}회 ${tally[v]}명`);
const fmin = Math.min(...friVals), fmax = Math.max(...friVals);
distText = `SHIFT 근무자 2일+ 연속휴무(주말·연차 포함): ${parts.join(" / ")}` +
(min === max ? " (완전 동일)" : " (최소 편차)") +
`  ·  금요일 SW: 최대 ${fmax}회` + (fmin === fmax ? " (동일)" : ` (최소 ${fmin}~최대 ${fmax})`);
const blockGy = res.blockGyPeople || new Set();
const fmtDist = (names) => {
if (!names.length) return "없음";
const tally = {};
names.forEach((n) => { const v = rotSum[n]; tally[v] = (tally[v] || 0) + 1; });
return Object.keys(tally).sort((a, b) => a - b).map((v) => `${v}회 ${tally[v]}명`).join(" / ");
};
const blockNames = shiftStaff.filter((n) => blockGy.has(n));
const restNames = shiftStaff.filter((n) => !blockGy.has(n));
const brng = blockNames.length ? `${Math.min(...blockNames.map((n) => rotSum[n]))}~${Math.max(...blockNames.map((n) => rotSum[n]))}` : "";
const rrng = restNames.length ? `${Math.min(...restNames.map((n) => rotSum[n]))}~${Math.max(...restNames.map((n) => rotSum[n]))}` : "";
distText += `  ·  당번제외(DAY+SW+GY) [6일GY ${brng ? brng + " / 고정10" : ""}]: ${fmtDist(blockNames)}`
+ `  ·  [그 외 / 목표6]: ${rrng} ${fmtDist(restNames)}`;
}

let body = "";
for (const p of res.people) {
const c = counts[p.name] || {};
let row = `<tr><td class="shift-name">${esc(p.name)}</td>`;
codes.forEach((code) => { row += `<td>${c[code] || 0}</td>`; });
row += `<td>${p.leader ? "-" : `<b>${rotSum[p.name]}</b>`}</td>`;
row += `<td>${p.leader ? "-" : friCnt[p.name]}</td>`;
row += `<td>${p.leader ? "-" : `<b>${res.blockCount[p.name]}</b>`}</td></tr>`;
body += row;
}
tbody.innerHTML = body;

let note = $("distNote");
if (!note) {
note = document.createElement("p");
note.id = "distNote";
note.className = "dist-note";
$("summaryTable").parentElement.appendChild(note);
}
note.textContent = distText;
}

function parseImportedTable(text) {
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
if (lines.length < 2) throw new Error("붙여넣은 데이터가 형식에 맞지 않습니다.");
const split = (l) => l.split("\t").map((s) => s.trim());
let dateRowIdx = -1, weekdayRowIdx = -1;
for (let i = 0; i < Math.min(lines.length, 3); i++) {
if (/[0-9]{1,2}\/[0-9]{1,2}/.test(lines[i])) { dateRowIdx = i; break; }
}
if (dateRowIdx === -1) throw new Error("날짜 행(예: 11/1)을 찾지 못했습니다.");
for (let i = 0; i < Math.min(lines.length, 4); i++) {
if (i === dateRowIdx) continue;
if (/[월화수목금토일]/.test(lines[i])) { weekdayRowIdx = i; break; }
}
const dateRow = split(lines[dateRowIdx]);
let dateStart = -1;
for (let i = 0; i < dateRow.length; i++) {
if (/[0-9]{1,2}\/[0-9]{1,2}/.test(dateRow[i])) { dateStart = i; break; }
}
if (dateStart === -1) throw new Error("날짜를 찾지 못했습니다.");
const dateCells = dateRow.slice(dateStart);
let weekCells = null;
if (weekdayRowIdx >= 0) {
const wr = split(lines[weekdayRowIdx]);
const wStart = wr.findIndex((c) => /^[월화수목금토일]$/.test(c));
if (wStart >= 0) {
weekCells = [];
for (let i = 0; i < dateCells.length; i++) weekCells.push(wStart + i < wr.length ? wr[wStart + i] : "");
}
}
const dataStart = Math.max(dateRowIdx, weekdayRowIdx) + 1;
const rows = [];
for (let i = dataStart; i < lines.length; i++) {
const cells = split(lines[i]);
const info = [];
let k = 0;
while (info.length < Math.min(3, dateStart) && k < dateStart) { info.push(cells[k] !== undefined ? cells[k] : ""); k++; }
const type = info[0] || "", name = info[1] || "", part = info[2] || "";
if (!name) continue;
let dayCells = [];
for (let j = dateStart; j < cells.length; j++) dayCells.push(cells[j] !== undefined ? cells[j] : "");
while (dayCells.length < dateCells.length) dayCells.push("");
dayCells.length = dateCells.length;
rows.push({ type, name, part, dayCells });
}
if (!rows.length) throw new Error("직원 데이터를 찾지 못했습니다.");
return { dateCells, weekCells, monthLabel: dateCells[0].split("/")[0] + "월", rows };
}

function renderImported() {
mode = "import";
const thead = $("scheduleTable").querySelector("thead");
const tbody = $("scheduleTable").querySelector("tbody");
let head = `<tr><th>근무</th><th>이름</th><th>파트</th>`;
for (let i = 0; i < importData.dateCells.length; i++) {
const w = importData.weekCells && importData.weekCells[i] ? importData.weekCells[i] : "";
head += `<th>${importData.dateCells[i]}<br><small>${esc(w)}</small></th>`;
}
head += "<th>근무일수</th></tr>";
thead.innerHTML = head;

let body = "";
const allCodes = new Set();
const counts = {};
for (const row of importData.rows) {
body += `<tr><td class="shift-name">${esc(row.type)}</td><td class="shift-name">${esc(row.name)}</td><td>${esc(row.part)}</td>`;
counts[row.name] = counts[row.name] || {};
let total = 0;
for (const c of row.dayCells) {
const code = c === "" ? "휴" : c;
if (code !== "휴" && code !== "") total += 1;
counts[row.name][code] = (counts[row.name][code] || 0) + 1;
allCodes.add(code);
body += shiftCell(code, code);
}
body += `<td><b>${total}</b></td></tr>`;
}
tbody.innerHTML = body;
renderImportSummary(counts, ["휴", ...Array.from(allCodes).filter((c) => c !== "휴")]);
$("weekTitle").textContent = `${importData.monthLabel} 근무표 (불러옴)`;
$("resultPanel").hidden = false;
}

function renderImportSummary(counts, codeList) {
const thead = $("summaryTable").querySelector("thead");
const tbody = $("summaryTable").querySelector("tbody");
let head = "<tr><th>직원</th>";
codeList.forEach((c) => { head += `<th class="cell-label">${esc(c)}</th>`; });
head += "</tr>";
thead.innerHTML = head;
let body = "";
for (const name of Object.keys(counts)) {
const c = counts[name] || {};
let row = `<tr><td class="shift-name">${esc(name)}</td>`;
codeList.forEach((code) => { row += `<td>${c[code] || 0}</td>`; });
row += "</tr>";
body += row;
}
tbody.innerHTML = body;
const note = $("distNote"); if (note) note.textContent = "";
}

function exportCSV() {
let rows = [], fileName = "";
if (mode === "import" && importData) {
rows.push(["근무", "이름", "파트", ...importData.dateCells]);
for (const r of importData.rows) rows.push([r.type, r.name, r.part, ...r.dayCells]);
fileName = `근무표_${importData.monthLabel}.csv`;
} else {
if (!lastResult) lastResult = generateMonth();
const res = lastResult;
parseJigunInput();
const head = ["직원", ...res.dates.map((d) => `${d.getDate()}(${WEEKDAYS[d.getDay()]})`), "2일+연속휴무"];
rows.push(head);
for (const p of res.people) {
rows.push([p.name, ...res.shifts[p.name].map((s, di) => displayShift(p.name, s, di, res.info)), p.leader ? "" : res.blockCount[p.name]]);
}
fileName = `근무표_${res.year}-${String(res.month + 1).padStart(2, "0")}.csv`;
}
const csv = rows.map((r) => r.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = fileName;
a.click();
URL.revokeObjectURL(a.href);
}

function parseStaffInput(text) {
return text.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);
}
function parseJigunInput() {
const el = $("jigunInput");
jigunUsers = new Set(el ? parseStaffInput(el.value) : []);
}
function showError(msg) {
const el = $("errorBox");
if (el) {
el.hidden = false;
el.textContent = "⚠ 오류: " + msg + "\n\n(이 문구를 그대로 복사해서 알려주세요.)";
} else {
alert(msg);
}
}
function clearError() {
const el = $("errorBox");
if (el) { el.hidden = true; el.textContent = ""; }
}
function safeGenerate() {
try { clearError(); render(); }
catch (e) { showError(e && e.message ? e.message + (e.stack ? "\n\n" + e.stack : "") : String(e)); }
}
function safeImport() {
try {
clearError();
importData = parseImportedTable($("importInput").value);
renderImported();
} catch (e) {
showError("불러오기: " + (e && e.message ? e.message : String(e)) + (e && e.stack ? "\n\n" + e.stack : ""));
}
}

$("generateBtn").addEventListener("click", () => {
staff = parseStaffInput($("staffInput").value);
safeGenerate();
});
$("importToggle").addEventListener("click", () => {
const body = $("importBody");
body.hidden = !body.hidden;
$("importToggle").textContent = body.hidden ? "데이터 붙여넣기로 불러오기 (기존 근무표)" : "닫기";
});
$("importBtn").addEventListener("click", safeImport);
$("prevWeekBtn").addEventListener("click", () => { now = new Date(now.getFullYear(), now.getMonth() - 1, 1); safeGenerate(); });
$("nextWeekBtn").addEventListener("click", () => { now = new Date(now.getFullYear(), now.getMonth() + 1, 1); safeGenerate(); });
$("exportBtn").addEventListener("click", exportCSV);

window.addEventListener("error", (e) => {
showError("스크립트 오류: " + (e.message || "알 수 없음") + (e.filename ? `\n@ ${e.filename}:${e.lineno}:${e.colno}` : ""));
});
window.addEventListener("unhandledrejection", (e) => {
const r = e.reason;
showError("처리되지 않은 오류: " + (r && r.message ? r.message : String(r)));
});

(function init() {
try {
$("staffInput").value = [
"김지욱", "장효영", "신민지", "남재현", "유다혜",
"김유신", "최서락", "이권재", "김민송", "서지현",
"정의정", "김예빈", "조이준", "박수정", "전성민",
].join("\n");

$("holidayInput").value = [
"2026-01-01", "2026-03-01", "2026-05-05", "2026-06-06",
"2026-08-15", "2026-10-03", "2026-10-09", "2026-12-25",
].join("\n");

$("rulesInput").value = [
"정의정,화,목,제외SW",
"서지현,3토,제외SW",
].join("\n");

const RULES_KEY = "schedule_personRules";
try {
const saved = localStorage.getItem(RULES_KEY);
if (saved !== null) $("rulesInput").value = saved;
} catch (e) { /* 무시 */ }
const saveRules = () => { try { localStorage.setItem(RULES_KEY, $("rulesInput").value); } catch (e) { /* ignore */ } };
$("rulesInput").addEventListener("input", saveRules);
$("rulesInput").addEventListener("change", saveRules);
$("rulesInput").addEventListener("blur", saveRules);

if ($("jigunInput")) {
const JIGUN_KEY = "schedule_jigunUsers";
try {
const savedJ = localStorage.getItem(JIGUN_KEY);
if (savedJ !== null) $("jigunInput").value = savedJ;
} catch (e) { /* 무시 */ }
const saveJigun = () => { try { localStorage.setItem(JIGUN_KEY, $("jigunInput").value); } catch (e) { /* ignore */ } };
$("jigunInput").addEventListener("input", saveJigun);
$("jigunInput").addEventListener("change", saveJigun);
$("jigunInput").addEventListener("blur", saveJigun);
}
parseJigunInput();

now = new Date(2026, 11, 1);
now = (function () {
var t = new Date();
var lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
if (t.getDate() === lastDay) {
return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
return now;
})();
$("startDate").value = isoDate(now);
$("startDate").addEventListener("change", (e) => {
if (e.target.value) { now = new Date(e.target.value + "T00:00:00"); safeGenerate(); }
});
} catch (e) {
showError("초기화 오류: " + (e && e.message ? e.message + (e.stack ? "\n\n" + e.stack : "") : String(e)));
}
})();

const ACCESS_PASSWORD = "MEOL123!";
(function loginGate() {
const overlay = document.getElementById("lockOverlay");
const input = document.getElementById("lockPw");
const btn = document.getElementById("lockBtn");
const msg = document.getElementById("lockMsg");
if (!overlay || !input || !btn) return;
let unlocked = false;
const attempt = () => {
if (input.value === ACCESS_PASSWORD) {
unlocked = true;
overlay.remove();                      // 잠금 화면 제거 (앱은 이미 초기화됨)
document.body.style.overflow = "";     // 스크롤 잠금 해제
} else {
if (msg) msg.hidden = false;
input.value = "";
input.focus();
}
};
btn.addEventListener("click", attempt);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
input.focus();
document.body.style.overflow = "hidden";
})();
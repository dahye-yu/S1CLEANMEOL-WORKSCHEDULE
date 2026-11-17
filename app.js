// ===== 상태 =====
let staff = [];
let now = new Date();
let mode = "generate";     // generate | import
let importData = null;

const LEADERS = ["김지욱", "장효영"];

// 평일 SHIFT 제외(주말만 SHIFT 가능)
const WEEKDAY_NO_SHIFT = ["신민지", "남재현", "유다혜", "김유신", "박수정"];
// 주말 DAY/OFFICE 슬롯만 가능
const WEEKEND_OFFICE_ONLY = ["신민지", "유다혜", "박수정"];
// 주말 DAY/OFFICE 또는 하루짜리 GY 가능
const WEEKEND_OFFICE_OR_GY = ["남재현", "김유신"];
// SW 근무 전면 제외 (평일·주말·균형화 포함)
const SW_NO = ["신민지", "남재현", "유다혜", "김유신", "박수정"];
const isSwBanned = (n) => SW_NO.includes(n);

// ===== 고정 회전 (앵커 기준) =====
// 6일 연속 GY (일~금): 2026-11-15(일) 김민송 시작
const GY_BLOCK_ANCHOR = new Date(2026, 10, 15);
const GY_BLOCK_ORDER = ["김민송", "최서락", "서지현", "정의정", "김예빈", "이권재", "조이준", "전성민"];
// 하루짜리 GY (토): 2026-11-14(토) 서지현 시작
const SINGLE_GY_ANCHOR = new Date(2026, 10, 14);
const SINGLE_GY_ORDER = ["서지현", "남재현", "김예빈", "조이준", "김유신", "정의정", "최서락", "김민송", "이권재"];

const WORK_OFFICE = "OFFICE";
const OFF_DAY = "휴무";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_INDEX = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

const $ = (id) => document.getElementById(id);

// ===== 날짜 유틸 =====
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

// ===== 공휴일 / 개별 제약 =====
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
function parsePersonRules(text) {
  const rules = [];
  (text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 3) return;
    const name = parts[0];
    const targets = parts[1].split(",").map((s) => s.trim()).filter(Boolean);
    const role = parts[2].trim();
    if (name && targets.length && role) rules.push({ name, targets, role });
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
  // 기간: A~B (예: 12/28~12/31, 2026-12-28~2026-12-31)
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
    if (r.role !== "*" && r.role !== role) continue;
    for (const t of r.targets) if (matchTarget(t, date)) return true;
  }
  return false;
}
// 해당 날짜에 휴무/연차 지정이 있으면 코드를 반환
// 규칙: 평일(근무일)=연차, 주말·공휴일=휴무
function offCode(name, date) {
  for (const r of personRules) {
    if (r.name !== name) continue;
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

// ===== 회전 담당자 계산 =====
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

// ================================================================
//  월 단위 자동 생성
// ================================================================
function generateMonth() {
  if (staff.length === 0) throw new Error("직원 명단이 비어 있습니다.");
  holidays = parseHolidays($("holidayInput") ? $("holidayInput").value : "");
  personRules = parsePersonRules($("rulesInput") ? $("rulesInput").value : "");

  const year = now.getFullYear(), month = now.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  const dates = [];
  for (let dd = 1; dd <= last; dd++) dates.push(new Date(year, month, dd));

  // 패밀리데이: 21일(월급일)이 속한 주(월~일)의 금요일.
  //  단, ① 21일이 월요일이면서 공휴일이면 그 직전 금요일,
  //  ② 선정된 금요일이 공휴일이면 직전주의 금요일로 이동.
  const familyDay = (() => {
    const d21 = new Date(year, month, 21);
    // 기본: 21일이 속한 주(월~일)의 금요일
    const monday = new Date(d21);
    monday.setDate(d21.getDate() - ((d21.getDay() + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    // ① 21일이 월요일 & 공휴일 -> 그 직전 금요일
    if (d21.getDay() === 1 && holidays.has(isoDate(d21))) {
      friday.setDate(d21.getDate() - 3);
    }
    // ② 선정된 금요일이 공휴일이면 직전주 금요일로 이동
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

  // 1) 날짜 정보 + 고정 GY
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

  // 하루짜리(토요일) GY: 한 달에 같은 사람이 두 번 들어가지 않도록 추적
  const singleGyThismonth = new Set();

  // 6일짜리 GY 블록을 실제로 도는 인원 (해당월 DAY+SW+GY 목표 10)
  const blockGyPeople = new Set();

  // 1-1) 고정 GY 배정 (해당자가 휴무/연차면 그날은 대체 GY 필요)
  info.forEach((it) => {
    if (it.gy && !offCode(it.gy, it.date)) {
      place(it.gy, "GY", it.di);
      if (it.dow === 6) singleGyThismonth.add(it.gy);
      else if (it.gt === "block") blockGyPeople.add(it.gy); // 일~금 연속 GY 블록 담당자
    } else {
      it.needsGy = true;
    }
  });

  // 2) 주말/공휴일 그룹(토~일) 구성
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

  // 후보 풀 (SHIFT 근무자 = 리더 제외)
  const shiftStaff = staff.filter((n) => !LEADERS.includes(n));
  const wdPool = shiftStaff.filter((n) => !WEEKDAY_NO_SHIFT.includes(n));
  const swPool = shiftStaff.filter((n) => !WEEKEND_OFFICE_ONLY.includes(n) && !WEEKEND_OFFICE_OR_GY.includes(n));
  const dayPool = shiftStaff.slice();
  const gyPool = shiftStaff.filter((n) => GY_BLOCK_ORDER.includes(n) || WEEKEND_OFFICE_OR_GY.includes(n));

  // 블록(2일+ 연속 휴무) 추정치
  const blk = {};
  shiftStaff.forEach((n) => { blk[n] = 0; });

  // 금요일 SW 분산 카운터 (기피 근무)
  const friSW = {};
  shiftStaff.forEach((n) => { friSW[n] = 0; });

  const secPenalty = (n, di) => (Math.abs(di - byName[n].lastShift) === 1 ? 1 : 0);

  // 규칙: SW 근무한 사람은 다음날 당번/DAY로 배정하지 않음
  const hadSwPrev = (n, di) => di > 0 && shifts[n][di - 1] === "SW";

  // 대체 GY 선택 (휴무/연차·이미 배정된 인원 제외, GY 적게 한 사람 우선)
  const pickGy = (date, used) => {
    let cand = gyPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, "GY", date) && !offCode(n, date));
    if (cand.length === 0) cand = dayPool.filter((n) => !used.has(n) && !isBlocked(n, "GY", date) && !offCode(n, date));
    if (cand.length === 0) return null;
    cand.sort((a, b) => ((byName[a].roleCount["GY"] || 0) - (byName[b].roleCount["GY"] || 0)) || (byName[a].shiftTotal - byName[b].shiftTotal));
    return cand[0];
  };

  // 3) 주말 그룹별 유연 배정 (SW/DAY, 공휴일 GY)
  //    블록이 많은 사람을 우선 근무시켜 추가 블록을 막아 균형화
  for (const key of order) {
    const members = groups.get(key);
    const full = members.length === 2;
    const used = new Set();
    members.forEach((it) => { if (it.gy && shifts[it.gy][it.di] === "GY") used.add(it.gy); });

    for (const it of members) {
      const roles = [];
      if (it.needsGy) roles.push("GY");
      roles.push("SW", "DAY");
      for (const role of roles) {
        // SW 다음날 당번/DAY 배정 금지 (주말 DAY)
        const noSwNext = role === "DAY" ? (n) => !hadSwPrev(n, it.di) : () => true;
        let pool = role === "GY" ? gyPool : role === "SW" ? swPool : dayPool;
        let cand = pool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && noSwNext(n) && !(role === "SW" && isSwBanned(n)));
        if (cand.length === 0) {
          cand = dayPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && !(role === "SW" && isSwBanned(n)));
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

  // 4) 평일: 대체 GY + 당번/SW
  for (const it of info) {
    if (it.weekendLike) continue;
    const used = new Set();
    if (it.needsGy) {
      const g = pickGy(it.date, used);
      if (g) { used.add(g); place(g, "GY", it.di); }
    } else if (it.gy) {
      used.add(it.gy);
    }
    for (const role of ["당번", "SW"]) {
      // SW 다음날 당번 배정 금지
      const noSwNext = role === "당번" ? (n) => !hadSwPrev(n, it.di) : () => true;
      let cand = wdPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && noSwNext(n) && !(role === "SW" && isSwBanned(n)));
      if (cand.length === 0) cand = dayPool.filter((n) => !used.has(n) && !byName[n].leader && !isBlocked(n, role, it.date) && !offCode(n, it.date) && !(role === "SW" && isSwBanned(n)));
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

  // 5) 나머지 기본값 (휴무/연차 지정일 우선)
  staff.forEach((n) => {
    for (let di = 0; di < dates.length; di++) {
      if (shifts[n][di] === null) {
        const oc = offCode(n, dates[di]);
        if (oc) shifts[n][di] = oc;
        else if (info[di].familyDay) shifts[n][di] = "F/D";           // 패밀리데이: 휴무 대신 F/D
        else shifts[n][di] = info[di].weekendLike ? OFF_DAY : WORK_OFFICE;
      }
    }
  });

  // 5.5) 균형화: 당번 제외 DAY/SW/GY 합계를 가능한 한 6~10에 맞춤
  balanceRotation(shifts, dates, info, byName);

  // 6) 2일+ 연속 휴무 실제 집계
  const blockCount = {};
  staff.forEach((n) => { blockCount[n] = countBlocks(shifts[n]); });

  // ================================================================
  //  균형화 헬퍼 (당번 제외 DAY/SW/GY 합계 목표: 가능한 한 6~10)
  //   - 10 초과 인원의 SW·DAY를 낮은 인원에게 양도 (최대치 축소)
  //   - 가장 적게 근무한 인원을 우선 채워 낮은 값(→~6)을 끌어올림
  //   - 1일 1명 원칙을 지키며 같은 날짜 안에서 SW/DAY 소유권만 스왑
  // ================================================================
  function balanceRotation(shifts, dates, info, byName) {
    const rotCount = (name) => {
      let c = 0;
      for (const r of ["DAY", "SW", "GY"]) c += byName[name].roleCount[r] || 0;
      return c;
    };
    // 목표: 6일 GY 블록 참여자 10, 그 외 SHIFT원 6
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
          if (role === "DAY" && !info[di].weekendLike) continue; // DAY는 주말·공휴일에만
          const owner = holder(di, role);
          if (!owner) continue;
          if (LEADERS.includes(owner)) continue;

          // 그날 해당 역할 자리가 비어있고(휴무/OFFICE) 차지 가능한 후보
          // 부수 제약: SW 다음날 당번/DAY 금지 규칙을 지키면서 스왑
          const candidates = shiftStaff.filter((n) =>
            n !== owner
            && (shifts[n][di] === WORK_OFFICE || shifts[n][di] === OFF_DAY)
            && !isBlocked(n, role, dates[di])
            && !offCode(n, dates[di])
            && !(role === "SW" && isSwBanned(n)) // SW 제외 인원에게 SW 양도 금지
            && (role !== "DAY" || !(di > 0 && shifts[n][di - 1] === "SW")) // DAY를 받아도 전날 SW면 금지
            && (role !== "SW" || !(di + 1 < dates.length && (shifts[n][di + 1] === "DAY" || shifts[n][di + 1] === "당번"))) // SW 다음날 DAY/당번 금지
          );
          if (!candidates.length) continue;
          // 목표에서 가장 많이 미달된 인원에게 양도
          const best = candidates.slice().sort((a, b) => dev(a) - dev(b))[0];
          if (dev(owner) - dev(best) >= 2) { // 양도 후 목표 편차 합이 줄어드는 경우만
            apply(di, role, owner, best);
            moved = true;
            break;
          }
        }
      }
    }

    // === 6일 GY 참여자는 무조건 정확히 10으로 강제 보정 ===
    //   - 10 미만: p가 쉬는 날의 SW/DAY 슬롯을 다른 사람에게서 가져와 채움
    //   - 10 초과: p의 SW/DAY 슬롯을 다른 사람에게 넘김
    const canTake = (n, di, role) => {
      if (LEADERS.includes(n)) return false;
      if (!(shifts[n][di] === WORK_OFFICE || shifts[n][di] === OFF_DAY)) return false;
      if (isBlocked(n, role, dates[di])) return false;
      if (offCode(n, dates[di])) return false;
      if (role === "SW" && isSwBanned(n)) return false;
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
          // 초과분을 다른 인원(비참여자 우선, 적게 일한 사람)에게 양도
          let mv = null;
          for (let di = 0; di < dates.length && !mv; di++) {
            for (const role of ["SW", "DAY"]) {
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
          // 미달분을 p가 쉬는 날의 SW/DAY 슬롯을 가져와 채움
          //   비참여자에게서만 가져옴 → 참여자끼리 슬롯을 주고받는 진동(무한 반복) 방지
          let mv = null;
          for (let di = 0; di < dates.length && !mv; di++) {
            if (!(shifts[p][di] === WORK_OFFICE || shifts[p][di] === OFF_DAY)) continue;
            const opts = [];
            for (const role of ["SW", "DAY"]) {
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

// 2일 이상 연속 휴무(주말·연차 포함) 횟수
function countBlocks(row) {
  let cnt = 0, run = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === OFF_DAY || row[i] === "연차" || row[i] === "F/D") { run++; }
    else { if (run >= 2) cnt++; run = 0; }
  }
  if (run >= 2) cnt++;
  return cnt;
}

// ================================================================
//  렌더링 (월 단위)
// ================================================================
let lastResult = null;

function render() {
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
      counts[p.name][s] = (counts[p.name][s] || 0) + 1;
      body += shiftCell(s, shortLabel(s));
    }
    body += `<td>${p.leader ? "-" : res.blockCount[p.name]}</td></tr>`;
  }
  tbody.innerHTML = body;

  renderSummary(counts, res);
  $("weekTitle").textContent =
    `${res.year}년 ${res.month + 1}월 근무표  ·  GY(일~금) 순환 · 1일 GY(토) 순환`;
  $("resultPanel").hidden = false;
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
    case "SW": return "cell-sw";
    case "GY": return "cell-gy";
    case "DAY": return "cell-day";
    case "연차": return "cell-leave";
    case "F/D": return "cell-fd";
    case "OFFICE": return "cell-office";
    case "휴무": case "휴": case "": return "cell-off";
    default: return "cell-other";
  }
}
function shiftCell(code, label) {
  return `<td class="sched ${codeClass(code)}"><div class="cell-label">${esc(label)}</div></td>`;
}

// 월 요약: 역할 집계 + 금요일 SW + 연속휴무(주말·연차 포함)
function renderSummary(counts, res) {
  const thead = $("summaryTable").querySelector("thead");
  const tbody = $("summaryTable").querySelector("tbody");
  const codes = [WORK_OFFICE, "당번", "DAY", "SW", "GY", OFF_DAY, "연차", "F/D"];

  let head = "<tr><th>직원</th>";
  codes.forEach((c) => { head += `<th class="cell-label">${esc(c)}</th>`; });
  head += "<th>당번제외<br>(DAY+SW+GY)</th><th>금요일 SW</th><th>2일+ 연속휴무</th></tr>";
  thead.innerHTML = head;

  // 금요일 SW 횟수 계산
  const friCnt = {};
  for (const p of res.people) {
    let c = 0;
    for (let di = 0; di < res.dates.length; di++) {
      if (res.dates[di].getDay() === 5 && res.shifts[p.name][di] === "SW") c++;
    }
    friCnt[p.name] = c;
  }
  // 당번 제외 DAY/SW/GY 합계
  const rotSum = {};
  for (const p of res.people) {
    const c = counts[p.name] || {};
    rotSum[p.name] = (c["DAY"] || 0) + (c["SW"] || 0) + (c["GY"] || 0);
  }

  // SHIFT 근무자 분포 계산
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
    // 당번 제외 DAY/SW/GY 합계 분포 (6일 GY 참여자 목표 10 / 그 외 6)
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

// ================================================================
//  데이터 불러오기 (붙여넣기) — 기존 기능 유지
// ================================================================
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

// ===== CSV =====
function exportCSV() {
  let rows = [], fileName = "";
  if (mode === "import" && importData) {
    rows.push(["근무", "이름", "파트", ...importData.dateCells]);
    for (const r of importData.rows) rows.push([r.type, r.name, r.part, ...r.dayCells]);
    fileName = `근무표_${importData.monthLabel}.csv`;
  } else {
    if (!lastResult) lastResult = generateMonth();
    const res = lastResult;
    const head = ["직원", ...res.dates.map((d) => `${d.getDate()}(${WEEKDAYS[d.getDay()]})`), "2일+연속휴무"];
    rows.push(head);
    for (const p of res.people) {
      rows.push([p.name, ...res.shifts[p.name], p.leader ? "" : res.blockCount[p.name]]);
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

// ===== 이벤트 =====
function parseStaffInput(text) {
  return text.split(/[\n,，]/).map((s) => s.trim()).filter(Boolean);
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

// 전역 예외도 화면에 표시
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
      "정의정 | 화,목 | SW",
      "서지현 | 3토 | SW",
    ].join("\n");

    // 개별 근무 제약: 마지막 입력을 로컬(localStorage)에 저장/복원
    const RULES_KEY = "schedule_personRules";
    try {
      const saved = localStorage.getItem(RULES_KEY);
      if (saved) $("rulesInput").value = saved;
    } catch (e) { /* 저장 공간 비활성(시크릿 등)이면 무시 */ }
    $("rulesInput").addEventListener("input", () => {
      try { localStorage.setItem(RULES_KEY, $("rulesInput").value); } catch (e) { /* ignore */ }
    });

    // 기본: 2026-11-15(일) 기준 → 11월
    now = new Date(2026, 10, 15);
    $("startDate").value = isoDate(now);
    $("startDate").addEventListener("change", (e) => {
      if (e.target.value) { now = new Date(e.target.value + "T00:00:00"); safeGenerate(); }
    });
  } catch (e) {
    showError("초기화 오류: " + (e && e.message ? e.message + (e.stack ? "\n\n" + e.stack : "") : String(e)));
  }
})();

// ===== 비밀번호 잠금 (경량 클라이언트 방식) =====
// !! 배포 전에 아래 비밀번호를 반드시 원하는 값으로 바꾸세요 !!
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
    } else {
      if (msg) msg.hidden = false;
      input.value = "";
      input.focus();
    }
  };
  btn.addEventListener("click", attempt);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  input.focus();
  // 잠금 상태에서 스크롤 방지(선택)
  document.body.style.overflow = "hidden";
})();

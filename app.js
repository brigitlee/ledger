'use strict';

/* ---------- 基本資料 ---------- */

const CATS = {
  '飲食': { c: 'var(--red)',    t: '#fff',              i: 'restaurant' },
  '日用': { c: 'var(--yellow)', t: 'var(--yellow-ink)', i: 'shopping_bag' },
  '交通': { c: 'var(--teal)',   t: '#fff',              i: 'directions_bus' },
  '毛孩': { c: 'var(--pink)',   t: 'var(--pink-ink)',   i: 'pets' },
  '嗜好': { c: 'var(--purple)', t: '#fff',              i: 'palette' },
  '捐獻': { c: 'var(--pink)',   t: 'var(--pink-ink)',   i: 'favorite' },
  '學習': { c: 'var(--purple)', t: '#fff',              i: 'menu_book' },
  '家人': { c: 'var(--yellow)', t: 'var(--yellow-ink)', i: 'people' },
  '共用': { c: 'var(--teal)',   t: '#fff',              i: 'handshake' },
  '療癒': { c: 'var(--purple)', t: '#fff',              i: 'spa' },
  '朋友': { c: 'var(--pink)',   t: 'var(--pink-ink)',   i: 'mood' },
  '工作': { c: 'var(--teal)',   t: '#fff',              i: 'work' },
  '瓦斯': { c: 'var(--red)',    t: '#fff',              i: 'local_fire_department' },
  '房租': { c: 'var(--teal)',   t: '#fff',              i: 'home' },
  '網路': { c: 'var(--purple)', t: '#fff',              i: 'wifi' },
  '手機': { c: 'var(--red)',    t: '#fff',              i: 'smartphone' },
  '水費': { c: 'var(--teal)',   t: '#fff',              i: 'water_drop' },
  '電費': { c: 'var(--yellow)', t: 'var(--yellow-ink)', i: 'bolt' },
  '保險': { c: 'var(--purple)', t: '#fff',              i: 'verified_user' },
};
const GRID = ['飲食', '日用', '交通', '毛孩', '嗜好', '捐獻', '學習'];
const PAYS = ['現金', '刷卡一次付清', '帳戶匯款'];
const PAY_ICON = { '現金': 'payments', '刷卡一次付清': 'credit_card', '帳戶匯款': 'account_balance' };
const PLACES = ['菜市場', '超市', '蝦皮', '網購', '自行輸入'];

const STORE_KEY = 'anyu-ledger-v1';
const VERSION = '15';

/* 偵錯記錄（預設關閉）：除錯時改成 true，會把觸控事件顯示在畫面上 */
const DEBUG = false;
function dbg(msg) {
  if (!DEBUG) return;
  let el = document.getElementById('dbg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dbg';
    el.style.cssText = 'position:fixed;left:0;top:0;right:0;max-height:32vh;overflow:hidden;background:rgba(0,0,0,.82);color:#7fff7f;font:11px/1.45 monospace;z-index:99999;padding:5px;pointer-events:none;white-space:pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = (msg + '\n' + el.textContent).slice(0, 700);
}
function descTgt(t) {
  if (!t || !t.closest) return '?';
  const p = t.closest('[data-pick]'); if (p) return 'pick:' + p.dataset.pick;
  const a = t.closest('[data-act]'); if (a) return 'act:' + a.dataset.act;
  const c = t.closest('.tile[data-cat]'); if (c) return 'tile:' + c.dataset.cat;
  const k = t.closest('[data-key]'); if (k) return 'key:' + k.dataset.key;
  return String(t.className || t.tagName || '?').slice(0, 18);
}

/* ---------- 狀態 ---------- */

function load() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { d = {}; }
  return Object.assign({ expenses: [], incomes: [], budget: { total: 0, cats: {} }, recurring: [], marketMode: false, syncUrl: '' }, d);
}
const db = load();
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }

const ui = { view: 'home', tab: 'expense', listMode: 'today' };
let sheet = null;

/* ---------- 小工具 ---------- */

const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function curMonth() { return todayISO().slice(0, 7); }
function prevMonth() {
  const [y, m] = curMonth().split('-').map(Number);
  return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
}
function dayLabel(iso) {
  if (iso === todayISO()) return '今天';
  const [, m, d] = iso.split('-').map(Number);
  return m + '/' + d;
}
function headerDate() {
  const d = new Date();
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 週' + w;
}
function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function monthExpenses(month) { return db.expenses.filter(e => e.date.startsWith(month)); }
function monthIncomes(month) { return db.incomes.filter(e => e.date.startsWith(month)); }
function spentOf(month, cat) {
  return monthExpenses(month).filter(e => !cat || e.cat === cat).reduce((s, e) => s + e.amount, 0);
}

/* ---------- 固定支出 ---------- */

function monthLen(y, m) { return new Date(y, m, 0).getDate(); }
function recurDueDate(t, month) {
  const [y, m] = month.split('-').map(Number);
  const day = Math.min(t.day, monthLen(y, m));
  return month + '-' + String(day).padStart(2, '0');
}
function recurDoneThisMonth(t, month) {
  return db.expenses.find(e => e.recurId === t.id && e.date.startsWith(month));
}
function materializeRecurring() {
  const month = curMonth();
  let changed = false;
  (db.recurring || []).forEach(t => {
    if (!t.active) return;
    if (recurDoneThisMonth(t, month)) return;
    const due = recurDueDate(t, month);
    if (todayISO() >= due) {
      db.expenses.push({ id: uid(), ts: Date.now(), date: due, cat: t.cat, amount: t.amount, detail: t.detail, pay: t.pay, place: '', recurId: t.id });
      changed = true;
    }
  });
  if (changed) save();
}

/* ---------- 首頁 ---------- */

function catTile(name, opts) {
  const c = CATS[name];
  return `<button class="tile" data-cat="${name}" style="background:${c.c};color:${c.t}" aria-label="${name}">
    <span class="pop" style="background:${c.c};color:${c.t}">${name}</span>
    <i class="mi" aria-hidden="true">${c.i}</i>
  </button>`;
}

function metaPart(icon, label, color) {
  return `<span class="mpart"><i class="mi" style="color:${color};font-size:15px">${icon}</i>${esc(label)}</span>`;
}
function entryRow(e, showDate) {
  const C = CATS[e.cat] || { c: 'var(--muted)', i: 'sell' };
  const parts = [metaPart(C.i, e.cat, C.c)];
  if (e.place) parts.push(metaPart('location_on', e.place, 'var(--muted)'));
  if (e.pay) parts.push(metaPart(PAY_ICON[e.pay] || 'payments', e.pay, 'var(--muted)'));
  const d = showDate ? `<span class="mpart" style="color:var(--muted)">${dayLabel(e.date)}</span>` : '';
  return `<button class="row" data-act="edit-exp" data-id="${e.id}">
    <span style="min-width:0"><span class="who">${esc(e.detail) || e.cat}</span><br><span class="meta">${d}${parts.join('')}</span></span>
    <span class="val">-${fmt(e.amount)}</span>
  </button>`;
}
function incomeRow(e, showDate) {
  const d = showDate ? `<span style="color:var(--muted)">${dayLabel(e.date)} ・ </span>` : '';
  return `<button class="row" data-act="edit-inc" data-id="${e.id}">
    <span><span class="who">${esc(e.payer)}</span><br><span class="meta">${d}${esc(e.detail || '')}</span></span>
    <span class="val in">+${fmt(e.amount)}</span>
  </button>`;
}

function renderHome() {
  const m = curMonth();
  const spent = spentOf(m);
  const income = monthIncomes(m).reduce((s, e) => s + e.amount, 0);
  const total = db.budget.total;
  const isExp = ui.tab === 'expense';

  let cardInner;
  if (isExp) {
    let barHtml = '', sub = '';
    if (total > 0) {
      const pct = Math.min(100, spent / total * 100);
      const left = total - spent;
      const now = new Date();
      const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
      barHtml = `<div class="bar"><div class="${spent > total ? 'over' : ''}" style="width:${pct}%"></div></div>`;
      sub = left >= 0
        ? `還可花 NT$${fmt(left)} ・ 平均每天 NT$${fmt(Math.max(0, Math.floor(left / daysLeft)))}`
        : `超出預算 NT$${fmt(-left)}`;
    } else {
      sub = '點這裡設定本月預算';
    }
    cardInner = `<div class="lbl"><span>本月已花</span><i class="ti ti-chevron-right" aria-hidden="true"></i></div>
      <div class="amt">NT$${fmt(spent)}</div>${barHtml}<div class="sub">${sub}</div>`;
  } else {
    cardInner = `<div class="lbl"><span>本月收入</span></div>
      <div class="amt">NT$${fmt(income)}</div><div class="sub">已記 ${monthIncomes(m).length} 筆</div>`;
  }

  const list = isExp ? monthExpenses(m) : monthIncomes(m);
  const todayList = list.filter(e => e.date === todayISO());
  const shown = (ui.listMode === 'today' ? todayList : list)
    .slice().sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const rows = shown.length
    ? shown.map(e => isExp ? entryRow(e, ui.listMode !== 'today') : incomeRow(e, ui.listMode !== 'today')).join('')
    : `<div class="empty">${ui.listMode === 'today' ? '今天還沒記帳' : '這個月還沒有紀錄'}</div>`;

  const bottom = isExp
    ? `<div class="sec-lbl">記一筆</div>
      <div class="grid">
        ${GRID.map(catTile).join('')}
        <button class="tile ghost" data-act="more-cats" aria-label="更多分類"><i class="ti ti-dots" aria-hidden="true"></i></button>
      </div>
      <div class="actionbar">
        <button class="pill ${db.marketMode ? 'solid' : 'line'}" data-act="market">${db.marketMode ? '<span class="dot"></span>' : ''}菜市場模式</button>
        <button class="mic" data-act="mic" aria-label="語音記帳"><i class="ti ti-microphone" aria-hidden="true"></i></button>
        <button class="pill line" data-act="manual-exp">手動</button>
      </div>`
    : `<button class="addbtn" data-act="add-income"><i class="ti ti-plus" aria-hidden="true"></i>記一筆收入</button>`;

  return `
    <div class="topline"><span>記帳 v${VERSION}</span>
      <span style="display:flex;align-items:center;gap:12px">
        <button data-act="open-settings" aria-label="雲端同步設定" style="color:var(--muted);display:flex"><i class="ti ti-cloud" style="font-size:19px"></i></button>
        ${headerDate()}</span></div>
    <div class="greet-row"><div class="greet">嗨，安娪</div>
      <div class="deco" aria-hidden="true"><span class="d1"></span><span class="d2"></span><span class="d3"></span></div></div>
    <div class="tabs">
      <button class="tab ${isExp ? 'on' : ''}" data-act="tab-exp">支出</button>
      <button class="tab ${isExp ? '' : 'on'}" data-act="tab-inc">收入</button>
    </div>
    <button class="bigcard" data-act="${isExp ? 'goto-budget' : ''}" style="text-align:left;width:100%">${cardInner}</button>
    <div class="tabs" style="margin-top:14px">
      <button class="tab y ${ui.listMode === 'today' ? 'on' : ''}" data-act="list-today">今天</button>
      <button class="tab y ${ui.listMode === 'month' ? 'on' : ''}" data-act="list-month">本月</button>
    </div>
    <div class="listcard">${rows}</div>
    ${bottom}`;
}

/* ---------- 預算頁 ---------- */

function renderBudget() {
  const m = curMonth(), pm = prevMonth();
  const total = db.budget.total;
  const spent = spentOf(m);
  let totalCard;
  if (total > 0) {
    const pct = Math.min(100, spent / total * 100);
    const left = total - spent;
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    totalCard = `<div class="lbl"><span>本月總預算</span><i class="ti ti-pencil" aria-hidden="true"></i></div>
      <div class="amt">NT$${fmt(total)}</div>
      <div class="bar"><div class="${spent > total ? 'over' : ''}" style="width:${pct}%"></div></div>
      <div class="sub">${left >= 0 ? `還可花 NT$${fmt(left)} ・ 平均每天 NT$${fmt(Math.max(0, Math.floor(left / daysLeft)))}` : `超出預算 NT$${fmt(-left)}`}</div>`;
  } else {
    totalCard = `<div class="lbl"><span>本月總預算</span><i class="ti ti-pencil" aria-hidden="true"></i></div>
      <div class="amt">尚未設定</div><div class="sub">點一下，輸入這個月想控制的總額</div>`;
  }

  const catRows = Object.keys(db.budget.cats).map(cat => {
    const b = db.budget.cats[cat];
    const s = spentOf(m, cat);
    const c = CATS[cat];
    const pct = Math.min(100, s / b * 100);
    return `<div class="b-row">
      <button class="b-top" data-act="edit-budget" data-cat="${cat}">
        <span class="mini" style="background:${c.c};color:${c.t}"><i class="mi" aria-hidden="true">${c.i}</i></span>
        <span class="nm">${cat}</span>
        <span class="nums"><span class="sp">${fmt(s)} / </span>${fmt(b)}</span>
      </button>
      <div class="b-bar"><div style="width:${pct}%;background:${s > b ? 'var(--red)' : c.c}"></div></div>
    </div>`;
  }).join('');

  const recurList = db.recurring || [];
  const upcoming = recurList.filter(t => t.active && !recurDoneThisMonth(t, m));
  const recurSummary = recurList.length
    ? `固定支出 ${recurList.length} 項${upcoming.length ? ' ・ 即將扣款 ' + upcoming.length : ' ・ 本月都記好了'}`
    : '設定每月固定支出（房租、水電…）自動記帳';

  return `
    <div class="topline"><span>記帳</span><span>${headerDate()}</span></div>
    <div class="greet-row">
      <button class="back" data-act="goto-home"><i class="ti ti-arrow-left" aria-hidden="true"></i>預算</button>
      <div class="deco" aria-hidden="true"><span class="d1"></span><span class="d2"></span><span class="d3"></span></div></div>
    <div class="tabs"><span class="tab on">${Number(m.slice(5))}月</span></div>
    <button class="bigcard" data-act="edit-budget-total" style="text-align:left;width:100%">${totalCard}</button>
    <div class="sec-lbl">分類預算</div>
    <div class="listcard" style="padding:4px 16px">
      ${catRows}
      <div class="b-row">
        <button class="b-top" data-act="add-budget" style="color:var(--muted)">
          <span class="mini" style="border:1.5px dashed var(--muted)"><i class="ti ti-plus" aria-hidden="true"></i></span>
          <span class="nm">幫分類設預算</span>
        </button>
      </div>
    </div>
    <button class="notecard" data-act="goto-recurring" style="width:100%;text-align:left">
      <i class="ti ti-refresh" aria-hidden="true"></i>
      <span style="flex:1">${recurSummary}</span>
      <i class="ti ti-chevron-right" aria-hidden="true" style="color:var(--muted)"></i></button>`;
}

/* ---------- 固定支出頁 ---------- */

function renderRecurring() {
  const m = curMonth();
  const list = db.recurring || [];
  const rows = list.length ? list.map(t => {
    const C = CATS[t.cat] || { c: 'var(--muted)', i: 'sell' };
    const done = recurDoneThisMonth(t, m);
    let status;
    if (!t.active) status = `<span class="r-status" style="color:var(--muted)">已暫停</span>`;
    else if (done) status = `<span class="r-status" style="color:var(--teal)">✓ 已記入 ${Number(m.slice(5))}/${Number(done.date.slice(8))}</span>`;
    else status = `<button class="btn-now" data-act="recur-now" data-id="${t.id}">現在記</button>`;
    return `<div class="rrow">
      <button class="rrow-main" data-act="edit-recur" data-id="${t.id}">
        <span class="mini" style="background:${C.c};color:#fff;${t.active ? '' : 'opacity:.4'}"><i class="mi" aria-hidden="true">${C.i}</i></span>
        <span class="rinfo">
          <span class="rname">${t.cat}${t.detail ? '<span style="color:var(--muted)"> ・ ' + esc(t.detail) + '</span>' : ''}</span>
          <span class="rsub">每月${t.day}號 ・ ${esc(t.pay)} ・ $${fmt(t.amount)}</span>
        </span>
      </button>
      ${status}
    </div>`;
  }).join('') : `<div class="empty">還沒有固定支出<br><span style="font-size:12px">設定一次，每月自動幫妳記帳</span></div>`;

  return `
    <div class="topline"><span>記帳</span><span>${headerDate()}</span></div>
    <div class="greet-row">
      <button class="back" data-act="goto-budget"><i class="ti ti-arrow-left" aria-hidden="true"></i>固定支出</button>
      <div class="deco" aria-hidden="true"><span class="d1"></span><span class="d2"></span><span class="d3"></span></div></div>
    <div class="sec-lbl">設定一次，每月到日期自動記帳</div>
    <div class="listcard" style="padding:4px 16px">${rows}</div>
    <button class="addbtn" data-act="add-recur"><i class="ti ti-plus" aria-hidden="true"></i>新增固定支出</button>`;
}

/* ---------- 主渲染 ---------- */

function render() {
  $('#app').innerHTML = ui.view === 'home' ? renderHome()
    : ui.view === 'recurring' ? renderRecurring()
    : renderBudget();
  // 直接綁 touchend，讓 Android pointercancel 場景仍能觸發
  const moreCatsBtn = document.querySelector('[data-act="more-cats"]');
  if (moreCatsBtn) {
    moreCatsBtn.addEventListener('touchend', e => {
      e.preventDefault(); // 阻止後續 click
      handleActivate(e.target);
    }, { once: true, passive: false });
  }
}

/* ---------- 記帳面板 ---------- */

function sheetTabs(current, kind) {
  if (kind === 'income') {
    return `<span class="s-tab on" style="background:var(--teal);color:#fff"><i class="ti ti-coin" aria-hidden="true"></i>收入</span>`;
  }
  if (kind === 'budget-total') {
    return `<span class="s-tab on" style="background:var(--teal);color:#fff"><i class="ti ti-target" aria-hidden="true"></i>總預算</span>`;
  }
  const others = GRID.filter(c => c !== current).slice(0, 4);
  const cc = CATS[current];
  return `<span class="s-tab on" style="background:${cc.c};color:${cc.t}"><i class="mi" aria-hidden="true">${cc.i}</i>${current}</span>`
    + others.map(c => `<button class="s-tab" style="background:${CATS[c].c};color:${CATS[c].t}" data-act="sheet-cat" data-cat="${c}" aria-label="${c}"><i class="mi" aria-hidden="true">${CATS[c].i}</i></button>`).join('')
    + `<button class="s-tab" style="background:var(--tab-idle);color:var(--muted)" data-act="sheet-more" aria-label="更多分類"><i class="ti ti-dots" aria-hidden="true"></i></button>`;
}

function amountHtml(str) {
  return str
    ? `<span class="cur">NT$</span>${fmt(Number(str))}`
    : `<span class="cur">NT$</span><span class="ph">0</span>`;
}

const KEYS = `<div class="keys">
  ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="key" data-key="${n}">${n}</button>`).join('')}
  <span class="key blank"></span>
  <button class="key" data-key="0">0</button>
  <button class="key" data-key="del" aria-label="刪除"><i class="ti ti-backspace" aria-hidden="true"></i></button>
</div>`;

function renderSheet() {
  if (!sheet) return;
  $('#s-tabs').innerHTML = sheetTabs(sheet.cat, sheet.kind);
  let chips = '', extra = '', save = '記下來', del = '';

  if (sheet.kind === 'expense') {
    chips = `<div class="chips">
      <button class="chip" data-act="chip-date"><i class="ti ti-calendar" aria-hidden="true"></i>${dayLabel(sheet.date)}</button>
      <button class="chip ${sheet.place ? '' : 'dash'}" data-act="chip-place"><i class="ti ti-map-pin" aria-hidden="true"></i>${esc(sheet.place) || '地點'}</button>
      <button class="chip" data-act="chip-pay">${esc(sheet.pay)}</button>
    </div>
    <input class="s-input" id="detail-input" placeholder="細項（例：小黃瓜＋花椰菜）" value="${esc(sheet.detail)}">`;
    if (sheet.editId) del = `<button class="s-del" data-act="del-entry"><i class="ti ti-trash" aria-hidden="true"></i> 刪除這筆</button>`;
  } else if (sheet.kind === 'income') {
    chips = `<div class="chips">
      <button class="chip" data-act="chip-date"><i class="ti ti-calendar" aria-hidden="true"></i>${dayLabel(sheet.date)}</button>
    </div>
    <input class="s-input" id="payer-input" placeholder="給錢的人（例：丁建中、股息）" value="${esc(sheet.payer)}">
    <input class="s-input" id="detail-input" placeholder="細項（例：情境圖x3）" value="${esc(sheet.detail)}">`;
    if (sheet.editId) del = `<button class="s-del" data-act="del-entry"><i class="ti ti-trash" aria-hidden="true"></i> 刪除這筆</button>`;
  } else if (sheet.kind === 'recur') {
    chips = `<div class="chips">
      <button class="chip" data-act="chip-day"><i class="ti ti-calendar-repeat" aria-hidden="true"></i>每月${sheet.day || 1}號</button>
      <button class="chip" data-act="chip-pay">${esc(sheet.pay)}</button>
      <button class="chip ${sheet.active === false ? 'dash' : ''}" data-act="chip-active">${sheet.active === false ? '已暫停' : '啟用中'}</button>
    </div>
    <input class="s-input" id="detail-input" placeholder="細項（例：So-Net中華電信月租）" value="${esc(sheet.detail)}">`;
    if (sheet.editId) del = `<button class="s-del" data-act="del-recur"><i class="ti ti-trash" aria-hidden="true"></i> 刪除這筆固定支出</button>`;
    save = '存固定支出';
  } else {
    const pmSpent = spentOf(prevMonth(), sheet.kind === 'budget-total' ? null : sheet.cat);
    chips = `<div class="chips">
      <span class="chip">上月實際花了 ${fmt(pmSpent)}</span>
      ${sheet.kind === 'budget-cat' && db.budget.cats[sheet.cat] != null ? '<button class="chip dash" data-act="budget-unset">不設限</button>' : ''}
    </div>`;
    save = '存預算';
  }

  $('#s-body').innerHTML = `
    <div class="s-head"><span>${sheet.kind.startsWith('budget') ? '每月預算' : '金額'}</span>
      <button class="x" data-act="close-sheet" aria-label="關閉"><i class="ti ti-x"></i></button></div>
    <div class="s-amt" id="amt">${amountHtml(sheet.amount)}</div>
    ${chips}${extra}${KEYS}
    <button class="s-save" data-act="save-sheet">${save}</button>${del}`;
}

function openSheet(opts) {
  sheet = Object.assign({ amount: '', detail: '', payer: '', pay: '現金', place: '', date: todayISO(), editId: null }, opts);
  renderSheet();
  const ov = $('#overlay');
  ov.classList.remove('hidden');
  void ov.offsetHeight; // 強制重繪，確保滑出動畫在手機上一定觸發
  ov.classList.add('open');
}
function closeSheet() {
  $('#overlay').classList.remove('open');
  setTimeout(() => { $('#overlay').classList.add('hidden'); sheet = null; }, 240);
}
function grabInputs() {
  if (!sheet) return;
  const d = $('#detail-input'); if (d) sheet.detail = d.value.trim();
  const p = $('#payer-input'); if (p) sheet.payer = p.value.trim();
}

function newExpenseSheet(cat) {
  openSheet({
    kind: 'expense', cat,
    place: db.marketMode ? '菜市場' : '',
    pay: '現金',
  });
}

function saveSheet() {
  grabInputs();
  const n = Number(sheet.amount);
  if (sheet.kind === 'budget-total') {
    db.budget.total = n; save(); closeSheet(); render(); return;
  }
  if (sheet.kind === 'budget-cat') {
    if (n > 0) db.budget.cats[sheet.cat] = n; else delete db.budget.cats[sheet.cat];
    save(); closeSheet(); render(); return;
  }
  if (!(n > 0)) { toast('先輸入金額'); vibrate(60); return; }
  if (sheet.kind === 'recur') {
    const t = { id: sheet.editId || uid(), cat: sheet.cat, amount: n, detail: sheet.detail, pay: sheet.pay, day: sheet.day || 1, active: sheet.active !== false };
    if (sheet.editId) {
      const i = db.recurring.findIndex(x => x.id === sheet.editId);
      if (i >= 0) db.recurring[i] = Object.assign({}, db.recurring[i], t);
    } else db.recurring.push(t);
    save(); materializeRecurring(); vibrate(15);
    closeSheet(); render();
    toast(sheet.editId ? '改好了' : '固定支出設好了！');
    return;
  }
  if (sheet.kind === 'expense') {
    const entry = {
      id: sheet.editId || uid(), ts: Date.now(),
      date: sheet.date, cat: sheet.cat, amount: n,
      detail: sheet.detail, pay: sheet.pay, place: sheet.place,
      recurId: sheet.recurId || null,
    };
    if (sheet.editId) {
      const i = db.expenses.findIndex(e => e.id === sheet.editId);
      if (i >= 0) db.expenses[i] = Object.assign({}, db.expenses[i], entry);
    } else db.expenses.push(entry);
  } else {
    if (!sheet.payer) { toast('「給錢的人」要填一下'); vibrate(60); return; }
    const entry = {
      id: sheet.editId || uid(), ts: Date.now(),
      date: sheet.date, payer: sheet.payer, amount: n, detail: sheet.detail,
    };
    if (sheet.editId) {
      const i = db.incomes.findIndex(e => e.id === sheet.editId);
      if (i >= 0) db.incomes[i] = Object.assign({}, db.incomes[i], entry);
    } else db.incomes.push(entry);
  }
  save(); vibrate(15);
  closeSheet(); render();
  toast(sheet && sheet.editId ? '改好了' : '記下來了！');
  maybeSync();
}

/* ---------- 選擇視窗 ---------- */

let modalCb = null;
let modalGuardUntil = 0;
function openModal(html, cb) {
  modalCb = cb || null;
  modalGuardUntil = Date.now() + 400; // 400ms 內不讓 scrim 關閉（防止同一觸控的延遲 click 打到 scrim）
  const box = $('#modal-box');
  box.innerHTML = html;
  $('#modal').classList.remove('hidden');
  // 直接綁在每個選項上：pointerup（觸控）＋click（滑鼠）都能用；once 防重複
  box.querySelectorAll('[data-pick]').forEach(btn => {
    const fire = (e) => {
      if (e) e.stopPropagation();
      const v = btn.dataset.pick, c = modalCb;
      modalGuardUntil = 0; // 使用者主動選了，解除 guard
      $('#modal').classList.add('hidden'); modalCb = null; // 直接關，不走 closeModal guard
      if (c) c(v);
    };
    btn.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') fire(e); }, { once: true });
    btn.addEventListener('click', e => { if (e.pointerType === 'mouse' || e.detail > 0) fire(e); }, { once: true });
  });
}
function closeModal(fromScrim) {
  // 剛開的 modal（400ms 內），只擋 scrim 誤觸，不擋明確的關閉按鈕
  if (fromScrim && Date.now() < modalGuardUntil) return;
  $('#modal').classList.add('hidden'); modalCb = null;
}

function pickCategory(title, cb) {
  const grid = Object.keys(CATS).map(c => {
    const tint = `color-mix(in srgb, ${CATS[c].c} 16%, #FFFDF7)`;
    const ink = `color-mix(in srgb, ${CATS[c].c} 68%, #33291F)`;
    return `<button class="pick" data-pick="${c}" style="background:${tint};color:${ink}">
      <span class="ic" style="background:${CATS[c].c};color:${CATS[c].t}"><i class="mi" aria-hidden="true">${CATS[c].i}</i></span>${c}
    </button>`;
  }).join('');
  openModal(`<h3>${title}</h3><div class="pick-grid">${grid}</div>`, cb);
}
function pickPlace(cb) {
  const opts = PLACES.map(p => `<button class="opt" data-pick="${p}"><i class="ti ti-map-pin" aria-hidden="true" style="color:var(--muted)"></i>${p}</button>`).join('');
  openModal(`<h3>在哪裡買的？</h3><div class="pick-list">${opts}
    <button class="opt" data-pick="__custom"><i class="ti ti-pencil" aria-hidden="true" style="color:var(--muted)"></i>自己打字…</button>
    <button class="opt" data-pick="__none" style="color:var(--muted)"><i class="ti ti-x" aria-hidden="true"></i>不填地點</button></div>`, cb);
}
function confirmModal(msg, cb) {
  openModal(`<h3>${msg}</h3><div class="btns">
    <button class="no" data-pick="__no">先不要</button>
    <button class="ok" data-pick="__yes">刪除</button></div>`, cb);
}
function pickDay(cb) {
  let cells = '';
  for (let i = 1; i <= 31; i++) cells += `<button class="day-cell" data-pick="${i}">${i}</button>`;
  openModal(`<h3>每月幾號扣款？</h3><div class="day-grid">${cells}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:10px">遇到月份沒有的日期（如31號），會自動用當月最後一天</div>`, cb);
}

/* ---------- 語音記帳 ---------- */

const KEYWORD_CAT = {
  '飲食': ['菜', '瓜', '果', '蕉', '蔥', '薑', '蒜', '蘿蔔', '高麗', '花椰', '菇', '番茄', '茄', '椒', '筍', '芹', '韭', '豆', '肉', '雞', '豬', '牛', '魚', '蝦', '蛋', '奶', '飯', '麵', '米', '油', '鹽', '糖', '醬', '咖啡', '茶', '水果', '蔬菜', '便當', '早餐', '午餐', '晚餐', '飲料', '零食', '餅', '麵包', '吐司', '豆漿', '優格', '水餃'],
  '日用': ['衛生紙', '面紙', '洗衣', '洗碗', '沐浴', '洗髮', '牙膏', '牙刷', '清潔', '垃圾袋', '夾鏈', '電池', '燈泡', '保鮮膜', '層架', '收納'],
  '毛孩': ['貓', '狗', '飼料', '貓砂', '寵物', '罐罐', '凍乾', '潔牙'],
  '交通': ['悠遊卡', '加油', '油錢', '停車', '計程車', '小黃', '公車', '捷運', '車票', '高鐵', '台鐵', 'uber'],
  '學習': ['書', '課程', '電子書', '訂閱'],
  '嗜好': ['模具', '烘焙', '材料', '顏料', '畫具'],
};
function guessCategory(detail) {
  for (const cat in KEYWORD_CAT) {
    if (CATS[cat] && KEYWORD_CAT[cat].some(k => detail.includes(k))) return cat;
  }
  return db.marketMode ? '飲食' : '日用';
}

function cnToNum(str) {
  const d = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const u = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
  let total = 0, section = 0, num = 0, matched = false;
  for (const ch of str) {
    if (ch in d) { num = d[ch]; matched = true; }
    else if (ch in u) {
      matched = true;
      if (u[ch] === 10000) { total = (total + section + num) * u[ch]; section = 0; num = 0; }
      else { if (num === 0) num = 1; section += num * u[ch]; num = 0; }
    }
  }
  return matched ? total + section + num : null;
}

function parseVoice(text) {
  let amount = null;
  let m = text.match(/(\d+)\s*(?:元|塊錢|塊|円)/);
  if (m) amount = parseInt(m[1], 10);
  if (amount == null) {
    const nums = (text.match(/\d+/g) || []).map(n => parseInt(n, 10));
    if (nums.length) amount = Math.max(...nums);
  }
  let cnUsed = null;
  if (amount == null) {
    const cm = text.match(/[零〇一二兩三四五六七八九十百千萬]+/g);
    if (cm) for (const c of cm) { const v = cnToNum(c); if (v) { amount = v; cnUsed = c; break; } }
  }
  let detail = text
    .replace(/(\d+)\s*(元|塊錢|塊|円)?/g, '')
    .replace(/(總共|一共|共|花了|買了|大概|差不多|然後|還有|塊錢|元|塊)/g, '')
    .replace(/[，。、！？.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cnUsed) detail = detail.replace(cnUsed, '').replace(/\s+/g, ' ').trim();
  return { detail, amount, cat: guessCategory(detail), raw: text };
}

let recog = null, recognizing = false;
function voiceSupported() { return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window; }

function showVoice(state, data) {
  const v = $('#voice');
  v.classList.remove('hidden');
  if (state === 'listening') {
    v.innerHTML = `<button class="v-close" data-act="voice-cancel" aria-label="取消"><i class="ti ti-x"></i></button>
      <div class="v-mic live"><i class="ti ti-microphone" aria-hidden="true"></i></div>
      <div class="v-transcript">${esc(data.transcript) || '聆聽中…'}</div>
      <div class="v-hint">說品項和金額<br>例如：「小黃瓜花椰菜 150 元」</div>
      <div class="v-actions"><button class="v-btn ghost" data-act="voice-stop">講完了</button></div>`;
  } else if (state === 'result') {
    const c = CATS[data.cat] || { c: 'var(--red)', i: 'tag' };
    const amtHtml = data.amount > 0
      ? `<div class="v-amount"><span class="cur">NT$</span>${fmt(data.amount)}</div>`
      : `<div class="v-amount" style="font-size:22px;color:var(--teal-pale)">沒聽到金額，待會補</div>`;
    v.innerHTML = `<button class="v-close" data-act="voice-cancel" aria-label="關閉"><i class="ti ti-x"></i></button>
      <div class="v-mic"><i class="ti ti-check" aria-hidden="true"></i></div>
      <div class="v-detail">${esc(data.detail) || '（沒聽清楚品項）'}</div>
      ${amtHtml}
      <button class="v-catchip" data-act="voice-recat"><i class="mi" aria-hidden="true">${c.i}</i>${data.cat}<i class="ti ti-chevron-down" style="font-size:15px;opacity:.7"></i></button>
      <div class="v-meta">${db.marketMode ? '菜市場 ・ 現金' : '現金'}</div>
      <div class="v-actions">
        <button class="v-btn primary" data-act="voice-save"><i class="ti ti-check" aria-hidden="true"></i>記下來</button>
        <button class="v-btn ghost" data-act="voice-edit">改一下</button>
        <button class="v-btn ghost" data-act="voice-retry">重講</button>
      </div>`;
  } else {
    v.innerHTML = `<button class="v-close" data-act="voice-cancel" aria-label="關閉"><i class="ti ti-x"></i></button>
      <div class="v-mic" style="background:rgba(255,255,255,.15)"><i class="ti ti-microphone-off" aria-hidden="true"></i></div>
      <div class="v-detail" style="font-size:20px">${esc(data.msg || '出了點問題')}</div>
      <div class="v-actions">
        <button class="v-btn primary" data-act="voice-retry">再試一次</button>
        <button class="v-btn ghost" data-act="voice-manual">改用手動記</button>
      </div>`;
  }
}
function hideVoice() { $('#voice').classList.add('hidden'); $('#voice').innerHTML = ''; }

let lastParse = null;
function startVoice() {
  if (!voiceSupported()) {
    showVoice('error', { msg: '這支瀏覽器不支援語音\n用 Chrome 開啟就可以了' });
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR();
  recog.lang = 'zh-TW';
  recog.interimResults = true;
  recog.continuous = false;
  let finalText = '';
  showVoice('listening', { transcript: '' });
  recog.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    showVoice('listening', { transcript: (finalText + interim).trim() });
  };
  recog.onerror = ev => {
    recognizing = false;
    if (ev.error === 'no-speech') showVoice('error', { msg: '沒聽到聲音\n靠近一點再講一次' });
    else if (ev.error === 'not-allowed') showVoice('error', { msg: '需要開啟麥克風權限\n請允許後再試' });
    else showVoice('error', { msg: '語音出了點問題，再試一次' });
  };
  recog.onend = () => {
    recognizing = false;
    const text = finalText.trim();
    if (!text) { showVoice('error', { msg: '沒聽到聲音\n靠近一點再講一次' }); return; }
    lastParse = parseVoice(text);
    showVoice('result', lastParse);
  };
  recognizing = true;
  try { recog.start(); } catch (e) { /* 已在進行中 */ }
}
function stopVoiceListening() { if (recog && recognizing) { try { recog.stop(); } catch (e) {} } }
function cancelVoice() { recognizing = false; if (recog) { try { recog.abort(); } catch (e) {} } hideVoice(); }

function saveVoiceEntry() {
  if (!lastParse) return;
  const p = lastParse;
  if (!(p.amount > 0)) { voiceEdit(); return; }
  db.expenses.push({
    id: uid(), ts: Date.now(), date: todayISO(),
    cat: p.cat, amount: p.amount, detail: p.detail,
    pay: '現金', place: db.marketMode ? '菜市場' : '',
  });
  save(); vibrate(15); hideVoice(); render();
  toast('記下來了：' + (p.detail || p.cat) + ' ' + fmt(p.amount));
  maybeSync();
}
function voiceEdit() {
  if (!lastParse) return;
  const p = lastParse;
  hideVoice();
  openSheet({ kind: 'expense', cat: p.cat, amount: p.amount > 0 ? String(p.amount) : '', detail: p.detail, place: db.marketMode ? '菜市場' : '', pay: '現金' });
}

/* ---------- 雲端同步（手機 → Google 試算表）---------- */

function entryToRow(e) {
  const isIncome = e.payer != null;
  return {
    id: e.id,
    type: isIncome ? '收入' : '支出',
    date: e.date,
    cat: isIncome ? (e.payer || '') : (e.cat || ''),
    detail: e.detail || '',
    amount: e.amount,
    pay: isIncome ? '' : (e.pay || ''),
    place: isIncome ? '' : (e.place || ''),
    ts: e.ts || '',
  };
}
function allEntries() { return [...db.expenses, ...db.incomes]; }
function syncStatus() {
  const all = allEntries();
  const pending = all.filter(e => !e.synced).length;
  return { total: all.length, pending, synced: all.length - pending };
}
async function syncUpload(reuploadAll) {
  if (!db.syncUrl) return { ok: false, reason: 'no-url' };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  const list = (reuploadAll ? allEntries() : allEntries().filter(e => !e.synced));
  if (!list.length) return { ok: true, n: 0 };
  try {
    await fetch(db.syncUrl, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(list.map(entryToRow)),
    });
    list.forEach(e => { e.synced = true; });
    save();
    return { ok: true, n: list.length };
  } catch (err) {
    return { ok: false, reason: 'network' };
  }
}
function maybeSync() { if (db.syncUrl && navigator.onLine) syncUpload(false); }

function openSettings() {
  const s = syncStatus();
  openModal(`<h3>雲端同步</h3>
    <div style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.6">記的帳會自動寄到雲端，回電腦就能同步進 .ods。網址只存在這支手機，不外流。</div>
    <input id="sync-url-input" class="s-input" placeholder="貼上雲端同步網址" value="${esc(db.syncUrl || '')}" style="margin-bottom:12px">
    <div style="font-size:14px;margin-bottom:14px">${db.syncUrl ? `已上傳 ${s.synced} 筆 ・ 待上傳 <b>${s.pending}</b> 筆` : '尚未設定網址'}</div>
    <button class="s-save" data-act="sync-save" style="margin-top:0">儲存並上傳</button>
    <button class="s-del" data-act="close-modal" style="color:var(--muted)">關閉</button>`, null);
}

/* ---------- 事件 ---------- */

let _lastActivateTime = 0;
function handleActivate(tgt) {
  const now = Date.now();
  if (now - _lastActivateTime < 80) return; // 防止 pointerup + touchend 雙觸發
  _lastActivateTime = now;
  const pickEl = tgt.closest('[data-pick]');
  if (pickEl && modalCb) {
    const v = pickEl.dataset.pick;
    const cb = modalCb;
    closeModal();
    cb(v);
    return;
  }
  const key = tgt.closest('[data-key]');
  if (key && sheet) {
    const k = key.dataset.key;
    if (k === 'del') sheet.amount = sheet.amount.slice(0, -1);
    else if (sheet.amount.length < 7 && !(sheet.amount === '' && k === '0')) sheet.amount += k;
    $('#amt').innerHTML = amountHtml(sheet.amount);
    vibrate(8);
    return;
  }

  const tile = tgt.closest('.tile[data-cat]');
  if (tile) { newExpenseSheet(tile.dataset.cat); return; }

  const el = tgt.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'tab-exp') { ui.tab = 'expense'; render(); }
  if (act === 'tab-inc') { ui.tab = 'income'; render(); }
  if (act === 'list-today') { ui.listMode = 'today'; render(); }
  if (act === 'list-month') { ui.listMode = 'month'; render(); }
  if (act === 'goto-budget') { ui.view = 'budget'; render(); }
  if (act === 'goto-home') { ui.view = 'home'; render(); }
  if (act === 'goto-recurring') { ui.view = 'recurring'; render(); }
  if (act === 'open-settings') openSettings();
  if (act === 'sync-save') {
    const inp = $('#sync-url-input');
    const url = inp ? inp.value.trim() : '';
    db.syncUrl = url; save();
    closeModal();
    if (!url) { toast('已清除網址'); return; }
    toast('上傳中…');
    syncUpload(false).then(r => {
      if (r.ok) toast(r.n ? `已上傳 ${r.n} 筆到雲端` : '雲端已是最新');
      else toast(r.reason === 'offline' ? '沒有網路，等等會自動補傳' : '上傳失敗，稍後再試');
    });
  }

  if (act === 'add-recur') openSheet({ kind: 'recur', cat: '房租', amount: '', pay: '帳戶匯款', day: 1, active: true });
  if (act === 'edit-recur') {
    const t = db.recurring.find(x => x.id === el.dataset.id);
    if (t) openSheet({ kind: 'recur', cat: t.cat, amount: String(t.amount), detail: t.detail, pay: t.pay, day: t.day, active: t.active, editId: t.id });
  }
  if (act === 'recur-now') {
    const t = db.recurring.find(x => x.id === el.dataset.id);
    if (t) openSheet({ kind: 'expense', cat: t.cat, amount: String(t.amount), detail: t.detail, pay: t.pay, place: '', recurId: t.id });
  }

  if (act === 'market') {
    db.marketMode = !db.marketMode; save(); render();
    toast(db.marketMode ? '菜市場模式：地點、現金幫妳填好' : '菜市場模式關閉');
  }
  if (act === 'mic') startVoice();
  if (act === 'voice-stop') stopVoiceListening();
  if (act === 'voice-cancel') cancelVoice();
  if (act === 'voice-save') saveVoiceEntry();
  if (act === 'voice-edit') voiceEdit();
  if (act === 'voice-retry') startVoice();
  if (act === 'voice-manual') { hideVoice(); newExpenseSheet(db.marketMode ? '飲食' : '日用'); }
  if (act === 'voice-recat') pickCategory('改成哪一類？', c => { if (CATS[c] && lastParse) { lastParse.cat = c; showVoice('result', lastParse); } });
  if (act === 'manual-exp') newExpenseSheet(db.marketMode ? '飲食' : '日用');
  if (act === 'more-cats') pickCategory('記哪一類？', c => { if (CATS[c]) newExpenseSheet(c); });
  if (act === 'add-income') openSheet({ kind: 'income', cat: null });

  if (act === 'edit-exp') {
    const en = db.expenses.find(x => x.id === el.dataset.id);
    if (en) openSheet({ kind: 'expense', cat: en.cat, amount: String(en.amount), detail: en.detail, pay: en.pay, place: en.place, date: en.date, editId: en.id });
  }
  if (act === 'edit-inc') {
    const en = db.incomes.find(x => x.id === el.dataset.id);
    if (en) openSheet({ kind: 'income', cat: null, amount: String(en.amount), detail: en.detail, payer: en.payer, date: en.date, editId: en.id });
  }

  if (act === 'edit-budget-total') openSheet({ kind: 'budget-total', cat: null, amount: db.budget.total ? String(db.budget.total) : '' });
  if (act === 'edit-budget') {
    const c = el.dataset.cat;
    openSheet({ kind: 'budget-cat', cat: c, amount: db.budget.cats[c] ? String(db.budget.cats[c]) : '' });
  }
  if (act === 'add-budget') pickCategory('幫哪一類設預算？', c => {
    if (CATS[c]) openSheet({ kind: 'budget-cat', cat: c, amount: db.budget.cats[c] ? String(db.budget.cats[c]) : '' });
  });
  if (act === 'budget-unset') {
    delete db.budget.cats[sheet.cat]; save(); closeSheet(); render(); toast('改成不設限了');
  }

  if (act === 'close-sheet') closeSheet();
  if (act === 'close-modal') closeModal(el.classList.contains('modal-scrim'));

  if (act === 'sheet-cat') { grabInputs(); sheet.cat = el.dataset.cat; renderSheet(); }
  if (act === 'sheet-more') { grabInputs(); pickCategory('換成哪一類？', c => { if (CATS[c] && sheet) { sheet.cat = c; renderSheet(); } }); }

  if (act === 'chip-pay') {
    grabInputs();
    sheet.pay = PAYS[(PAYS.indexOf(sheet.pay) + 1) % PAYS.length];
    renderSheet();
  }
  if (act === 'chip-place') {
    grabInputs();
    if (!sheet) return;
    const cycle = ['', ...PLACES];
    const idx = cycle.indexOf(sheet.place);
    const next = cycle[(idx + 1) % cycle.length];
    if (next === '自行輸入') {
      const t = prompt('地點：');
      sheet.place = (t != null && t.trim()) ? t.trim() : sheet.place;
    } else {
      sheet.place = next;
    }
    renderSheet();
  }
  if (act === 'chip-date') {
    grabInputs();
    const dp = $('#datepick');
    dp.value = sheet.date;
    dp.max = todayISO();
    dp.onchange = () => { if (sheet && dp.value) { sheet.date = dp.value; renderSheet(); } };
    if (dp.showPicker) dp.showPicker(); else dp.click();
  }
  if (act === 'chip-day') {
    grabInputs();
    pickDay(v => { if (sheet) { sheet.day = Number(v); renderSheet(); } });
  }
  if (act === 'chip-active') { grabInputs(); sheet.active = (sheet.active === false); renderSheet(); }

  if (act === 'save-sheet') saveSheet();
  if (act === 'del-entry') {
    confirmModal('確定刪除這筆？', v => {
      if (v !== '__yes' || !sheet) return;
      if (sheet.kind === 'expense') db.expenses = db.expenses.filter(x => x.id !== sheet.editId);
      else db.incomes = db.incomes.filter(x => x.id !== sheet.editId);
      save(); closeSheet(); render(); toast('刪掉了');
    });
  }
  if (act === 'del-recur') {
    confirmModal('刪除這筆固定支出？（已記入的帳不會被刪）', v => {
      if (v !== '__yes' || !sheet) return;
      db.recurring = db.recurring.filter(x => x.id !== sheet.editId);
      save(); closeSheet(); render(); toast('刪掉了');
    });
  }
}

/* 觸控優先：手機用 pointerup 直接觸發（避開可捲動容器吃掉點擊的問題），
   滑鼠仍走 click；用 suppressClick 防止同一次操作重複觸發。 */
let pressedTile = null, pDownXY = null, suppressClick = false, suppressTimer = null;
function clearPressed() {
  if (pressedTile) { const t = pressedTile; pressedTile = null; setTimeout(() => t.classList.remove('pressed'), 120); }
}
document.addEventListener('pointerdown', e => {
  dbg('DOWN ' + e.pointerType + ' ' + descTgt(e.target));
  pDownXY = [e.clientX, e.clientY];
  const t = e.target.closest('.tile[data-cat]');
  if (t) { pressedTile = t; t.classList.add('pressed'); }
});
document.addEventListener('pointerup', e => {
  clearPressed();
  if (e.pointerType === 'mouse' || !pDownXY) { pDownXY = null; dbg('UP ' + e.pointerType + ' (skip)'); return; }
  const moved = Math.hypot((e.clientX || 0) - pDownXY[0], (e.clientY || 0) - pDownXY[1]);
  pDownXY = null;
  dbg('UP ' + descTgt(e.target) + ' moved=' + Math.round(moved));
  if (moved <= 12) {
    suppressClick = true;
    clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => { suppressClick = false; }, 700);
    handleActivate(e.target);
  }
});
document.addEventListener('pointercancel', e => { dbg('CANCEL ' + descTgt(e.target)); clearPressed(); pDownXY = null; });
document.addEventListener('click', e => {
  dbg('CLICK ' + descTgt(e.target) + (suppressClick ? ' [supp]' : ''));
  if (suppressClick) { suppressClick = false; return; }
  handleActivate(e.target);
});

/* ---------- 啟動 ---------- */

materializeRecurring();
render();
maybeSync();
window.addEventListener('online', maybeSync);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then(reg => { reg.update(); }).catch(() => {});
  // 有新版的 service worker 接手時自動重整一次，讓更新立即生效
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return; refreshing = true; location.reload();
  });
}

// ---------- 存储 ----------
const KEY = 'cc-manager-v1';
const BANKS = ['工商银行','建设银行','农业银行','中国银行','交通银行','招商银行','中信银行','浦发银行','民生银行','兴业银行','光大银行','平安银行','广发银行','华夏银行','邮储银行','北京银行','上海银行','宁波银行','浙商银行','渤海银行'];
const NETWORKS = ['', '银联', 'Visa', 'MasterCard', 'American Express', 'JCB'];
function validateCards(arr) {
  if (!Array.isArray(arr) || arr.length > 1000) throw new Error('必须是最多 1000 张卡的数组');
  const ids = new Set();
  const fields = ['id','bank','name','last4','expiry','network','limit','color','billDay','graceDays','annualFee','feeDate','waiverType','waiverTarget','waiverDone','waiverNote','benefits','note'];
  return arr.map(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !fields.includes(k))) throw new Error('存在未知字段或无效卡片');
    const out = {};
    for (const k of fields) {
      const v = c[k] ?? '';
      if (!['string','number'].includes(typeof v) || String(v).length > 5000) throw new Error(`字段 ${k} 无效`);
      out[k] = String(v);
    }
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(out.id) || ids.has(out.id)) throw new Error('卡片 ID 无效或重复');
    ids.add(out.id);
    if (!out.bank.trim() || (out.last4 && !/^\d{4}$/.test(out.last4)) ||
        (out.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(out.expiry)) ||
        !NETWORKS.includes(out.network) || (out.color && !/^#[0-9a-f]{6}$/i.test(out.color)) ||
        !['none','count','amount','points','rigid','other'].includes(out.waiverType)) throw new Error('银行、尾号、有效期或选项无效');
    for (const k of ['billDay','graceDays','limit','annualFee','waiverTarget','waiverDone']) {
      const v = out[k];
      if ((['billDay','graceDays'].includes(k) && !v) || (v && !/^\d+(\.\d{1,2})?$/.test(v))) throw new Error(`字段 ${k} 必须是非负数`);
      const n = Number(v);
      const max = k === 'billDay' ? 31 : k === 'graceDays' ? 90 : 1e9;
      if (!Number.isFinite(n) || n > max || (k === 'billDay' && n < 1) ||
          ((['billDay','graceDays'].includes(k) || (out.waiverType === 'count' && k.startsWith('waiver'))) && !Number.isInteger(n))) throw new Error(`字段 ${k} 超出范围或不是整数`);
    }
    if (out.feeDate) {
      const d = new Date(out.feeDate + 'T00:00:00');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(out.feeDate) || !Number.isFinite(d.getTime()) || fmtDate(d) !== out.feeDate || d.getFullYear() < 1900 || d.getFullYear() > 9999) throw new Error('年费日期无效');
    }
    return out;
  });
}
let storageIssue = '';
let cards = [];
// 出错时保留原始数据，禁止无意覆盖；允许用户明确确认导入恢复。
function loadCards() {
  try { return validateCards(JSON.parse(localStorage.getItem(KEY) || '[]')); }
  catch { storageIssue = '本地数据损坏或存储不可用，原数据未覆盖。请在“数据”页导出原始数据或导入有效备份恢复。'; return []; }
}
function commitCards(next, recovering = false) {
  try {
    if (storageIssue && !recovering) throw new Error(storageIssue);
    next = validateCards(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    cards = next; storageIssue = ''; return true;
  } catch (err) { alert(`保存失败：${err.message}`); return false; }
}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((day0(b) - day0(a)) / 864e5);

// ---------- 日期计算 ----------
function billDateIn(y, m, billDay) { // 月份天数不足时取月末
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(billDay, last));
}
function nextBill(c, from = new Date()) {
  const t = day0(from);
  let d = billDateIn(t.getFullYear(), t.getMonth(), +c.billDay);
  if (d < t) d = billDateIn(t.getFullYear(), t.getMonth() + 1, +c.billDay);
  return d;
}
function dueAfter(bill, c) { const d = new Date(bill); d.setDate(d.getDate() + (+c.graceDays || 0)); return d; }
// 当前待还账单：上一个账单日对应的还款日（若未过期），否则为下一期
function nextDue(c, from = new Date()) {
  const t = day0(from);
  const nb = nextBill(c, t);
  const prev = billDateIn(nb.getFullYear(), nb.getMonth() - 1, +c.billDay);
  const pd = dueAfter(prev, c);
  return pd >= t ? pd : dueAfter(nb, c);
}
// 今天刷这张卡，到还款日的免息天数
function freeDays(c, from = new Date()) {
  // 账单日当天的消费仍计入本期，所以 nextBill 取到今天即可
  return daysBetween(from, dueAfter(nextBill(c, from), c));
}
function nextFeeDate(c, from = new Date()) {
  if (!c.feeDate || !+c.annualFee) return null;
  const t = day0(from), o = new Date(c.feeDate + 'T00:00:00');
  let d = billDateIn(t.getFullYear(), o.getMonth(), o.getDate());
  if (d < t) d = billDateIn(t.getFullYear() + 1, o.getMonth(), o.getDate());
  return d;
}
function waiverInfo(c) {
  const target = +c.waiverTarget || 0, done = +c.waiverDone || 0;
  if (!+c.annualFee) return { label: '无年费', cls: 'ok', pct: 100 };
  if (c.waiverType === 'rigid') return { label: '刚性年费', cls: 'bad', pct: 0 };
  if ((c.waiverType === 'count' || c.waiverType === 'amount') && target) {
    const pct = Math.min(100, Math.round(done / target * 100));
    const unit = c.waiverType === 'count' ? '笔' : '元';
    return { label: pct >= 100 ? '记录已达标，需银行确认' : `减免进度 ${done}/${target}${unit}`, cls: pct >= 100 ? 'ok' : 'warn', pct };
  }
  if (c.waiverType === 'points') return { label: '可积分抵扣', cls: 'warn', pct: 0 };
  return { label: c.waiverType === 'none' ? '无减免' : '见政策说明', cls: 'warn', pct: 0 };
}
const dayTag = n => n < 0 ? '已过' : n === 0 ? '今天' : `${n} 天后`;
const urgency = n => n <= 3 ? 'bad' : n <= 7 ? 'warn' : '';

// ---------- 卡片列表 ----------
function renderCards() {
  const el = $('#tab-cards');
  if (!cards.length) { el.innerHTML = '<div class="empty">还没有信用卡，点右下角 + 添加（支持拍照识别）</div>'; return; }
  const list = [...cards].sort((a, b) => daysBetween(new Date(), nextDue(a)) - daysBetween(new Date(), nextDue(b)));
  el.innerHTML = '<div class="grid">' + list.map(c => {
    const due = daysBetween(new Date(), nextDue(c));
    const fee = nextFeeDate(c), w = waiverInfo(c);
    const benefits = (c.benefits || '').split('\n').map(s => s.trim()).filter(Boolean);
    return `<div class="panel" data-id="${esc(c.id)}" style="cursor:pointer">
      <div class="cc" style="background:linear-gradient(135deg,${esc(c.color||'#2f5bea')},#1d2433)">
        <div class="bank">${esc(c.bank)} ${esc(c.name)}</div>
        <div class="num">•••• •••• •••• ${esc(c.last4||'----')}</div>
        <div class="meta"><span>${esc(c.network)} ${esc(c.expiry||'')}</span><span>${c.limit?'额度 '+c.limit:''}</span></div>
      </div>
      <div style="margin-top:10px">
        <span class="tag ${urgency(due)}">预计还款 ${fmtDate(nextDue(c))}（${dayTag(due)}）</span>
        <span class="tag">账单日 每月${c.billDay}号</span>
        <span class="tag">今天消费预计免息 ${freeDays(c)} 天</span>
      </div>
      <div>${+c.annualFee ? `<span class="tag">年费 ¥${c.annualFee}</span>` : '<span class="tag ok">免年费</span>'}
        ${fee ? `<span class="tag ${urgency(daysBetween(new Date(), fee))}">扣费 ${fmtDate(fee)}</span>` : ''}
        <span class="tag ${w.cls}">${w.label}</span></div>
      ${w.pct && w.pct < 100 ? `<div class="bar"><i style="width:${w.pct}%"></i></div>` : ''}
      ${c.waiverNote ? `<div style="color:var(--sub);font-size:13px;margin-top:6px">减免：${esc(c.waiverNote)}</div>` : ''}
      ${benefits.length ? `<div style="margin-top:6px">${benefits.map(b => `<span class="tag">${esc(b)}</span>`).join('')}</div>` : ''}
    </div>`;
  }).join('') + '</div>';
  el.querySelectorAll('[data-id]').forEach(n => n.onclick = () => openForm(n.dataset.id));
}
// ---------- 表单 ----------
const form = $('#form');
let editingId = null;
let formSession = 0;
$('#banks').innerHTML = BANKS.map(b => `<option value="${b}">`).join('');
function openForm(id) {
  formSession++;
  editingId = id || null;
  form.reset();
  const c = cards.find(x => x.id === id);
  $('#formTitle').textContent = c ? '编辑信用卡' : '添加信用卡';
  $('#delBtn').hidden = !c;
  $('#ocrStatus').textContent = 'OCR 在本地处理，但需联网下载第三方组件与语言包；请遮挡完整卡号和 CVV，只保存尾号。识别结果需核对。';
  if (c) for (const [k, v] of Object.entries(c)) if (form.elements[k]) form.elements[k].value = v ?? '';
  $('#modal').classList.add('show');
}
const closeForm = () => { formSession++; $('#modal').classList.remove('show'); };
$('#addBtn').onclick = () => openForm();
$('#cancel').onclick = closeForm;
$('#delBtn').onclick = () => {
  if (!confirm('确定删除这张卡？')) return;
  if (commitCards(cards.filter(x => x.id !== editingId))) { closeForm(); renderAll(); }
};
form.onsubmit = e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const next = editingId ? cards.map(c => c.id === editingId ? { ...c, ...data } : c)
    : [...cards, { id: crypto.randomUUID(), ...data }];
  if (commitCards(next)) { closeForm(); renderAll(); }
};

// ---------- 拍照识别 (Tesseract.js, 浏览器本地) ----------
$('#camBtn').onclick = () => { if (confirm('识别需下载第三方 OCR 代码和语言包。请先遮挡完整卡号和 CVV；照片不作为卡片数据保存。继续？')) $('#photo').click(); };
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    const timer = setTimeout(() => rej(new Error('OCR 组件加载超时，请手动填写')), 30000);
    s.onload = () => { clearTimeout(timer); res(); }; s.onerror = () => { clearTimeout(timer); rej(new Error('OCR 组件加载失败，请检查网络')); };
    document.head.appendChild(s);
  });
}
function parseCardText(text) {
  const out = {};
  const compact = text.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
  const num = (compact.match(/(?:\d[\s-]?){15,19}/) || [])[0];
  if (num) {
    const d = num.replace(/\D/g, '');
    out.last4 = d.slice(-4);
    out.network = /^4/.test(d) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(d) ? 'MasterCard'
      : /^3[47]/.test(d) ? 'American Express' : /^35/.test(d) ? 'JCB' : /^62/.test(d) ? '银联' : '';
  }
  const exp = compact.match(/\b(0[1-9]|1[0-2])\s*[\/\-]\s*(\d{2})\b/);
  if (exp) out.expiry = `${exp[1]}/${exp[2]}`;
  const bank = BANKS.find(b => text.includes(b) || text.includes(b.replace('银行', '')));
  if (bank) out.bank = bank;
  return out;
}
let ocrTask = 0;
$('#photo').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const st = $('#ocrStatus');
  const session = formSession;
  const task = ++ocrTask;
  const snapshot = Object.fromEntries([...form.elements].filter(x => x.name).map(x => [x.name, x.value]));
  try {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('请选择不超过 10 MB 的图片');
    st.textContent = '正在加载识别组件…';
    await loadTesseract();
    const r = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: m => { if (task === ocrTask && session === formSession && m.status === 'recognizing text') st.textContent = `识别中 ${Math.round(m.progress * 100)}%`; }
    });
    const got = parseCardText(r.data.text);
    if (task !== ocrTask || formSession !== session || !$('#modal').classList.contains('show')) return;
    const filled = [];
    for (const [k, v] of Object.entries(got)) if (v && form.elements[k] && !snapshot[k] && !form.elements[k].value) { form.elements[k].value = v; filled.push(k); }
    st.textContent = filled.length ? `已填入：${filled.join('、')}，请核对。` : '未填入新信息（已有值不会覆盖），请手动核对。';
  } catch (err) { if (task === ocrTask && formSession === session) st.textContent = err.message; }
  finally { if (task === ocrTask) e.target.value = ''; }
};
// ---------- 分析 ----------
function renderAnalysis() {
  const el = $('#tab-analysis');
  if (!cards.length) { el.innerHTML = '<div class="empty">添加信用卡后查看分析</div>'; return; }
  const now = new Date();
  const totalFee = cards.reduce((s, c) => s + (+c.annualFee || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + (+c.limit || 0), 0);
  const waivable = cards.filter(c => +c.annualFee && waiverInfo(c).pct >= 100);
  const saved = waivable.reduce((s, c) => s + +c.annualFee, 0);
  const best = [...cards].sort((a, b) => freeDays(b) - freeDays(a))[0];
  const dues = [...cards].sort((a, b) => nextDue(a) - nextDue(b));
  const fees = cards.map(c => ({ c, d: nextFeeDate(c) })).filter(x => x.d).sort((a, b) => a.d - b.d);
  const risk = cards.filter(c => +c.annualFee && c.waiverType !== 'rigid' && waiverInfo(c).pct < 100 && nextFeeDate(c) && daysBetween(now, nextFeeDate(c)) <= 60);
  el.innerHTML = `<div class="grid">
    <div class="panel"><h3>总览</h3>
      <div class="item">卡片数量：<b>${cards.length}</b></div>
      <div class="item">录入额度合计：<b>¥${totalLimit}</b>（未去除共享额度）</div>
      <div class="item">年费合计：<b>¥${totalFee}</b>（记录达标部分 ¥${saved}，扣除后估算 ¥${totalFee - saved}；须银行确认）</div>
    </div>
    <div class="panel"><h3>今日消费：按预计免息期推荐</h3>
      <div class="item"><b>${esc(best.bank)} ${esc(best.name)}</b>（尾号 ${esc(best.last4)}）</div>
      <div class="item">免息期约 ${freeDays(best)} 天，本次消费预计还款日 ${fmtDate(dueAfter(nextBill(best), best))}</div>
      <div style="color:var(--sub);font-size:13px">按账单日后还款天数估算，刚过账单日的卡免息期最长。</div>
    </div>
    <div class="panel"><h3>还款日历</h3>
      ${dues.map(c => { const n = daysBetween(now, nextDue(c)); return `<div class="item">${fmtDate(nextDue(c))} <span class="tag ${urgency(n)}">${dayTag(n)}</span> ${esc(c.bank)}${esc(c.name)}</div>`; }).join('')}
    </div>
    <div class="panel"><h3>年费扣费日历</h3>
      ${fees.length ? fees.map(({c, d}) => { const w = waiverInfo(c); return `<div class="item">${fmtDate(d)} ¥${c.annualFee} ${esc(c.bank)}${esc(c.name)} <span class="tag ${w.cls}">${w.label}</span></div>`; }).join('') : '<div class="item">暂无年费卡</div>'}
    </div>
    <div class="panel"><h3>年费风险提醒</h3>
      ${risk.length ? risk.map(c => `<div class="item"><span class="tag bad">60 天内扣费</span> ${esc(c.bank)}${esc(c.name)}：${waiverInfo(c).label}，${fmtDate(nextFeeDate(c))} 扣 ¥${c.annualFee}</div>`).join('') : '<div class="item">暂无 60 天内未达标的年费</div>'}
    </div>
    <div class="panel"><h3>账单日分布</h3>
      ${[...cards].sort((a, b) => a.billDay - b.billDay).map(c => `<div class="item">每月 ${c.billDay} 号 · ${esc(c.bank)}${esc(c.name)}</div>`).join('')}
    </div>
  </div>`;
}

// ---------- 知识 ----------
function renderKnowledge() {
  $('#tab-knowledge').innerHTML = '<div class="panel kn">' + KNOWLEDGE.map((k, i) =>
    `<details ${i === 0 ? 'open' : ''}><summary>${k.t}</summary><ul>${k.b.map(x => `<li>${x}</li>`).join('')}</ul></details>`).join('') + '</div>';
}

// ---------- 数据 ----------
function renderData() {
  $('#tab-data').innerHTML = `<div class="panel"><h3>备份与恢复</h3>
    <p style="color:var(--sub)">数据未加密，只保存在当前浏览器中。换设备、卸载或清缓存前请先导出，备份请妥善保管。导入会覆盖，不会合并。</p>
    ${storageIssue ? `<p>${esc(storageIssue)}</p><button class="btn" id="raw">导出原始数据</button>` : ''}
    <div class="row"><button class="btn" id="exp">导出 JSON</button>
    <button class="btn ghost" id="imp">导入 JSON</button></div>
    <input type="file" id="impFile" accept=".json,application/json" hidden></div>`;
  if ($('#raw')) $('#raw').onclick = () => { try { downloadJSON(localStorage.getItem(KEY) || '', 'credit-cards-recovery.json'); } catch (err) { alert(err.message); } };
  $('#exp').onclick = () => {
    if (storageIssue) { alert(storageIssue); return; }
    downloadJSON(JSON.stringify(cards, null, 2), `credit-cards-${fmtDate(new Date())}.json`);
  };
  $('#imp').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async e => {
    try {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB');
      const arr = validateCards(JSON.parse(await file.text()));
      if (confirm(`导入 ${arr.length} 张卡，将覆盖当前数据（包括损坏原数据），继续？`) && commitCards(arr, true)) renderAll();
    } catch (err) { alert(`导入失败：${err.message}`); }
    finally { e.target.value = ''; }
  };
}

// ---------- 路由 ----------
const renderers = { cards: renderCards, analysis: renderAnalysis, knowledge: renderKnowledge, data: renderData };
function downloadJSON(text, name) {
  if (window.CardExport) { window.CardExport.save(text); return; }
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let tab = 'cards';
function renderAll() { renderers[tab](); }
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  Object.keys(renderers).forEach(k => $('#tab-' + k).hidden = k !== tab);
  $('#addBtn').hidden = tab !== 'cards';
  renderAll();
});
cards = loadCards();
renderAll();
if (storageIssue) alert(storageIssue);

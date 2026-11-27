const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
function context(raw = '[]', fail = false) {
  const elements = new Map();
  const element = s => {
    if (!elements.has(s)) elements.set(s, {innerHTML:'', hidden:false, elements:[], querySelectorAll:()=>[], classList:{contains:()=>true, add(){}, remove(){}}});
    return elements.get(s);
  };
  const alerts = [];
  const c = vm.createContext({
    document:{querySelector:element, querySelectorAll:()=>[]},
    localStorage:{getItem:()=>raw, setItem(){if(fail) throw Error('quota');}},
    alert: s=>alerts.push(s), console, setTimeout, clearTimeout
  });
  vm.runInContext(source, c);
  c.alerts = alerts;
  return c;
}
const card = {id:'test-1', bank:'测试银行', billDay:'10', graceDays:'20', waiverType:'none'};
test('损坏或不合法存储不会导致启动崩溃，也不会覆盖原数据', () => {
  for (const raw of ['{', '{}', '[null]']) {
    const c = context(raw);
    assert.equal(vm.runInContext('cards.length', c), 0);
    assert.equal(vm.runInContext('commitCards([])', c), false);
    assert.ok(c.alerts.length);
  }
});
test('导入允许旧版字符串数值，并规范化数值', () => {
  const c = context();
  c.input = [{...card, limit:120.50, last4:'1234', feeDate:'2024-02-29'}];
  assert.equal(vm.runInContext('validateCards(input)[0].limit', c), '120.5');
});
test('拒绝未知字段、注入、重复 ID、非法数值与日期', () => {
  const c = context();
  for (const patch of [
    {id:'"><script>'}, {bank:null}, {last4:'1234567890123456'}, {expiry:'13/29'},
    {network:'evil'}, {color:'red;display:none'}, {billDay:'0'}, {billDay:'1.5'},
    {graceDays:'91'}, {limit:'Infinity'}, {limit:'1e5'}, {limit:-1}, {annualFee:1e10},
    {feeDate:'2025-02-29'}, {feeDate:'0000-01-01'}, {note:[]}, {fullNumber:'secret'}
  ]) {
    c.input = [{...card,...patch}];
    assert.throws(()=>vm.runInContext('validateCards(input)', c), JSON.stringify(patch));
  }
  c.input = [card, card];
  assert.throws(()=>vm.runInContext('validateCards(input)', c));
});
test('保存失败不改变内存，明确恢复可以替换损坏数据', () => {
  const c = context('[]', true);
  c.input = [card];
  assert.equal(vm.runInContext('commitCards(input)', c), false);
  assert.equal(vm.runInContext('cards.length', c), 0);
  const recovery = context('{');
  recovery.input = [card];
  assert.equal(vm.runInContext('commitCards(input, true)', recovery), true);
});
test('本次消费还款日不使用上一期尚未到期的还款日', () => {
  const c = context(); c.input = card;
  assert.equal(vm.runInContext("fmtDate(nextDue(input, new Date(2026,0,11)))", c), '2026-01-30');
  assert.equal(vm.runInContext("fmtDate(dueAfter(nextBill(input, new Date(2026,0,11)), input))", c), '2026-03-02');
  assert.equal(vm.runInContext("freeDays(input, new Date(2026,0,10))", c), 20);
});
test('月底账单和闰日年费按月末收敛', () => {
  const c = context();
  assert.equal(vm.runInContext('fmtDate(billDateIn(2025,1,31))', c), '2025-02-28');
  assert.equal(vm.runInContext("fmtDate(nextFeeDate({feeDate:'2024-02-29',annualFee:100}, new Date(2025,0,1)))", c), '2025-02-28');
});
test('OCR 未知卡组织不默认银联，已识别 Visa 正确返回', () => {
  const c = context();
  assert.equal(vm.runInContext("parseCardText('4111 1111 1111 1111').network", c), 'Visa');
  assert.equal(vm.runInContext("parseCardText('9111 1111 1111 1111').network", c), '');
  assert.match(fs.readFileSync(`${__dirname}/index.html`, 'utf8'), /select name="network"><option value=""/);
});
test('OCR 只填空字段，不覆盖已有卡组织或识别期间手动填写值', async () => {
  const c = context();
  let complete;
  c.Tesseract = {recognize:()=>new Promise(resolve=>{complete=resolve;})};
  c.window = {Tesseract:c.Tesseract};
  vm.runInContext(`
    form.elements = [{name:'network',value:'JCB'},{name:'bank',value:''},{name:'last4',value:''}];
    for (const field of form.elements) form.elements[field.name] = field;
  `, c);
  const event = {target:{files:[{type:'image/jpeg',size:20}],value:'photo'}};
  c.event = event;
  const task = vm.runInContext("$('#photo').onchange(event)", c);
  await Promise.resolve();
  vm.runInContext("form.elements.bank.value = '手动银行'", c);
  complete({data:{text:'招商银行 4111 1111 1111 1111'}});
  await task;
  assert.equal(vm.runInContext('form.elements.network.value', c), 'JCB');
  assert.equal(vm.runInContext('form.elements.bank.value', c), '手动银行');
  assert.equal(vm.runInContext('form.elements.last4.value', c), '1111');
  assert.equal(event.target.value, '');
});
test('取消 JSON 文件选择不会改变数据', async () => {
  const c = context(JSON.stringify([card]));
  vm.runInContext('renderData()', c);
  c.event = {target:{files:[],value:'cancel'}};
  await vm.runInContext("$('#impFile').onchange(event)", c);
  assert.equal(vm.runInContext('cards.length', c), 1);
  assert.equal(c.event.target.value, '');
});

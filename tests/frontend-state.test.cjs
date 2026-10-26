const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const source = readFileSync(join(__dirname, '../frontend/app.js'), 'utf8');

async function fixture(initial = {}, search = '') {
  const values = new Map(Object.entries(initial));
  const nodes = new Map();
  const listeners = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {innerHTML:'', textContent:'', isConnected:true, focus(){}});
    return nodes.get(id);
  };
  const context = vm.createContext({
    URLSearchParams, Date, console, crypto:{randomUUID},
    localStorage:{getItem:k => values.get(k) ?? null, setItem:(k,v) => values.set(k,v)},
    location:{search, hash:'#home'},
    window:{API_BASE:'', addEventListener(){}, scrollTo(){}, print(){}},
    document:{getElementById:node, querySelectorAll:() => [], body:{dataset:{}},
      addEventListener:(name, fn) => { listeners[name] = fn; }},
    fetch:async () => ({ok:true, json:async () => ({items:[], infections:[], notice:'sample', alerts:[]})})
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {values, listeners, run:code => vm.runInContext(code,context),
    get:code => JSON.parse(JSON.stringify(vm.runInContext(code,context)))};
}

test('normal startup has no invented family, weather, symptoms or exposure', async () => {
  const f = await fixture();
  assert.deepEqual(f.get('S.family'), []);
  assert.deepEqual(f.get('S.card'), {weather:'',exposure:'',hours:'',symptoms:''});
  assert.equal(f.get('S.cardResult'), null);
});

test('switching people separates diagnoses, documents and payment identity', async () => {
  const f = await fixture();
  f.run(`var original = currentCase(); original.check.diagnosis_codes=['T67'];
    original.codeInput='T67'; original.docs['진단서 또는 소견서']=true;
    original.claimForm.name='테스트 본인'; original.result={total_amount:150000};
    S.family.push({id:'parent',name:'테스트 가족',age:72,sigungu:'부천시',vulnerable:true});
    selectPerson('parent');`);
  assert.deepEqual(f.get('currentCase().check.diagnosis_codes'), []);
  assert.deepEqual(f.get('currentCase().docs'), {});
  assert.equal(f.get('currentCase().claimForm.name'), '');
  assert.equal(f.get('currentCase().result'), null);
  f.run("selectPerson('self')");
  assert.deepEqual(f.get('currentCase().check.diagnosis_codes'), ['T67']);
  assert.equal(f.get("currentCase().docs['진단서 또는 소견서']"), true);
  assert.equal(f.get('currentCase().claimForm.name'), '테스트 본인');
});

test('new visit starts blank while the previous visit remains available', async () => {
  const f = await fixture();
  f.run(`var first=currentCase(); first.codeInput='T68'; first.docs.proof=true;
    first.result={total_amount:150000}; newCase();`);
  assert.equal(f.get('currentCase().codeInput'), '');
  assert.deepEqual(f.get('currentCase().docs'), {});
  assert.equal(f.get('currentCase().result'), null);
  assert.equal(f.get('S.cases.length'), 2);
  assert.equal(f.get('S.cases[0].codeInput'), 'T68');
});

test('editing an input invalidates the previous result', async () => {
  const f = await fixture();
  f.run(`currentCase().result={total_amount:150000};
    updateInput({id:'diagnosis-input',value:'T68',dataset:{}});`);
  assert.equal(f.get('currentCase().result'), null);
  assert.equal(f.get('currentCase().codeInput'), 'T68');
});

test('changing the visit date clears document completion', async () => {
  const f = await fixture();
  f.run(`currentCase().docs.proof=true; currentCase().result={total_amount:1};
    updateInput({id:'event_date',type:'date',value:'2025-08-01',dataset:{field:'event_date'}});`);
  assert.deepEqual(f.get('currentCase().docs'), {});
  assert.equal(f.get('currentCase().result'), null);
});

test('demo never reads personal case records or writes local storage', async () => {
  const initial = {'cheonguri.workspace.v2': JSON.stringify({family:[{id:'private-person'}],cases:[]}),
    'cheonguri.check':JSON.stringify({diagnosis_codes:['T67']})};
  const f = await fixture(initial, '?demo=1');
  assert.equal(f.get('S.family[0].id'), 'demo-mother');
  f.run("currentCase().docs.proof=true; newCase(); save()");
  assert.deepEqual(Object.fromEntries(f.values), initial);
});

test('legacy migration preserves input without reusing old results or checked documents', async () => {
  const f = await fixture({
    'cheonguri.check':JSON.stringify({event_date:'2026-08-05',diagnosis_codes:['T67']}),
    'cheonguri.docs':JSON.stringify({proof:true}),
    'cheonguri.result':JSON.stringify({total_amount:150000})
  });
  assert.equal(f.get('currentCase().codeInput'), 'T67');
  assert.deepEqual(f.get('currentCase().docs'), {});
  assert.equal(f.get('currentCase().result'), null);
  assert.equal(f.get('currentCase().check.resident_on_event'), null);
});

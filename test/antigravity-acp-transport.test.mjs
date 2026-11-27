import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as adapterModule from '../components/subscriptions/lib/antigravity-cli-adapter.js';
import * as local from '../components/subscriptions/lib/antigravity-cli-local.js';

const message = (role,text,source) => ({role,content:[{type:'text',text}],...(source?{source:{kind:source}}:{})});
const ask = text => message('user',text,'user');
const answer = text => message('assistant',text,'model');
const emit = text => [{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text},{type:'block-end',index:0,block:{type:'text',text}},{type:'finish',reason:{kind:'stop'}}];
async function collect(iter) { const chunks=[]; for await(const chunk of iter) chunks.push(chunk); return chunks; }
const failure = code => new local.AgyCliError(code,code);
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'spig-acp-transport-'));
  const {createAcpTransport}=await import('../components/subscriptions/lib/antigravity-acp-transport.js').catch(e=>{ if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; return {}; });
  assert.equal(typeof createAcpTransport,'function','the ACP session router must be exported');
  const events=[], clients=[], warnings=[]; let mode='acp', behavior, replay=true;
  const make=() => createAcpTransport({root, modeOf:()=>mode,onWarn:m=>warnings.push(m),fallback:async function*(o){events.push(['fallback',o]);yield* emit('fallback');},clientFactory:o=>{
    let alive=true;
    const c={get alive(){return alive;},async initialize(){events.push(['init',o]);},async newSession({model}){events.push(['new',model]);return `agy-${clients.length}`;}, async loadSession({sessionId}){events.push(['load',sessionId]);return replay;}, async *prompt({text}){events.push(['prompt',text]);if(behavior)yield* behavior();else yield* emit('ok');},dispose(){alive=false;}};
    clients.push(c);return c;
  }});
  const transport=make(); t.after(async()=>{await transport.disposeAll();await fs.rm(root,{force:true,recursive:true});});
  const options=(messages,extra)=>({sessionId:'dsh-one',model:'gemini-4-hydrogen-low',messages,...extra});
  return {root,events,clients,warnings,make,transport,options,setBehavior:b=>behavior=b,setReplay:b=>replay=b,setMode:m=>mode=m};
}

test('incremental turn does not resend the prior history after a matching answer', async t=>{
  const f=await fixture(t), first=ask('historic secret'), second=ask('current question');
  await collect(f.transport.stream(f.options([first])));
  await collect(f.transport.stream(f.options([first,answer('ok'),second])));
  const prompts=f.events.filter(([type])=>type==='prompt');
  assert.equal(f.clients.length,1);
  assert.match(prompts[0][1],/historic secret/);
  assert.doesNotMatch(prompts[1][1],/historic secret/);
  assert.ok(prompts[1][1].endsWith('current question'));
});

test('restores persisted binding with replay and rebuilds if replay is absent', async t=>{
  const f=await fixture(t), a=ask('original'), b=ask('next');
  await collect(f.transport.stream(f.options([a]))); await f.transport.disposeAll();
  const restored=f.make();t.after(()=>restored.disposeAll());
  await collect(restored.stream(f.options([a,answer('ok'),b])));
  assert.deepEqual(f.events.filter(([type])=>type==='load'),[['load','agy-1']]);
  assert.doesNotMatch(f.events.filter(([type])=>type==='prompt').at(-1)[1],/original/);
  await restored.disposeAll();f.setReplay(false);
  const third=f.make();t.after(()=>third.disposeAll());
  await collect(third.stream(f.options([a,answer('ok'),b,answer('ok'),ask('third')])));
  assert.match(f.events.filter(([type])=>type==='prompt').at(-1)[1],/original/);
});

test('prefix rewrite, model change and workspace change each rebuild',async t=>{
  const f=await fixture(t);
  await collect(f.transport.stream(f.options([ask('original')])));
  const rewritten=[ask('checkpoint'),answer('ok'),ask('after compact')];
  await collect(f.transport.stream(f.options(rewritten)));
  await collect(f.transport.stream(f.options([...rewritten,answer('ok'),ask('after model')],{model:'another-model'})));
  await collect(f.transport.stream(f.options([...rewritten,answer('ok'),ask('after model'),answer('ok'),ask('after dir')],{model:'another-model',workspaceDir:os.tmpdir()})));
  assert.equal(f.events.filter(([type])=>type==='new').length,4);
  assert.match(f.events.filter(([type])=>type==='prompt').at(-1)[1],/checkpoint/);
});

test('a transport failure before output falls back, including after handshake',async t=>{
  const f=await fixture(t);f.setBehavior(function*(){throw new local.AgyCliError('PRIVATE PROMPT CONTENT','ACP_TRANSPORT');});
  assert.equal((await collect(f.transport.stream(f.options([ask('current')]))))[1].text,'fallback');
  assert.equal(f.warnings.length,1);assert.equal(f.clients[0].alive,false);
  assert.match(f.warnings[0], /ACP_TRANSPORT, stage=session\/prompt.*session=[a-f0-9]{12}/u);
  assert.doesNotMatch(f.warnings[0], /PRIVATE PROMPT CONTENT/u);
});

test('never fall back on semantic failures or after the first emitted block',async t=>{
  const f=await fixture(t);
  for(const code of ['RATE_LIMIT','AUTH','ABORTED','INVALID_REQUEST','EMPTY_RESPONSE']){
    f.setBehavior(function*(){throw failure(code);});
    await assert.rejects(collect(f.transport.stream(f.options([ask('current')]))),{code});
  }
  f.setBehavior(function*(){yield emit('partial')[0];throw failure('ACP_TRANSPORT');});
  await assert.rejects(collect(f.transport.stream(f.options([ask('current')]))),{code:'ACP_TRANSPORT'});
  assert.equal(f.events.filter(([type])=>type==='fallback').length,0);
});

test('compaction purpose and compaction mode bypass ACP; switching back restores the fallback',async t=>{
  const f=await fixture(t);
  f.setMode('compaction');await collect(f.transport.stream(f.options([ask('current')])));
  f.setMode('acp');await collect(f.transport.stream(f.options([ask('current')],{purpose:'compaction'})));
  await collect(f.transport.stream(f.options([ask('current')])));
  f.setMode('compaction');await collect(f.transport.stream(f.options([ask('current')])));
  assert.deepEqual(f.events.map(([type])=>type),['fallback','fallback','init','new','prompt','fallback']);
});

test('uses the async chunk branch without changing the legacy run branch',async()=>{
  const adapter=adapterModule.createCliAdapter({list:async()=>[{id:'probe',name:'Probe'}],run:async()=>{throw new Error('legacy run should not be called');},stream:async function*(){yield* emit('live');}});
  assert.equal((await collect(adapter.stream({model:'probe'})))[1].text,'live');
});

test('long-session timeout at session/prompt retries ACP on a fresh session instead of falling back to CLI compaction', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spig-acp-long-retry-'));
  const { createAcpTransport } = await import('../components/subscriptions/lib/antigravity-acp-transport.js');
  const warnings = [], fallbacks = [], newSessions = [], prompts = [];
  let promptAttempts = 0;
  const transport = createAcpTransport({
    root,
    modeOf: () => 'acp',
    onWarn: m => warnings.push(m),
    fallback: async function* (o) { fallbacks.push(o); yield* emit('fallback'); },
    clientFactory: () => ({
      alive: true,
      async initialize() {},
      async newSession() { const id = `agy-${newSessions.length + 1}`; newSessions.push(id); return id; },
      async loadSession() { return true; },
      async *prompt({ text }) {
        prompts.push(text);
        promptAttempts += 1;
        if (promptAttempts === 1) throw new local.AgyCliError('timed out', 'TIMEOUT', { acpDiagnostic: 'session/prompt idle timeout; 0 update(s)' });
        yield* emit('recovered-on-acp');
      },
      dispose() { this.alive = false; },
    }),
  });
  t.after(async () => { await transport.disposeAll(); await fs.rm(root, { force: true, recursive: true }); });
  const big = 'h'.repeat(95_000);
  const messages = [ask(big), answer(big), ask('current question')];
  const chunks = await collect(transport.stream({ sessionId: 'dsh-long-timeout', model: 'gemini-4-hydrogen-low', messages }));
  assert.equal(chunks.find(c => c.type === 'text-delta')?.text, 'recovered-on-acp');
  assert.equal(fallbacks.length, 0, 'must not fall back to stream-json when history exceeds CLI ceiling');
  assert.equal(newSessions.length, 2, 'must recreate ACP session on retry');
  assert.ok(warnings.some(w => /retrying ACP on a fresh session/u.test(w) && /TIMEOUT/u.test(w) && w.includes('stage=session/prompt')));
});

test('long-session handshake rejection refuses destructive stream-json fallback without blind ACP retry', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spig-acp-handshake-block-'));
  const { createAcpTransport } = await import('../components/subscriptions/lib/antigravity-acp-transport.js');
  const warnings = [], fallbacks = [];
  let initCalls = 0;
  const transport = createAcpTransport({
    root,
    modeOf: () => 'acp',
    onWarn: m => warnings.push(m),
    fallback: async function* (o) { fallbacks.push(o); yield* emit('fallback'); },
    clientFactory: () => ({
      alive: true,
      async initialize() {
        initCalls += 1;
        throw new local.AgyCliError('handshake rejected', 'ACP_TRANSPORT', { acpDiagnostic: 'unsupported-cli-version; CLI 2.0.0' });
      },
      async newSession() { throw new Error('must not run'); },
      async loadSession() { throw new Error('must not run'); },
      async *prompt() { throw new Error('must not run'); },
      dispose() { this.alive = false; },
    }),
  });
  t.after(async () => { await transport.disposeAll(); await fs.rm(root, { force: true, recursive: true }); });
  const big = 'h'.repeat(95_000);
  const messages = [ask(big), answer(big), ask('current question')];
  await assert.rejects(
    collect(transport.stream({ sessionId: 'dsh-long-handshake', model: 'gemini-4-hydrogen-low', messages })),
    (err) => {
      assert.equal(err.code, 'ACP_TRANSPORT');
      assert.ok(err.message.includes('stage=initialize'));
      assert.ok(err.message.includes('unsupported-cli-version; CLI 2.0.0'));
      assert.match(err.message, /would force compaction/u);
      return true;
    },
  );
  assert.equal(initCalls, 1, 'handshake failure must not waste a blind ACP retry');
  assert.equal(fallbacks.length, 0, 'must not fall back to stream-json and force compaction');
  assert.ok(warnings.some(w => w.includes('stage=initialize') && w.includes('unsupported-cli-version')));
});

test('transport switch defaults to compaction and changes only on valid values',()=>{
  assert.equal(local.agyTransport?.(),'compaction');
  local.setAgyTransport('acp');assert.equal(local.agyTransport(),'acp');
  assert.throws(()=>local.setAgyTransport('other'));
  local.setAgyTransport('compaction');
});

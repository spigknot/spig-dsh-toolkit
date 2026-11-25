import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { ACP_DENIED_ANSWER, createAcpClient } from './antigravity-acp-client.js';
import { deliverAcpContext } from './antigravity-context-delivery.js';
import { agyBridgeFor, agyToolBridge, agyTransport, AGY_PROMPT_TOO_LARGE, AgyCliError, debugLog, runAgy, splitPrompt } from './antigravity-cli-local.js';
import { answerChunks, canonicalAnswer, invalidCallFeedback, noteInvalidCalls, parseToolBridgeOutput } from './antigravity-tool-bridge.js';
import { streamCliResult } from './antigravity-cli-adapter.js';

const STATE_VERSION = 1;
const FALLBACK_CODES = new Set(['ACP_TRANSPORT', 'TIMEOUT']);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Compare request content and provenance, not transient IDs assigned when the
// request becomes part of the durable session. Keep exact order and role.
function fingerprint(messages, system) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(system ?? '') + '\n');
  for (const m of messages) {
    hash.update(JSON.stringify([m.role, m.source?.kind ?? (m.role === 'user' ? 'user' : null), m.content, m.toolCallId]) + '\n');
  }
  return hash.digest('hex');
}

// The answer as this transport produced it: text, plus each bridged tool
// call's name and arguments (ids are DSH's to keep, not part of the match).
function assistantText(message) {
  if (message?.role !== 'assistant') return undefined;
  return canonicalAnswer(message.content);
}

/**
 * DSH tool bridge over ACP: buffer one answer, then re-emit it as text plus
 * DSH tool calls. Nothing is yielded before the answer is complete, so the
 * raw tagged blocks never reach the person and a pre-answer failure can still
 * fall back. Errors and cancellations pass through unchanged.
 */
async function* bridged(source, bridge, retry) {
  const collectOne = async (stream) => {
    const buffered = [];
    let text = '', reasoning = '';
    for await (const chunk of stream) {
      if (chunk.type === 'finish' && chunk.reason?.kind !== 'error' && chunk.reason?.kind !== 'aborted') {
        return { done: true, buffered, text, reasoning, usage: buffered.find(c => c.type === 'usage')?.usage };
      }
      buffered.push(chunk);
      if (chunk.type === 'text-delta') text += chunk.text;
      if (chunk.type === 'reasoning-delta') reasoning += chunk.text;
      if (chunk.type === 'finish') return { done: false, buffered };
    }
    return { done: false, buffered };
  };
  let turn = await collectOne(source);
  if (!turn.done) { yield* turn.buffered; return; }
  let parsed = parseToolBridgeOutput(turn.text, bridge.tag, new Set(bridge.names));
  if (parsed.calls.length === 0 && parsed.invalid.length > 0 && retry) {
    const second = await collectOne(retry(invalidCallFeedback(bridge.tag, parsed.invalid)));
    if (!second.done) { yield* second.buffered; return; }
    if (second.text.trim()) {
      turn = second;
      parsed = parseToolBridgeOutput(second.text, bridge.tag, new Set(bridge.names));
    }
  }
  yield* answerChunks({text: noteInvalidCalls(parsed.text, parsed.invalid), calls: parsed.calls, usage: turn.usage, reasoning: turn.reasoning});
}

function matches(entry, options, workspaceDir, bridgeKey) {
  const messages = options.messages ?? [];
  return entry && entry.model === options.model && entry.workspaceDir === workspaceDir &&
    (entry.bridgeKey ?? null) === bridgeKey &&
    entry.effort === (options.reasoningEffort ?? null) && Number.isSafeInteger(entry.syncedCount) &&
    entry.syncedCount > 0 && entry.syncedCount < messages.length - 1 &&
    entry.lastFingerprint === fingerprint(messages.slice(0, entry.syncedCount), options.system) &&
    typeof assistantText(messages[entry.syncedCount]) === 'string' &&
    entry.answerFingerprint === digest(assistantText(messages[entry.syncedCount])) &&
    !messages.slice(entry.syncedCount + 1).some(m => m.role === 'assistant');
}

async function ensureDir(dir) {
  await mkdir(dir, {recursive:true, mode:0o700});
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ACP private directory is not a real directory');
}

async function atomicWrite(file, obj) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(obj), {mode:0o600, flag:'wx'});
    await rename(temp, file);
  } finally { await unlink(temp).catch(() => {}); }
}

// The installed ACP does not accept --settings. Use the tested isolated config
// and mandatory permission callback. No workspace config, credentials, or
// personal settings are copied into it. Never run in auto/accept-edits mode.
async function preparePolicy(root, key) {
  await ensureDir(root);
  const privateDir = path.join(root, key);
  await ensureDir(privateDir);
  const contextDir = path.join(privateDir, 'context');
  const stateDir = path.join(privateDir, 'gemini');
  await ensureDir(contextDir);
  await ensureDir(stateDir);
  const agyDir = path.join(stateDir, 'antigravity-cli');
  const profileDir = path.join(agyDir, 'spig-acp');
  await ensureDir(agyDir);
  await ensureDir(profileDir);
  await atomicWrite(path.join(profileDir, 'settings.json'), {
    toolPermission:'strict',
    permissions:{allow:['read_file(*)'],deny:['write_file(*)','command(*)','execute_url(*)','download_url(*)','mcp(*)','read_url(*)']}
  });
  return {contextDir,stateDir};
}

export function createAcpTransport({
  root, modeOf = agyTransport, bridgeEnabledOf = agyToolBridge, onWarn, clientFactory = createAcpClient,
  fallback = options => streamCliResult(runAgy, options), idleTimeoutMs = 10 * 60_000,
  startupTimeoutMs, turnTimeoutMs, maxProcesses = 8
}) {
  if (!path.isAbsolute(root)) throw new TypeError('ACP storage path must be absolute');
  const bindingsFile = path.join(root, 'agy-acp-sessions.json');
  const live = new Map(), active = new Set(), cliRetries = new Map();
  const requestKey = options => { try { return digest(splitPrompt(options).requests); } catch { return undefined; } };
  async function* streamFallback(options, key) {
    try { yield* fallback(options); }
    catch (error) {
      if (error?.code === AGY_PROMPT_TOO_LARGE && key !== undefined) {
        const request = requestKey(options);
        if (request !== undefined) {
          if (cliRetries.size >= 256) cliRetries.delete(cliRetries.keys().next().value);
          cliRetries.set(key, {request, expires:Date.now()+10*60_000});
        }
      }
      throw error;
    }
  }
  let bindings, loading, writes = Promise.resolve(), stopped = false, generation = 0;
  function warn(message) { try { onWarn?.(message); } catch {} }
  async function store() {
    loading ??= (async () => {
      bindings = new Map();
      try {
        const data = JSON.parse(await readFile(bindingsFile, 'utf8'));
        if (data.version === STATE_VERSION && data.entries && typeof data.entries === 'object') {
          for (const [key, entry] of Object.entries(data.entries)) {
            if (/^[a-f\d]{64}$/u.test(key) && typeof entry?.agySessionId === 'string' && typeof entry?.lastFingerprint === 'string') bindings.set(key, entry);
          }
        }
      } catch (err) { if (err.code !== 'ENOENT') warn('Antigravity ACP binding could not be read; rebuilding from DSH history'); }
    })();
    await loading;
    return bindings;
  }
  async function save() {
    writes = writes.then(async () => {
      try { await atomicWrite(bindingsFile, {version:STATE_VERSION,entries:Object.fromEntries(bindings)}); }
      catch { warn('Antigravity ACP binding could not be saved'); }
    });
    await writes;
  }
  function close(key) {
    const rec = live.get(key);
    if (!rec) return Promise.resolve();
    live.delete(key);
    clearTimeout(rec.timer);
    return Promise.resolve(rec.client.dispose()).catch(() => {});
  }
  function closeLive() {
    ++generation;
    return Promise.all([...live.keys()].map(close));
  }
  async function disposeAll() {
    stopped = true;
    await closeLive();
    await writes;
  }
  function scheduleIdle(key, rec) {
    if (live.get(key) !== rec) return;
    rec.timer = setTimeout(() => { void close(key); }, idleTimeoutMs);
    rec.timer.unref?.();
  }
  async function streamWorkspace(dir) {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) return null;
    try { return await realpath(dir); } catch { return null; }
  }
  async function* stream(options) {
    // DSH conversation turns have no purpose tag. Auxiliary calls (including
    // explicit/native compaction) must never enter a user's ACP trajectory.
    if (options.purpose !== undefined || !options.sessionId) {
      yield* fallback(options);
      return;
    }
    const key = digest(String(options.sessionId));
    if (stopped || modeOf() !== 'acp') { yield* streamFallback(options,key); return; }
    if (options.signal?.aborted) throw new AgyCliError('Antigravity ACP request cancelled', 'ABORTED');
    const retry = cliRetries.get(key);
    if (retry) {
      cliRetries.delete(key);
      if (retry.expires >= Date.now() && retry.request === requestKey(options)) {
        yield* streamFallback(options,key);
        return;
      }
    }
    if (active.has(key)) throw new AgyCliError('Antigravity ACP already has an active turn for this session', 'INVALID_REQUEST');
    active.add(key);
    const epoch = generation;
    let emitted = false, committed = false, shouldFallback = false, rec, broken, entry;
    try {
      const map = await store();
      const workspaceDir = await streamWorkspace(options.workspaceDir);
      const assertCurrent = () => {
        if (options.signal?.aborted) throw new AgyCliError('Antigravity ACP request cancelled', 'ABORTED');
        if (stopped || generation !== epoch || modeOf() !== 'acp') throw new AgyCliError('Antigravity ACP transport changed during the turn', 'ACP_TRANSPORT');
      };
      assertCurrent();
      entry = map.get(key);
      // The bridge header lives in the agy session: a different tag or catalog
      // means a different session. Reuse the persisted tag after a restart.
      const bridge = agyBridgeFor(options, {enabled: bridgeEnabledOf() !== false, tag: entry?.bridgeTag});
      const bridgeKey = bridge === undefined ? null : digest([bridge.tag, bridge.header]);
      let incremental = matches(entry, options, workspaceDir, bridgeKey);
      rec = live.get(key);
      if (rec && (!rec.client.alive || !incremental)) { await close(key); rec = undefined; }
      if (!rec) {
        let dirs;
        try { dirs = await preparePolicy(root,key); }
        catch { throw new AgyCliError('Antigravity ACP private policy could not be prepared', 'ACP_TRANSPORT'); }
        assertCurrent();
        if (live.size >= maxProcesses) {
          const idle = [...live.keys()].find(id => !active.has(id));
          if (!idle) throw new AgyCliError('Antigravity ACP process limit is in use', 'ACP_TRANSPORT');
          await close(idle);
          assertCurrent();
        }
        const client = clientFactory({...dirs,workspaceDir,startupTimeoutMs,turnTimeoutMs});
        rec = {client,...dirs};
        live.set(key,rec);
        await client.initialize(options.signal);
        if (incremental) {
          incremental = await client.loadSession({sessionId:entry.agySessionId,model:options.model,signal:options.signal});
          if (incremental) rec.agySessionId = entry.agySessionId;
        }
        if (!incremental) {
          if (map.delete(key)) await save();
          rec.agySessionId = await client.newSession({model:options.model,signal:options.signal});
        }
      }
      clearTimeout(rec.timer);
      const request = incremental ? {messages:options.messages.slice(entry.syncedCount+1)} : options;
      const payload = await deliverAcpContext(request,{contextDir:rec.contextDir,incremental,onWarn:warn,bridge});
      assertCurrent();
      // Clear the durable checkpoint before the RPC: an interrupted provider
      // turn may have mutated upstream even if it never produced its answer.
      if (map.delete(key)) await save();
      assertCurrent();
      const text = [];
      let calls = '';
      const promptAcp = (promptText) => rec.client.prompt({sessionId:rec.agySessionId,text:promptText,signal:options.signal});
      const source = promptAcp(payload.text);
      for await (const chunk of bridge === undefined ? source : bridged(source, bridge, (feedback) => {
        options.signal?.throwIfAborted();
        return promptAcp(feedback);
      })) {
        if (chunk.type === 'text-delta') text.push(chunk.text);
        if (chunk.type === 'block-end' && chunk.block?.type === 'tool-call') calls += canonicalAnswer([chunk.block]);
        if (chunk.type === 'finish' && chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted' && text.join('') !== ACP_DENIED_ANSWER) {
          if (generation === epoch && !stopped) {
            map.set(key, {agySessionId:rec.agySessionId,model:options.model,workspaceDir,effort:options.reasoningEffort ?? null,bridgeKey,bridgeTag:bridge?.tag ?? null,
              syncedCount:(options.messages ?? []).length,lastFingerprint:fingerprint(options.messages ?? [],options.system),answerFingerprint:digest(text.join('') + calls)});
            await save();
            committed = true;
            scheduleIdle(key,rec);
          }
        }
        emitted = true;
        yield chunk;
      }
      if (!committed && !emitted) throw new AgyCliError('Antigravity ACP ended without output', 'ACP_TRANSPORT');
    } catch (error) {
      broken = error;
      if (options.signal?.aborted) throw new AgyCliError('Antigravity ACP request cancelled', 'ABORTED');
      if (emitted || !FALLBACK_CODES.has(error?.code)) throw error;
      shouldFallback = true;
    } finally {
      if (!committed) await close(key);
      active.delete(key);
    }
    if (shouldFallback) {
      warn(`Antigravity ACP unavailable before streaming (${broken.code}); using stream-json for this turn`);
      await debugLog({transport:'acp',fallback:true,reason:broken.code,purpose:options.purpose});
      yield* streamFallback(options,key);
    }
  }
  return {stream,disposeAll,closeLive};
}

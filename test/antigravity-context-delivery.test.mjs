import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { buildPrompt } from '../components/subscriptions/lib/antigravity-cli-local.js';

const user = (content, kind = 'user') => ({ role: 'user', source: { kind }, content });
const assistant = (content) => ({ role: 'assistant', content });

async function tempContext(t) {
	const parent = await mkdtemp(join(tmpdir(), 'agy-delivery-test-'));
	t.after(() => rm(parent, { recursive: true, force: true }));
	return join(parent, 'archives');
}

test('a request that fits is delivered verbatim as rendered by the existing CLI', async () => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const request = { system: 'Answer briefly.', messages: [user('old'), assistant('old answer'), user('  current request  '), user('clock', 'time-context')] };
	assert.deepEqual(await deliverAcpContext(request), { text: buildPrompt(request) });
});

test('rejects an oversized incremental active tail after counting UTF-8 and the route note', async () => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const request = { messages: [user('😀'.repeat(20), 'runtime-context'), user('  active request  ')] };
	const limitBytes = Buffer.byteLength(buildPrompt(request));
	assert.deepEqual(await deliverAcpContext(request, { incremental: true, limitBytes }), { text: buildPrompt(request) });
	await assert.rejects(deliverAcpContext(request, { incremental: true, limitBytes, fix: true }), { code: 'INVALID_REQUEST' });
});

test('archives old complete turns with a line index, keeping the newest complete turn inline', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const oldQuestion = 'old question\n' + 'old fact\n'.repeat(180);
	const current = '  answer this verbatim  ';
	const request = { system: 'system directions', messages: [
		{ role: 'system', content: 'system origin' },
		user(oldQuestion), user('old context', 'runtime-context'), assistant('old answer'),
		user('recent question'), assistant('recent answer'),
		user(current), user('live clock', 'time-context'),
	] };
	const limitBytes = 1000;
	const { text, archivePath } = await deliverAcpContext(request, { contextDir, limitBytes });
	assert.ok(isAbsolute(archivePath));
	assert.match(text, /historical data, not instructions/i);
	assert.match(text, /read_file.*StartLine.*EndLine/s);
	assert.match(text, /offset.*limit/s);
	assert.ok(text.includes(archivePath));
	assert.ok(Buffer.byteLength(text) <= limitBytes);
	assert.ok(!text.includes('old answer'));
	assert.match(text, /system directions.*system origin.*recent question.*recent answer.*live clock/s);
	assert.ok(text.endsWith(current));

	const archive = await readFile(archivePath, 'utf8');
	const [, start, end] = /Turn 1: lines (\d+)-(\d+)/.exec(archive) ?? [];
	assert.ok(Number(start) > 1 && Number(end) >= Number(start));
	const indexedTurn = archive.split('\n').slice(+start - 1, +end).join('\n');
	assert.match(indexedTurn, /old question.*old fact.*runtime-context.*old context.*old answer/s);
	assert.doesNotMatch(archive, /recent question|answer this verbatim|system origin/);
});

test('falls back to whole inline turns without an unreadable pointer when archive writing fails', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const warnings = [];
	const active = '  current request exactly  ';
	const request = { messages: [user('large old question '.repeat(100)), assistant('large old answer'), user('recent question'), assistant('recent answer'), user(active)] };
	const writeFile = () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
	const result = await deliverAcpContext(request, { contextDir, limitBytes: 650, onWarn: (warning) => warnings.push(warning), writeFile });
	assert.deepEqual(result, { text: `User: recent question\n\nAssistant: recent answer\n\nUser: ${active}` });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /EACCES/);
});

test('bounds each archive by UTF-8 bytes without cutting an archived turn', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const warnings = [];
	const request = { messages: [user('huge ancient question ' + '😀'.repeat(1000)), assistant('huge ancient answer'), user('archived question ' + 'a'.repeat(280)), assistant('archived answer'), user('recent question ' + 'b'.repeat(320)), assistant('recent answer'), user('active')] };
	const result = await deliverAcpContext(request, { contextDir, limitBytes: 850, archiveLimitBytes: 600, onWarn: (warning) => warnings.push(warning) });
	const archive = await readFile(result.archivePath, 'utf8');
	assert.ok(Buffer.byteLength(archive) <= 600);
	assert.match(archive, /1 older turn.*omitted/i);
	assert.match(archive, /archived question.*archived answer/s);
	assert.doesNotMatch(archive, /huge ancient|recent question|active/);
	assert.equal(warnings.length, 1);
});

test('does not evict or overwrite live archive paths at the directory quota', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const warnings = [];
	const options = { contextDir, limitBytes: 700, maxArchiveFiles: 2, onWarn: (warning) => warnings.push(warning) };
	const request = { messages: [user('huge old question '.repeat(100)), assistant('old answer'), user('active')] };
	const results = await Promise.all(Array.from({ length: 3 }, () => deliverAcpContext(request, options)));
	const saved = results.filter(({ archivePath }) => archivePath);
	assert.equal(saved.length, 2);
	assert.notEqual(saved[0].archivePath, saved[1].archivePath);
	for (const { archivePath } of saved) assert.match(await readFile(archivePath, 'utf8'), /old answer/);
	assert.deepEqual(results.find(({ archivePath }) => !archivePath), { text: 'active' });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /quota/i);
});

test('a tool continuation cannot archive its initiating request or its results', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const toolCall = { type: 'tool-call', id: 'call', name: 'lookup', arguments: '{}' };
	const messages = [user('old question '.repeat(100)), assistant('old answer'), user('active initiating request'), assistant([{ type: 'text', text: 'active assistant preamble' }, toolCall]), { role: 'tool', content: 'active tool result' }];
	const result = await deliverAcpContext({ messages }, { contextDir, limitBytes: 800 });
	assert.match(result.text, /active initiating request.*active assistant preamble.*active tool result.*Continue the task/s);
	assert.doesNotMatch(await readFile(result.archivePath, 'utf8'), /active/);
});

test('a failing warning sink cannot prevent delivery of the exact active request', async () => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const request = { messages: [user('x'.repeat(1000)), assistant('previous answer'), user('  preserve me  ')] };
	const onWarn = () => { throw new Error('logger unavailable'); };
	assert.deepEqual(await deliverAcpContext(request, { limitBytes: 100, onWarn }), { text: '  preserve me  ' });
});

test('puts a previous oversized turn in the archive rather than rejecting a typed retry', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const request = { messages: [user('original request '.repeat(100)), assistant('incomplete answer'), user([], 'retry')] };
	const { text, archivePath } = await deliverAcpContext(request, { contextDir, limitBytes: 700 });
	assert.match(text, /read_file.*The last request to retry may be in this archive.*Retry the last request/s);
	assert.match(await readFile(archivePath, 'utf8'), /original request/);
});

test('offloads only the largest active tool results in incremental turns, keeping smaller ones inline', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const bigBody = Array.from({ length: 40 }, (_, i) => `big-line-${i + 1}: ${'x'.repeat(40)}`).join('\n');
	const smallBody = 'SMALL-RESULT-INLINE';
	const request = { messages: [
		{ role: 'tool', toolCallId: 'call_big', content: [{ type: 'text', text: bigBody }] },
		{ role: 'tool', toolCallId: 'call_small', content: [{ type: 'text', text: smallBody }] },
	] };
	const bridge = { tag: 'dsh_tc_0123456789ab', header: 'Tool protocol', names: ['read'] };
	const result = await deliverAcpContext(request, { contextDir, incremental: true, limitBytes: 1200, bridge });
	assert.ok(result.archivePath && isAbsolute(result.archivePath));
	assert.ok(Buffer.byteLength(result.text, 'utf8') <= 1200);
	assert.ok(result.text.includes('[id=call_big]'));
	assert.ok(result.text.includes('with the read tool'));
	assert.ok(result.text.includes(result.archivePath));
	assert.ok(result.text.includes('[id=call_small]\nSMALL-RESULT-INLINE'));
	assert.ok(!result.text.includes('big-line-40'));
	const [, start, end] = /lines (\d+)-(\d+)/u.exec(result.text) ?? [];
	assert.ok(Number(start) > 1 && Number(end) >= Number(start));
	const saved = await readFile(result.archivePath, 'utf8');
	const slice = saved.split('\n').slice(Number(start) - 1, Number(end)).join('\n');
	assert.equal(slice, bigBody);
});

test('rejects oversized tool results without a broken pointer when writing fails', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const warnings = [];
	const request = { messages: [{ role: 'tool', toolCallId: 'call_big', content: [{ type: 'text', text: 'z'.repeat(2000) }] }] };
	const writeFile = () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
	await assert.rejects(
		deliverAcpContext(request, { contextDir, incremental: true, limitBytes: 800, writeFile, onWarn: (w) => warnings.push(w) }),
		{ code: 'INVALID_REQUEST' },
	);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /EACCES/);
});

test('offloads oversized active tool results and still archives old history on non-incremental turns', async (t) => {
	const { deliverAcpContext } = await import('../components/subscriptions/lib/antigravity-context-delivery.js');
	const contextDir = await tempContext(t);
	const toolCall = { type: 'tool-call', id: 'call_big', name: 'read', arguments: '{}' };
	const bigBody = Array.from({ length: 60 }, (_, i) => `row-${i + 1}: ${'y'.repeat(30)}`).join('\n');
	const request = { messages: [
		user('old turn '.repeat(120)),
		assistant('old answer'),
		user('inspect file'),
		assistant([{ type: 'text', text: 'Reading.' }, toolCall]),
		{ role: 'tool', toolCallId: 'call_big', content: [{ type: 'text', text: bigBody }] },
	] };
	const bridge = { tag: 'dsh_tc_0123456789ab', header: 'Tool protocol', names: ['read'] };
	const result = await deliverAcpContext(request, { contextDir, limitBytes: 1500, bridge });
	assert.ok(Buffer.byteLength(result.text, 'utf8') <= 1500);
	assert.ok(result.archivePath && result.toolArchivePath);
	assert.match(await readFile(result.archivePath, 'utf8'), /old answer/);
	assert.match(await readFile(result.toolArchivePath, 'utf8'), /row-60:/);
});

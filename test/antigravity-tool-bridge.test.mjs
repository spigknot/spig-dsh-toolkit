import assert from 'node:assert/strict';
import test from 'node:test';
import {
	bridgeTag,
	forgetBridgeTag,
	serializeToolsCompact,
	bridgeHeader,
	parseToolBridgeOutput,
	shouldBridge
} from '../components/subscriptions/lib/antigravity-tool-bridge.js';

const TAG_RE = /^dsh_tc_[0-9a-f]{12}$/u;

const verboseTools = [
	{
		name: 'pwsh',
		description: 'Execute a PowerShell command (`pwsh -Command`) and return its stdout/stderr. Each call runs in a fresh pwsh process; pass workdir instead of cd. Long output is truncated to its tail. '.repeat(6),
		parameters: {
			$schema: 'http://json-schema.org/draft-07/schema#',
			type: 'object',
			additionalProperties: false,
			properties: {
				command: { type: 'string', description: 'The PowerShell command to execute. '.repeat(10), examples: ['Get-ChildItem', 'git status'] },
				timeoutMs: { type: 'number', description: 'Timeout in milliseconds.' },
				mode: { type: 'string', enum: ['fast', 'slow'], default: 'fast' }
			},
			required: ['command']
		}
	},
	{
		name: 'read',
		description: 'Read a UTF-8 text file and return line-numbered content.',
		parameters: { type: 'object', properties: { file_path: { type: 'string' }, limit: { type: 'number' } }, required: ['file_path'] }
	}
];

test('a session keeps one tag; different sessions and session-less calls get fresh tags', () => {
	const a1 = bridgeTag('session-a');
	const a2 = bridgeTag('session-a');
	const b = bridgeTag('session-b');
	assert.match(a1, TAG_RE);
	assert.equal(a1, a2);
	assert.notEqual(a1, b);
	assert.notEqual(bridgeTag(undefined), bridgeTag(undefined));
	forgetBridgeTag('session-a');
	assert.notEqual(bridgeTag('session-a'), a1);
});

test('the bridge runs only with tools, outside compaction, and when enabled', () => {
	assert.equal(shouldBridge({ enabled: true, tools: verboseTools, purpose: undefined }), true);
	assert.equal(shouldBridge({ enabled: false, tools: verboseTools }), false);
	assert.equal(shouldBridge({ enabled: true, tools: [] }), false);
	assert.equal(shouldBridge({ enabled: true, tools: undefined }), false);
	assert.equal(shouldBridge({ enabled: true, tools: verboseTools, purpose: 'compaction' }), false);
});

test('the catalog drops schema noise but keeps names, types, required and enum', () => {
	const catalog = serializeToolsCompact(verboseTools, { maxBytes: 32_000 });
	assert.deepEqual(catalog.names, ['pwsh', 'read']);
	assert.equal(catalog.bytes, Buffer.byteLength(catalog.text, 'utf8'));
	assert.ok(!catalog.text.includes('$schema'));
	assert.ok(!catalog.text.includes('additionalProperties'));
	assert.ok(!catalog.text.includes('examples'));
	assert.match(catalog.text, /"command":\{"type":"string"/u);
	assert.match(catalog.text, /"required":\["command"\]/u);
	assert.match(catalog.text, /"enum":\["fast","slow"\]/u);
	assert.match(catalog.text, /- read:/u);
	const raw = Buffer.byteLength(JSON.stringify(verboseTools), 'utf8');
	assert.ok(catalog.bytes < raw / 2, `catalog ${catalog.bytes} not much smaller than raw ${raw}`);
});

test('the catalog shrinks descriptions to fit the byte budget and never drops a tool', () => {
	const many = Array.from({ length: 60 }, (_, index) => ({
		name: `tool_${index}`,
		description: `Tool number ${index} does something important. ${'More detail that is long. '.repeat(30)}`,
		parameters: { type: 'object', properties: { value: { type: 'string', description: 'x'.repeat(300) } }, required: ['value'] }
	}));
	const roomy = serializeToolsCompact(many, { maxBytes: 1_000_000 });
	const tight = serializeToolsCompact(many, { maxBytes: 8_000 });
	assert.ok(tight.bytes <= 8_000, `tight catalog is ${tight.bytes} bytes`);
	assert.ok(tight.bytes < roomy.bytes);
	assert.equal(tight.names.length, 60);
	for (let index = 0; index < 60; index += 1) assert.ok(tight.text.includes(`- tool_${index}`));
	assert.match(tight.text, /"required":\["value"\]/u);
});

test('the header carries the exact tag, the protocol rules and the catalog', () => {
	const tag = bridgeTag('header-session');
	const catalog = serializeToolsCompact(verboseTools, { maxBytes: 32_000 });
	const header = bridgeHeader(tag, catalog);
	assert.ok(header.includes(`<${tag}>{"name":`));
	assert.ok(header.includes(`</${tag}>`));
	assert.ok(header.includes(catalog.text));
	assert.match(header, /built-in tools .* disabled/iu);
	assert.ok(!/cannot run shell commands/iu.test(header));
});

const allowed = new Set(['read', 'pwsh']);

test('plain text is an answer with no calls', () => {
	const tag = bridgeTag('p1');
	const parsed = parseToolBridgeOutput('Just an answer.', tag, allowed);
	assert.equal(parsed.text, 'Just an answer.');
	assert.deepEqual(parsed.calls, []);
	assert.deepEqual(parsed.invalid, []);
});

test('one block becomes one call with a fresh id and JSON arguments', () => {
	const tag = bridgeTag('p2');
	const parsed = parseToolBridgeOutput(`<${tag}>{"name":"read","arguments":{"file_path":"README.md"}}</${tag}>`, tag, allowed);
	assert.equal(parsed.text, '');
	assert.equal(parsed.calls.length, 1);
	assert.match(parsed.calls[0].id, /^agy_tc_[0-9a-f]{12}$/u);
	assert.equal(parsed.calls[0].name, 'read');
	assert.deepEqual(JSON.parse(parsed.calls[0].arguments), { file_path: 'README.md' });
});

test('leading text is kept, parallel calls are kept in order, and text after the last call is dropped', () => {
	const tag = bridgeTag('p3');
	const raw = `I will look at both.\n<${tag}>{"name":"read","arguments":{"file_path":"a"}}</${tag}>\n<${tag}>{"name":"pwsh","arguments":{"command":"git status"}}</${tag}>\nResult: everything is fine (invented).`;
	const parsed = parseToolBridgeOutput(raw, tag, allowed);
	assert.equal(parsed.text, 'I will look at both.');
	assert.deepEqual(parsed.calls.map((call) => call.name), ['read', 'pwsh']);
	assert.notEqual(parsed.calls[0].id, parsed.calls[1].id);
	assert.ok(parsed.droppedTrailing > 0);
});

test('a quoted foreign tag or random XML never becomes a call', () => {
	const tag = bridgeTag('p4');
	const raw = 'Example: <dsh_tc_000000000000>{"name":"pwsh","arguments":{"command":"rm -rf /"}}</dsh_tc_000000000000> and <tool>{"name":"read"}</tool>';
	const parsed = parseToolBridgeOutput(raw, tag, allowed);
	assert.equal(parsed.calls.length, 0);
	assert.equal(parsed.text, raw);
});

test('malformed JSON, unknown tools and non-object arguments are reported, never emitted', () => {
	const tag = bridgeTag('p5');
	const raw = [
		`<${tag}>{"name":"read","arguments":{"file_path":</${tag}>`,
		`<${tag}>{"name":"delete_everything","arguments":{}}</${tag}>`,
		`<${tag}>{"name":"read","arguments":[1,2]}</${tag}>`,
		`<${tag}>   </${tag}>`,
		`<${tag}>{"name":"read","arguments":{"file_path":"ok.txt"}}</${tag}>`
	].join('\n');
	const parsed = parseToolBridgeOutput(raw, tag, allowed);
	assert.equal(parsed.calls.length, 1);
	assert.equal(parsed.calls[0].name, 'read');
	assert.equal(parsed.invalid.length, 3);
	assert.ok(parsed.invalid.some((entry) => /JSON/u.test(entry.reason)));
	assert.ok(parsed.invalid.some((entry) => /unknown tool "delete_everything"/u.test(entry.reason)));
	assert.ok(parsed.invalid.some((entry) => /arguments/u.test(entry.reason)));
});

test('a fenced json body, missing arguments, stringified arguments and an unclosed final block parse', () => {
	const tag = bridgeTag('p6');
	const fenced = parseToolBridgeOutput(`<${tag}>\n\`\`\`json\n{"name":"read","arguments":{"file_path":"x"}}\n\`\`\`\n</${tag}>`, tag, allowed);
	assert.deepEqual(JSON.parse(fenced.calls[0].arguments), { file_path: 'x' });
	const bare = parseToolBridgeOutput(`<${tag}>{"name":"pwsh"}</${tag}>`, tag, allowed);
	assert.equal(bare.calls[0].arguments, '{}');
	const stringified = parseToolBridgeOutput(`<${tag}>{"name":"read","arguments":"{\\"file_path\\":\\"y\\"}"}</${tag}>`, tag, allowed);
	assert.deepEqual(JSON.parse(stringified.calls[0].arguments), { file_path: 'y' });
	const unclosed = parseToolBridgeOutput(`Reading.\n<${tag}>{"name":"read","arguments":{"file_path":"z"}}`, tag, allowed);
	assert.equal(unclosed.calls.length, 1);
	assert.equal(unclosed.text, 'Reading.');
});

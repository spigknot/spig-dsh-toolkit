import { spawn as nodeSpawn } from 'node:child_process';
import { realpath as fsRealpath, stat as fsStat } from 'node:fs/promises';
import path from 'node:path';
import { AgyCliError, classifyFailure } from './antigravity-cli-local.js';

const VERIFIED_CLI_VERSION = '1.5.17';
const VERIFIED_AGENT_NAME = 'Antigravity ACP Server';
const MAX_FRAME = 8 * 1024 * 1024;
const transportError = (message) => new AgyCliError(message, 'ACP_TRANSPORT');
const aborted = () => new AgyCliError('Antigravity ACP call aborted', 'ABORTED');
export const ACP_DENIED_ANSWER = 'No text response: Antigravity ACP allows only reads.';

function safePath(value) {
	if (typeof value !== 'string' || !path.isAbsolute(value) || /[\u0000-\u001f\u007f]/u.test(value) || /^[\\/]{2}/u.test(value)) return null;
	const windows = process.platform === 'win32';
	if (windows && !/^[a-z]:[\\/]/iu.test(value)) return null;
	if (!windows && value.includes('\\')) return null;
	const rest = windows ? value.slice(2) : value;
	if (rest.includes(':')) return null;
	for (const part of rest.split(/[\\/]/u)) {
		if (!part) continue;
		if (/[. ]$/u.test(part) || /[<>"|?*~]/u.test(part) || /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9¹²³]|LPT[0-9¹²³]) *(?:\.|$)/iu.test(part)) return null;
	}
	return path.normalize(value);
}

function within(root, candidate, insensitive = false) {
	// Canonical path containment is case-sensitive, including on Windows: NTFS
	// directories can opt into case sensitivity. The private exclusion can be stricter.
	if (insensitive && process.platform === 'win32') {
		root = root.toLowerCase();
		candidate = candidate.toLowerCase();
	}
	return root === candidate || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

function onceOption(options, kind) {
	if (!Array.isArray(options)) return undefined;
	const match = options.find(option => option?.kind === kind && typeof option.optionId === 'string' && option.optionId.length > 0);
	return match && options.filter(option => option?.optionId === match.optionId).length === 1 ? match.optionId : undefined;
}

function forceProcessTree(child, platform) {
	const directKill = () => { try { child.kill('SIGKILL'); } catch {} };
	if (platform !== 'win32' || !Number.isInteger(child.pid) || child.pid <= 0) {
		directKill();
		return;
	}
	return new Promise((resolve) => {
		const systemRoot = process.env.SystemRoot || 'C:\\Windows';
		try {
			const killer = nodeSpawn(path.win32.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
			killer.once('error', () => { directKill(); resolve(); });
			killer.once('close', (code) => { if (code !== 0) directKill(); resolve(); });
		} catch {
			directKill();
			resolve();
		}
	});
}

function failure(detail, code = 'ACP_TRANSPORT') {
	const classified = classifyFailure(detail);
	return ['RATE_LIMIT', 'AUTH'].includes(classified.code) ? classified : new AgyCliError(classified.message, code);
}

/** One private, version-gated ACP process. The caller must prepare its strict settings overlay first. */
export function createAcpClient({
	workspaceDir, contextDir, stateDir, spawn = nodeSpawn,
	bin = process.env.DSH_AGY_BIN?.trim() || 'agy', startupTimeoutMs = 30_000,
	turnTimeoutMs = 180_000, shutdownGraceMs = 250, realpath = fsRealpath, stat = fsStat,
	platform = process.platform, killTree = (child) => forceProcessTree(child, platform),
}) {
	const cwd = path.resolve(contextDir);
	const readRoots = [...new Set([...(workspaceDir ? [path.resolve(workspaceDir)] : []), cwd])];
	const state = path.resolve(stateDir);
	const pending = new Map();
	let nextId = 0;
	let child;
	let alive = false;
	let init;
	let close;
	let onClose;
	let stopping;
	let closed = false;
	let buffer = '';
	let stderr = '';
	let turn;
	const replays = new Map();

	function stop(error, cancel = false) {
		if (stopping) return stopping;
		alive = false;
		// Mark the process unavailable before settling any callers or touching streams.
		let done;
		stopping = new Promise((resolve) => { done = resolve; });
		if (turn?.accepting) {
			turn.accepting = false;
			if (cancel && !closed) write({ method: 'session/cancel', params: { sessionId: turn.sessionId } });
		}
		for (const entry of pending.values()) entry.reject(error);
		if (!child || closed) {
			done();
			return stopping;
		}
		const timer = setTimeout(() => {
			if (closed) return done();
			try { Promise.resolve(killTree(child)).then(done, () => { try { child.kill('SIGKILL'); } catch {} done(); }); }
			catch { try { child.kill('SIGKILL'); } catch {} done(); }
		}, shutdownGraceMs);
		close?.then(() => { clearTimeout(timer); done(); });
		try { child.stdin?.end(); } catch {}
		return stopping;
	}

	function write(message) {
		try {
			child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
		} catch (error) {
			stop(failure(`${stderr}\n${error.message}`));
		}
	}

	async function canRead(tool) {
		if (tool?.name !== 'read_file' || tool.kind !== 'read' || !Array.isArray(tool.locations) || tool.locations.length !== 1) return false;
		const target = safePath(tool.rawInput?.Path);
		if (!target || safePath(tool.args?.Path) !== target || safePath(tool.locations[0]?.path) !== target) return false;
		if (within(state, target, true) || !readRoots.some(root => within(root, target, true))) return false;
		try {
			const [file, privateRoot, ...roots] = await Promise.all([target, state, ...readRoots].map(dir => Promise.resolve().then(() => realpath(dir)).then(safePath).catch(() => null)));
			if (!file || !privateRoot || within(privateRoot, file, true) || !roots.some(root => root && within(root, file))) return false;
			return (await stat(file)).isFile();
		} catch {
			return false;
		}
	}

	async function permission({ id, params }) {
		const current = turn;
		const relevant = () => current?.accepting && turn === current && current.sessionId === params?.sessionId;
		const allow = onceOption(params?.options, 'allow_once');
		const permitted = relevant() && allow && await canRead(params.toolCall) && relevant();
		if (stopping) return;
		const optionId = permitted ? allow : onceOption(params?.options, 'reject_once');
		if (!permitted && relevant()) current.denied = true;
		write({ id, result: { outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' } } });
	}

	function handleMessage(message) {
		if (message?.jsonrpc !== '2.0') throw transportError('Invalid Antigravity ACP JSON-RPC message');
		if (typeof message.method === 'string') {
			if (Object.hasOwn(message, 'id')) {
				if (message.method === 'session/request_permission') {
					permission(message).catch(() => stop(transportError('Antigravity ACP permission response failed')));
				} else write({ id: message.id, error: { code: -32601, message: 'Method not found' } });
				return;
			}
			if (message.method === 'session/update') {
				const { sessionId, update } = message.params ?? {};
				const replay = replays.get(sessionId);
				if (replay && update?.content?.type === 'text' && typeof update.content.text === 'string' && update.content.text.trim()) {
					if (update.sessionUpdate === 'user_message_chunk') replay.user = true;
					if (update.sessionUpdate === 'agent_message_chunk') replay.agent = true;
				}
				if (typeof sessionId === 'string' && update?.sessionUpdate === 'current_mode_update' && update.currentModeId !== 'default') {
					stop(transportError('Antigravity ACP session left default mode'), true);
					return;
				}
				if (turn?.accepting && turn.sessionId === sessionId && update?.content?.type === 'text' && typeof update.content.text === 'string') {
					if (update.sessionUpdate === 'agent_message_chunk') turn.push({ text: update.content.text, kind: 'text' });
					if (update.sessionUpdate === 'agent_thought_chunk') turn.push({ text: update.content.text, kind: 'reasoning' });
				}
			}
			return;
		}
		const entry = pending.get(message.id);
		if (!entry) return;
		if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) throw transportError('Invalid Antigravity ACP JSON-RPC response');
		if (Object.hasOwn(message, 'error')) {
			const rpcCode = message.error?.code;
			const diagnostic = typeof message.error?.message === 'string' ? message.error.message : 'Antigravity ACP request failed';
			const error = rpcCode === 401 ? new AgyCliError(diagnostic, 'AUTH') : failure(JSON.stringify(message.error));
			error.rpcCode = message.error?.code;
			entry.reject(error);
		} else entry.resolve(message.result);
	}

	function read(chunk) {
		if (stopping) return;
		buffer += chunk;
		try {
			let newline;
			while (!stopping && (newline = buffer.indexOf('\n')) !== -1) {
				if (newline > MAX_FRAME) throw transportError('Oversized Antigravity ACP frame');
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				// Plain launcher diagnostics are not protocol frames. A JSON-looking
				// but malformed frame still fails the connection.
				if (line.startsWith('{')) handleMessage(JSON.parse(line));
			}
			if (buffer.length > MAX_FRAME) throw transportError('Oversized Antigravity ACP frame');
		} catch (error) {
			stop(error instanceof AgyCliError ? error : failure(`${stderr}\nInvalid Antigravity ACP NDJSON`));
		}
	}

	function request(method, params, signal, timeoutMs, onSettled) {
		if (signal?.aborted) {
			const error = aborted();
			stop(error);
			return Promise.reject(error);
		}
		if (stopping) return Promise.reject(transportError('Antigravity ACP process is closed'));
		return new Promise((resolve, reject) => {
			const id = ++nextId;
			const onAbort = () => stop(aborted(), true);
			const timer = setTimeout(() => stop(failure(`${stderr}\nAntigravity ACP ${method} timed out`, 'TIMEOUT'), true), timeoutMs);
			const settled = (fn) => (value) => {
				pending.delete(id);
				onSettled?.();
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				fn(value);
			};
			pending.set(id, { resolve: settled(resolve), reject: settled(reject) });
			signal?.addEventListener('abort', onAbort, { once: true });
			write({ id, method, params });
		});
	}

	async function start(signal) {
		try {
			if (signal?.aborted) throw aborted();
			if (stopping) throw transportError('Antigravity ACP process is closed');
			child = spawn(bin, [
				'acp', '--stdio', '--sandbox', `--gemini-dir=${state}`, '--cli_dir_name=spig-acp', '--include-default-customizations=false',
				...readRoots.flatMap(dir => ['--add-dir', dir]),
			], { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
			close = new Promise((resolve) => { onClose = resolve; });
			child.on('close', (code) => {
				closed = true;
				onClose();
				stop(failure(`${stderr}\nAntigravity ACP process closed (${code})`));
			});
			const onError = (error) => stop(failure(`${stderr}\n${error.message}`));
			child.on('error', onError);
			for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', onError);
			child.stdout.setEncoding('utf8');
			child.stdout.on('data', read);
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
			const result = await request('initialize', { protocolVersion: 1, clientCapabilities: {} }, signal, startupTimeoutMs);
			if (result?.protocolVersion !== 1 || result?.agentInfo?.name !== VERIFIED_AGENT_NAME || result.agentInfo.version !== VERIFIED_CLI_VERSION) {
				throw transportError(`Antigravity ACP requires protocol v1 and verified CLI ${VERIFIED_CLI_VERSION}`);
			}
			if (signal?.aborted) throw aborted();
			if (stopping) throw transportError('Antigravity ACP process closed during initialize');
			alive = true;
		} catch (cause) {
			const error = cause instanceof AgyCliError ? cause : failure(`${stderr}\n${cause.message}`);
			stop(error);
			throw error;
		}
	}

	const sessionIds = new Set();

	function verifyDefaultMode(result) {
		if (result?.modes?.currentModeId !== 'default') {
			const error = transportError('Antigravity ACP session is not in default mode');
			stop(error);
			throw error;
		}
	}

	async function selectModel(sessionId, model, signal) {
		if (model !== undefined) await request('session/set_model', { sessionId, modelId: model }, signal, startupTimeoutMs);
		sessionIds.add(sessionId);
	}

	function prompt(options) {
		const owner = {};
		const stream = streamPrompt(options, owner);
		const cancel = () => {
			if (turn?.owner !== owner || turn.finished) return;
			turn.cancelled = aborted();
			stop(turn.cancelled, true);
		};
		return {
			[Symbol.asyncIterator]() { return this; },
			next: (...args) => stream.next(...args),
			return: (value) => { cancel(); return stream.return(value); },
			throw: (error) => { cancel(); return stream.throw(error); },
		};
	}

	async function* streamPrompt({ sessionId, text, signal }, owner) {
		if (!alive || !sessionIds.has(sessionId)) throw transportError('Antigravity ACP session is not available');
		if (turn) throw transportError('Antigravity ACP already has an active prompt');
		const queue = [];
		let ready;
		const current = turn = {
			sessionId, owner, accepting: true,
			push(event) { queue.push(event); ready?.(); }
		};
		request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, signal, turnTimeoutMs, () => {
			current.accepting = false;
		}).then((result) => current.push({ result }), (error) => current.push({ error }));
		let answer = '', leading = '';
		let block, index = 0;
		const endBlock = () => ({ type: 'block-end', index: index++, block });
		function* emit(kind, text) {
			if (block?.type !== kind) {
				if (block) { yield endBlock(); checkCancelled(); }
				block = {type:kind,text:''};
				yield {type:'block-start',index,blockType:kind};
				checkCancelled();
			}
			block.text += text;
			yield {type:`${kind}-delta`,index,text};
		}
		function checkCancelled() {
			if (signal?.aborted) {
				const error = aborted();
				stop(error, true);
				throw error;
			}
			if (current.cancelled) throw current.cancelled;
		}
		try {
			for (;;) {
				if (queue.length === 0) await new Promise((resolve) => { ready = resolve; });
				ready = undefined;
				checkCancelled();
				const event = queue.shift();
				if (event.error) throw event.error;
				if ('result' in event) {
					if (!answer) {
						if (!current.denied) throw new AgyCliError('Antigravity ACP returned an empty answer', 'EMPTY_RESPONSE');
						answer = ACP_DENIED_ANSWER;
						yield* emit('text', answer);
						checkCancelled();
					}
					yield endBlock();
					checkCancelled();
					const stats = event.result?.usage;
					if (stats) {
						const usage = { inputTokens: stats.inputTokens ?? 0, outputTokens: stats.outputTokens ?? 0 };
						for (const [from, to] of [['cachedReadTokens', 'cacheReadTokens'], ['cachedWriteTokens', 'cacheWriteTokens'], ['thoughtTokens', 'reasoningTokens'], ['totalTokens', 'totalTokens']]) {
							if (Number.isFinite(stats[from])) usage[to] = stats[from];
						}
						yield { type: 'usage', usage };
						checkCancelled();
					}
					current.finished = true;
					yield { type: 'finish', reason: { kind: event.result?.stopReason === 'max_tokens' ? 'max-tokens' : 'stop' } };
					return;
				}
				if (!event.text) continue;
				if (event.kind === 'reasoning') {
					yield* emit('reasoning', event.text);
					continue;
				}
				if (!answer) {
					// Hold whitespace-only leading text so an empty reply stays EMPTY_RESPONSE.
					leading += event.text;
					if (!leading.trim()) continue;
					answer = leading;
					yield* emit('text', leading);
				} else {
					answer += event.text;
					yield* emit('text', event.text);
				}
			}
		} finally {
			if (current.accepting) await stop(aborted(), true);
			else if (stopping && !current.finished) await stopping;
			turn = undefined;
		}
	}

	return {
		prompt,
		async newSession({ model, signal } = {}) {
			if (!alive) throw transportError('Antigravity ACP process is not initialized');
			const result = await request('session/new', { cwd, mcpServers: [] }, signal, startupTimeoutMs);
			verifyDefaultMode(result);
			const sessionId = result.sessionId;
			if (typeof sessionId !== 'string' || !sessionId) throw transportError('Antigravity ACP returned no session id');
			await selectModel(sessionId, model, signal);
			return sessionId;
		},
		async loadSession({ sessionId, model, signal }) {
			if (!alive) throw transportError('Antigravity ACP process is not initialized');
			if (turn || replays.has(sessionId)) throw transportError('Antigravity ACP session is busy');
			sessionIds.delete(sessionId);
			const replay = {};
			replays.set(sessionId, replay);
			let result;
			try {
				result = await request('session/load', { sessionId, cwd, mcpServers: [] }, signal, startupTimeoutMs, () => replays.delete(sessionId));
			} catch (error) {
				if (error.rpcCode === -32002) return false;
				throw error;
			} finally {
				replays.delete(sessionId);
			}
			verifyDefaultMode(result);
			if (result.sessionId !== undefined && result.sessionId !== sessionId) throw transportError('Antigravity ACP loaded a different session id');
			if (!replay.user || !replay.agent) return false;
			await selectModel(sessionId, model, signal);
			return true;
		},
		get alive() { return alive; },
		initialize(signal) {
			if (signal?.aborted) return Promise.reject(aborted());
			if (stopping) return Promise.reject(transportError('Antigravity ACP process is closed'));
			return init ??= start(signal);
		},
		dispose: () => stop(transportError('Antigravity ACP process disposed'), true),
	};
}

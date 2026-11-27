import { groupCliModels, pickCliModel } from './antigravity-cli-catalog.js';
import { answerChunks, invalidCallFeedback, noteInvalidCalls, parseToolBridgeOutput } from './antigravity-tool-bridge.js';

/** Gemini 4 generation window on the Antigravity subscription. */
export const CLI_CONTEXT_WINDOW = 1_048_576;
/** Fallback output cap when a model does not advertise its own. */
export const CLI_DEFAULT_MAX_TOKENS = 32_768;

export async function* streamCliResult(run, options, error = (message, code) => Object.assign(new Error(message), {code})) {
  let result = await run(options);
  let text = typeof result === 'string' ? result : result?.text;
  if (!text?.trim()) throw error('Antigravity CLI returned no text', 'EMPTY_RESPONSE');
  const bridge = typeof result === 'object' ? result?.bridge : undefined;
  if (!bridge) {
    yield* answerChunks({text, usage: result?.usage});
    return;
  }
  // DSH tool bridge (antigravity-tool-bridge.js): tagged blocks become DSH
  // tool calls, which DSH itself executes.
  let parsed = parseToolBridgeOutput(text, bridge.tag, new Set(bridge.tools));
  if (parsed.calls.length === 0 && parsed.invalid.length > 0) {
    // Every block was invalid: ask once, with the reasons, before giving up.
    options.signal?.throwIfAborted();
    const messages = [...(options.messages ?? []),
      {role:'assistant', content:[{type:'text', text}]},
      {role:'user', content:[{type:'text', text: invalidCallFeedback(bridge.tag, parsed.invalid)}]}];
    const retry = await run({...options, messages});
    const retryText = typeof retry === 'string' ? retry : retry?.text;
    if (retryText?.trim()) {
      result = retry;
      const again = (typeof retry === 'object' ? retry?.bridge : undefined) ?? bridge;
      parsed = parseToolBridgeOutput(retryText, again.tag, new Set(again.tools));
    }
  }
  yield* answerChunks({text: noteInvalidCalls(parsed.text, parsed.invalid), calls: parsed.calls, usage: result?.usage});
}

export function createCliAdapter({
  list,
  run,
  stream,
  defaultEffortOf = () => undefined,
  error = (message) => new Error(message),
  ttlMs = 300_000,
  failureBackoffMs = 15_000,
  listTimeoutMs = 60_000,
  now = () => Date.now(),
}) {
  let cache, expires = 0, pending;
  async function models() {
    if (cache && now() < expires) return cache;
    pending ??= Promise.resolve()
      .then(() => list({ signal: AbortSignal.timeout(listTimeoutMs) }))
      .then(rows => {
        cache = groupCliModels(rows);
        expires = now() + ttlMs;
        return cache;
      })
      .catch(cause => {
        // Stale-if-error: keep the last known-good catalog on transient CLI/network
        // failures and back off briefly so concurrent/subsequent calls do not stampede.
        if (cache && cache.length > 0) {
          expires = now() + failureBackoffMs;
          return cache;
        }
        throw cause;
      })
      .finally(() => { pending = undefined; });
    return pending;
  }
  // Context capacity is mandatory: compaction and model switching size their
  // budget from it, and an empty context rejects every mid-session switch.
  const info = (provider, id, name) => ({
    provider,
    id,
    name,
    inputModalities: ['text'],
    context: { contextWindow: CLI_CONTEXT_WINDOW },
    defaultMaxTokens: CLI_DEFAULT_MAX_TOKENS
  });
  return {
    clearAccountCatalog() { expires = 0; },
    providerInfo: provider => ({id:provider, name:'Google Antigravity (agy CLI)'}),
    providerRetryPolicy: () => ({mode:'normal', maxRetries:0, retryableCodes:[], initialDelayMs:1000, maxDelayMs:1000, jitterRatio:0}),
    async listModels(provider) {
      return (await models()).map(entry => info(provider, entry.id, entry.name));
    },
    async resolveModel(provider, model, signal) {
      signal?.throwIfAborted();
      const entries = await models();
      signal?.throwIfAborted();
      const entry = entries.find(item => item.id === model || [...item.variants.values()].includes(model));
      if (!entry) throw error(`Model ${model} is not listed by agy models`, 'NO_ADAPTER');
      let reasoning = entry.reasoning;
      if (reasoning && entry.id !== model) {
        const effort = reasoning.efforts.find(effort => entry.variants.get(effort.id) === model);
        reasoning = {efforts:[effort], defaultEffort:effort.id};
      } else if (reasoning) {
        const configured = defaultEffortOf(model);
        if (reasoning.efforts.some(effort => effort.id === configured)) reasoning = {...reasoning,defaultEffort:configured};
      }
      return {...info(provider,model,entry.name), ...(reasoning ? {reasoning} : {})};
    },
    async prepareCall(provider, model, signal) {
      return {model: await this.resolveModel(provider, model, signal),stream: options => this.stream(options)};
    },
    async *stream(options) {
      options.signal?.throwIfAborted();
      const entries = await models();
      options.signal?.throwIfAborted();
      const configured = defaultEffortOf(options.model);
      const entry = entries.find(item => item.id === options.model);
      const effort = options.reasoningEffort ?? entry?.reasoning?.efforts.find(item => item.id === configured)?.id;
      let model;
      try { model = pickCliModel(entries, options.model, effort); }
      catch (cause) { throw error(cause.message, 'NO_ADAPTER'); }
      const selected = {...options,model};
      yield* stream ? stream(selected) : streamCliResult(run, selected, error);
    }
  };
}

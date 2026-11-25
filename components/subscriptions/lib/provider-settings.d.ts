import { type ProviderId } from './auth/store.js';
export declare const PROVIDER_TOOLS: {
    readonly codex: readonly ["image_generate", "web_search"];
    readonly claude: readonly [];
    readonly grok: readonly ["image_generate", "video_generate", "x_search"];
    readonly copilot: readonly [];
    readonly antigravity: readonly [];
};
export type SubscriptionTool = 'image_generate' | 'video_generate' | 'x_search' | 'web_search';
/** Mirrors `PromptCacheTtl` in translate/anthropic.ts; kept here so the client bundle needs no translate import. */
export declare const PROMPT_CACHE_TTLS: readonly ["5m", "1h"];
export type PromptCacheTtlSetting = typeof PROMPT_CACHE_TTLS[number];
export type SubagentSpeedTier = 'standard' | 'fast';
export type AgyTransport = 'compaction' | 'acp';
export interface AccountPreferences {
    alias?: string;
    /** Absent means included. */
    poolEnabled?: boolean;
    /** Absent means no separate picker entries. */
    independentEntry?: boolean;
    /** Absent allows every model; [] allows none. */
    poolModels?: string[];
}
export interface ProviderPreferences {
    /** Presentation only; never used as a provider or model routing key. */
    displayName?: string;
    modelDisplayNames?: Record<string, string>;
    accounts?: Record<string, AccountPreferences>;
    /** Absent follows discovery; an explicit selection hides newly discovered models. */
    visibleModels?: string[];
    contextWindows?: Record<string, number>;
    /** Codex-only provider-wide local context budget and output reservation. */
    contextWindow?: number;
    defaultMaxTokens?: number;
    /** Codex only: per-model defaults for subagents, independent of main-session speed. */
    subagentSpeeds?: Record<string, SubagentSpeedTier>;
    tools?: Partial<Record<SubscriptionTool, boolean>>;
    /** Claude only: overrides the plugin config's `claudePromptCacheTtl`; absent follows config. */
    promptCacheTtl?: PromptCacheTtlSetting;
    /**
     * Antigravity only: keeps the CLI shell-free so the route answers in text.
     * Absent means on — the CLI's command executor fails on this host, and with
     * the shell granted the model can end a turn with an empty reply.
     */
    agyFix?: boolean;
    /** Antigravity only: refuse prompts agy would silently truncate and compact the history instead. Absent means on. */
    agyPromptGuard?: boolean;
    /** Antigravity only: absent keeps the CLI + compaction route. */
    agyTransport?: AgyTransport;
    /** Antigravity only: run DSH tools through the tool-calling bridge. Absent means on. */
    agyToolBridge?: boolean;
    /** Codex only: allow the fast tier (`service_tier: priority`). Absent means off. */
    fastAllowed?: boolean;
}
export declare function validatePreferences(provider: ProviderId, input: unknown): ProviderPreferences;
/** Durable user preferences, independent of expiring discovery caches. */
export declare class ProviderSettingsStore {
    private current;
    private writes;
    readonly path: string;
    constructor(path?: string);
    get(provider: ProviderId): ProviderPreferences;
    visible(provider: ProviderId, model: string): boolean;
    modelName(provider: ProviderId, model: string, fallback: string): string;
    contextWindow(model: string): number | undefined;
    /** Read on every request so saved changes apply to the next subagent request. */
    subagentSpeed(model: string): SubagentSpeedTier;
    /** The Settings-page Claude cache TTL; undefined follows the plugin config. Read per request, so no clone. */
    promptCacheTtl(): PromptCacheTtlSetting | undefined;
    /** Opt-in to persistent ACP; existing profiles keep the compaction route. */
    agyTransport(): AgyTransport;
    /** The Antigravity empty-reply fix; on unless the user turned it off. Read per request, so no clone. */
    agyFix(): boolean;
    /** The Antigravity long-prompt guard; on unless the user turned it off. */
    agyPromptGuard(): boolean;
    /** The Antigravity DSH tool bridge; on unless the user turned it off. */
    agyToolBridge(): boolean;
    /** Codex fast tier; off unless the user turned it on in Settings. */
    codexFastAllowed(): boolean;
    /** Creation-time policy survives restarts and never changes an existing session. */
    toolEnabled(provider: ProviderId, tool: SubscriptionTool, createdAt?: number): boolean;
    set(provider: ProviderId, input: unknown): Promise<void>;
}

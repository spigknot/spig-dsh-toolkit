/**
 * Upstream ships the public Antigravity desktop OAuth client identity here.
 * This fork removes those literals so the repository can be published: they
 * are Google's application credentials, not ours to redistribute. The CLI
 * route does not need them. Supply a pair through config.antigravity.clientId
 * and clientSecret, or ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET, if
 * the legacy HTTP route is ever re-enabled. Upstream source of the values:
 * pi-antigravity, src/auth/oauth.ts.
 */
export const ANTIGRAVITY_DEFAULT_CLIENT_ID = '';
export const ANTIGRAVITY_DEFAULT_CLIENT_SECRET = '';

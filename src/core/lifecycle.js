import { detectLegacyConflict } from "./conflict-detector.js";

/**
 * Orchestrates mounting and unmounting of independent toolkit components
 * using isolated Cordis plugin forks (`ctx.plugin(...)` / `fork.dispose()`).
 *
 * Guarantees:
 * - Disabled components never execute `apply()`, never register hooks/adapters/tools.
 * - Enabling/disabling a component at runtime immediately mounts/unmounts its Cordis fork.
 * - Conflicting legacy plugins are detected before mounting so duplicate providers/hooks never collide.
 * - Individual component settings remain untouched when toggled off.
 */
export class ToolkitComponentManager {
  constructor(ctx, config, { registry, store, conflictDetector = detectLegacyConflict, logger } = {}) {
    this.ctx = ctx;
    this.config = config ?? {};
    this.registry = registry;
    this.store = store;
    this.conflictDetector = conflictDetector;
    this.logger = logger ?? ctx?.logger ?? console;
    this.forks = new Map();
    this.errors = new Map();
    this.conflicts = new Map();
  }

  /** Mount all components that are currently enabled and conflict-free. */
  mountEnabled() {
    for (const component of this.registry.list()) {
      if (this.store.isEnabled(component.id)) {
        this._mountComponent(component);
      }
    }
  }

  _mountComponent(component) {
    if (this.forks.has(component.id)) return true;
    this.errors.delete(component.id);

    const conflict = this.conflictDetector(this.ctx, component);
    if (conflict.hasConflict) {
      this.conflicts.set(component.id, conflict);
      this.logger.warn?.(`[spig-dsh-toolkit] skipping "${component.id}": ${conflict.message}`);
      return false;
    }
    this.conflicts.delete(component.id);

    try {
      const componentConfig = typeof component.resolveConfig === "function"
        ? component.resolveConfig(this.config)
        : {};
      const fork = this.ctx.plugin(component.hostPlugin, componentConfig);
      this.forks.set(component.id, fork);
      this.logger.info?.(`[spig-dsh-toolkit] mounted component "${component.id}"`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.set(component.id, message);
      this.logger.warn?.(`[spig-dsh-toolkit] failed to mount component "${component.id}": ${message}`);
      return false;
    }
  }

  _unmountComponent(id) {
    const fork = this.forks.get(id);
    if (!fork) return;
    this.forks.delete(id);
    this.errors.delete(id);
    try {
      fork.dispose?.();
      this.logger.info?.(`[spig-dsh-toolkit] unmounted component "${id}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.set(id, message);
      this.logger.warn?.(`[spig-dsh-toolkit] error disposing component "${id}": ${message}`);
    }
  }

  async setEnabled(id, enabled) {
    const component = this.registry.get(id);
    if (!component) {
      throw new Error(`unknown toolkit component "${id}"`);
    }
    await this.store.setEnabled(id, enabled);
    if (enabled) {
      this._mountComponent(component);
    } else {
      this._unmountComponent(id);
      this.conflicts.delete(id);
    }
    return this.statusOf(id);
  }

  statusOf(id) {
    const component = this.registry.get(id);
    if (!component) return undefined;
    const enabled = this.store.isEnabled(id);
    const active = this.forks.has(id);
    const conflict = enabled && !active
      ? (this.conflicts.get(id) ?? this.conflictDetector(this.ctx, component))
      : this.conflictDetector(this.ctx, component);
    return {
      id: component.id,
      title: component.title,
      description: component.description,
      settingsSectionId: component.settingsSectionId ?? null,
      enabled,
      active,
      conflict: conflict.hasConflict ? conflict : null,
      error: this.errors.get(id) ?? null,
    };
  }

  status() {
    return {
      components: this.registry.list().map((component) => this.statusOf(component.id)),
    };
  }

  disposeAll() {
    for (const id of [...this.forks.keys()]) {
      this._unmountComponent(id);
    }
  }
}

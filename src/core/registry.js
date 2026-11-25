/**
 * Pure declarative component registry for spig-dsh-toolkit.
 *
 * Kept free of component-specific imports so core lifecycle/state/RPC modules
 * remain decoupled and testable without DSH host peer dependencies.
 */
export function createComponentRegistry(components = []) {
  const map = new Map();
  for (const component of components) {
    if (!component || typeof component.id !== "string" || component.id.trim().length === 0) {
      throw new Error("toolkit component must have a non-empty string id");
    }
    if (map.has(component.id)) {
      throw new Error(`duplicate toolkit component id "${component.id}"`);
    }
    map.set(component.id, component);
  }
  return {
    list: () => [...map.values()],
    get: (id) => map.get(id),
    has: (id) => map.has(id),
    defaults: () => Object.fromEntries([...map.values()].map((c) => [c.id, c.defaultEnabled !== false])),
  };
}

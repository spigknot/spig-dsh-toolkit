const effortIds = ['low', 'medium', 'high', 'xhigh', 'max'];
const suffix = /-(low|medium|high|xhigh|max)$/;

export function groupCliModels(rows) {
  const entries = new Map();
  for (const { id, name } of rows) {
    const effort = suffix.exec(id)?.[1];
    const base = effort ? id.slice(0, -(effort.length + 1)) : id;
    let entry = entries.get(base);
    if (!entry) entries.set(base, entry = { id: base, name: name.replace(/\s+\((low|medium|high|xhigh|max)\)$/i, ''), variants: new Map() });
    if (effort) entry.variants.set(effort, id);
    else entry.exact = id;
  }
  return [...entries.values()].map(entry => {
    const efforts = effortIds.filter(id => entry.variants.has(id)).map(id => ({ id, name: id === 'xhigh' ? 'XHigh' : id[0].toUpperCase() + id.slice(1) }));
    if (efforts.length === 0) return entry;
    return { ...entry, reasoning: { efforts, defaultEffort: entry.variants.has('medium') ? 'medium' : efforts[0].id } };
  });
}

export function pickCliModel(entries, model, effort) {
  for (const entry of entries) {
    if (entry.id === model) {
      const selected = effort ?? entry.reasoning?.defaultEffort;
      const wire = selected === undefined ? entry.exact : entry.variants.get(selected);
      if (wire) return wire;
      throw new Error(`Antigravity CLI does not advertise effort ${effort} for ${model}`);
    }
    for (const [level, wire] of entry.variants) {
      if (wire !== model) continue;
      if (effort === undefined || effort === level) return wire;
      throw new Error(`Antigravity CLI does not advertise effort ${effort} for ${model}`);
    }
  }
  throw new Error(`Antigravity CLI does not advertise model ${model}`);
}

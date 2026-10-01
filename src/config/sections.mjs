const collator = new Intl.Collator('en');

/**
 * Shared section rules; presets supply presentation and aliases, not a whitelist.
 * @param {{ id: string, label: string, description: string, english?: string, aliases?: string[] }[]} presets
 * @param {string} defaultId
 * @param {string} prefix
 */
function defineSections(presets, defaultId, prefix, useDirectory = false) {
  const presetsById = new Map(presets.map((section) => [section.id, section]));
  const idsByAlias = new Map(
    (useDirectory ? [] : presets).flatMap((section) =>
      [section.id, section.label, ...(section.aliases ?? [])].map((alias) => [
        alias.toLowerCase(),
        section.id,
      ]),
    ),
  );

  /** @param {string} id */
  function byId(id) {
    // Keep fragments identical to DOM IDs: browsers try literal matches before
    // decoding. Escape underscores too so encoded and authored names stay distinct.
    const anchorId = `${prefix}-${encodeURIComponent(id).replaceAll('_', '%5F').replaceAll('%', '_')}`;
    const preset = presetsById.get(id);
    return {
      id,
      label: preset?.label ?? id,
      english: preset?.english ?? '',
      description: preset?.description ?? '',
      anchorId,
      href: `#${anchorId}`,
    };
  }

  return {
    /** @param {string} value @param {string} filename */
    resolve(value, filename) {
      if (useDirectory) {
        const separator = filename.indexOf('/');
        return separator < 0 ? defaultId : filename.slice(0, separator);
      }
      return value ? (idsByAlias.get(value.toLowerCase()) ?? value) : defaultId;
    },
    byId,
    /** @param {ReadonlyArray<{ section: string }>} articles */
    collect(articles) {
      const ids = new Set();
      for (const article of articles) ids.add(article.section);
      const presetIds = [...presetsById.keys()].filter((id) => ids.delete(id));
      return [...presetIds, ...[...ids].sort(collator.compare)].map(byId);
    },
  };
}

export const blogSections = defineSections(
  [
    {
      id: 'learn',
      label: 'Learning',
      english: 'LEARNING',
      description: 'Code, courses, and questions still taking shape.',
      aliases: ['study', '学习'],
    },
    {
      id: 'life',
      label: 'Life',
      english: 'LIFE',
      description: 'Skies, everyday life, and moments that need no conclusion.',
      aliases: ['living', 'daily', '生活'],
    },
  ],
  'learn',
  'section',
);

export const noteSections = defineSections(
  [
    { id: 'formulas', label: 'Formulas', description: 'Definitions, derivations, and assumptions' },
    {
      id: 'source',
      label: 'Source code',
      description: 'Call paths, data structures, and questions',
    },
    { id: 'cuda', label: 'CUDA API', description: 'Interfaces, usage, and edge cases' },
    {
      id: 'spice',
      label: 'SPICE algorithms',
      description: 'Circuit equations, solvers, and convergence',
    },
    { id: 'other', label: 'Other notes', description: 'Ideas still taking shape' },
  ],
  'other',
  'topic',
  true,
);

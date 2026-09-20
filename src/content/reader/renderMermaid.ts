import mermaid from 'mermaid';

const dayVariables = {
  fontFamily: "Outfit, 'Noto Sans SC', sans-serif",
  primaryColor: '#e7f3fc',
  primaryTextColor: '#203b58',
  primaryBorderColor: '#8bbbe0',
  secondaryColor: '#f7faff',
  tertiaryColor: '#ffffff',
  lineColor: '#5499d4',
  textColor: '#34475f',
  mainBkg: '#e7f3fc',
  nodeBorder: '#8bbbe0',
  clusterBkg: '#f7faff',
  clusterBorder: '#c5d9eb',
  titleColor: '#203b58',
  edgeLabelBackground: '#f7faff',
};

const nightVariables = {
  fontFamily: "Outfit, 'Noto Sans SC', sans-serif",
  primaryColor: '#1d3652',
  primaryTextColor: '#dceafa',
  primaryBorderColor: '#4d79a0',
  secondaryColor: '#142338',
  tertiaryColor: '#192b43',
  lineColor: '#8ebff0',
  textColor: '#b8cee2',
  mainBkg: '#1d3652',
  nodeBorder: '#4d79a0',
  clusterBkg: '#142338',
  clusterBorder: '#2a3d55',
  titleColor: '#dceafa',
  edgeLabelBackground: '#192b43',
};

function clearMermaidArtifacts(id: string) {
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
}

// Mermaid has global configuration: serialize initialization AND rendering across theme changes.
let renderQueue: Promise<void> = Promise.resolve();
const cache = new WeakMap<HTMLElement, Map<string, { source: string; svg: string }>>();

export function renderMermaidDiagrams(
  diagrams: HTMLElement[],
  theme: 'day' | 'night',
  shouldAbort?: () => boolean,
) {
  const task = renderQueue.then(() => drawDiagrams(diagrams, theme, shouldAbort));
  renderQueue = task.catch(() => {});
  return task;
}

async function drawDiagrams(
  diagrams: HTMLElement[],
  theme: 'day' | 'night',
  shouldAbort?: () => boolean,
) {
  if (shouldAbort?.()) return;
  if (!diagrams.length) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    logLevel: 'error',
    theme: theme === 'night' ? 'dark' : 'base',
    themeVariables: theme === 'night' ? nightVariables : dayVariables,
    fontFamily: "Outfit, 'Noto Sans SC', sans-serif",
    flowchart: { curve: 'basis', useMaxWidth: true },
    sequence: { useMaxWidth: true },
    suppressErrorRendering: true,
  });

  for (const [index, block] of diagrams.entries()) {
    const source = block.querySelector('.mermaid-source')?.textContent?.trim() ?? '';
    const canvas = block.querySelector<HTMLElement>('.mermaid-canvas');
    if (!canvas || !source) continue;
    if (shouldAbort?.()) return;
    if (block.dataset.renderedTheme === theme) continue;
    const id = `aliciaMermaid${index}${Math.random().toString(36).slice(2, 8)}`;
    try {
      const stored = cache.get(block)?.get(theme);
      const { svg } = stored?.source === source ? stored : await mermaid.render(id, source);
      if (shouldAbort?.()) {
        clearMermaidArtifacts(id);
        return;
      }
      const themes = cache.get(block) ?? new Map();
      themes.set(theme, { source, svg });
      cache.set(block, themes);
      canvas.innerHTML = svg;
      block.dataset.renderedTheme = theme;
      const svgElement = canvas.querySelector('svg');
      svgElement?.setAttribute('role', 'img');
      svgElement?.setAttribute('aria-label', 'Mermaid diagram');
      canvas.hidden = false;
      block.classList.add('is-rendered');
      block.classList.remove('is-error');
    } catch {
      clearMermaidArtifacts(id);
      if (shouldAbort?.()) return;
      canvas.replaceChildren();
      canvas.hidden = true;
      block.classList.remove('is-rendered');
      block.classList.add('is-error');
      delete block.dataset.renderedTheme;
    }
  }
}

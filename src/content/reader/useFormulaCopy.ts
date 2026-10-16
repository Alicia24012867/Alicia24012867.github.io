import { useEffect, type RefObject } from 'react';

/** The TeX a formula was written in, between the dollar signs it was written with. */
function texOf(formula: Element) {
  const tex = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
  if (tex == null) return undefined;
  return formula.classList.contains('katex-display') ? `$$${tex}$$` : `$${tex}$`;
}

/** The whole formula a node is part of, if any. */
function formulaAt(node: Node, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement;
  const formula = element?.closest('.katex');
  if (!formula || !root.contains(formula)) return undefined;
  return formula.parentElement?.closest('.katex-display') ?? formula;
}

const absolute = (value: string) => {
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return value;
  }
};

/**
 * Copying text with formulas gives each formula as its TeX, `$…$` inline and `$$…$$` on its
 * own line. Browsers would paste both KaTeX's MathML and its drawn glyphs, a character to a
 * line. A formula cut by either end of the selection is copied whole. Other selections copy
 * as the browser copies them.
 */
export function useFormulaCopy(bodyRef: RefObject<HTMLElement | null>, html: string) {
  useEffect(() => {
    const root = bodyRef.current;
    if (!root?.querySelector('.katex')) return;
    const onCopy = (event: ClipboardEvent) => {
      const selection = document.getSelection();
      if (!event.clipboardData || !selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0).cloneRange();
      const formulas = [...root.querySelectorAll('.katex')];
      if (!formulas.some((formula) => range.intersectsNode(formula))) return;
      const first = formulaAt(range.startContainer, root);
      if (first) range.setStartBefore(first);
      const last = formulaAt(range.endContainer, root);
      if (last) range.setEndAfter(last);

      const copy = document.createElement('div');
      copy.append(range.cloneContents());
      // Page controls and drawn diagrams stay behind; a diagram's source comes along.
      copy.querySelectorAll('.heading-link, .copy-code, .mermaid-canvas').forEach((node) => {
        node.remove();
      });
      for (const selector of ['.katex-display', '.katex'])
        copy.querySelectorAll(selector).forEach((formula) => {
          const tex = texOf(formula);
          if (tex !== undefined) formula.replaceWith(tex);
        });
      // Pasted elsewhere, links and images keep pointing at this site.
      copy.querySelectorAll('[href]').forEach((node) => {
        node.setAttribute('href', absolute(node.getAttribute('href')!));
      });
      copy.querySelectorAll('img').forEach((image) => {
        image.setAttribute('src', absolute(image.getAttribute('src') ?? ''));
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
      });
      const markup = copy.innerHTML;
      // Laid out off screen for a moment, the copy gives the line breaks a browser would.
      copy.style.cssText = 'position: fixed; top: 0; left: -10000px; width: 640px;';
      document.body.append(copy);
      const text = copy.innerText;
      copy.remove();
      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', markup);
      event.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [bodyRef, html]);
}

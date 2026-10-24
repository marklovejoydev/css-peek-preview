import * as vscode from 'vscode';
import { CssMatch } from './types';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const escapeMarkdown = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+\-.!|]/g, '\\$&');

// Values used in the miniature sample are deliberately restricted to a conservative CSS subset.
function safeStyle(matchList: CssMatch[], includeDefaults = true): string {
  const supported = new Set(['background', 'background-color', 'color', 'padding', 'margin', 'border', 'border-radius', 'font-size', 'font-weight', 'font-family', 'text-align', 'display', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'gap', 'row-gap', 'column-gap', 'flex-direction', 'align-items', 'justify-content', 'grid-template-columns']);
  const values: Record<string, string> = {};
  for (const match of matchList) for (const decl of match.declarations) {
    const property = decl.property.toLowerCase();
    const value = decl.value.trim();
    if (!supported.has(property) || /[<>"'\\{};]/.test(value) || /url\s*\(|expression\s*\(/i.test(value) || value.length > 100) continue;
    if (property === 'font-family' && !/^[\w\s,"'-]+$/.test(value)) continue;
    if (property === 'text-align' && !/^(left|right|center|justify|start|end)$/.test(value)) continue;
    if (property === 'display' && !/^(inline|block|inline-block|flex|grid|none)$/.test(value)) continue;
    if (['padding', 'margin', 'border-radius', 'font-size', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'gap', 'row-gap', 'column-gap'].includes(property) && !/^[\w.%\s(),#-]+$/.test(value)) continue;
    if (property === 'font-weight' && !/^(normal|bold|bolder|lighter|[1-9]00)$/.test(value)) continue;
    if (property === 'border' && !/^[\w.%\s(),#-]+$/.test(value)) continue;
    if (['background', 'background-color', 'color'].includes(property) && !/^[\w.%\s(),#-]+$/.test(value)) continue;
    if (property === 'flex-direction' && !/^(row|row-reverse|column|column-reverse)$/.test(value)) continue;
    if (['align-items', 'justify-content'].includes(property) && !/^(flex-start|flex-end|center|space-between|space-around|space-evenly|stretch|baseline|start|end)$/.test(value)) continue;
    if (property === 'grid-template-columns' && !/^[\w.%\s(),#-]+$/.test(value)) continue;
    values[property] = value;
  }
  const defaults = includeDefaults ? { display: 'inline-block', padding: '8px 12px', 'border-radius': '4px', background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)', border: '1px solid var(--vscode-editorWidget-border)' } : {};
  const merged = { ...defaults, ...values };
  return Object.entries(merged).map(([key, value]) => `${key}:${value}`).join(';');
}

export interface SampleElement { tag: string; classes: string[]; children: Array<SampleElement | string>; }

function elementFromTag(tag: string, attributes: string): SampleElement {
  const classAttribute = attributes.match(/\b(?:class|className)\s*=\s*(["'])(.*?)\1/);
  return { tag, classes: classAttribute?.[2].split(/\s+/).filter(Boolean) ?? [], children: [] };
}

function appendText(element: SampleElement, text: string): void {
  const sample = text.replace(/\{[^{}]*\}/g, '').replace(/\s+/g, ' ').trim();
  if (sample) element.children.push(sample);
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** Extracts a bounded static JSX/HTML subtree containing the class token. */
export function sampleElement(document: vscode.TextDocument, range: vscode.Range, className: string): SampleElement {
  const source = document.getText();
  const offset = document.offsetAt(range.start);
  const openStart = source.lastIndexOf('<', offset);
  const openEnd = source.indexOf('>', offset);
  if (openStart >= 0 && openEnd >= 0) {
    const opening = source.slice(openStart, openEnd + 1);
    const tagMatch = opening.match(/^<([A-Za-z][\w.-]*)\b/);
    const classAttribute = opening.match(/\b(?:class|className)\s*=\s*(["'])(.*?)\1/);
    if (tagMatch && classAttribute?.[2].split(/\s+/).includes(className)) {
      const root = elementFromTag(tagMatch[1], opening.slice(tagMatch[0].length, -1));
      const stack: SampleElement[] = [root];
      const tags = /<\/?([A-Za-z][\w.-]*)\b([^<>]*?)>/g;
      tags.lastIndex = openEnd + 1;
      let cursor = openEnd + 1;
      let nodeCount = 1;
      let tag: RegExpExecArray | null;
      while (stack.length && nodeCount < 100 && (tag = tags.exec(source)) && tag.index - openStart < 12000) {
        appendText(stack[stack.length - 1], source.slice(cursor, tag.index));
        cursor = tags.lastIndex;
        const name = tag[1];
        if (tag[0].startsWith('</')) {
          let matchIndex = stack.length - 1;
          while (matchIndex >= 0 && stack[matchIndex].tag !== name) matchIndex--;
          if (matchIndex >= 0) stack.length = matchIndex;
          continue;
        }
        const child = elementFromTag(name, tag[2]);
        stack[stack.length - 1].children.push(child);
        nodeCount++;
        if (!tag[2].trimEnd().endsWith('/') && !VOID_ELEMENTS.has(name.toLowerCase())) stack.push(child);
      }
      if (stack.length) appendText(stack[stack.length - 1], source.slice(cursor));
      return root;
    }
  }
  return { tag: 'div', classes: [], children: [`.${className}`] };
}

export function sampleClasses(element: SampleElement): string[] {
  const classes = new Set<string>();
  const visit = (node: SampleElement) => { node.classes.forEach(name => classes.add(name)); node.children.forEach(child => { if (typeof child !== 'string') visit(child); }); };
  visit(element);
  return [...classes];
}

export function renderWebviewPreview(
  webview: vscode.Webview,
  className: string,
  element: SampleElement,
  matchesByClass: Map<string, CssMatch[]>,
  emptyMessage: string
): string {
  const nonce = [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
  const escapedClass = escapeHtml(className);
  const uniqueMatches = new Map<string, { match: CssMatch; className: string }>();
  for (const [name, matches] of matchesByClass) for (const match of matches.filter(item => item.direct !== false)) {
    const key = `${match.uri.toString()}|${match.line}|${match.selector}`;
    if (!uniqueMatches.has(key)) uniqueMatches.set(key, { match, className: name });
  }
  const rules = [...uniqueMatches.values()];
  const getElementMatches = (node: SampleElement) => {
    const unique = new Map<string, CssMatch>();
    for (const name of node.classes) for (const match of matchesByClass.get(name) ?? []) unique.set(`${match.uri.toString()}|${match.line}|${match.selector}`, match);
    return [...unique.values()];
  };
  const sampleRules: string[] = [];
  let sampleNodeIndex = 0;
  const renderElement = (node: SampleElement, root = false): string => {
    const tag = /^[A-Za-z][\w.-]*$/.test(node.tag) ? node.tag : 'div';
    const matches = getElementMatches(node).filter(match => match.direct !== false);
    const style = safeStyle(matches, false) || (root ? 'display:inline-block;padding:12px 24px;border-radius:8px;background:#2563eb;color:white;border:0;font-weight:600' : '');
    const previewClass = `preview-node-${sampleNodeIndex++}`;
    if (style) sampleRules.push(`.${previewClass}{${style}}`);
    const classes = [previewClass, ...node.classes].map(escapeHtml).join(' ');
    const attributes = ` class="${classes}"${style ? ` style="${escapeHtml(style)}"` : ''}`;
    const children = node.children.map(child => typeof child === 'string' ? escapeHtml(child) : renderElement(child)).join('');
    return `<${tag}${attributes}>${children}</${tag}>`;
  };
  const ruleCards = rules.map(({ match, className: matchedClass }) => {
    const source = escapeHtml(vscode.workspace.asRelativePath(match.uri, false));
    const declarations = match.declarations.map(d => `  ${d.property}: ${d.value}${d.important ? ' !important' : ''};`).join('\n');
    return `<section class="rule"><div class="source">${source}:${match.line}</div><div class="code-head">‹/› &nbsp; CSS</div><pre>${escapeHtml(declarations)}</pre><a class="source-link" href="#" data-uri="${escapeHtml(match.uri.toString())}" data-line="${match.line}" data-class="${escapeHtml(matchedClass)}">Click the source to open the stylesheet</a></section>`;
  }).join('');
  const message = rules.length ? '' : `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:18px;background:#000;color:#f2f2f2;font:13px var(--vscode-font-family,Arial,sans-serif)}.card{border:1px solid #292929;border-radius:9px;padding:12px}.heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.heading strong{font-size:15px}.class-name{color:#ddd}.sample-frame{min-height:50px;max-width:100%;overflow:auto}.sample-frame>*{max-width:100%}.caption{margin:13px 0 18px;color:#c7c7c7}.rule{border-top:1px solid #202020;padding-top:18px;margin-top:16px}.source{font-size:12px;margin-bottom:30px;color:#ddd}.code-head{background:#444;border-radius:20px 20px 0 0;padding:14px 18px;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#444;margin:0;padding:0 18px 18px;border-radius:0 0 22px 22px;color:#f1f1f1;font:12px/1.7 var(--vscode-editor-font-family,Consolas,monospace)}a{display:inline-block;margin-top:14px;color:var(--vscode-textLink-foreground,#75baff);text-decoration:none}a:hover{text-decoration:underline}.empty{color:#ccc}
    ${sampleRules.join('\n')}
    </style></head><body><main class="card"><div class="heading"><strong>CSS Preview</strong><span class="class-name">${escapedClass}</span></div><div class="sample-frame">${renderElement(element, true)}</div><p class="caption">Live preview — updates as CSS changes</p>${message}${ruleCards}</main><script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.addEventListener('click', event => {
        const link = event.target.closest('.source-link');
        if (!link) return;
        event.preventDefault();
        vscode.postMessage({ type: 'openSource', uri: link.dataset.uri, line: Number(link.dataset.line), className: link.dataset.class });
      });
    </script></body></html>`;
}

export function renderPreview(className: string, matches: CssMatch[], emptyMessage?: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportHtml = true;
  md.isTrusted = { enabledCommands: ['css-peek-preview.openSource'] };
  md.appendMarkdown('### CSS Preview · `.' + escapeMarkdown(className) + '`\n\n');
  if (!matches.length) {
    md.appendMarkdown(`${escapeMarkdown(emptyMessage ?? 'No matching CSS rules were found.')}\n\n`);
    md.appendMarkdown('Enable **CSS Peek Preview: Search Workspace** in Settings to search other stylesheets.');
    return md;
  }
  md.appendMarkdown('_Approximate sample; this does not compute the browser cascade._\n\n');
  md.appendMarkdown(`<span style="${escapeHtml(safeStyle(matches))}"> .${escapeHtml(className)} </span>\n\n`);
  for (const match of matches) {
    const declarations = match.declarations.map(d => `  ${d.property}: ${d.value}${d.important ? ' !important' : ''};`).join('\n');
    const source = vscode.workspace.asRelativePath(match.uri, false);
    const args = encodeURIComponent(JSON.stringify([match.uri.toString(), match.line]));
    md.appendMarkdown(`**${escapeMarkdown(match.selector)}**${match.atRules.length ? `  \n${escapeMarkdown(match.atRules.join(' → '))}` : ''}  \n`);
    md.appendMarkdown(`[${escapeMarkdown(source)}:${match.line}](command:css-peek-preview.openSource?${args})\n\n`);
    md.appendCodeblock(declarations, 'css');
  }
  return md;
}

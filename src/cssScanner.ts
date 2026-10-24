import * as vscode from 'vscode';
import postcss, { AtRule, Rule } from 'postcss';
import scss from 'postcss-scss';
import selectorParser from 'postcss-selector-parser';
import { CssMatch, ScanResult } from './types';

interface ParsedStylesheet { text: string; root?: postcss.Root; parseError?: string; }
const parsedCache = new Map<string, ParsedStylesheet>();
const PARSED_CACHE_LIMIT = 48;

export function clearCssCache(uri?: vscode.Uri): void {
  if (uri) parsedCache.delete(uri.toString());
  else parsedCache.clear();
}

function parseStylesheet(text: string, uri: vscode.Uri): ParsedStylesheet {
  const key = uri.toString();
  const cached = parsedCache.get(key);
  if (cached?.text === text) { parsedCache.delete(key); parsedCache.set(key, cached); return cached; }
  let parsed: ParsedStylesheet;
  try {
    const parser = uri.fsPath.toLowerCase().endsWith('.scss') ? scss : postcss;
    parsed = { text, root: parser.parse(text, { from: uri.fsPath }) };
  } catch (error) {
    parsed = { text, parseError: error instanceof Error ? error.message : 'Unable to parse stylesheet.' };
  }
  parsedCache.set(key, parsed);
  if (parsedCache.size > PARSED_CACHE_LIMIT) parsedCache.delete(parsedCache.keys().next().value!);
  return parsed;
}

function selectorHasClass(selector: string, target: string): boolean {
  let found = false;
  selectorParser(root => root.walkClasses(node => { if (node.value === target) found = true; })).processSync(selector);
  return found;
}

function selectorTargetsClass(selector: string, target: string): boolean {
  let found = false;
  selectorParser(root => root.walkClasses(node => {
    if (node.value !== target) return;
    let ancestor: typeof node.parent = node.parent;
    while (ancestor) {
      if (ancestor.type === 'pseudo') return;
      ancestor = ancestor.parent;
    }
    const siblings = node.parent?.nodes ?? [];
    const index = siblings.indexOf(node);
    if (!siblings.slice(index + 1).some(sibling => sibling.type === 'combinator')) found = true;
  })).processSync(selector);
  return found;
}

function expandedSelectors(rule: Rule): string[] {
  const ancestors: Rule[] = [];
  let parent: postcss.Node['parent'] = rule.parent;
  while (parent) {
    if (parent.type === 'rule') ancestors.unshift(parent as Rule);
    parent = parent.parent;
  }
  let selectors = [''];
  for (const current of [...ancestors, rule]) {
    const own = current.selectors;
    if (!selectors[0]) { selectors = own; continue; }
    selectors = selectors.flatMap(parentSelector => own.map(selector => selector.includes('&')
      ? selector.replace(/&/g, parentSelector)
      : `${parentSelector} ${selector}`));
  }
  return selectors;
}

export function scanCss(text: string, uri: vscode.Uri, className: string): ScanResult {
  const matches: CssMatch[] = [];
  const parsed = parseStylesheet(text, uri);
  if (!parsed.root) return { matches, parseError: parsed.parseError };
  try {
    const root = parsed.root;
    root.walkRules((rule: Rule) => {
      let matched = false;
      let direct = false;
      try {
        // A selector list contributes its matching arms only; keep source spelling for navigation.
        for (const selector of expandedSelectors(rule)) {
          if (selectorHasClass(selector, className)) matched = true;
          if (selectorTargetsClass(selector, className)) direct = true;
        }
      } catch { /* incomplete selector: skip this rule */ }
      if (!matched) return;
      const declarations = rule.nodes?.filter(n => n.type === 'decl').map(n => ({
        property: (n as postcss.Declaration).prop,
        value: (n as postcss.Declaration).value,
        important: (n as postcss.Declaration).important
      })) ?? [];
      if (declarations.length === 0) return;
      const atRules: string[] = [];
      let parent: postcss.Node['parent'] = rule.parent;
      while (parent) { if (parent.type === 'atrule') atRules.unshift(`@${(parent as AtRule).name} ${(parent as AtRule).params}`.trim()); parent = parent.parent; }
      matches.push({ uri, line: rule.source?.start?.line ?? 1, selector: rule.selector, declarations, atRules, direct });
    });
    return { matches };
  } catch (error) {
    return { matches, parseError: error instanceof Error ? error.message : 'Unable to scan stylesheet.' };
  }
}

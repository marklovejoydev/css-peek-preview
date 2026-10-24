import * as vscode from 'vscode';
import { classAtPosition } from './classNameResolver';
import { clearCssCache, scanCss } from './cssScanner';
import { existingCandidates, workspaceStylesheets } from './stylesheetResolver';
import { CssMatch } from './types';
import { renderPreview, renderWebviewPreview, sampleClasses, sampleElement } from './previewRenderer';

interface CachedText { stamp: string; text: string; }
const cache = new Map<string, CachedText>();
const CACHE_LIMIT = 80;
interface PreviewState { source: vscode.Uri; className: string; line: number; character: number; panel: vscode.WebviewPanel; }
let previewState: PreviewState | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

async function readStylesheet(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
  if (open) return open.getText();
  const stat = await vscode.workspace.fs.stat(uri);
  const stamp = `${stat.mtime}:${stat.size}`;
  const key = uri.toString();
  const cached = cache.get(key);
  if (cached?.stamp === stamp) { cache.delete(key); cache.set(key, cached); return cached.text; }
  const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  cache.set(key, { stamp, text });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return text;
}

export async function findMatches(source: vscode.Uri, pattern: string, className: string, searchWorkspace?: boolean): Promise<{ matches: CssMatch[]; empty: string }> {
  const shouldSearchWorkspace = searchWorkspace ?? vscode.workspace.getConfiguration('cssPeekPreview').get<boolean>('searchWorkspace', false);
  const resolved = await existingCandidates(source, pattern);
  if (resolved.invalidPattern) return { matches: [], empty: `Invalid stylesheet path pattern: ${resolved.invalidPattern}` };
  const checked = new Set<string>();
  let hadParseError = false;
  let matches: CssMatch[] = [];
  for (const uri of resolved.uris) {
    checked.add(uri.toString());
    try {
      const result = scanCss(await readStylesheet(uri), uri, className);
      hadParseError ||= Boolean(result.parseError);
      if (result.matches.length) { matches = result.matches; break; }
    } catch { /* inaccessible/deleted candidate */ }
  }
  if (!matches.length && shouldSearchWorkspace) {
    for (const uri of await workspaceStylesheets(source)) {
      if (checked.has(uri.toString())) continue;
      try { matches.push(...scanCss(await readStylesheet(uri), uri, className).matches); } catch { /* skip unavailable file */ }
    }
  }
  const expected = vscode.workspace.asRelativePath(resolved.expected, false);
  let empty = matches.length ? '' : resolved.uris.length === 0
    ? `Expected stylesheet not found: ${expected}.`
    : hadParseError ? `Could not parse the configured stylesheet near the matching rules: ${expected}.`
      : `No matching CSS rules found in ${expected}.`;
  if (!matches.length && !shouldSearchWorkspace) empty += ' Workspace search is disabled.';
  return { matches, empty };
}

export function activate(context: vscode.ExtensionContext): void {
  const languageIds = ['html', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'astro', 'vue', 'svelte'];
  const selectors: vscode.DocumentSelector = languageIds.map(language => ({ language, scheme: 'file' }));
  const refreshPreviewSoon = () => {
    if (!previewState || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refreshPreview();
    }, 120);
  };
  const invalidateStylesheet = (uri: vscode.Uri) => {
    cache.delete(uri.toString());
    clearCssCache(uri);
    refreshPreviewSoon();
  };
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (/\.(css|scss)$/i.test(event.document.uri.fsPath)) invalidateStylesheet(event.document.uri);
    else if (previewState?.source.toString() === event.document.uri.toString()) refreshPreviewSoon();
  }));
  context.subscriptions.push(vscode.workspace.onDidDeleteFiles(event => event.files.forEach(invalidateStylesheet)));
  context.subscriptions.push(vscode.workspace.onDidRenameFiles(event => event.files.forEach(file => { invalidateStylesheet(file.oldUri); invalidateStylesheet(file.newUri); })));
  const stylesheetWatcher = vscode.workspace.createFileSystemWatcher('**/*.{css,scss}');
  stylesheetWatcher.onDidChange(invalidateStylesheet, undefined, context.subscriptions);
  stylesheetWatcher.onDidCreate(invalidateStylesheet, undefined, context.subscriptions);
  stylesheetWatcher.onDidDelete(invalidateStylesheet, undefined, context.subscriptions);
  context.subscriptions.push(stylesheetWatcher);

  async function refreshPreview(): Promise<void> {
    const current = previewState;
    if (!current) return;
    try {
      const document = await vscode.workspace.openTextDocument(current.source);
      const line = Math.min(document.lineCount - 1, current.line);
      const token = classAtPosition(document, new vscode.Position(line, Math.min(document.lineAt(line).text.length, current.character)));
      const className = token?.name ?? current.className;
      const pattern = vscode.workspace.getConfiguration('cssPeekPreview').get<string>('stylesheetPath', '{directory}/{name}.css');
      const element = token ? sampleElement(document, token.range, className) : { tag: 'div', classes: [], children: [`.${className}`] };
      const previewClasses = [...new Set([className, ...sampleClasses(element)])];
      const classResults = await Promise.all(previewClasses.map(async name => [name, await findMatches(current.source, pattern || '{directory}/{name}.css', name)] as const));
      if (previewState !== current) return;
      const matchesByClass = new Map(classResults.map(([name, result]) => [name, result.matches]));
      const empty = classResults.find(([name]) => name === className)?.[1].empty ?? 'No matching CSS rules were found.';
      current.className = className;
      current.panel.title = `CSS Preview: .${className}`;
      current.panel.webview.html = renderWebviewPreview(
        current.panel.webview,
        className,
        element,
        matchesByClass,
        empty
      );
    } catch { /* source may have been deleted while the preview is open */ }
  }

  context.subscriptions.push(vscode.languages.registerHoverProvider(selectors, {
    async provideHover(document, position, _token) {
      const token = classAtPosition(document, position);
      if (!token) return undefined;
      const before = vscode.window.activeTextEditor;
      const sourceVersion = document.version;
      const pattern = vscode.workspace.getConfiguration('cssPeekPreview').get<string>('stylesheetPath', '{directory}/{name}.css');
      const result = await findMatches(document.uri, pattern || '{directory}/{name}.css', token.name);
      // Avoid returning a preview for stale editor/cursor state after asynchronous file reads.
      const current = vscode.window.activeTextEditor;
      if (!current || current.document.uri.toString() !== document.uri.toString() || current.document.version !== sourceVersion || (before && !current.selection.active.isEqual(position))) return undefined;
      const content = renderPreview(token.name, result.matches, result.empty);
      return new vscode.Hover(content, token.range);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('css-peek-preview.show', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { void vscode.window.showInformationMessage('Open a source file and place the cursor in a static class or className value.'); return; }
    if (!classAtPosition(editor.document, editor.selection.active)) { void vscode.window.showInformationMessage('Place the cursor inside a static class or className token in HTML, JSX, TSX, JavaScript, TypeScript, Astro, Vue, or Svelte.'); return; }
    const token = classAtPosition(editor.document, editor.selection.active)!;
    if (previewState) {
      previewState.panel.reveal(vscode.ViewColumn.Beside);
      previewState = { ...previewState, source: editor.document.uri, className: token.name, line: editor.selection.active.line, character: editor.selection.active.character };
      await refreshPreview();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'cssPeekPreview', 'CSS Preview', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const messageListener = panel.webview.onDidReceiveMessage(message => {
      if (message?.type === 'openSource') {
        void vscode.commands.executeCommand('css-peek-preview.openSource', message.uri, message.line, message.className);
      }
    });
    previewState = { panel, source: editor.document.uri, className: token.name, line: editor.selection.active.line, character: editor.selection.active.character };
    panel.onDidDispose(() => { messageListener.dispose(); if (previewState?.panel === panel) previewState = undefined; });
    await refreshPreview();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('css-peek-preview.openSource', async (uriString: unknown, lineValue: unknown, classNameValue?: unknown) => {
    if (typeof uriString !== 'string' || typeof lineValue !== 'number' || !Number.isInteger(lineValue)) return;
    let uri: vscode.Uri;
    try { uri = vscode.Uri.parse(uriString); if (uri.scheme !== 'file') return; } catch { return; }
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
      const line = Math.max(0, Math.min(doc.lineCount - 1, lineValue - 1));
      const text = doc.lineAt(line).text;
      const className = typeof classNameValue === 'string' ? classNameValue : '';
      const selectorOffset = className ? text.indexOf(`.${className}`) : -1;
      const start = selectorOffset >= 0 ? selectorOffset + 1 : 0;
      const end = selectorOffset >= 0 ? Math.min(text.length, start + className.length) : start;
      editor.selection = new vscode.Selection(line, start, line, end);
      editor.revealRange(new vscode.Range(line, start, line, end), vscode.TextEditorRevealType.InCenter);
    } catch { void vscode.window.showWarningMessage(`Unable to open stylesheet: ${uri.fsPath}`); }
  }));
}

export function deactivate(): void { cache.clear(); if (refreshTimer) clearTimeout(refreshTimer); previewState = undefined; }

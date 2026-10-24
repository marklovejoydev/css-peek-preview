import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { findMatches } from '../../src/extension';
import { existingCandidates, resolveStylesheetPaths, workspaceStylesheets } from '../../src/stylesheetResolver';

suite('Stylesheet resolution', () => {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  test('supports placeholders for a file outside a workspace', () => {
    const source = vscode.Uri.file(path.join(os.tmpdir(), 'outside', 'src', 'Test.tsx'));
    const resolved = resolveStylesheetPaths(source, '{directory}/{name}.{extension}.css');
    assert.strictEqual(resolved.expected.fsPath.toLowerCase(), path.resolve(path.dirname(source.fsPath), 'Test.tsx.css').toLowerCase());
    assert.strictEqual(resolveStylesheetPaths(source, '{unknown}/{name}.css').invalidPattern, '{unknown}/Test.css');
  });

  test('orders configured file before module and extension variants with no duplicate URIs', () => {
    const resolved = resolveStylesheetPaths(vscode.Uri.file(path.join(os.tmpdir(), 'outside', 'Test.tsx')), '{directory}/{name}.css');
    const paths = resolved.uris.map(uri => uri.fsPath);
    assert.strictEqual(paths[0].toLowerCase(), path.resolve(os.tmpdir(), 'outside', 'Test.css').toLowerCase());
    assert.ok(paths.some(candidate => candidate.toLowerCase() === path.resolve(os.tmpdir(), 'outside', 'Test.module.css').toLowerCase()));
    assert.ok(paths.some(candidate => candidate.toLowerCase() === path.resolve(os.tmpdir(), 'outside', 'Test.scss').toLowerCase()));
    assert.strictEqual(new Set(paths).size, paths.length);
  });

  test('resolves relative workspace paths and prioritizes the configured SCSS file', async () => {
    assert.ok(root, 'test host must open the fixture workspace');
    const source = vscode.Uri.file(path.join(root!, 'src', 'App.tsx'));
    const result = resolveStylesheetPaths(source, '{directory}/{name}.scss');
    assert.strictEqual(result.expected.fsPath.toLowerCase(), path.join(root!, 'src', 'App.scss').toLowerCase());
    assert.strictEqual(result.uris[0].fsPath.toLowerCase(), result.expected.fsPath.toLowerCase());
    assert.strictEqual(resolveStylesheetPaths(source, 'src/styles/{name}.css').expected.fsPath.toLowerCase(), path.join(root!, 'src', 'styles', 'App.css').toLowerCase());
  });

  test('reads same-directory CSS, SCSS and CSS Module candidates, and reports missing files', async () => {
    assert.ok(root, 'test host must open the fixture workspace');
    const source = vscode.Uri.file(path.join(root!, 'src', 'App.tsx'));
    const appCss = vscode.Uri.file(path.join(root!, 'src', 'App.css'));
    const appScss = vscode.Uri.file(path.join(root!, 'src', 'App.scss'));
    const moduleCss = vscode.Uri.file(path.join(root!, 'src', 'App.module.css'));
    const candidates = await existingCandidates(source, '{directory}/{name}.css');
    assert.deepStrictEqual(candidates.uris.map(uri => uri.fsPath.toLowerCase()), [appCss, moduleCss, appScss].map(uri => uri.fsPath.toLowerCase()));
    const scssCandidates = await existingCandidates(source, '{directory}/{name}.scss');
    assert.deepStrictEqual(scssCandidates.uris.map(uri => uri.fsPath.toLowerCase()), [appScss, appCss, moduleCss].map(uri => uri.fsPath.toLowerCase()));
    assert.strictEqual((await existingCandidates(source, '{directory}/Missing.css')).uris.length, 0);
  });

  test('uses the first candidate that contains the class and preserves configured-path priority', async () => {
    assert.ok(root, 'test host must open the fixture workspace');
    const source = vscode.Uri.file(path.join(root!, 'src', 'App.tsx'));
    const primary = await findMatches(source, '{directory}/{name}.css', 'component', false);
    assert.ok(primary.matches.length > 0);
    assert.ok(primary.matches.every(match => match.uri.fsPath.toLowerCase().endsWith('app.css')));
    const moduleFallback = await findMatches(source, '{directory}/{name}.css', 'module-only', false);
    assert.ok(moduleFallback.matches.length > 0);
    assert.ok(moduleFallback.matches.every(match => match.uri.fsPath.toLowerCase().endsWith('app.module.css')));
    const scssFallback = await findMatches(source, '{directory}/{name}.css', 'scss-only', false);
    assert.ok(scssFallback.matches.length > 0);
    assert.ok(scssFallback.matches.every(match => match.uri.fsPath.toLowerCase().endsWith('app.scss')));
  });

  test('workspace scanning is opt-in and excludes ignored directories', async () => {
    assert.ok(root, 'test host must open the fixture workspace');
    assert.strictEqual(vscode.workspace.getConfiguration('cssPeekPreview').get<boolean>('searchWorkspace'), false);
    const source = vscode.Uri.file(path.join(root!, 'src', 'App.tsx'));
    const unrelated = vscode.Uri.file(path.join(root!, 'styles', 'shared.css'));
    const ignored = vscode.Uri.file(path.join(root!, 'node_modules', 'pkg', 'ignored.css'));
    const nodeModules = vscode.Uri.file(path.join(root!, 'node_modules'));
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(ignored.fsPath)));
      await vscode.workspace.fs.writeFile(ignored, Buffer.from('.shared { color: black }'));
      const disabled = await findMatches(source, '{directory}/{name}.css', 'shared', false);
      assert.strictEqual(disabled.matches.length, 0);
      assert.ok(disabled.empty.includes('Workspace search is disabled'));
      const enabled = await findMatches(source, '{directory}/{name}.css', 'shared', true);
      assert.strictEqual(enabled.matches.length, 1);
      assert.strictEqual(enabled.matches[0].uri.fsPath.toLowerCase(), unrelated.fsPath.toLowerCase());
      assert.deepStrictEqual((await workspaceStylesheets(source)).filter(uri => uri.fsPath.toLowerCase() === ignored.fsPath.toLowerCase()), []);
    } finally {
      try { await vscode.workspace.fs.delete(nodeModules, { recursive: true, useTrash: false }); } catch { /* not created */ }
    }
  });
});

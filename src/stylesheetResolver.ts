import * as vscode from 'vscode';
import * as path from 'path';
import { ResolvedStylesheets } from './types';

const DEFAULT_EXTENSIONS = ['.css', '.scss'];
const ignored = '**/{node_modules,.git,dist,build,out}/**';

function extensionList(): string[] {
  const configured = vscode.workspace.getConfiguration('cssPeekPreview').get<unknown>('stylesheetExtensions', DEFAULT_EXTENSIONS);
  const values = Array.isArray(configured) ? configured.filter((entry): entry is string => typeof entry === 'string') : [];
  const valid = values.map(entry => entry.startsWith('.') ? entry : `.${entry}`).filter(entry => /^\.[\w.-]+$/.test(entry));
  return [...new Set(valid.length ? valid : DEFAULT_EXTENSIONS)];
}

export function resolveStylesheetPaths(source: vscode.Uri, pattern: string): ResolvedStylesheets {
  const folder = vscode.workspace.getWorkspaceFolder(source);
  const sourcePath = source.fsPath;
  const dir = path.dirname(sourcePath);
  const root = folder?.uri.fsPath;
  const relativeDir = root ? (path.relative(root, dir).split(path.sep).join('/') || '.') : '.';
  const name = path.basename(sourcePath, path.extname(sourcePath));
  const sourceExtension = path.extname(sourcePath).slice(1);
  const values = { directory: relativeDir, name, extension: sourceExtension };
  let substituted = pattern.replace(/\{(directory|name|extension)\}/g, (_m, key: keyof typeof values) => values[key]);
  if (/\{[^}]+\}/.test(substituted) || !substituted.trim() || substituted.includes('\0')) return { uris: [], expected: source, invalidPattern: substituted };

  const absolute = path.isAbsolute(substituted);
  const base = absolute ? path.normalize(substituted) : path.resolve(root ?? dir, substituted);
  const configuredExt = path.extname(base);
  const stem = configuredExt ? base.slice(0, -configuredExt.length) : base;
  const extensions = extensionList();
  const candidates = [base];
  // Variants are adjacent to the configured stem and only follow the exact configured path.
  if (configuredExt && extensions.includes(configuredExt.toLowerCase())) {
    candidates.push(`${stem}.module${configuredExt}`);
    for (const ext of extensions) {
      candidates.push(`${stem}${ext}`);
      candidates.push(`${stem}.module${ext}`);
    }
  }
  const unique = [...new Set(candidates)].map(p => vscode.Uri.file(p));
  return { uris: unique, expected: vscode.Uri.file(base) };
}

export async function existingCandidates(source: vscode.Uri, pattern: string): Promise<ResolvedStylesheets> {
  const resolved = resolveStylesheetPaths(source, pattern);
  if (resolved.invalidPattern) return resolved;
  const existing: vscode.Uri[] = [];
  for (const uri of resolved.uris) {
    try { await vscode.workspace.fs.stat(uri); existing.push(uri); } catch { /* missing candidate */ }
  }
  return { ...resolved, uris: existing };
}

export async function workspaceStylesheets(source: vscode.Uri): Promise<vscode.Uri[]> {
  const folder = vscode.workspace.getWorkspaceFolder(source);
  if (!folder) return [];
  const extensions = extensionList();
  const results = await Promise.all(extensions.map(extension =>
    vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/*${extension}`), ignored, 500)));
  const unique = new Map<string, vscode.Uri>();
  for (const uri of results.flat()) unique.set(uri.toString(), uri);
  return [...unique.values()];
}

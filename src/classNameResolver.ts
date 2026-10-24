import * as vscode from 'vscode';

export interface ClassToken { name: string; range: vscode.Range; }
const CLASS_ATTRIBUTE = /\b(?:class|className)\s*=\s*(["'])(.*?)\1/g;
const TOKEN = /[^\s"'`{}]+/g;

/** Finds a statically-written HTML/JSX class token containing the cursor. */
export function classAtPosition(document: vscode.TextDocument, position: vscode.Position): ClassToken | undefined {
  if (position.line < 0 || position.line >= document.lineCount || position.character < 0 || position.character > document.lineAt(position.line).text.length) return undefined;
  const lineText = document.lineAt(position.line).text;
  CLASS_ATTRIBUTE.lastIndex = 0;
  let attr: RegExpExecArray | null;
  while ((attr = CLASS_ATTRIBUTE.exec(lineText))) {
    const contentStart = attr.index + attr[0].indexOf(attr[2]);
    const contentEnd = contentStart + attr[2].length;
    if (position.character < contentStart || position.character > contentEnd) continue;
    TOKEN.lastIndex = 0;
    let token: RegExpExecArray | null;
    while ((token = TOKEN.exec(attr[2]))) {
      const start = contentStart + token.index;
      const end = start + token[0].length;
      if (position.character >= start && position.character <= end) {
        const raw = token[0];
        // CSS identifier escapes are decoded for selector comparison where the escape is simple.
        const name = raw.replace(/\\([\da-fA-F]{1,6})\s?|\\(.)/g, (_m, hex: string | undefined, char: string | undefined) => hex ? String.fromCodePoint(parseInt(hex, 16)) : (char ?? ''));
        return { name, range: new vscode.Range(position.line, start, position.line, end) };
      }
    }
  }
  return undefined;
}

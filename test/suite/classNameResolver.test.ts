import * as assert from 'assert';
import * as vscode from 'vscode';
import { classAtPosition } from '../../src/classNameResolver';

suite('Class name resolution', () => {
  async function document(content: string, language: string) {
    return vscode.workspace.openTextDocument({ language, content });
  }

  test('resolves HTML class values and multiple tokens at their boundaries', async () => {
    const doc = await document('<div class="primary-button other_item">', 'html');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 12))?.name, 'primary-button');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 26))?.name, 'primary-button');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 27))?.name, 'other_item');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 36))?.name, 'other_item');
  });

  test('resolves JSX and TSX className values', async () => {
    for (const language of ['javascriptreact', 'typescriptreact']) {
      const doc = await document('<button className="save-action">', language);
      assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 23))?.name, 'save-action');
    }
  });

  test('returns no token for empty classes, invalid positions, and dynamic expressions', async () => {
    const doc = await document('<div class=""><div className={classes}>', 'typescriptreact');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 12)), undefined);
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 30)), undefined);
    assert.strictEqual(classAtPosition(doc, new vscode.Position(1, 0)), undefined);
  });

  test('decodes a simple CSS escape in a class token', async () => {
    const doc = await document('<div class="has\\:colon">', 'html');
    assert.strictEqual(classAtPosition(doc, new vscode.Position(0, 16))?.name, 'has:colon');
  });
});

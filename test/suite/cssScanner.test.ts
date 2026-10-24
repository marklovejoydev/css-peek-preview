import * as assert from 'assert';
import * as vscode from 'vscode';
import { scanCss } from '../../src/cssScanner';

suite('CSS scanner', () => {
  test('matches simple, compound, hover, and descendant selectors without substring matches', () => {
    const uri = vscode.Uri.file('/workspace/Example.css');
    const result = scanCss('.btn-large { color: black }\n.btn:hover, .card .btn.active { color: blue }', uri, 'btn');
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0].selector, '.btn:hover, .card .btn.active');
    assert.strictEqual(result.matches[0].line, 2);
  });

  test('preserves multiple and duplicate declarations, order, and !important', () => {
    const result = scanCss('.x { color: red; color: blue !important; padding: 4px }', vscode.Uri.file('/x.css'), 'x');
    assert.deepStrictEqual(result.matches[0].declarations.map(d => d.property), ['color', 'color', 'padding']);
    assert.strictEqual(result.matches[0].declarations[1].value, 'blue');
    assert.strictEqual(result.matches[0].declarations[1].important, true);
  });

  test('captures enclosing at-rules and parses SCSS nesting', () => {
    const result = scanCss('@media (min-width: 40rem) { .x { color: red; &:hover { color: blue } } }', vscode.Uri.file('/x.scss'), 'x');
    assert.strictEqual(result.matches.length, 2);
    assert.deepStrictEqual(result.matches[0].atRules, ['@media (min-width: 40rem)']);
  });

  test('handles malformed syntax and absent selectors without throwing', () => {
    const uri = vscode.Uri.file('/x.css');
    assert.ok(scanCss('.x { color: red', uri, 'x').parseError);
    assert.deepStrictEqual(scanCss('.y { color: red }', uri, 'x').matches, []);
  });
});

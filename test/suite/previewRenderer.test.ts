import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { renderPreview } from "../../src/previewRenderer";
import { CssMatch } from "../../src/types";

suite("Preview rendering and navigation data", () => {
  test("the show command activates the extension and returns a CSS hover for the class token", async () => {
    const source = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        "src",
        "App.tsx",
      ),
    );
    const document = await vscode.workspace.openTextDocument(source);
    const editor = await vscode.window.showTextDocument(document);
    const offset =
      document.getText().indexOf('className="component"') +
      'className="'.length +
      2;
    const position = document.positionAt(offset);
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand("css-peek-preview.show");
    const sourceEditor = await vscode.window.showTextDocument(document);
    sourceEditor.selection = new vscode.Selection(position, position);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      source,
      position,
    );
    assert.ok(
      hovers?.length,
      "expected the extension hover provider to return a preview",
    );
    const markdown = hovers!
      .flatMap((hover) => hover.contents)
      .map((content) => (typeof content === "string" ? content : content.value))
      .join("\n");
    assert.ok(markdown.includes("CSS Preview"));
    assert.ok(markdown.includes(".component"));
    assert.ok(markdown.includes("#2825eb"));
  });

  test("renders separate rules, declarations, source line links, and approximation notice", () => {
    const uri = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        "a stylesheet.css",
      ),
    );
    const matches: CssMatch[] = [
      {
        uri,
        line: 3,
        selector: ".x:hover",
        atRules: [],
        declarations: [{ property: "color", value: "red", important: false }],
      },
      {
        uri,
        line: 8,
        selector: ".card .x",
        atRules: ["@media screen"],
        declarations: [{ property: "color", value: "blue", important: true }],
      },
    ];
    const md = renderPreview("x", matches);
    assert.ok(md.value.includes(".x:hover"));
    assert.ok(md.value.includes("\\.card \\.x"));
    assert.ok(md.value.includes("a stylesheet\\.css:3"));
    assert.ok(md.value.includes("!important"));
    assert.ok(md.value.includes("Approximate sample"));
    assert.deepStrictEqual(md.isTrusted, {
      enabledCommands: ["css-peek-preview.openSource"],
    });
  });

  test("opens source navigation links at the correct line, including paths with spaces", async () => {
    const uri = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        "navigation stylesheet.css",
      ),
    );
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from("first line\nsecond line\n"),
    );
    try {
      await vscode.commands.executeCommand(
        "css-peek-preview.openSource",
        uri.toString(),
        2,
      );
      assert.strictEqual(
        vscode.window.activeTextEditor?.document.uri.toString(),
        uri.toString(),
      );
      assert.strictEqual(
        vscode.window.activeTextEditor?.selection.active.line,
        1,
      );
      const missing = uri.with({
        path: uri.path.replace(
          /navigation stylesheet\.css$/,
          "deleted stylesheet.css",
        ),
      });
      await assert.doesNotReject(async () => {
        await vscode.commands.executeCommand(
          "css-peek-preview.openSource",
          missing.toString(),
          1,
        );
      });
    } finally {
      await vscode.workspace.fs.delete(uri, { useTrash: false });
    }
  });

  test("escapes markup in the inspected class and retains unsupported declarations safely", () => {
    const uri = vscode.Uri.file("/tmp/x.css");
    const matches: CssMatch[] = [
      {
        uri,
        line: 1,
        selector: ".x",
        atRules: [],
        declarations: [
          {
            property: "background",
            value: "url(https://evil.invalid/x)",
            important: false,
          },
          {
            property: "content",
            value: "<script>alert(1)</script>",
            important: false,
          },
        ],
      },
    ];
    const md = renderPreview("<script>", matches);
    assert.ok(md.value.includes("&lt;script&gt;"));
    assert.ok(md.value.includes("url(https://evil.invalid/x)"));
    assert.ok(md.value.includes("content: <script>alert(1)</script>"));
    assert.strictEqual(
      md.value.includes('href="command:workbench.action'),
      false,
    );
  });

  test("provides sensible defaults and an empty state", () => {
    const uri = vscode.Uri.file("/tmp/x.css");
    const sample = renderPreview("x", [
      { uri, line: 1, selector: ".x", atRules: [], declarations: [] },
    ]);
    assert.ok(sample.value.includes("var(--vscode-editor-background)"));
    const empty = renderPreview(
      "x",
      [],
      "No matching CSS rules found in x.css.",
    );
    assert.ok(
      empty.value.includes("No matching CSS rules found in x\\.css\\."),
    );
  });
});

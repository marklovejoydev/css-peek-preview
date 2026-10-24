import * as vscode from 'vscode';

export interface Declaration { property: string; value: string; important: boolean; }
export interface CssMatch {
  uri: vscode.Uri;
  line: number;
  selector: string;
  declarations: Declaration[];
  atRules: string[];
  /** False when this class only appears in an ancestor compound of the selector. */
  direct?: boolean;
}
export interface ScanResult { matches: CssMatch[]; parseError?: string; }
export interface ResolvedStylesheets { uris: vscode.Uri[]; expected: vscode.Uri; invalidPattern?: string; }

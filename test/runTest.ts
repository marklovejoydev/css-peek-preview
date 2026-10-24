import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const fixtureWorkspace = path.join(extensionDevelopmentPath, 'test', 'fixtures', 'workspace');
    const profileRoot = path.resolve(extensionDevelopmentPath, '.vscode-test');
    const isolatedProfile = path.resolve(profileRoot, 'extension-test-profile');
    if (!isolatedProfile.startsWith(`${profileRoot}${path.sep}`)) throw new Error('Unsafe VS Code test profile path.');
    fs.mkdirSync(profileRoot, { recursive: true });
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, './suite/index'),
      launchArgs: [fixtureWorkspace, `--user-data-dir=${isolatedProfile}`, '--disable-extensions']
    });
  } catch (error) {
    console.error('Failed to run extension tests:', error);
    process.exitCode = 1;
  }
}
void main();

import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  for (const file of ['classNameResolver.test.js', 'stylesheetResolver.test.js', 'cssScanner.test.js', 'previewRenderer.test.js']) {
    mocha.addFile(path.resolve(__dirname, file));
  }
  await new Promise<void>((resolve, reject) => mocha.run(failures => failures ? reject(new Error(`${failures} tests failed`)) : resolve()));
}

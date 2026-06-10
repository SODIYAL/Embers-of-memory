// Shared headless-browser resolution for the screenshot/playtest harnesses.
// Local Chrome/Edge on Windows/macOS dev machines; @sparticuz/chromium
// (Linux build) in the sandbox/CI.

import { existsSync } from 'node:fs';
import { platform } from 'node:os';

export async function resolveBrowser() {
  if (platform() === 'win32') {
    const candidates = [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    ];
    const found = candidates.find(p => existsSync(p));
    if (!found) throw new Error('no local Chrome/Edge found for headless harness');
    return { executablePath: found, args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'] };
  }
  if (platform() === 'darwin') {
    const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (existsSync(mac)) return { executablePath: mac, args: ['--enable-unsafe-swiftshader'] };
  }
  const chromium = (await import('@sparticuz/chromium')).default;
  chromium.setGraphicsMode = true; // WebGL via SwiftShader — Phaser 4 needs it
  return {
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--enable-unsafe-swiftshader'],
  };
}

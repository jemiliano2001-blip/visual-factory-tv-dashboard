import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

const GUARDED_FILES: string[] = [
  'src/App.tsx',
  'src/components/Layout.tsx',
  'src/components/AppShellChrome.tsx',
  'src/components/ErrorBoundary.tsx',
  'src/components/ProtectedRoute.tsx',
  'src/components/OdooStatusBadge.tsx',
  'src/components/NetworkStatusIndicator.tsx',
  'src/components/ScrollToTopButton.tsx',
  'src/components/KeyboardShortcutsDialog.tsx',
  'src/pages/Login.tsx',
  'src/pages/AdminPanel.tsx',
];

const adminDir = path.join(ROOT, 'src', 'components', 'admin');
for (const name of fs.readdirSync(adminDir)) {
  if (name.endsWith('.tsx')) {
    GUARDED_FILES.push(`src/components/admin/${name}`);
  }
}

const RAW_TOKEN_RE = /^(?:bg-white|text-white|(?:bg|text|border|ring|from|to|via)-(?:slate|gray|indigo|red)-\d+(?:\/\d+)?)$/;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('guardrail de tokens UI: consola Admin, Auth y Chrome sin paleta cruda fuera de print:', () => {
  const violations: string[] = [];

  for (const relPath of GUARDED_FILES) {
    const absPath = path.join(ROOT, relPath);
    const content = stripComments(fs.readFileSync(absPath, 'utf8'));
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      const tokens = line.split(/[\s"'`{}()[\],;:]+/).filter(Boolean);
      for (const token of tokens) {
        if (token.startsWith('print:')) continue;
        const base = token.replace(/^(?:hover|focus|focus-visible|active|disabled|sm|md|lg|xl|2xl|dark):/, '');
        if (RAW_TOKEN_RE.test(base)) {
          violations.push(`${relPath}:${idx + 1} -> ${token}`);
        }
      }
    });
  }

  assert.deepEqual(violations, []);
});

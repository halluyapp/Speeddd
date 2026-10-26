import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('compact shared navigation preserves primary actions without narrow-screen overflow rules regressing', async () => {
  const [mainStyles, raceStyles] = await Promise.all([
    fs.readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/race.css', import.meta.url), 'utf8'),
  ]);
  assert.match(mainStyles, /@media \(max-width: 420px\)[\s\S]*?\.header-actions \.text-button\[href\$='\.html'\][\s\S]*?display: none/);
  assert.match(raceStyles, /@media \(max-width: 370px\)[\s\S]*?\.race-brand small \{ font-size: 6px; letter-spacing: \.12em; \}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/social/social.json', import.meta.url), 'utf8'));

test('catalogue indexes the social UI kit and all vector masters/runtimes are local', async () => {
  assert.ok(catalog.version >= 6);
  assert.deepEqual(catalog.social, [{ id: 'velocity-social-lobby', name: 'Velocity Social Lobby — Social 01', manifest: 'assets/social/social.json', preview: 'assets/previews/social-lobby.webp', page: 'social.html' }]);
  assert.equal(manifest.emblems.length, 8); assert.equal(manifest.icons.ids.length, 24); assert.equal(manifest.palettes.length, 4);
  assert.equal(manifest.fixtureOnly, true); assert.equal(manifest.license, 'CC0-1.0');
  const paths = [manifest.preview, manifest.icons.path, 'assets/social/LICENSE.txt', ...manifest.emblems.map((emblem) => emblem.runtime)];
  for (const relative of paths) {
    assert.ok(!relative.startsWith('http')); const bytes = await fs.readFile(new URL(`../public/${relative}`, import.meta.url));
    assert.ok(bytes.length > 40); if (relative.endsWith('.svg')) assert.doesNotMatch(bytes.toString('utf8'), /<script|foreignObject|(?:href|src)=["']https?:/i);
  }
  for (const emblem of manifest.emblems) {
    const master = await fs.readFile(new URL(`../${emblem.master}`, import.meta.url), 'utf8');
    assert.match(master, /CC0 1\.0 Universal/); assert.match(master, new RegExp(`Velocity ${emblem.name} emblem`));
  }
  const iconMaster = await fs.readFile(new URL(`../${manifest.icons.master}`, import.meta.url), 'utf8');
  assert.match(iconMaster, /CC0/); assert.equal([...iconMaster.matchAll(/<symbol id=/g)].length, 24);
});

test('social palettes have readable contrast and all fictional fixture references are valid', () => {
  const luminance = (hex) => {
    const values = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const palette of manifest.palettes) { assert.ok(contrast(palette.primary, palette.onPrimary) >= 4.5); assert.ok(contrast(palette.secondary, palette.onSecondary) >= 4.5); }
  const players = manifest.demo.players; const ids = new Set(players.map((player) => player.id));
  assert.equal(players.length, 10); assert.equal(ids.size, 10); assert.equal(new Set(players.map((player) => player.tag)).size, 10);
  assert.equal(players.filter((player) => player.role === 'host').length, 1);
  for (const player of players) { assert.ok(manifest.emblems.some((emblem) => emblem.id === player.emblem)); assert.ok(manifest.palettes.some((palette) => palette.id === player.team)); assert.ok(player.ping > 0 && player.ping <= 250); }
  assert.equal(manifest.demo.states.party.playerIds.length, 4); assert.equal(manifest.demo.states.party.emptySlots, 2);
  const lobby = manifest.demo.states.lobby.teams.flatMap((team) => team.playerIds); assert.equal(lobby.length, 8); assert.equal(new Set(lobby).size, 8); assert.ok(lobby.every((id) => ids.has(id)));
  assert.ok(manifest.demo.states.lobby.playerIds.every((id) => lobby.includes(id)));
  const ready = manifest.demo.states.ready; assert.equal(ready.playerIds.length, 8); assert.equal(new Set(ready.playerIds).size, 8); assert.equal(ready.readyPlayerIds.length, 8);
  assert.ok(ready.playerIds.every((id) => ids.has(id) && ready.readyPlayerIds.includes(id))); assert.ok(ready.readyPlayerIds.every((id) => ids.has(id)));
  assert.ok(manifest.demo.room.code.startsWith('DEMO-')); assert.ok(catalog.tracks.some((track) => track.id === manifest.demo.room.trackId));
});

test('social package supplies reusable tokens and explicitly excludes live network systems', () => {
  assert.equal(manifest.uiTokens.iconSize, 24); assert.equal(manifest.uiTokens.emblemSize, 128); assert.ok(manifest.uiTokens.spaceUnit > 0);
  for (const phrase of ['No servers', 'networking', 'matchmaking', 'authentication', 'chat transport', 'voice', 'presence', 'invitations', 'live multiplayer logic']) assert.ok(manifest.gameplayNote.includes(phrase));
  assert.match(manifest.demo.disclaimer, /Fictional static presentation data only/);
});

test('social inspector is poster-first, local, responsive and has no join or chat controls', async () => {
  const [html, script, styles, config, index, track, race, effects, combat, packageJson] = await Promise.all([
    fs.readFile(new URL('../social.html', import.meta.url), 'utf8'), fs.readFile(new URL('../src/social.js', import.meta.url), 'utf8'), fs.readFile(new URL('../src/social.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), fs.readFile(new URL('../index.html', import.meta.url), 'utf8'), fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../race.html', import.meta.url), 'utf8'), fs.readFile(new URL('../effects.html', import.meta.url), 'utf8'), fs.readFile(new URL('../combat.html', import.meta.url), 'utf8'), fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="social-poster"[\s\S]*?src="\/assets\/previews\/social-lobby\.webp"/); assert.match(html, /fetchpriority="high"/);
  for (const id of ['social-player-list', 'social-state-content', 'team-palette-list', 'social-icon-grid', 'download-social-emblem']) assert.ok(html.includes(`id="${id}"`));
  assert.doesNotMatch(html, /<form|<input|contenteditable/i); assert.doesNotMatch(`${html}\n${script}`, /WebSocket|RTCPeerConnection|EventSource|sendBeacon|unpkg|jsdelivr|googleapis/);
  assert.match(script, /setTeam\(id\)[\s\S]*?--room-accent/); assert.match(styles, /@media \(max-width: 700px\)/); assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(config, /social: resolve\(process\.cwd\(\), 'social\.html'\)/);
  for (const page of [index, track, race, effects, combat]) assert.match(page, /href="\.\/social\.html"/);
  assert.match(packageJson, /"build:social"/); assert.match(packageJson, /"validate:social"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/progression/progression.json', import.meta.url), 'utf8'));
const publicFile = (relative) => new URL(`../public/${relative}`, import.meta.url);
const sourceFile = (relative) => new URL(`../${relative}`, import.meta.url);

test('catalogue indexes original progression vectors and every master/runtime is local and safe', async () => {
  assert.ok(catalog.version >= 9);
  assert.deepEqual(catalog.progression, [{ id: 'velocity-progression-kit', name: 'Velocity Progression Kit — Progression 01', manifest: 'assets/progression/progression.json', preview: 'assets/previews/progression-kit.webp', page: 'progression.html' }]);
  assert.equal(manifest.fixtureOnly, true); assert.equal(manifest.license, 'CC0-1.0'); assert.equal(manifest.ranks.length, 10); assert.equal(manifest.frames.length, 4); assert.equal(manifest.icons.ids.length, 20);
  const assets = [...manifest.ranks, ...manifest.frames];
  for (const [index, asset] of assets.entries()) {
    if (index < 10) assert.equal(asset.level, index + 1);
    for (const relative of [asset.master, asset.runtime]) {
      assert.ok(!relative.startsWith('http')); const source = await fs.readFile(relative.startsWith('assets-src/') ? sourceFile(relative) : publicFile(relative), 'utf8');
      assert.match(source, /<svg[^>]*viewBox=/); assert.doesNotMatch(source, /<script|foreignObject|<image|(?:href|src)=["']https?:/i);
      if (relative.startsWith('assets-src/')) assert.match(source, /CC0 1\.0 Universal/);
    }
  }
  const sprite = await fs.readFile(publicFile(manifest.icons.path), 'utf8'); const spriteMaster = await fs.readFile(sourceFile(manifest.icons.master), 'utf8');
  assert.equal([...sprite.matchAll(/<symbol id=/g)].length, 20); assert.equal([...spriteMaster.matchAll(/<symbol id=/g)].length, 20);
  for (const id of manifest.icons.ids) assert.ok(sprite.includes(`<symbol id="${id}"`));
  for (const relative of [manifest.preview, 'assets/progression/LICENSE.txt']) assert.ok((await fs.stat(publicFile(relative))).size > 100);
});

test('reward records and static fixtures reference valid existing catalogue assets', async () => {
  const driverManifest = JSON.parse(await fs.readFile(publicFile('assets/drivers/drivers.json'), 'utf8'));
  const rankIds = new Set(manifest.ranks.map((rank) => rank.id)); const rewardIds = new Set(manifest.rewards.map((reward) => reward.id)); const challengeIds = new Set(manifest.challenges.map((challenge) => challenge.id));
  assert.equal(rewardIds.size, 6); assert.equal(challengeIds.size, 4);
  for (const reward of manifest.rewards) {
    assert.ok(manifest.frames.some((frame) => frame.id === reward.rarity)); assert.ok(manifest.icons.ids.includes(reward.icon));
    if (reward.source?.collection === 'cars') assert.ok(catalog.cars.some((car) => car.id === reward.source.id));
    if (reward.source?.collection === 'tracks') assert.ok(catalog.tracks.some((track) => track.id === reward.source.id));
    if (reward.source?.collection === 'drivers') assert.ok(driverManifest.assets.some((driver) => driver.id === reward.source.id));
    if (reward.preview) { assert.ok(!reward.preview.startsWith('http')); assert.ok((await fs.stat(publicFile(reward.preview))).size > 500); }
  }
  const { profile, season, rewards } = manifest.demo.states;
  assert.ok(rankIds.has(profile.rankId)); assert.ok(catalog.tracks.some((track) => track.id === profile.trackId)); assert.ok(profile.challengeIds.every((id) => challengeIds.has(id))); assert.ok(profile.rewardIds.every((id) => rewardIds.has(id)));
  assert.equal(season.stages.length, 5); assert.equal(season.stages.filter((stage) => stage.state === 'current').length, 1);
  for (const stage of season.stages) { assert.ok(rankIds.has(stage.rankId)); assert.ok(rewardIds.has(stage.rewardId)); assert.ok(['complete', 'current', 'locked'].includes(stage.state)); }
  assert.equal(rewards.rewardIds.length, 6); assert.ok(rewards.rewardIds.every((id) => rewardIds.has(id)));
  for (const challenge of manifest.challenges) assert.ok(Math.abs(challenge.percent - Math.round(challenge.current / challenge.total * 100)) <= 1);
});

test('frame contrast and linked-media licenses are independently explicit', async () => {
  const luminance = (hex) => {
    const values = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const frame of manifest.frames) assert.ok(contrast(frame.color, frame.onColor) >= 4.5);
  for (const rank of manifest.ranks) assert.ok(contrast(rank.color, '#10191d') >= 4.5);
  const vector = manifest.linkedMedia.find((media) => media.rewardId === 'vector-84'); const car = catalog.cars.find((item) => item.id === 'wedge');
  assert.equal(vector.license, 'CC BY 4.0'); assert.equal(vector.author, car.credit.author); assert.equal(vector.title, car.credit.title); assert.equal(vector.source, car.credit.source);
  assert.ok(manifest.linkedMedia.filter((media) => media.license === 'CC0-1.0').length >= 2); assert.match(manifest.linkedMediaNotice, /No linked media is relicensed/);
  const license = await fs.readFile(publicFile('assets/progression/LICENSE.txt'), 'utf8'); assert.match(license, /drcollect/); assert.match(license, /CC BY 4\.0/); assert.match(license, /CC0 1\.0 Universal/);
  for (const phrase of ['No XP calculation', 'unlock logic', 'purchases', 'save data', 'servers', 'progression gameplay']) assert.ok(manifest.gameplayNote.includes(phrase));
});

test('Progression Lab is poster-first, responsive, inspectable and wired into every inspector', async () => {
  const [html, script, styles, config, index, track, race, effects, combat, social, drivers, packageJson] = await Promise.all([
    fs.readFile(new URL('../progression.html', import.meta.url), 'utf8'), fs.readFile(new URL('../src/progression.js', import.meta.url), 'utf8'), fs.readFile(new URL('../src/progression.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), fs.readFile(new URL('../index.html', import.meta.url), 'utf8'), fs.readFile(new URL('../track.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../race.html', import.meta.url), 'utf8'), fs.readFile(new URL('../effects.html', import.meta.url), 'utf8'), fs.readFile(new URL('../combat.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../social.html', import.meta.url), 'utf8'), fs.readFile(new URL('../drivers.html', import.meta.url), 'utf8'), fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="progression-poster"[\s\S]*?src="\/assets\/previews\/progression-kit\.webp"/); assert.match(html, /fetchpriority="high"/);
  for (const id of ['progression-reward-list', 'progression-rank-list', 'progression-frame-list', 'progression-icon-grid', 'progression-state-content', 'download-progression-rank']) assert.ok(html.includes(`id="${id}"`));
  assert.match(script, /URLSearchParams/); assert.match(script, /fixture\.progress/); assert.match(script, /reward-frame/); assert.match(script, /data-stage-rank/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent|WebSocket|RTCPeerConnection|localStorage|indexedDB/); assert.doesNotMatch(html, /<form|<input|contenteditable/i);
  assert.match(styles, /@media \(max-width: 700px\)/); assert.match(styles, /@media \(max-width: 390px\)/); assert.match(config, /progression: resolve\(process\.cwd\(\), 'progression\.html'\)/);
  for (const page of [index, track, race, effects, combat, social, drivers]) assert.match(page, /href="\.\/progression\.html"/);
  assert.match(packageJson, /"build:progression"/); assert.match(packageJson, /"validate:progression"/); assert.match(packageJson, /validate:drivers && npm run validate:progression/);
});

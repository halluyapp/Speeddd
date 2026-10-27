import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/progression/progression.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;
const pass = (message) => console.log(`PASS ${message}`);
const localFile = (relative, source = 'public') => path.join(ROOT, source, relative);
function luminance(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) { const first = luminance(a); const second = luminance(b); return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05); }
function validateSvg(source, label) {
  if (!source.includes('<svg') || !source.includes('viewBox=')) throw new Error(`${label}: not a standalone SVG`);
  if (/<script|foreignObject|<image|(?:href|src)=["']https?:/i.test(source)) throw new Error(`${label}: executable, raster or remote content is not allowed`);
}
const unique = (rows) => new Set(rows.map((row) => row.id)).size === rows.length;

try {
  if (!catalog.progression?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/progression/progression.json' && entry.page === 'progression.html')) throw new Error('Main catalogue does not reference the progression package');
  if (!manifest.fixtureOnly || manifest.license !== 'CC0-1.0') throw new Error('Fixture-only CC0 record is missing');
  if (manifest.ranks.length !== 10 || manifest.icons.ids.length !== 20 || manifest.frames.length !== 4 || manifest.rewards.length !== 6 || manifest.challenges.length !== 4) throw new Error('Progression inventory is incomplete');
  if (!unique(manifest.ranks) || !unique(manifest.frames) || !unique(manifest.rewards) || !unique(manifest.challenges)) throw new Error('Progression asset/fixture IDs are not unique');
  for (const [index, rank] of manifest.ranks.entries()) {
    if (rank.level !== index + 1 || !/^#[0-9a-f]{6}$/i.test(rank.color) || contrast(rank.color, '#10191d') < 4.5) throw new Error(`${rank.id}: invalid level/color contrast`);
    const [master, runtime] = await Promise.all([fs.readFile(localFile(rank.master, '.'), 'utf8'), fs.readFile(localFile(rank.runtime), 'utf8')]);
    validateSvg(master, `${rank.id} master`); validateSvg(runtime, `${rank.id} runtime`);
    if (!master.includes('CC0 1.0') || !runtime.includes(`Velocity ${rank.name} rank insignia`)) throw new Error(`${rank.id}: title/license metadata missing`);
  }
  pass('10 rank insignias have readable CC0 masters, compact runtimes, ordered levels and readable contrast');
  const [sprite, spriteMaster] = await Promise.all([fs.readFile(localFile(manifest.icons.path), 'utf8'), fs.readFile(localFile(manifest.icons.master, '.'), 'utf8')]);
  validateSvg(sprite, 'icon sprite'); validateSvg(spriteMaster, 'icon sprite master');
  const spriteIds = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]); const masterIds = [...spriteMaster.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  if (spriteIds.length !== 20 || new Set(spriteIds).size !== 20 || manifest.icons.ids.some((id) => !spriteIds.includes(id)) || spriteIds.join(',') !== masterIds.join(',')) throw new Error('Icon sprite symbols/masters do not match the 20-record manifest');
  for (const id of ['xp', 'credits', 'trophy', 'car', 'driver', 'track', 'gift', 'lock', 'check']) if (!spriteIds.includes(id)) throw new Error(`Required icon ${id} is missing`);
  const iconIds = new Set(spriteIds); const frameIds = new Set(manifest.frames.map((frame) => frame.id));
  for (const frame of manifest.frames) {
    const [master, runtime] = await Promise.all([fs.readFile(localFile(frame.master, '.'), 'utf8'), fs.readFile(localFile(frame.runtime), 'utf8')]);
    validateSvg(master, `${frame.id} frame master`); validateSvg(runtime, `${frame.id} frame runtime`);
    if (!master.includes('CC0 1.0') || !runtime.includes('viewBox="0 0 320 420"') || contrast(frame.color, frame.onColor) < 4.5) throw new Error(`${frame.id}: frame metadata, dimensions or contrast invalid`);
  }
  pass('20 local symbols and four scalable rarity frames resolve with unique IDs and checked contrast');

  const rankIds = new Set(manifest.ranks.map((rank) => rank.id)); const rewardIds = new Set(manifest.rewards.map((reward) => reward.id)); const challengeIds = new Set(manifest.challenges.map((challenge) => challenge.id));
  const carIds = new Set(catalog.cars.map((car) => car.id)); const trackIds = new Set(catalog.tracks.map((track) => track.id));
  const driverManifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/drivers/drivers.json'), 'utf8')); const driverIds = new Set(driverManifest.assets.map((driver) => driver.id));
  for (const reward of manifest.rewards) {
    if (!frameIds.has(reward.rarity) || !iconIds.has(reward.icon)) throw new Error(`${reward.id}: invalid frame/icon reference`);
    if (reward.source) {
      const valid = reward.source.collection === 'cars' ? carIds.has(reward.source.id) : reward.source.collection === 'tracks' ? trackIds.has(reward.source.id) : reward.source.collection === 'drivers' ? driverIds.has(reward.source.id) : false;
      if (!valid) throw new Error(`${reward.id}: source catalogue reference is invalid`);
    }
    if (reward.preview) {
      if (/^https?:/.test(reward.preview)) throw new Error(`${reward.id}: remote preview is not allowed`);
      if ((await fs.stat(localFile(reward.preview))).size < 500) throw new Error(`${reward.id}: linked local preview is missing`);
    }
  }
  if (manifest.linkedMedia.length !== 3 || !manifest.linkedMediaNotice.includes('CC BY 4.0') || !manifest.linkedMediaNotice.includes('No linked media is relicensed')) throw new Error('Linked-media license separation is incomplete');
  for (const linked of manifest.linkedMedia) {
    const reward = manifest.rewards.find((item) => item.id === linked.rewardId); if (!reward || reward.preview !== linked.preview) throw new Error(`${linked.rewardId}: linked-media record mismatch`);
    if (linked.rewardId === 'vector-84') {
      const car = catalog.cars.find((item) => item.id === 'wedge');
      if (linked.license !== 'CC BY 4.0' || linked.author !== car.credit.author || linked.title !== car.credit.title || linked.source !== car.credit.source) throw new Error('Vector 84 linked-media attribution is stale');
    } else if (linked.license !== 'CC0-1.0') throw new Error(`${linked.rewardId}: unexpected linked-media license`);
  }
  for (const challenge of manifest.challenges) {
    if (!iconIds.has(challenge.icon) || challenge.current < 0 || challenge.total < 1 || challenge.current > challenge.total || Math.abs(challenge.percent - Math.round(challenge.current / challenge.total * 100)) > 1) throw new Error(`${challenge.id}: invalid static progress fixture`);
  }
  const { profile, season, rewards } = manifest.demo.states;
  if (!rankIds.has(profile.rankId) || !trackIds.has(profile.trackId) || profile.progress < 0 || profile.progress > 100 || profile.challengeIds.some((id) => !challengeIds.has(id)) || profile.rewardIds.some((id) => !rewardIds.has(id))) throw new Error('Profile fixture references are invalid');
  if ((await fs.stat(localFile(profile.trackPreview))).size < 500) throw new Error('Profile track preview is missing');
  if (season.stages.length !== 5 || !unique(season.stages) || season.stages.filter((stage) => stage.state === 'current').length !== 1 || season.stages.some((stage) => !rankIds.has(stage.rankId) || !rewardIds.has(stage.rewardId) || !['complete', 'current', 'locked'].includes(stage.state))) throw new Error('Season stages are invalid');
  if (rewards.rewardIds.length !== 6 || new Set(rewards.rewardIds).size !== 6 || rewards.rewardIds.some((id) => !rewardIds.has(id))) throw new Error('Reward-gallery fixture is invalid');
  pass('6 rewards, 4 challenges and 3 fixtures reference valid local catalogue media without duplicating or relicensing it');

  for (const phrase of ['No XP calculation', 'unlock logic', 'purchases', 'save data', 'servers', 'progression gameplay']) if (!manifest.gameplayNote.includes(phrase)) throw new Error(`Presentation-only scope is missing: ${phrase}`);
  if ((await fs.stat(localFile(manifest.preview))).size < 1000) throw new Error('Progression poster is missing');
  const license = await fs.readFile(localFile('assets/progression/LICENSE.txt'), 'utf8'); if (!license.includes('drcollect') || !license.includes('CC BY 4.0') || !license.includes('CC0 1.0 Universal')) throw new Error('Standalone license record lacks linked-media attribution');
  const [html, script] = await Promise.all([fs.readFile(path.join(ROOT, 'progression.html'), 'utf8'), fs.readFile(path.join(ROOT, 'src/progression.js'), 'utf8')]);
  if (/unpkg|jsdelivr|googleapis|raw\.githubusercontent/i.test(`${html}\n${script}`)) throw new Error('Progression inspector has a remote runtime dependency');
  if (/WebSocket|RTCPeerConnection|EventSource|sendBeacon|localStorage|indexedDB|contenteditable/i.test(`${html}\n${script}`)) throw new Error('Progression inspector contains transport, persistence or editable input');
  if (/<form|<input/i.test(html)) throw new Error('Progression inspector should not contain purchase/profile forms');
  for (const id of ['progression-rank-list', 'progression-frame-list', 'progression-icon-grid', 'progression-state-content', 'download-progression-rank']) if (!html.includes(`id="${id}"`)) throw new Error(`Inspector control ${id} is missing`);
  pass('poster, standalone attribution, local-only inspector and explicit no-progression-logic scope validated');
} catch (error) { failed = true; console.error(`FAIL ${manifest.id}: ${error.message}`); }

console.log(`\n${failed ? 'FAIL' : 'PASS'} Validated 10 rank masters/runtimes, 20 icons, 4 frames, 6 rewards, 4 challenges, 3 fixtures and progression inspector.`);
if (failed) process.exitCode = 1;

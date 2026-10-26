import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/social/social.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;
const fail = (message) => { failed = true; console.error(`FAIL ${message}`); };
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

try {
  if (!catalog.social?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/social/social.json' && entry.page === 'social.html')) throw new Error('Main catalogue does not reference the social package');
  if (!manifest.fixtureOnly || manifest.license !== 'CC0-1.0') throw new Error('Fixture-only CC0 record is missing');
  if (manifest.emblems.length !== 8 || manifest.icons.ids.length !== 24 || manifest.palettes.length !== 4) throw new Error('Social vector inventory is incomplete');
  const emblemIds = new Set(manifest.emblems.map((emblem) => emblem.id)); const paletteIds = new Set(manifest.palettes.map((palette) => palette.id));
  if (emblemIds.size !== 8 || paletteIds.size !== 4) throw new Error('Emblem/palette IDs are not unique');
  for (const emblem of manifest.emblems) {
    const [master, runtime] = await Promise.all([fs.readFile(localFile(emblem.master, '.'), 'utf8'), fs.readFile(localFile(emblem.runtime), 'utf8')]);
    validateSvg(master, `${emblem.id} master`); validateSvg(runtime, `${emblem.id} runtime`);
    if (!master.includes('CC0 1.0') || !runtime.includes(`Velocity ${emblem.name} emblem`)) throw new Error(`${emblem.id}: title/license metadata missing`);
  }
  pass('8 original emblems have readable masters, compact runtimes and no remote/executable content');
  const [sprite, spriteMaster] = await Promise.all([fs.readFile(localFile(manifest.icons.path), 'utf8'), fs.readFile(localFile(manifest.icons.master, '.'), 'utf8')]);
  validateSvg(sprite, 'icon sprite'); validateSvg(spriteMaster, 'icon sprite master');
  const spriteIds = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  const masterIds = [...spriteMaster.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]);
  if (spriteIds.length !== 24 || new Set(spriteIds).size !== 24 || manifest.icons.ids.some((id) => !spriteIds.includes(id)) || spriteIds.join(',') !== masterIds.join(',')) throw new Error('Icon sprite symbols/masters do not match the 24-record manifest');
  for (const id of ['players', 'party', 'invite', 'chat', 'mic', 'ready', 'host', 'ping', 'desktop', 'controller', 'download']) if (!spriteIds.includes(id)) throw new Error(`Required icon ${id} is missing`);
  pass('24 local interface icons resolve as unique reusable SVG symbols');
  for (const palette of manifest.palettes) {
    if (!/^#[0-9a-f]{6}$/i.test(palette.primary) || !/^#[0-9a-f]{6}$/i.test(palette.secondary)) throw new Error(`${palette.id}: invalid palette hex`);
    if (contrast(palette.primary, palette.onPrimary) < 4.5 || contrast(palette.secondary, palette.onSecondary) < 4.5) throw new Error(`${palette.id}: text contrast is below 4.5:1`);
    console.log(`PASS palette ${palette.id.padEnd(7)} primary ${contrast(palette.primary, palette.onPrimary).toFixed(2)}:1 · secondary ${contrast(palette.secondary, palette.onSecondary).toFixed(2)}:1`);
  }
  const { players, states, room } = manifest.demo;
  if (players.length !== 10 || new Set(players.map((player) => player.id)).size !== 10 || new Set(players.map((player) => player.tag)).size !== 10) throw new Error('Demo player inventory/IDs are invalid');
  if (players.filter((player) => player.role === 'host').length !== 1) throw new Error('Fixture must contain exactly one host marker');
  for (const player of players) {
    if (!emblemIds.has(player.emblem) || !paletteIds.has(player.team)) throw new Error(`${player.id}: invalid emblem/team reference`);
    if (!Number.isInteger(player.ping) || player.ping < 1 || player.ping > 250 || typeof player.ready !== 'boolean') throw new Error(`${player.id}: invalid static ping/ready fixture`);
    if (!['Desktop', 'Controller', 'Deck'].includes(player.platform) || !['connected', 'muted'].includes(player.voice)) throw new Error(`${player.id}: invalid platform/voice fixture`);
  }
  const playerIds = new Set(players.map((player) => player.id));
  if (states.party.playerIds.length !== 4 || new Set(states.party.playerIds).size !== 4 || states.party.emptySlots !== 2 || states.party.playerIds.some((id) => !playerIds.has(id))) throw new Error('Party fixture is invalid');
  const lobbyMembers = states.lobby.teams.flatMap((team) => team.playerIds); const lobbyIds = new Set(lobbyMembers);
  if (states.lobby.teams.length !== 2 || lobbyMembers.length !== 8 || lobbyIds.size !== 8 || lobbyMembers.some((id) => !playerIds.has(id)) || states.lobby.playerIds.length !== 8 || states.lobby.playerIds.some((id) => !lobbyIds.has(id)) || states.lobby.teams.some((team) => team.playerIds.length !== 4 || !paletteIds.has(team.team))) throw new Error('Team lobby fixture is invalid');
  const readyIds = new Set(states.ready.readyPlayerIds);
  if (states.ready.playerIds.length !== 8 || new Set(states.ready.playerIds).size !== 8 || states.ready.playerIds.some((id) => !playerIds.has(id)) || readyIds.size !== 8 || states.ready.readyPlayerIds.some((id) => !playerIds.has(id)) || states.ready.playerIds.some((id) => !readyIds.has(id))) throw new Error('Ready-check fixture is invalid');
  if (!room.code.startsWith('DEMO-') || !catalog.tracks?.some((track) => track.id === room.trackId)) throw new Error('Room must be explicitly fictional and reference an existing local track');
  const trackPreview = await fs.stat(localFile(room.trackPreview)); if (trackPreview.size < 1000) throw new Error('Reused local track preview is missing');
  pass('10 fictional players and party/lobby/ready fixtures have valid references and static values');
  if (!manifest.gameplayNote.includes('No servers') || !manifest.gameplayNote.includes('matchmaking') || !manifest.gameplayNote.includes('live multiplayer logic')) throw new Error('Presentation-only network scope is not explicit');
  const poster = await fs.stat(localFile(manifest.preview)); if (poster.size < 1000) throw new Error('Social poster is missing');
  const [html, script] = await Promise.all([fs.readFile(path.join(ROOT, 'social.html'), 'utf8'), fs.readFile(path.join(ROOT, 'src/social.js'), 'utf8')]);
  if (/unpkg|jsdelivr|googleapis|raw\.githubusercontent/i.test(`${html}\n${script}`)) throw new Error('Social inspector has a remote runtime dependency');
  if (/WebSocket|RTCPeerConnection|EventSource|sendBeacon|contenteditable/i.test(`${html}\n${script}`)) throw new Error('Social inspector contains a live transport or chat input');
  if (/<form|<input/i.test(html)) throw new Error('Social inspector should not contain join/chat forms');
  for (const id of ['social-player-list', 'team-palette-list', 'social-icon-grid', 'social-state-content', 'download-social-emblem']) if (!html.includes(`id="${id}"`)) throw new Error(`Inspector control ${id} is missing`);
  pass('poster, local-only inspector and explicit no-networking scope validated');
} catch (error) { fail(`${manifest.id}: ${error.message}`); }

console.log(`\n${failed ? 'FAIL' : 'PASS'} Validated 8 emblem masters/runtimes, 24 icons, 4 palettes, 10 players, 3 fixtures and social inspector.`);
if (failed) process.exitCode = 1;

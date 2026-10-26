import './social.css';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const dom = Object.fromEntries([
  'social-poster', 'social-error', 'social-error-message', 'retry-social', 'social-player-list', 'stage-social-count', 'room-name', 'room-event',
  'room-code', 'room-region', 'room-privacy', 'fixture-eyebrow', 'fixture-title', 'fixture-description', 'social-state-content',
  'selected-player-emblem', 'selected-player-role', 'selected-player-tag', 'selected-player-name', 'selected-player-ready', 'selected-player-ping',
  'selected-player-team', 'selected-player-platform', 'selected-player-voice', 'selected-player-presence', 'team-palette-list', 'social-icon-grid',
  'download-social-emblem',
].map((id) => [id, document.getElementById(id)]));
const state = { manifest: null, socialState: 'party', selectedPlayer: 'p-v84', team: 'lime', ready: false };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="${assetUrl('assets/social/icons.svg')}#${name}"></use></svg>`;
const playerById = (id) => state.manifest?.demo.players.find((player) => player.id === id);
const paletteById = (id) => state.manifest?.palettes.find((palette) => palette.id === id);
const emblemById = (id) => state.manifest?.emblems.find((emblem) => emblem.id === id);
const currentFixture = () => state.manifest?.demo.states[state.socialState];
const isReady = (player) => currentFixture()?.readyPlayerIds ? currentFixture().readyPlayerIds.includes(player.id) : player.ready;
const platformIcon = (platform) => ({ Desktop: 'desktop', Controller: 'controller', Deck: 'deck' })[platform] || 'desktop';

function selectPlayer(id) {
  if (!playerById(id)) return;
  state.selectedPlayer = id; document.body.dataset.player = id; renderPlayerList(); renderSelectedPlayer();
  document.querySelectorAll('#social-state-content [data-preview-player]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.previewPlayer === id)));
}
function renderPlayerList() {
  dom['social-player-list'].innerHTML = state.manifest.demo.players.map((player) => {
    const palette = paletteById(player.team); const emblem = emblemById(player.emblem); const ready = isReady(player);
    return `<button type="button" data-player="${player.id}" class="${player.id === state.selectedPlayer ? 'active' : ''}" aria-pressed="${player.id === state.selectedPlayer}" style="--player-accent:${palette.primary}">
      <img src="${assetUrl(emblem.runtime)}" width="35" height="35" alt="" loading="lazy" /><span><strong>${escapeHtml(player.tag)}</strong><small>${escapeHtml(player.name)}</small></span><b><i class="${ready ? 'ready' : ''}"></i>${player.ping} ms</b>
    </button>`;
  }).join('');
  dom['social-player-list'].querySelectorAll('[data-player]').forEach((button) => button.addEventListener('click', () => selectPlayer(button.dataset.player)));
}
function renderSelectedPlayer() {
  const player = playerById(state.selectedPlayer); if (!player) return;
  const emblem = emblemById(player.emblem); const palette = paletteById(player.team); const ready = isReady(player);
  dom['selected-player-emblem'].src = assetUrl(emblem.runtime); dom['selected-player-emblem'].alt = `${emblem.name} emblem`;
  dom['selected-player-role'].textContent = `${player.role.toUpperCase()} / ${player.platform.toUpperCase()}`;
  dom['selected-player-tag'].textContent = player.tag; dom['selected-player-name'].textContent = player.name;
  dom['selected-player-ready'].innerHTML = `<i></i> ${ready ? 'Ready' : 'Not ready'}`; dom['selected-player-ready'].dataset.ready = String(ready);
  dom['selected-player-ping'].textContent = `${player.ping} ms`; dom['selected-player-team'].textContent = palette.name;
  dom['selected-player-platform'].textContent = player.platform; dom['selected-player-voice'].textContent = player.voice === 'connected' ? 'Connected' : 'Muted';
  dom['selected-player-presence'].textContent = player.presence; dom['download-social-emblem'].href = assetUrl(emblem.runtime); dom['download-social-emblem'].download = `${emblem.id}.svg`;
  document.body.dataset.selectedReady = String(ready);
}
function renderPalettes() {
  dom['team-palette-list'].innerHTML = state.manifest.palettes.map((palette) => `<button type="button" data-team="${palette.id}" class="${palette.id === state.team ? 'active' : ''}" aria-pressed="${palette.id === state.team}" style="--team-primary:${palette.primary};--team-secondary:${palette.secondary}" title="${escapeHtml(palette.name)} · ${palette.primary} / ${palette.secondary}"><span class="palette-swatches"><i></i><i></i></span><span>${escapeHtml(palette.name)}</span></button>`).join('');
  dom['team-palette-list'].querySelectorAll('[data-team]').forEach((button) => button.addEventListener('click', () => setTeam(button.dataset.team)));
}
function setTeam(id) {
  const palette = paletteById(id); if (!palette) return;
  state.team = id; document.body.dataset.team = id; document.documentElement.style.setProperty('--room-accent', palette.primary); renderPalettes();
}
function renderIcons() {
  dom['social-icon-grid'].innerHTML = state.manifest.icons.ids.map((id) => `<span title="${id}" aria-label="${id} icon">${icon(id)}</span>`).join('');
}
function partyPlayer(player) {
  const palette = paletteById(player.team); const emblem = emblemById(player.emblem); const ready = isReady(player);
  return `<button type="button" class="party-player" data-preview-player="${player.id}" aria-pressed="${player.id === state.selectedPlayer}" style="--player-accent:${palette.primary}">
    <img src="${assetUrl(emblem.runtime)}" width="58" height="58" alt="${emblem.name} emblem" /><strong>${escapeHtml(player.tag)}</strong><small>${escapeHtml(player.name)}</small><span><i></i>${escapeHtml(player.platform)} · ${player.ping} ms</span><b>${player.role === 'host' ? 'HOST' : ready ? 'READY' : 'NOT READY'}</b>
  </button>`;
}
function lobbyPlayer(player, palette) {
  const emblem = emblemById(player.emblem); const ready = isReady(player);
  return `<button type="button" class="lobby-player" data-preview-player="${player.id}" aria-pressed="${player.id === state.selectedPlayer}"><img src="${assetUrl(emblem.runtime)}" width="36" height="36" alt="" /><span><strong>${escapeHtml(player.tag)}${player.role === 'host' ? ' · HOST' : ''}</strong><small>${escapeHtml(player.platform)} · ${ready ? 'Ready' : 'Not ready'}</small></span><b>${icon(platformIcon(player.platform))}${player.ping} ms</b></button>`;
}
function readyPlayer(player) {
  const emblem = emblemById(player.emblem);
  return `<button type="button" class="ready-player" data-preview-player="${player.id}" aria-pressed="${player.id === state.selectedPlayer}"><img src="${assetUrl(emblem.runtime)}" width="36" height="36" alt="" /><span><strong>${escapeHtml(player.tag)}</strong><small>${escapeHtml(player.name)}</small></span><b>${icon('ready')}READY</b></button>`;
}
function renderState() {
  const fixture = currentFixture(); if (!fixture) return;
  dom['fixture-eyebrow'].textContent = fixture.eyebrow; dom['fixture-title'].textContent = fixture.title; dom['fixture-description'].textContent = fixture.description;
  if (state.socialState === 'party') {
    dom['social-state-content'].innerHTML = `<div class="party-grid">${fixture.playerIds.map((id) => partyPlayer(playerById(id))).join('')}${Array.from({ length: fixture.emptySlots }, () => `<div class="empty-party-slot">${icon('invite')}<strong>Open presentation slot</strong><small>No invitation action</small></div>`).join('')}</div>`;
  } else if (state.socialState === 'lobby') {
    dom['social-state-content'].innerHTML = `<div class="lobby-teams">${fixture.teams.map((team) => { const palette = paletteById(team.team); return `<section class="lobby-team" style="--team-accent:${palette.primary}"><div class="lobby-team-heading"><span><i></i>${escapeHtml(palette.name)}</span><small>${team.playerIds.length} PLAYERS</small></div>${team.playerIds.map((id) => lobbyPlayer(playerById(id), palette)).join('')}</section>`; }).join('')}</div>`;
  } else {
    dom['social-state-content'].innerHTML = `<div class="ready-grid">${fixture.playerIds.map((id) => readyPlayer(playerById(id))).join('')}</div>`;
  }
  dom['social-state-content'].querySelectorAll('[data-preview-player]').forEach((button) => button.addEventListener('click', () => selectPlayer(button.dataset.previewPlayer)));
}
function setSocialState(id) {
  if (!state.manifest?.demo.states[id]) return;
  state.socialState = id; document.body.dataset.socialState = id;
  document.querySelectorAll('[data-social-view]').forEach((button) => { const active = button.dataset.socialView === id; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  renderState(); renderPlayerList(); renderSelectedPlayer();
}
function renderAll() {
  const { room, players } = state.manifest.demo;
  dom['room-name'].textContent = room.name; dom['room-event'].textContent = room.event; dom['room-code'].textContent = room.code;
  dom['room-region'].textContent = room.region; dom['room-privacy'].textContent = room.privacy; dom['stage-social-count'].textContent = `${players.length} DEMO PLAYERS`;
  renderIcons(); renderPalettes(); setTeam(state.team); setSocialState(state.socialState); selectPlayer(state.selectedPlayer);
}
async function init() {
  try {
    const response = await fetch(assetUrl('assets/social/social.json')); if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
    state.manifest = await response.json();
    if (!Array.isArray(state.manifest.demo.players) || !state.manifest.demo.states.party || !playerById(state.selectedPlayer)) throw new Error('Social fixture inventory is invalid');
    renderAll(); state.ready = true; document.body.dataset.assetReady = 'true'; dom['social-poster'].classList.add('is-hidden'); dom['social-error'].hidden = true;
  } catch (error) {
    console.error('Social Lab initialization failed', error); dom['social-error-message'].textContent = error.message; dom['social-error'].hidden = false;
  }
}
document.querySelectorAll('[data-social-view]').forEach((button) => button.addEventListener('click', () => setSocialState(button.dataset.socialView)));
dom['retry-social'].addEventListener('click', init);
init();

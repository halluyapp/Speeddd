import './progression.css';

const BASE_URL = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE_URL}${path.replace(/^\//, '')}`;
const query = new URLSearchParams(window.location.search);
const dom = Object.fromEntries([
  'progression-poster', 'progression-error', 'progression-error-message', 'retry-progression', 'progression-reward-list',
  'selected-reward-kind', 'selected-reward-name', 'selected-reward-description', 'selected-reward-source', 'selected-reward-license',
  'stage-progression-count', 'progression-hero-image', 'hero-eyebrow', 'hero-title', 'hero-description', 'hero-rank',
  'fixture-eyebrow', 'fixture-title', 'fixture-description', 'progression-state-content', 'selected-rank-image', 'selected-rank-level',
  'selected-rank-name', 'selected-rank-description', 'selected-rank-color', 'selected-rank-master', 'progression-rank-list',
  'progression-frame-list', 'progression-icon-grid', 'download-progression-rank', 'active-progression-file',
  ...[0, 1, 2].flatMap((index) => [`hero-metric-label-${index}`, `hero-metric-${index}`]),
].map((id) => [id, document.getElementById(id)]));
const state = { manifest: null, fixture: query.get('fixture') || 'profile', rank: query.get('rank') || 'elite', reward: query.get('reward') || 'nova-driver', ready: false };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="${assetUrl('assets/progression/icons.svg')}#${name}"></use></svg>`;
const rankById = (id) => state.manifest?.ranks.find((rank) => rank.id === id);
const frameById = (id) => state.manifest?.frames.find((frame) => frame.id === id);
const rewardById = (id) => state.manifest?.rewards.find((reward) => reward.id === id);
const challengeById = (id) => state.manifest?.challenges.find((challenge) => challenge.id === id);
const currentFixture = () => state.manifest?.demo.states[state.fixture];
function syncQuery() {
  const url = new URL(window.location.href); url.searchParams.set('fixture', state.fixture); url.searchParams.set('rank', state.rank); url.searchParams.set('reward', state.reward);
  window.history.replaceState(null, '', url);
}

function renderRankList() {
  dom['progression-rank-list'].innerHTML = state.manifest.ranks.map((rank) => `<button type="button" data-rank="${rank.id}" class="${rank.id === state.rank ? 'active' : ''}" aria-pressed="${rank.id === state.rank}" style="--rank-accent:${rank.color}" title="${escapeHtml(rank.name)} · rank ${rank.level}"><img src="${assetUrl(rank.runtime)}" width="44" height="44" alt="" loading="lazy" /><span>R${String(rank.level).padStart(2, '0')}</span></button>`).join('');
  dom['progression-rank-list'].querySelectorAll('[data-rank]').forEach((button) => button.addEventListener('click', () => selectRank(button.dataset.rank)));
}
function renderSelectedRank() {
  const rank = rankById(state.rank); if (!rank) return;
  dom['selected-rank-image'].src = assetUrl(rank.runtime); dom['selected-rank-image'].alt = `${rank.name} rank insignia`;
  dom['selected-rank-level'].textContent = `RANK ${String(rank.level).padStart(2, '0')}`; dom['selected-rank-name'].textContent = rank.name;
  dom['selected-rank-description'].textContent = rank.description; dom['selected-rank-color'].textContent = rank.color; dom['selected-rank-master'].textContent = rank.master;
  dom['download-progression-rank'].href = assetUrl(rank.runtime); dom['download-progression-rank'].download = `${rank.id}.svg`; dom['active-progression-file'].textContent = rank.runtime;
  document.body.dataset.rankLevel = String(rank.level); document.documentElement.style.setProperty('--room-accent', rank.color);
}
function selectRank(id) {
  if (!rankById(id)) return; state.rank = id; document.body.dataset.rank = id; renderRankList(); renderSelectedRank(); syncQuery();
}
function renderRewardList() {
  dom['progression-reward-list'].innerHTML = state.manifest.rewards.map((reward) => {
    const frame = frameById(reward.rarity);
    return `<button type="button" data-reward="${reward.id}" class="${reward.id === state.reward ? 'active' : ''}" aria-pressed="${reward.id === state.reward}" style="--reward-accent:${frame.color}">${icon(reward.icon)}<span><strong>${escapeHtml(reward.name)}</strong><small>${escapeHtml(reward.kind)}</small></span><b>${escapeHtml(frame.name)}</b></button>`;
  }).join('');
  dom['progression-reward-list'].querySelectorAll('[data-reward]').forEach((button) => button.addEventListener('click', () => selectReward(button.dataset.reward)));
}
function renderSelectedReward() {
  const reward = rewardById(state.reward); if (!reward) return;
  const linked = state.manifest.linkedMedia.find((item) => item.rewardId === reward.id);
  dom['selected-reward-kind'].textContent = `${reward.kind.toUpperCase()} / ${reward.rarity.toUpperCase()}`; dom['selected-reward-name'].textContent = reward.name;
  dom['selected-reward-description'].textContent = reward.description; dom['selected-reward-source'].textContent = reward.source ? `${reward.source.collection} / ${reward.source.id}` : 'progression / vector';
  dom['selected-reward-license'].textContent = linked?.license || 'CC0-1.0'; document.body.dataset.rewardLicense = linked?.license || 'CC0-1.0';
}
function selectReward(id) {
  if (!rewardById(id)) return; state.reward = id; document.body.dataset.reward = id; renderRewardList(); renderSelectedReward();
  dom['progression-state-content'].querySelectorAll('[data-reward]').forEach((button) => { const active = button.dataset.reward === id; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  syncQuery();
}
function renderFrames() {
  dom['progression-frame-list'].innerHTML = state.manifest.frames.map((frame) => `<div style="--frame-accent:${frame.color}" title="${escapeHtml(frame.name)} frame · ${frame.color}"><img src="${assetUrl(frame.runtime)}" alt="" /><span>${escapeHtml(frame.name)}</span></div>`).join('');
}
function renderIcons() {
  dom['progression-icon-grid'].innerHTML = state.manifest.icons.ids.map((id) => `<span title="${id}" aria-label="${id} icon">${icon(id)}</span>`).join('');
}
function challengeCard(challenge) {
  return `<article class="challenge-card"><div>${icon(challenge.icon)}<strong>${escapeHtml(challenge.name)}</strong></div><p>${escapeHtml(challenge.description)}</p><div><span>${challenge.current} / ${challenge.total}</span><b>${escapeHtml(challenge.reward)}</b></div><span><i style="width:${challenge.percent}%"></i></span></article>`;
}
function rewardCard(reward) {
  const frame = frameById(reward.rarity); const media = reward.preview ? `<img src="${assetUrl(reward.preview)}" alt="${escapeHtml(reward.name)} preview" loading="lazy" />` : `<div class="reward-media icon-media">${icon(reward.icon)}</div>`;
  const mediaMarkup = reward.preview ? `<div class="reward-media">${media}</div>` : media;
  return `<button type="button" class="reward-card ${reward.id === state.reward ? 'active' : ''}" data-reward="${reward.id}" aria-pressed="${reward.id === state.reward}" style="--reward-accent:${frame.color}"><img class="reward-frame" src="${assetUrl(frame.runtime)}" alt="" />${mediaMarkup}<span>${escapeHtml(reward.kind)} / ${escapeHtml(frame.name)}</span><strong>${escapeHtml(reward.name)}</strong><small>${escapeHtml(reward.amount || (reward.source ? `${reward.source.collection} / ${reward.source.id}` : 'Vector fixture'))}</small></button>`;
}
function renderHero() {
  const fixture = currentFixture(); let rankId; let metrics;
  if (state.fixture === 'profile') {
    rankId = fixture.rankId; metrics = [['Profile', fixture.levelLabel], ['Progress fixture', fixture.xpLabel], ['Credit fixture', fixture.creditsLabel]];
    dom['hero-eyebrow'].textContent = fixture.eyebrow; dom['hero-title'].textContent = fixture.title; dom['hero-description'].textContent = 'Kestrel Ridge · local profile fixture';
  } else if (state.fixture === 'season') {
    const current = fixture.stages.find((stage) => stage.state === 'current'); rankId = current.rankId; metrics = [['Journey', '5 STAGES'], ['Current fixture', current.label.toUpperCase()], ['Stage state', 'NO ADVANCEMENT']];
    dom['hero-eyebrow'].textContent = fixture.eyebrow; dom['hero-title'].textContent = fixture.title; dom['hero-description'].textContent = 'Five static stages · inspect any rank or reward';
  } else {
    rankId = 'legend'; metrics = [['Gallery', '6 REWARDS'], ['Rarity frames', '4 SVG'], ['Vector assets', 'CC0']];
    dom['hero-eyebrow'].textContent = fixture.eyebrow; dom['hero-title'].textContent = fixture.title; dom['hero-description'].textContent = 'Original vectors + linked local package media';
  }
  const rank = rankById(rankId); dom['hero-rank'].src = assetUrl(rank.runtime); dom['hero-rank'].alt = `${rank.name} rank insignia`;
  dom['progression-hero-image'].src = assetUrl(state.manifest.demo.states.profile.trackPreview);
  metrics.forEach(([label, value], index) => { dom[`hero-metric-label-${index}`].textContent = label; dom[`hero-metric-${index}`].textContent = value; });
}
function renderState() {
  const fixture = currentFixture(); if (!fixture) return;
  dom['fixture-eyebrow'].textContent = fixture.eyebrow; dom['fixture-title'].textContent = fixture.title; dom['fixture-description'].textContent = fixture.description;
  if (state.fixture === 'profile') {
    dom['progression-state-content'].innerHTML = `<div class="progress-summary"><div><span>Rank progress fixture</span><strong>${escapeHtml(fixture.xpLabel)}</strong></div><span><i style="width:${fixture.progress}%"></i></span><small>${fixture.progress}% static layout marker · no XP calculation or advancement</small></div><div class="challenge-grid">${fixture.challengeIds.map((id) => challengeCard(challengeById(id))).join('')}</div>`;
  } else if (state.fixture === 'season') {
    dom['progression-state-content'].innerHTML = `<div class="season-stages">${fixture.stages.map((stage, index) => { const rank = rankById(stage.rankId); const reward = rewardById(stage.rewardId); return `<button type="button" class="season-stage ${stage.state}" data-stage-rank="${rank.id}" data-stage-reward="${reward.id}" style="--stage-accent:${rank.color}" aria-label="Inspect ${escapeHtml(stage.label)} rank and reward"><span>STAGE ${String(index + 1).padStart(2, '0')}</span><img src="${assetUrl(rank.runtime)}" alt="${escapeHtml(rank.name)} insignia" /><strong>${escapeHtml(stage.label)}</strong><small>${icon(reward.icon)}${escapeHtml(reward.name)}</small><b>${stage.state}</b></button>`; }).join('')}</div><div class="challenge-grid">${fixture.challengeIds.map((id) => challengeCard(challengeById(id))).join('')}</div>`;
    dom['progression-state-content'].querySelectorAll('[data-stage-rank]').forEach((button) => button.addEventListener('click', () => { selectRank(button.dataset.stageRank); selectReward(button.dataset.stageReward); }));
  } else {
    dom['progression-state-content'].innerHTML = `<div class="reward-gallery">${fixture.rewardIds.map((id) => rewardCard(rewardById(id))).join('')}</div>`;
    dom['progression-state-content'].querySelectorAll('[data-reward]').forEach((button) => button.addEventListener('click', () => selectReward(button.dataset.reward)));
  }
}
function setFixture(id) {
  if (!state.manifest?.demo.states[id]) return; state.fixture = id; document.body.dataset.fixture = id;
  document.querySelectorAll('[data-progression-view]').forEach((button) => { const active = button.dataset.progressionView === id; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  renderHero(); renderState(); syncQuery();
}
function renderAll() {
  dom['stage-progression-count'].textContent = `${state.manifest.ranks.length} RANK INSIGNIAS`;
  renderIcons(); renderFrames(); selectRank(state.rank); selectReward(state.reward); setFixture(state.fixture);
}
async function init() {
  try {
    const response = await fetch(assetUrl('assets/progression/progression.json')); if (!response.ok) throw new Error(`Manifest returned HTTP ${response.status}`);
    state.manifest = await response.json();
    if (!Array.isArray(state.manifest.ranks) || !Array.isArray(state.manifest.rewards) || !state.manifest.demo?.states) throw new Error('Progression fixture inventory is invalid');
    if (!state.manifest.demo.states[state.fixture]) state.fixture = 'profile'; if (!rankById(state.rank)) state.rank = 'elite'; if (!rewardById(state.reward)) state.reward = 'nova-driver';
    renderAll(); state.ready = true; document.body.dataset.assetReady = 'true'; dom['progression-poster'].classList.add('is-hidden'); dom['progression-error'].hidden = true;
  } catch (error) {
    console.error('Progression Lab initialization failed', error); dom['progression-error-message'].textContent = error.message; dom['progression-error'].hidden = false;
  }
}
document.querySelectorAll('[data-progression-view]').forEach((button) => button.addEventListener('click', () => setFixture(button.dataset.progressionView)));
dom['retry-progression'].addEventListener('click', init);
init();

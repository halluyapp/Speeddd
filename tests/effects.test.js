import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../public/assets/catalog.json', import.meta.url), 'utf8'));
const media = JSON.parse(await fs.readFile(new URL('../public/assets/media/vfx-audio.json', import.meta.url), 'utf8'));

test('catalogue indexes the media lab and every visual/audio source and runtime is local', async () => {
  assert.ok(catalog.version >= 4);
  assert.deepEqual(catalog.media, [{
    id: 'velocity-vfx-audio', name: 'Velocity VFX & Audio — Media 01', manifest: 'assets/media/vfx-audio.json', preview: 'assets/previews/vfx-audio.webp', page: 'effects.html',
  }]);
  assert.equal(media.effects.length, 8);
  assert.equal(media.audio.length, 11);
  assert.equal(media.license, 'CC0-1.0');
  assert.match(media.credit.source, /Original deterministic textures, flipbooks, waveforms and synthesized audio/);
  const paths = [media.preview];
  for (const effect of media.effects) paths.push(effect.runtime, effect.thumbnail);
  for (const audio of media.audio) paths.push(audio.runtime, audio.waveform);
  for (const relative of paths) {
    assert.ok(!relative.startsWith('http'));
    assert.ok((await fs.stat(new URL(`../public/${relative}`, import.meta.url))).size > 20);
  }
  for (const relative of [...media.effects.map((effect) => effect.master), ...media.audio.map((audio) => audio.master)]) {
    assert.ok((await fs.stat(new URL(`../${relative}`, import.meta.url))).size > 44);
  }
});

test('VFX records contain exact flipbook layouts, timing, blending and suggested dimensions', () => {
  const byId = Object.fromEntries(media.effects.map((effect) => [effect.id, effect]));
  assert.equal(byId.explosion.frames, 64);
  assert.equal(byId.explosion.columns, 8);
  assert.equal(byId.explosion.rows, 8);
  assert.equal(byId['skid-mark'].decal, true);
  assert.equal(byId['boost-flame'].loop, true);
  for (const effect of media.effects) {
    assert.equal(effect.columns * effect.rows, effect.frames);
    assert.equal(effect.frameWidth * effect.columns, effect.atlasWidth);
    assert.equal(effect.frameHeight * effect.rows, effect.atlasHeight);
    assert.ok(effect.suggestedSize.every((value) => value > 0));
    assert.ok(['normal', 'additive'].includes(effect.blend));
    if (effect.fps) assert.ok(Math.abs(effect.duration - effect.frames / effect.fps) < 0.0001);
  }
});

test('audio records preserve 48k/24 masters and provide gapless 32k/16 stereo runtimes', async () => {
  assert.equal(media.audio.filter((audio) => audio.loop).length, 4);
  assert.equal(media.audioProfile.sampleRate, 32000);
  assert.equal(media.audioProfile.masterSampleRate, 48000);
  for (const audio of media.audio) {
    assert.equal(audio.sampleRate, 32000);
    assert.equal(audio.masterSampleRate, 48000);
    assert.equal(audio.bitDepth, 16);
    assert.equal(audio.masterBitDepth, 24);
    assert.equal(audio.channels, 2);
    assert.ok(audio.peak <= 0.892 && audio.rms > 0.001);
    if (audio.loop) {
      assert.equal(audio.loopStart, 0);
      assert.equal(audio.loopEnd, audio.duration);
    }
    const bytes = await fs.readFile(new URL(`../public/${audio.runtime}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.readUInt16LE(22), 2);
    assert.equal(bytes.readUInt32LE(24), 32000);
    assert.equal(bytes.readUInt16LE(34), 16);
  }
  assert.match(media.gameplayNote, /No particle simulation, driving, damage, weapon, race or combat logic/);
});

test('media inspector is poster-first, frame-accurate and gesture-gated with local dependencies', async () => {
  const [html, script, config, index, track, race] = await Promise.all([
    fs.readFile(new URL('../effects.html', import.meta.url), 'utf8'), fs.readFile(new URL('../src/effects.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../track.html', import.meta.url), 'utf8'), fs.readFile(new URL('../race.html', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="effects-poster"[\s\S]*?src="\/assets\/previews\/vfx-audio\.webp"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /id="effect-scrubber"/);
  assert.match(html, /id="effect-speed"/);
  assert.match(html, /id="audio-filter"/);
  assert.match(html, /id="audio-volume"/);
  assert.doesNotMatch(html, /<audio|<video/i);
  assert.match(script, /decodeAudioData/);
  assert.match(script, /addEventListener\('click', playAudio\)/);
  assert.match(script, /source\.loop = audio\.loop/);
  assert.match(script, /texture\.offset\.set/);
  assert.doesNotMatch(`${html}\n${script}`, /unpkg|jsdelivr|googleapis|raw\.githubusercontent/);
  assert.match(config, /effects: resolve\(process\.cwd\(\), 'effects\.html'\)/);
  for (const page of [index, track, race]) assert.match(page, /href="\.\/effects\.html"/);
});

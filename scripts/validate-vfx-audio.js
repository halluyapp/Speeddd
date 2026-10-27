import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/media/vfx-audio.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, 'public/assets/catalog.json'), 'utf8'));
let failed = false;

function wavInfo(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV signature');
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') format = { audioFormat: buffer.readUInt16LE(offset + 8), channels: buffer.readUInt16LE(offset + 10), sampleRate: buffer.readUInt32LE(offset + 12), bits: buffer.readUInt16LE(offset + 22) };
    if (id === 'data') data = { offset: offset + 8, size };
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) throw new Error('WAV fmt/data chunk missing');
  return { ...format, ...data, frames: data.size / (format.channels * format.bits / 8) };
}

function pcmMetrics(buffer, info) {
  let peak = 0;
  let sum = 0;
  let count = 0;
  let differenceSum = 0;
  let differenceCount = 0;
  let sampleIndex = 0;
  const previous = Array(info.channels).fill(0);
  const bytes = info.bits / 8;
  const read = (offset) => info.bits === 24 ? buffer.readIntLE(offset, 3) / 8388607 : buffer.readInt16LE(offset) / 32767;
  for (let offset = info.offset; offset < info.offset + info.size; offset += bytes) {
    const sample = read(offset);
    const channel = sampleIndex % info.channels;
    peak = Math.max(peak, Math.abs(sample));
    sum += sample * sample;
    count += 1;
    if (sampleIndex >= info.channels) {
      const difference = sample - previous[channel];
      differenceSum += difference * difference;
      differenceCount += 1;
    }
    previous[channel] = sample;
    sampleIndex += 1;
  }
  const stride = info.channels * bytes;
  const last = info.offset + info.size - stride;
  const seam = Math.max(...Array.from({ length: info.channels }, (_, channel) => Math.abs(read(info.offset + channel * bytes) - read(last + channel * bytes))));
  return { peak, rms: Math.sqrt(sum / count), seam, deltaRms: Math.sqrt(differenceSum / differenceCount) };
}

try {
  if (!catalog.media?.some((entry) => entry.id === manifest.id && entry.manifest === 'assets/media/vfx-audio.json' && entry.page === 'effects.html')) throw new Error('Main catalogue does not reference the media package');
  if (manifest.effects.length !== 8 || manifest.audio.length !== 11 || manifest.license !== 'CC0-1.0') throw new Error('Media inventory or CC0 record is incomplete');
  if (manifest.audioProfile.sampleRate !== 32000 || manifest.audioProfile.masterSampleRate !== 48000 || manifest.audioProfile.bitDepth !== 16 || manifest.audioProfile.masterBitDepth !== 24) throw new Error('Audio runtime/master profile mismatch');

  for (const effect of manifest.effects) {
    try {
      const runtimePath = path.join(ROOT, 'public', effect.runtime);
      const [runtime, master, thumbnail] = await Promise.all([
        sharp(runtimePath).metadata(), sharp(path.join(ROOT, effect.master)).metadata(), sharp(path.join(ROOT, 'public', effect.thumbnail)).metadata(),
      ]);
      if (runtime.format !== 'webp' || master.format !== 'png' || thumbnail.format !== 'webp') throw new Error('Visual runtime/master format mismatch');
      if (runtime.width !== effect.atlasWidth || runtime.height !== effect.atlasHeight || runtime.channels !== 4) throw new Error('Runtime atlas dimensions or alpha channel mismatch');
      if (master.width !== effect.atlasWidth || master.height !== effect.atlasHeight || master.channels !== 4) throw new Error('Master atlas dimensions or alpha channel mismatch');
      if (effect.columns * effect.rows !== effect.frames || effect.frameWidth * effect.columns !== effect.atlasWidth || effect.frameHeight * effect.rows !== effect.atlasHeight) throw new Error('Flipbook layout does not match atlas dimensions');
      if (effect.fps && Math.abs(effect.duration - effect.frames / effect.fps) > 0.0001) throw new Error('Flipbook duration mismatch');
      if (!['normal', 'additive'].includes(effect.blend) || effect.suggestedSize.some((value) => value <= 0)) throw new Error('Blend mode or suggested size is invalid');
      const stats = await sharp(runtimePath).stats();
      const alpha = stats.channels[3];
      if (!alpha || alpha.min > 5 || alpha.max < 30 || alpha.mean <= 0 || alpha.mean >= 250) throw new Error('RGBA transparency range is not useful');
      if ((await fs.stat(runtimePath)).size !== effect.bytes) throw new Error('Runtime byte count is stale');
      console.log(`PASS VFX ${effect.id.padEnd(18)} ${String(effect.frames).padStart(2)} frames · ${effect.atlasWidth}×${effect.atlasHeight} · ${(effect.bytes / 1024).toFixed(0)} KB`);
    } catch (error) {
      failed = true;
      console.error(`FAIL VFX ${effect.id}: ${error.message}`);
    }
  }

  for (const audio of manifest.audio) {
    try {
      const runtimePath = path.join(ROOT, 'public', audio.runtime);
      const [runtimeBytes, masterBytes] = await Promise.all([fs.readFile(runtimePath), fs.readFile(path.join(ROOT, audio.master))]);
      const runtime = wavInfo(runtimeBytes);
      const master = wavInfo(masterBytes);
      if (runtime.audioFormat !== 1 || runtime.channels !== 2 || runtime.sampleRate !== 32000 || runtime.bits !== 16) throw new Error('Runtime PCM profile mismatch');
      if (master.audioFormat !== 1 || master.channels !== 2 || master.sampleRate !== 48000 || master.bits !== 24) throw new Error('Master PCM profile mismatch');
      if (Math.abs(runtime.frames / runtime.sampleRate - audio.duration) > 0.001 || Math.abs(master.frames / master.sampleRate - audio.duration) > 0.001) throw new Error('Audio duration mismatch');
      if (runtimeBytes.length !== audio.bytes) throw new Error('Runtime byte count is stale');
      const metrics = pcmMetrics(runtimeBytes, runtime);
      if (metrics.peak > 0.892 || metrics.peak < 0.05 || metrics.rms < 0.001) throw new Error(`Unsafe or silent audio levels (peak ${metrics.peak.toFixed(4)}, RMS ${metrics.rms.toFixed(4)})`);
      if (Math.abs(metrics.peak - audio.peak) > 0.002 || Math.abs(metrics.rms - audio.rms) > 0.002) throw new Error('Manifest audio metrics are stale');
      // A noise loop can legitimately have a large adjacent-sample jump. Compare
      // the wrap with the signal's own normal sample-to-sample variation.
      const seamLimit = Math.max(0.12, metrics.deltaRms * 2.5);
      if (audio.loop && (audio.loopStart !== 0 || audio.loopEnd !== audio.duration || metrics.seam > seamLimit)) throw new Error(`Loop boundary is discontinuous (${metrics.seam.toFixed(4)} > ${seamLimit.toFixed(4)})`);
      const waveform = await fs.readFile(path.join(ROOT, 'public', audio.waveform), 'utf8');
      if (!waveform.includes('<svg') || (waveform.match(/<rect/g) || []).length !== 96 || /(?:href|src)=["']https?:/i.test(waveform)) throw new Error('Waveform SVG is incomplete or remote');
      console.log(`PASS AUDIO ${audio.id.padEnd(20)} ${audio.duration.toFixed(2)}s · peak ${metrics.peak.toFixed(3)} · RMS ${metrics.rms.toFixed(3)}${audio.loop ? ` · seam ${metrics.seam.toFixed(4)}` : ''}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL AUDIO ${audio.id}: ${error.message}`);
    }
  }
  const preview = await fs.stat(path.join(ROOT, 'public', manifest.preview));
  if (preview.size < 1000) throw new Error('Media poster is missing');
  if (!manifest.gameplayNote.includes('No particle simulation') || !manifest.gameplayNote.includes('combat logic')) throw new Error('Media-only scope is not explicit');
} catch (error) {
  failed = true;
  console.error(`FAIL ${manifest.id}: ${error.message}`);
}

console.log(`\nValidated ${manifest.effects.length} VFX packages with masters/thumbnails and ${manifest.audio.length} stereo audio packages with masters/waveforms.`);
if (failed) process.exitCode = 1;

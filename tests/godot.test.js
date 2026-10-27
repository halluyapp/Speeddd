import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('native Godot project exposes the complete local combat-racing content and low-spec defaults', async () => {
  const [project, game, vehicle, prepare] = await Promise.all([
    read('godot/project.godot'), read('godot/scripts/game.gd'), read('godot/scripts/vehicle.gd'), read('scripts/prepare-godot-assets.js'),
  ]);
  assert.match(project, /GL Compatibility/);
  assert.match(project, /common\/physics_ticks_per_second=60/);
  assert.match(game, /for index in range\(4\)/);
  assert.match(game, /selected_car \+ index \* 3/);
  assert.match(vehicle, /func _ai_controls/);
  assert.match(vehicle, /func _update_checkpoints/);
  assert.match(vehicle, /func apply_damage/);
  assert.match(vehicle, /func _respawn/);
  assert.match(prepare, /catalog\.cars/);
  assert.match(prepare, /EXT_meshopt_compression/);
  assert.match(prepare, /relative\.replace\(\/\^assets\\\/\/, ''\)/);
});

test('Android workflow builds and tests a native APK without remote runtime assets', async () => {
  const [workflow, preset, scripts] = await Promise.all([
    read('.github/workflows/android.yml'), read('godot/export_presets.cfg'), read('godot/scripts/game.gd'),
  ]);
  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /android-actions\/setup-android@v4/);
  assert.match(workflow, /--export-debug Android/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(workflow, /actions\/cache@v4/);
  assert.match(workflow, /apksigner/);
  assert.match(workflow, /native-code/);
  assert.match(workflow, /smoke_test\.gd/);
  assert.match(preset, /architectures\/armeabi-v7a=true/);
  assert.match(preset, /architectures\/arm64-v8a=true/);
  assert.match(preset, /texture_format\/etc2_astc=true/);
  assert.doesNotMatch(scripts, /https?:\/\//);
});

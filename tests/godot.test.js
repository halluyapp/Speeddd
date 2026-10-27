import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('native project is APEX DRIVE and stages a focused noncombat vertical slice', async () => {
  const [project, game, vehicle, prepare, scene] = await Promise.all([
    read('godot/project.godot'), read('godot/scripts/game.gd'), read('godot/scripts/vehicle.gd'),
    read('scripts/prepare-godot-assets.js'), read('godot/scenes/main.tscn'),
  ]);
  assert.match(project, /config\/name="APEX DRIVE"/);
  assert.match(project, /GL Compatibility/);
  assert.match(project, /common\/physics_ticks_per_second=60/);
  assert.match(scene, /ApexDrive/);
  assert.match(game, /JAG STUDIOS|show_studio/);
  assert.match(game, /_start_cinematic/);
  assert.match(game, /func start_race\(mode: String = "quick"\)/);
  assert.match(game, /4 if selected_mode == "quick" else 1/);
  assert.match(vehicle, /func _ai_controls/);
  assert.match(vehicle, /func _update_checkpoints/);
  assert.doesNotMatch(vehicle, /apply_damage|missile|weapon_root|tracer_fired|nitro/);
  assert.doesNotMatch(game, /MissileScript|_on_missile|_try_fire/);
  assert.match(prepare, /sport-coupe/);
  assert.match(prepare, /trackIds = \['azurline-circuit'\]/);
  assert.doesNotMatch(prepare, /combat\.json|weapons:|projectile:/);
  assert.match(prepare, /EXT_meshopt_compression/);
  assert.match(prepare, /relative\.replace\(\/\^assets\\\/\/, ''\)/);
});

test('opening, garage, saves, Time Trial, cameras and real loading stages are implemented', async () => {
  const [game, ui, save, smoke, trackMap] = await Promise.all([
    read('godot/scripts/game.gd'), read('godot/scripts/ui.gd'), read('godot/scripts/save_manager.gd'),
    read('godot/tests/smoke_test.gd'), read('godot/scripts/track_map.gd'),
  ]);
  assert.match(game, /set_loading\(0\.28, "LOADING AZURE COAST"\)/);
  assert.match(game, /set_loading\(0\.52, "PREPARING ROAD COLLISION"\)/);
  assert.match(game, /set_loading\(0\.7, "LOADING CORSA RS"\)/);
  assert.match(game, /save\.record_race/);
  assert.match(game, /func cycle_camera/);
  assert.match(game, /func _on_inspection/);
  assert.match(ui, /QUICK RACE/);
  assert.match(ui, /TIME TRIAL/);
  assert.match(ui, /BODY PAINT/);
  assert.match(ui, /LOW/);
  assert.match(ui, /BALANCED/);
  assert.match(ui, /_layout_touch_controls/);
  assert.doesNotMatch(ui, /_touch_button\("fire"|_touch_button\("nitro"/);
  assert.match(save, /SAVE_VERSION: int = 1/);
  assert.match(save, /rename_absolute/);
  assert.match(save, /bestLaps/);
  assert.match(smoke, /Time Trial loads a solo event/);
  assert.match(smoke, /profile survives a save-manager restart/);
  assert.match(trackMap, /draw_polyline/);
});

test('Android workflow builds and verifies a universal APEX DRIVE APK without remote runtime assets', async () => {
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
  assert.match(workflow, /name: apex-drive-android-debug/);
  assert.match(workflow, /apex-drive-debug\.apk/);
  assert.match(preset, /package\/unique_name="app\.halluy\.apexdrive"/);
  assert.match(preset, /package\/name="APEX DRIVE"/);
  assert.match(preset, /architectures\/armeabi-v7a=true/);
  assert.match(preset, /architectures\/arm64-v8a=true/);
  assert.match(preset, /architectures\/x86=true/);
  assert.match(preset, /architectures\/x86_64=true/);
  assert.match(preset, /texture_format\/etc2_astc=true/);
  assert.doesNotMatch(scripts, /https?:\/\//);
});

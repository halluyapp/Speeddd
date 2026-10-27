extends RefCounted

const SAVE_VERSION: int = 1
const DEFAULT_DATA: Dictionary = {
	"profile": {
		"name": "DRIVER 01",
		"introSeen": false,
		"profileCreated": false,
	},
	"settings": {
		"graphics": "low",
		"drivingProfile": "simcade",
		"assists": true,
		"masterVolume": 0.8,
		"engineVolume": 0.85,
		"effectsVolume": 0.8,
		"musicVolume": 0.65,
		"cameraShake": true,
		"touchScale": 1.0,
		"steeringSensitivity": 1.0,
	},
	"selection": {
		"car": "sport-coupe",
		"paint": "#c7352b",
	},
	"progress": {
		"races": 0,
		"wins": 0,
		"bestLaps": {},
		"history": [],
	},
}

var data: Dictionary = {}
var save_path: String = "user://apex_drive_save.json"

func load_data() -> void:
	data = DEFAULT_DATA.duplicate(true)
	var loaded: Variant = _read_save(save_path)
	if loaded == null:
		loaded = _read_save(save_path + ".bak")
	if loaded is Dictionary:
		_merge_known(data, loaded)
	_sanitize()

func _read_save(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary:
		return null
	var version: int = int(parsed.get("version", 0))
	if version < 1 or version > SAVE_VERSION:
		return null
	return parsed

func _merge_known(target: Dictionary, source: Dictionary) -> void:
	for key in target:
		if not source.has(key):
			continue
		if target[key] is Dictionary and source[key] is Dictionary:
			if target[key].is_empty():
				target[key] = source[key].duplicate(true)
			else:
				_merge_known(target[key], source[key])
		elif (target[key] is int or target[key] is float) and (source[key] is int or source[key] is float):
			target[key] = source[key]
		elif typeof(target[key]) == typeof(source[key]):
			target[key] = source[key]

func _sanitize() -> void:
	data["profile"]["name"] = str(data["profile"]["name"]).strip_edges().substr(0, 18)
	if data["profile"]["name"].is_empty():
		data["profile"]["name"] = "DRIVER 01"
	if not str(data["settings"]["graphics"]) in ["low", "balanced"]:
		data["settings"]["graphics"] = "low"
	if not str(data["settings"]["drivingProfile"]) in ["simcade", "arcade"]:
		data["settings"]["drivingProfile"] = "simcade"
	for key in ["masterVolume", "engineVolume", "effectsVolume", "musicVolume", "touchScale", "steeringSensitivity"]:
		data["settings"][key] = clampf(float(data["settings"][key]), 0.0 if "Volume" in key else 0.7, 1.0 if "Volume" in key else 1.3)
	data["progress"]["races"] = maxi(0, int(data["progress"]["races"]))
	data["progress"]["wins"] = clampi(int(data["progress"]["wins"]), 0, data["progress"]["races"])
	if data["progress"]["history"].size() > 12:
		data["progress"]["history"] = data["progress"]["history"].slice(0, 12)

func save_data() -> bool:
	_sanitize()
	var payload: Dictionary = data.duplicate(true)
	payload["version"] = SAVE_VERSION
	var temporary_path: String = save_path + ".tmp"
	var file := FileAccess.open(temporary_path, FileAccess.WRITE)
	if file == null:
		push_warning("APEX DRIVE could not open its temporary save file.")
		return false
	file.store_string(JSON.stringify(payload, "\t"))
	file.flush()
	file.close()
	var absolute_save: String = ProjectSettings.globalize_path(save_path)
	var absolute_temp: String = ProjectSettings.globalize_path(temporary_path)
	var absolute_backup: String = ProjectSettings.globalize_path(save_path + ".bak")
	if FileAccess.file_exists(save_path):
		DirAccess.copy_absolute(absolute_save, absolute_backup)
	var error: Error = DirAccess.rename_absolute(absolute_temp, absolute_save)
	if error != OK:
		push_warning("APEX DRIVE could not commit its local save.")
		return false
	return true

func record_race(track_id: String, mode: String, position: int, best_lap: float, total_time: float) -> bool:
	if best_lap <= 0.0 or total_time <= 0.0:
		return false
	var key: String = "%s/%s" % [track_id, mode]
	var best_laps: Dictionary = data["progress"]["bestLaps"]
	var previous: float = float(best_laps.get(key, 0.0))
	var is_record: bool = previous <= 0.0 or best_lap < previous
	if is_record:
		best_laps[key] = snappedf(best_lap, 0.001)
	data["progress"]["races"] += 1
	if mode == "quick" and position == 1:
		data["progress"]["wins"] += 1
	var history: Array = data["progress"]["history"]
	history.push_front({
		"track": track_id,
		"mode": mode,
		"position": position,
		"bestLap": snappedf(best_lap, 0.001),
		"time": snappedf(total_time, 0.001),
	})
	data["progress"]["history"] = history.slice(0, 12)
	save_data()
	return is_record

func best_lap(track_id: String, mode: String) -> float:
	return float(data["progress"]["bestLaps"].get("%s/%s" % [track_id, mode], 0.0))

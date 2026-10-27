extends SceneTree

const SaveScript = preload("res://scripts/save_manager.gd")

var failures: Array[String] = []
var test_paths: Array[String] = [
	"user://apex_drive_manager_test.json",
	"user://apex_drive_game_test.json",
]

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS ", message)
	else:
		failures.append(message)
		push_error("FAIL " + message)

func _clean_test_saves() -> void:
	for path in test_paths:
		for suffix in ["", ".bak", ".tmp"]:
			var absolute: String = ProjectSettings.globalize_path(path + suffix)
			if FileAccess.file_exists(path + suffix):
				DirAccess.remove_absolute(absolute)

func _cross_checkpoint(vehicle: CharacterBody3D, index: int) -> void:
	var checkpoint: Dictionary = vehicle.course.checkpoints[index]
	var point: Array = checkpoint["position"]
	var forward: Array = checkpoint["forward"]
	vehicle.global_position = Vector3(point[0], point[1] + 0.2, point[2])
	vehicle.velocity = Vector3(forward[0], forward[1], forward[2]).normalized() * 14.0
	if index == 0 and vehicle.crossed_start:
		vehicle.current_lap_time = 42.0
		vehicle.race_time = maxf(vehicle.race_time, 42.0)
	vehicle._update_checkpoints()

func _complete_valid_lap(vehicle: CharacterBody3D) -> void:
	if not vehicle.crossed_start:
		_cross_checkpoint(vehicle, 0)
	var guard: int = 0
	while not vehicle.is_finished and guard < 16:
		_cross_checkpoint(vehicle, vehicle.next_checkpoint)
		guard += 1

func _run() -> void:
	_clean_test_saves()
	var manager: RefCounted = SaveScript.new()
	manager.save_path = test_paths[0]
	manager.load_data()
	_check(manager.data["profile"]["name"] == "DRIVER 01", "new local profile has a useful default")
	manager.data["profile"]["name"] = "SAVE TEST"
	_check(manager.save_data(), "versioned save writes through a temporary file")
	_check(manager.record_race("azurline-circuit", "time", 1, 51.234, 54.0), "first valid lap becomes a personal record")
	_check(not manager.record_race("azurline-circuit", "time", 1, 0.0, 0.0), "invalid or abandoned results grant no record")
	var restored: RefCounted = SaveScript.new()
	restored.save_path = test_paths[0]
	restored.load_data()
	_check(restored.data["profile"]["name"] == "SAVE TEST", "profile survives a save-manager restart")
	_check(is_equal_approx(restored.best_lap("azurline-circuit", "time"), 51.234), "best lap survives a save-manager restart")
	_check(restored.data["progress"]["races"] == 1, "only completed races increment the driver record")

	var content: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/content.json"))
	_check(content.get("brand", {}).get("title", "") == "APEX DRIVE", "native content carries the APEX DRIVE identity")
	_check(content.get("cars", []).size() == 1, "vertical slice stages one polished starter car")
	_check(content.get("tracks", []).size() == 1 and content["tracks"][0]["name"] == "Azure Coast", "Azure Coast is the first complete circuit")
	_check(not content.has("weapons") and not content.has("projectile"), "standard racing stages no weapons or projectiles")
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	game.save_path_override = test_paths[1]
	root.add_child(game)
	await process_frame
	_check(game.state == "studio", "game opens with the JAG STUDIOS identity")
	game._start_cinematic()
	await process_frame
	_check(game.state == "cinematic" and is_instance_valid(game.menu_car), "cinematic reveals the actual detailed 3D starter car")
	_check(game.menu_headlights.size() == 2, "cinematic includes functional headlight activation")
	game.finish_cinematic()
	_check(game.state == "profile", "first launch requests an offline driver profile")
	game.save_profile("TEST DRIVER")
	await process_frame
	_check(game.state == "menu" and game.menu_page == "home", "profile setup arrives at the 3D home garage")
	for page in ["race", "garage", "career", "settings", "home"]:
		game.navigate(page)
		await process_frame
		_check(game.ui.current_page == page and game.ui.menu_content.get_child_count() > 0, page + " navigation builds a functional page")
	game.set_paint("#23648a")
	await process_frame
	_check(game.selected_paint.to_html(false) == "23648a", "garage paint selection applies and updates local state")
	game._on_inspection("front")
	_check(game.camera.global_position.z > 5.0, "garage front inspection moves the real camera")
	game.set_setting("drivingProfile", "arcade")
	_check(game.save.data["settings"]["drivingProfile"] == "arcade", "driving-profile setting persists")
	game.set_setting("graphics", "balanced")
	await process_frame
	_check(game.key_light.shadow_enabled, "Balanced preset enables real shadows")
	game.set_setting("graphics", "low")
	await process_frame
	_check(not game.key_light.shadow_enabled, "Low preset disables expensive shadows")

	await game.start_race("quick")
	await process_frame
	_check(game.state == "countdown", "real loading stages finish on the starting grid")
	_check(game.racers.size() == 4, "Quick Race creates the player and three AI opponents")
	_check(game.course.centerline.size() == 361, "Azure Coast centerline drives AI and standings")
	_check(game.course.checkpoints.size() == 12, "all twelve ordered checkpoints are installed")
	_check(game.racers[1].driver_name == "M. KESTREL", "AI identity remains consistent throughout the event")
	game.cycle_camera()
	_check(game.camera_mode == 1, "hood camera is available")
	game.cycle_camera()
	_check(game.camera_mode == 2, "bumper camera is available")
	game.cycle_camera()
	_check(game.camera_mode == 0, "camera cycle returns to chase view")
	game._begin_racing()
	Input.action_press("throttle")
	for _index in range(180):
		await physics_frame
	Input.action_release("throttle")
	_check(game.player.speed_kph > 10.0, "starter car accelerates through the racing controller")
	_check(game.racers[1].speed_kph > 5.0, "AI opponent accelerates on the circuit")
	_check(game.racers[1].race_progress() > 0.0, "AI makes genuine course progress without rubber-banding")
	_check(game.player.crossed_start, "player crosses the ordered start checkpoint")
	_check(game.player.race_time > 1.0, "race timing advances")
	game.pause_race()
	_check(paused and game.state == "paused", "pause suspends the complete race")
	game.resume_race()
	_check(not paused and game.state == "racing", "resume restores racing and controls")
	game.player.total_laps = 1
	_complete_valid_lap(game.player)
	await process_frame
	_check(game.player.laps_completed == 1 and game.player.best_lap > 0.0, "ordered checkpoints produce a valid lap and best time")
	_check(game.state == "results" and game.player.finish_position >= 1, "finish order opens official race results")
	_check(game.save.best_lap("azurline-circuit", "quick") > 0.0, "Quick Race best lap is saved locally")

	await game.start_race("time")
	await process_frame
	_check(game.racers.size() == 1 and game.state == "countdown", "Time Trial loads a solo event with no physical opponents")
	game._begin_racing()
	game.player.total_laps = 1
	_complete_valid_lap(game.player)
	await process_frame
	_check(game.state == "results", "Time Trial reaches its results screen")
	_check(game.save.best_lap("azurline-circuit", "time") > 0.0, "Time Trial personal best is saved locally")
	game.show_home()
	await process_frame
	_check(game.state == "menu" and game.racers.is_empty(), "return to menu releases the complete race world")
	var persisted: RefCounted = SaveScript.new()
	persisted.save_path = test_paths[1]
	persisted.load_data()
	_check(persisted.data["progress"]["races"] == 2 and persisted.data["progress"]["history"].size() == 2, "both completed events survive an application-style reload")

	game._stop_audio(game)
	game.queue_free()
	await process_frame
	await create_timer(0.2).timeout
	_clean_test_saves()
	if failures.is_empty():
		print("PASS APEX DRIVE native smoke suite")
		quit(0)
	else:
		push_error("APEX DRIVE smoke failures: " + str(failures))
		quit(1)

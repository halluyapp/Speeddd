extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if condition:
		print("PASS ", message)
	else:
		failures.append(message)
		push_error("FAIL " + message)

func _run() -> void:
	var content: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/content.json"))
	_check(content.get("cars", []).size() == 11, "all eleven cars are available")
	_check(content.get("tracks", []).size() == 2, "both environments are available")
	_check(content.get("weapons", []).size() == 4, "all four weapon systems are available")
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	_check(game.state == "menu", "game opens in the 3D garage")
	game.start_race()
	await process_frame
	_check(game.racers.size() == 4, "low-spec race creates four racers")
	_check(game.course.centerline.size() == 361, "real Azurline centerline drives AI and progress")
	_check(game.course.checkpoints.size() == 12, "real checkpoint records are installed")
	game._begin_racing()
	Input.action_press("throttle")
	for _index in range(180):
		await physics_frame
	Input.action_release("throttle")
	_check(game.player.speed_kph > 10.0, "player vehicle accelerates through the shared controller")
	_check(game.player.race_time > 1.0, "race timing advances")
	var opponent: CharacterBody3D = game.racers[1]
	var initial_health: float = opponent.health
	opponent.apply_damage(10.0, game.player)
	_check(opponent.health == initial_health - 10.0, "damage applies through the common combat rule")
	opponent._begin_destroyed(game.player)
	_check(opponent.respawn_time > 0.0, "destruction starts respawn recovery")
	opponent.respawn_time = 0.01
	await physics_frame
	await physics_frame
	_check(opponent.health == 100.0 and opponent.visible, "respawn restores the vehicle at course data")
	game.pause_race()
	_check(paused and game.state == "paused", "pause suspends gameplay")
	game.resume_race()
	_check(not paused and game.state == "racing", "resume restores racing")
	game.show_garage()
	await process_frame
	_check(game.state == "menu", "garage return disposes the race")
	game.queue_free()
	await process_frame
	if failures.is_empty():
		print("PASS Godot native smoke suite")
		quit(0)
	else:
		push_error("Godot smoke failures: " + str(failures))
		quit(1)

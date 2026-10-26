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
	_check(game.racers[1].speed_kph > 5.0, "AI opponent accelerates on the real racing line")
	_check(game.player.crossed_start, "player crosses the ordered start checkpoint")
	_check(game.player.race_time > 1.0, "race timing advances")
	game.player.weapon_cooldown = 0.0
	game.player._try_fire()
	_check(game.player.heat > 0.0, "equipped weapon fires and accumulates heat")
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
	game._on_vehicle_finished(game.player)
	_check(game.state == "results", "player finish opens race results")
	game.show_garage()
	await process_frame
	_check(game.state == "menu", "garage return disposes the race")
	for car_index in range(content["cars"].size()):
		game._on_selection_changed("car", car_index)
		await process_frame
		_check(is_instance_valid(game.menu_car), "garage loads " + content["cars"][car_index]["name"])
	for weapon_index in range(content["weapons"].size()):
		game._on_selection_changed("weapon", weapon_index)
		await process_frame
		_check(is_instance_valid(game.menu_car) and game.menu_car.get_child_count() > 0, "garage mounts " + content["weapons"][weapon_index]["name"])
	game._on_selection_changed("track", 1)
	game._on_selection_changed("weapon", 2)
	game.start_race()
	await process_frame
	_check(game.course.checkpoints.size() == 18, "Kestrel Ridge installs all eighteen checkpoints")
	game._begin_racing()
	for _index in range(30):
		await physics_frame
	var children_before_missile: int = game.world_root.get_child_count()
	game._on_missile(game.player, game.racers[1])
	_check(game.world_root.get_child_count() == children_before_missile + 1, "missile pod creates a real homing projectile")
	game.show_garage()
	await process_frame
	_check(game.state == "menu", "second track and missile resources dispose cleanly")
	game._stop_audio(game)
	game.queue_free()
	await process_frame
	await create_timer(0.2).timeout
	if failures.is_empty():
		print("PASS Godot native smoke suite")
		quit(0)
	else:
		push_error("Godot smoke failures: " + str(failures))
		quit(1)

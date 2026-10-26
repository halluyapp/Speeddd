extends Node3D

const TrackScript = preload("res://scripts/track.gd")
const VehicleScript = preload("res://scripts/vehicle.gd")
const UIScript = preload("res://scripts/ui.gd")
const FlipbookScript = preload("res://scripts/flipbook.gd")
const MissileScript = preload("res://scripts/missile.gd")

var content: Dictionary = {}
var world_root: Node3D
var camera: Camera3D
var ui: CanvasLayer
var course: Node3D
var player: CharacterBody3D
var racers: Array = []
var menu_car: Node3D
var selected_car: int = 6
var selected_track: int = 0
var selected_weapon: int = 0
var state: String = "boot"
var previous_state: String = "racing"
var countdown: float = 0.0
var countdown_number: int = -1
var standings_refresh: float = 0.0
var player_position: int = 1

func _ready() -> void:
	Engine.max_fps = 30 if OS.has_feature("mobile") else 60
	_setup_input()
	content = _load_json("res://assets/content.json")
	_setup_environment()
	camera = Camera3D.new()
	camera.name = "PresentationCamera"
	camera.current = true
	camera.near = 0.12
	camera.far = 2600.0
	camera.fov = 64.0
	add_child(camera)
	ui = UIScript.new()
	ui.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(ui)
	ui.setup(content)
	ui.start_requested.connect(start_race)
	ui.restart_requested.connect(start_race)
	ui.garage_requested.connect(show_garage)
	ui.pause_requested.connect(pause_race)
	ui.resume_requested.connect(resume_race)
	ui.selection_changed.connect(_on_selection_changed)
	show_garage()

func _setup_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("071012")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b9d2d4")
	environment.ambient_light_energy = 0.72
	environment.reflected_light_source = Environment.REFLECTED_SOURCE_DISABLED
	world_environment.environment = environment
	add_child(world_environment)
	var key_light := DirectionalLight3D.new()
	key_light.name = "KeyLight"
	key_light.rotation_degrees = Vector3(-52, -32, 0)
	key_light.light_energy = 1.35
	key_light.shadow_enabled = false
	add_child(key_light)

func _setup_input() -> void:
	var keys: Dictionary = {
		"throttle": [KEY_W, KEY_UP],
		"brake": [KEY_S, KEY_DOWN],
		"steer_left": [KEY_A, KEY_LEFT],
		"steer_right": [KEY_D, KEY_RIGHT],
		"drift": [KEY_SPACE],
		"nitro": [KEY_SHIFT],
		"fire": [KEY_F],
		"pause": [KEY_ESCAPE],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in keys[action]:
			var event := InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action, event)
	var mouse_fire := InputEventMouseButton.new()
	mouse_fire.button_index = MOUSE_BUTTON_LEFT
	InputMap.action_add_event("fire", mouse_fire)

func _new_world() -> void:
	if is_instance_valid(world_root):
		remove_child(world_root)
		world_root.queue_free()
	world_root = Node3D.new()
	world_root.name = "RuntimeWorld"
	add_child(world_root)
	racers.clear()
	player = null
	course = null
	menu_car = null

func show_garage() -> void:
	get_tree().paused = false
	state = "menu"
	_new_world()
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(42, 42)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("0c1416")
	material.roughness = 0.92
	ground.material_override = material
	world_root.add_child(ground)
	var car: Dictionary = content["cars"][selected_car]
	menu_car = load("res://" + car["lods"]["2"]).instantiate()
	world_root.add_child(menu_car)
	var weapon: Node3D = load("res://" + content["weapons"][selected_weapon]["lods"]["3"]).instantiate()
	weapon.scale = Vector3.ONE * 0.32
	weapon.position = Vector3(0, car["dimensions"]["height"] + 0.02, -0.25)
	menu_car.add_child(weapon)
	camera.global_position = Vector3(7.2, 2.7, 7.2)
	camera.look_at(Vector3(0, 0.75, 0), Vector3.UP)
	camera.fov = 48.0
	ui.show_menu()

func _on_selection_changed(category: String, index: int) -> void:
	match category:
		"car": selected_car = index
		"track": selected_track = index
		"weapon": selected_weapon = index
	show_garage()

func start_race() -> void:
	get_tree().paused = false
	_new_world()
	state = "countdown"
	ui.show_race()
	var track_record: Dictionary = content["tracks"][selected_track]
	var track_data: Dictionary = _load_json("res://" + track_record["manifest"])
	course = TrackScript.new()
	world_root.add_child(course)
	course.setup(track_data)
	for index in range(4):
		var car_index: int = (selected_car + index * 3) % content["cars"].size()
		var weapon_index: int = (selected_weapon + index) % content["weapons"].size()
		var vehicle: CharacterBody3D = VehicleScript.new()
		vehicle.name = "Player" if index == 0 else "AI_%d" % index
		world_root.add_child(vehicle)
		vehicle.setup(content["cars"][car_index], content["weapons"][weapon_index], course, index == 0, index + 1)
		var grid: Dictionary = track_data["grid"][index]
		var point: Array = grid["position"]
		vehicle.global_transform = Transform3D(Basis(Vector3.UP, grid["yaw"]), Vector3(point[0], point[1] + 0.18, point[2]))
		vehicle.total_laps = 2
		vehicle.tracer_fired.connect(_on_tracer)
		vehicle.impact_occurred.connect(_on_impact)
		vehicle.missile_requested.connect(_on_missile)
		vehicle.destroyed.connect(_on_destroyed)
		vehicle.finished.connect(_on_vehicle_finished)
		racers.append(vehicle)
	for vehicle in racers:
		vehicle.opponents = racers
	player = racers[0]
	player_position = 1
	countdown = 3.0
	countdown_number = -1
	_update_race_camera(1.0, true)
	ui.set_message("3")
	_play_ui_sound("race-countdown", -7.0)

func _process(delta: float) -> void:
	if state == "menu" and is_instance_valid(menu_car):
		menu_car.rotation.y += delta * 0.12
	if state == "countdown":
		countdown -= delta
		var number: int = maxi(1, int(ceil(countdown)))
		if number != countdown_number and countdown > 0.35:
			countdown_number = number
			ui.set_message(str(number))
			if number < 3:
				_play_ui_sound("race-countdown", -7.0)
		if countdown <= 0.0:
			_begin_racing()
	if state == "countdown" or state == "racing" or state == "results":
		if is_instance_valid(player):
			_update_race_camera(delta)
	if state == "racing" and is_instance_valid(player):
		standings_refresh -= delta
		if standings_refresh <= 0.0:
			standings_refresh = 0.15
			_update_standings()
		ui.update_hud(player, player_position, racers.size())

func _begin_racing() -> void:
	state = "racing"
	for vehicle in racers:
		vehicle.race_active = true
	ui.set_message("GO", 0.9)
	_play_ui_sound("race-go", -5.0)

func _update_race_camera(delta: float, snap: bool = false) -> void:
	if not is_instance_valid(player):
		return
	var forward: Vector3 = player.global_basis.z.normalized()
	var desired: Vector3 = player.global_position - forward * 8.2 + Vector3.UP * 3.1
	var target: Vector3 = player.global_position + Vector3.UP * 0.9 + forward * 3.6
	if snap:
		camera.global_position = desired
	else:
		camera.global_position = camera.global_position.lerp(desired, 1.0 - exp(-delta * 6.0))
	camera.look_at(target, Vector3.UP)
	var speed_ratio: float = clampf(player.speed_kph / 3.6 / player.max_speed, 0.0, 1.0)
	camera.fov = lerpf(camera.fov, 61.0 + speed_ratio * 8.0 + (4.0 if player.boosting else 0.0), clampf(delta * 4.0, 0.0, 1.0))

func _update_standings() -> void:
	var ordered: Array = racers.duplicate()
	ordered.sort_custom(func(a: CharacterBody3D, b: CharacterBody3D): return a.race_progress() > b.race_progress())
	player_position = ordered.find(player) + 1

func _on_vehicle_finished(vehicle: CharacterBody3D) -> void:
	if vehicle != player:
		return
	_update_standings()
	state = "results"
	for racer in racers:
		racer.race_active = false
	ui.show_results(player, player_position, racers.size())
	_play_ui_sound("race-go", -6.0)

func pause_race() -> void:
	if state != "racing" and state != "countdown":
		return
	previous_state = state
	state = "paused"
	get_tree().paused = true
	ui.show_pause()

func resume_race() -> void:
	if state != "paused":
		return
	get_tree().paused = false
	state = previous_state
	ui.show_race()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if state == "paused":
			resume_race()
		else:
			pause_race()

func _on_tracer(start: Vector3, finish: Vector3, color: Color) -> void:
	var mesh := ImmediateMesh.new()
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	mesh.surface_add_vertex(start)
	mesh.surface_add_vertex(finish)
	mesh.surface_end()
	mesh.surface_set_material(0, material)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	world_root.add_child(instance)
	get_tree().create_timer(0.07).timeout.connect(instance.queue_free)

func _on_impact(world_position: Vector3, heavy: bool) -> void:
	_spawn_flipbook("explosion" if heavy else "impact-flash", world_position, 7.2 if heavy else 4.0)
	_play_spatial_sound("explosion" if heavy else "heavy-impact", world_position, -7.0 if heavy else -18.0)

func _on_destroyed(vehicle: CharacterBody3D, _attacker: CharacterBody3D) -> void:
	_spawn_flipbook("explosion", vehicle.global_position + Vector3.UP, 8.0)
	_play_spatial_sound("explosion", vehicle.global_position, -5.0)
	if vehicle == player:
		ui.set_message("DESTROYED  /  RESPAWNING", 2.6)

func _on_missile(vehicle: CharacterBody3D, target: CharacterBody3D) -> void:
	var missile: Node3D = MissileScript.new()
	world_root.add_child(missile)
	missile.global_position = vehicle.weapon_root.global_position + Vector3.UP * 0.25
	missile.configure(vehicle, target, content["projectile"], vehicle.global_basis.z)
	missile.detonated.connect(_on_missile_detonated)

func _on_missile_detonated(world_position: Vector3) -> void:
	_spawn_flipbook("explosion", world_position, 7.2)
	_play_spatial_sound("explosion", world_position, -6.0)

func _spawn_flipbook(id: String, world_position: Vector3, size: float) -> void:
	for effect in content["effects"]:
		if effect["id"] == id:
			var sprite: Sprite3D = FlipbookScript.new()
			world_root.add_child(sprite)
			sprite.global_position = world_position
			sprite.configure(effect, size)
			return

func _play_ui_sound(id: String, volume: float = -8.0) -> void:
	var stream: AudioStream = _sound_stream(id)
	if stream == null:
		return
	var player_node := AudioStreamPlayer.new()
	player_node.stream = stream
	player_node.volume_db = volume
	add_child(player_node)
	player_node.finished.connect(player_node.queue_free)
	player_node.play()

func _play_spatial_sound(id: String, world_position: Vector3, volume: float = -8.0) -> void:
	var stream: AudioStream = _sound_stream(id)
	if stream == null:
		return
	var player_node := AudioStreamPlayer3D.new()
	player_node.stream = stream
	player_node.volume_db = volume
	player_node.unit_size = 14.0
	player_node.max_distance = 180.0
	world_root.add_child(player_node)
	player_node.global_position = world_position
	player_node.finished.connect(player_node.queue_free)
	player_node.play()

func _sound_stream(id: String) -> AudioStream:
	for sound in content["audio"]:
		if sound["id"] == id:
			return load("res://" + sound["runtime"])
	return null

func _load_json(path: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(path))

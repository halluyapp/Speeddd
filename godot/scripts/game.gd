extends Node3D

const TrackScript = preload("res://scripts/track.gd")
const VehicleScript = preload("res://scripts/vehicle.gd")
const UIScript = preload("res://scripts/ui.gd")
const SaveScript = preload("res://scripts/save_manager.gd")

var content: Dictionary = {}
var save_path_override: String = ""
var save: RefCounted
var world_root: Node3D
var camera: Camera3D
var key_light: DirectionalLight3D
var ui: CanvasLayer
var course: Node3D
var player: CharacterBody3D
var racers: Array = []
var menu_car: Node3D
var menu_headlights: Array = []
var selected_car: int = 0
var selected_track: int = 0
var selected_mode: String = "quick"
var selected_laps: int = 2
var selected_difficulty: String = "club"
var selected_paint: Color = Color("c7352b")
var state: String = "boot"
var menu_page: String = "home"
var previous_state: String = "racing"
var countdown: float = 0.0
var countdown_number: int = -1
var standings_refresh: float = 0.0
var player_position: int = 1
var finish_order: Array = []
var studio_time: float = 0.0
var cinematic_time: float = 0.0
var cinematic_duration: float = 7.0
var camera_mode: int = 0
var loading_in_progress: bool = false
var menu_zoom: float = 1.0
var last_new_record: bool = false
var previous_best: float = 0.0
var menu_input_cooldown: float = 0.0

func _ready() -> void:
	save = SaveScript.new()
	if not save_path_override.is_empty():
		save.save_path = save_path_override
	save.load_data()
	selected_paint = Color(str(save.data["selection"]["paint"]))
	_setup_input()
	_setup_audio_buses()
	content = _load_json("res://assets/content.json")
	_setup_environment()
	_apply_settings()
	camera = Camera3D.new()
	camera.name = "PresentationCamera"
	camera.current = true
	camera.near = 0.09
	camera.far = 2600.0
	camera.fov = 58.0
	add_child(camera)
	ui = UIScript.new()
	ui.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(ui)
	ui.setup(content, save.data)
	ui.start_requested.connect(start_race)
	ui.restart_requested.connect(restart_race)
	ui.garage_requested.connect(show_garage)
	ui.home_requested.connect(show_home)
	ui.pause_requested.connect(pause_race)
	ui.resume_requested.connect(resume_race)
	ui.navigation_requested.connect(navigate)
	ui.selection_changed.connect(_on_selection_changed)
	ui.setting_changed.connect(set_setting)
	ui.paint_selected.connect(set_paint)
	ui.profile_saved.connect(save_profile)
	ui.intro_finished.connect(finish_cinematic)
	ui.camera_requested.connect(cycle_camera)
	ui.inspection_requested.connect(_on_inspection)
	show_studio()

func _setup_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("071016")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b9cfda")
	environment.ambient_light_energy = 0.68
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)
	key_light = DirectionalLight3D.new()
	key_light.name = "KeyLight"
	key_light.rotation_degrees = Vector3(-52, -32, 0)
	key_light.light_energy = 1.25
	key_light.shadow_enabled = false
	add_child(key_light)

func _setup_input() -> void:
	var keys: Dictionary = {
		"throttle": [KEY_W, KEY_UP],
		"brake": [KEY_S, KEY_DOWN],
		"steer_left": [KEY_A, KEY_LEFT],
		"steer_right": [KEY_D, KEY_RIGHT],
		"drift": [KEY_SPACE],
		"pause": [KEY_ESCAPE],
		"camera": [KEY_C],
	}
	for action in keys:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in keys[action]:
			var event := InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action, event)

func _setup_audio_buses() -> void:
	for bus_name in ["Engines", "Effects", "Music"]:
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		AudioServer.add_bus()
		var index: int = AudioServer.bus_count - 1
		AudioServer.set_bus_name(index, bus_name)
		AudioServer.set_bus_send(index, "Master")

func _apply_settings() -> void:
	if save == null:
		return
	var settings: Dictionary = save.data["settings"]
	var balanced: bool = settings["graphics"] == "balanced"
	Engine.max_fps = 60 if balanced and not OS.has_feature("mobile") else 30
	if is_instance_valid(key_light):
		key_light.shadow_enabled = balanced
	get_viewport().msaa_3d = Viewport.MSAA_2X if balanced else Viewport.MSAA_DISABLED
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(0.001, settings["masterVolume"])))
	for pair in [["Engines", "engineVolume"], ["Effects", "effectsVolume"], ["Music", "musicVolume"]]:
		var index: int = AudioServer.get_bus_index(pair[0])
		if index >= 0:
			AudioServer.set_bus_volume_db(index, linear_to_db(maxf(0.001, settings[pair[1]])))
	if is_instance_valid(ui):
		ui.apply_settings(settings)

func set_setting(key: String, value: Variant) -> void:
	if not save.data["settings"].has(key):
		return
	save.data["settings"][key] = value
	save.save_data()
	_apply_settings()
	if key == "graphics" and state == "menu":
		_build_garage_world()
		_set_menu_camera(true)
		ui.show_page(menu_page, _menu_context())

func set_paint(value: String) -> void:
	selected_paint = Color(value)
	save.data["selection"]["paint"] = value
	save.save_data()
	if state == "menu":
		_build_garage_world()
		_set_menu_camera(true)
		ui.show_page(menu_page, _menu_context())

func _new_world() -> void:
	if is_instance_valid(world_root):
		_stop_audio(world_root)
		remove_child(world_root)
		world_root.queue_free()
	world_root = Node3D.new()
	world_root.name = "RuntimeWorld"
	add_child(world_root)
	racers.clear()
	finish_order.clear()
	player = null
	course = null
	menu_car = null
	menu_headlights.clear()

func show_studio() -> void:
	state = "studio"
	studio_time = 0.0
	ui.show_studio()
	_play_ui_sound("race-countdown", -20.0)

func _start_cinematic() -> void:
	_build_garage_world()
	state = "cinematic"
	cinematic_time = 0.0
	cinematic_duration = 4.8 if save.data["settings"]["graphics"] == "low" else 7.0
	ui.show_cinematic(save.data["settings"]["graphics"] == "low")
	_update_cinematic_camera(0.0)

func finish_cinematic() -> void:
	if state != "cinematic" and state != "studio":
		return
	save.data["profile"]["introSeen"] = true
	save.save_data()
	if not save.data["profile"].get("profileCreated", false):
		state = "profile"
		ui.show_profile(str(save.data["profile"]["name"]))
	else:
		show_home()

func save_profile(driver_name: String) -> void:
	var clean_name: String = driver_name.strip_edges().substr(0, 18)
	save.data["profile"]["name"] = "DRIVER 01" if clean_name.is_empty() else clean_name.to_upper()
	save.data["profile"]["profileCreated"] = true
	save.data["profile"]["introSeen"] = true
	save.save_data()
	show_home()

func _build_garage_world() -> void:
	get_tree().paused = false
	_new_world()
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(54, 54)
	ground.mesh = plane
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color("0b1218")
	ground_material.metallic = 0.32
	ground_material.roughness = 0.36
	ground.material_override = ground_material
	world_root.add_child(ground)
	var platform := MeshInstance3D.new()
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 3.55
	cylinder.bottom_radius = 3.55
	cylinder.height = 0.08
	cylinder.radial_segments = 64
	platform.mesh = cylinder
	platform.position.y = -0.035
	var platform_material := StandardMaterial3D.new()
	platform_material.albedo_color = Color("111c23")
	platform_material.metallic = 0.5
	platform_material.roughness = 0.28
	platform.material_override = platform_material
	world_root.add_child(platform)
	_build_garage_architecture()
	var car: Dictionary = content["cars"][selected_car]
	var lod_key: String = "1" if save.data["settings"]["graphics"] == "balanced" else "2"
	var car_scene: PackedScene = load("res://" + car["lods"][lod_key])
	menu_car = car_scene.instantiate()
	menu_car.name = "GarageCar"
	world_root.add_child(menu_car)
	_apply_paint(menu_car, selected_paint, car)
	_add_menu_headlights(car)
	menu_zoom = 1.0

func _build_garage_architecture() -> void:
	var wall_material := StandardMaterial3D.new()
	wall_material.albedo_color = Color("0a1118")
	wall_material.roughness = 0.8
	var wall := MeshInstance3D.new()
	var wall_mesh := BoxMesh.new()
	wall_mesh.size = Vector3(24, 6, 0.25)
	wall.mesh = wall_mesh
	wall.material_override = wall_material
	wall.position = Vector3(0, 3, -8)
	world_root.add_child(wall)
	var strip_material := StandardMaterial3D.new()
	strip_material.albedo_color = Color("ff5b35")
	strip_material.emission_enabled = true
	strip_material.emission = Color("ff5b35")
	strip_material.emission_energy_multiplier = 1.8
	for x in [-7.5, -4.5, 4.5, 7.5]:
		var strip := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(0.055, 3.8, 0.05)
		strip.mesh = mesh
		strip.material_override = strip_material
		strip.position = Vector3(x, 2.2, -7.84)
		world_root.add_child(strip)
	var light_material := StandardMaterial3D.new()
	light_material.albedo_color = Color("d8edf2")
	light_material.emission_enabled = true
	light_material.emission = Color("d8edf2")
	light_material.emission_energy_multiplier = 2.0
	for z in [-2.8, 2.8]:
		var fixture := MeshInstance3D.new()
		var fixture_mesh := BoxMesh.new()
		fixture_mesh.size = Vector3(4.8, 0.06, 0.3)
		fixture.mesh = fixture_mesh
		fixture.material_override = light_material
		fixture.position = Vector3(0, 4.2, z)
		world_root.add_child(fixture)
	var garage_light := OmniLight3D.new()
	garage_light.position = Vector3(0, 3.8, 1.2)
	garage_light.light_color = Color("d8edf2")
	garage_light.light_energy = 2.1
	garage_light.omni_range = 12.0
	garage_light.shadow_enabled = false
	world_root.add_child(garage_light)
	var rim_light := OmniLight3D.new()
	rim_light.position = Vector3(-3.5, 1.8, -2.5)
	rim_light.light_color = Color("ff6a42")
	rim_light.light_energy = 1.6
	rim_light.omni_range = 9.0
	world_root.add_child(rim_light)

func _add_menu_headlights(car: Dictionary) -> void:
	for x in [-0.67, 0.67]:
		var light := SpotLight3D.new()
		light.position = Vector3(x, 0.62, car["dimensions"]["length"] * 0.42)
		light.rotation.y = PI
		light.light_color = Color("d9f2ff")
		light.light_energy = 0.0
		light.spot_range = 16.0
		light.spot_angle = 32.0
		light.shadow_enabled = false
		menu_car.add_child(light)
		menu_headlights.append(light)

func _apply_paint(node: Node, color: Color, car: Dictionary) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in range(node.mesh.get_surface_count()):
			var material: Material = node.get_active_material(surface)
			if material != null and material.resource_name in car.get("paintMaterials", []):
				var paint: StandardMaterial3D = material.duplicate()
				paint.albedo_color = color
				paint.metallic = 0.68
				paint.roughness = 0.24
				node.set_surface_override_material(surface, paint)
	for child in node.get_children():
		_apply_paint(child, color, car)

func _process(delta: float) -> void:
	menu_input_cooldown = maxf(0.0, menu_input_cooldown - delta)
	if state == "studio":
		studio_time += delta
		var duration: float = 0.45 if save.data["profile"].get("introSeen", false) else 2.0
		if studio_time >= duration:
			_start_cinematic()
	elif state == "cinematic":
		cinematic_time += delta
		_update_cinematic_camera(delta)
		if cinematic_time >= cinematic_duration:
			finish_cinematic()
	elif state == "menu" and is_instance_valid(menu_car):
		if menu_page == "home" and menu_input_cooldown <= 0.0:
			menu_car.rotation.y += delta * 0.09
		for light in menu_headlights:
			light.light_energy = lerpf(light.light_energy, 1.3, clampf(delta * 2.0, 0.0, 1.0))
	if state == "countdown":
		countdown -= delta
		var number: int = maxi(1, int(ceil(countdown)))
		if number != countdown_number and countdown > 0.25:
			countdown_number = number
			ui.set_message(str(number))
			ui.set_start_lights(4 - number)
			if number < 3:
				_play_ui_sound("race-countdown", -7.0)
		if countdown <= 0.0:
			_begin_racing()
	if state == "countdown" or state == "racing" or state == "results":
		if is_instance_valid(player):
			_update_race_camera(delta)
	if (state == "racing" or state == "countdown") and is_instance_valid(player):
		standings_refresh -= delta
		if standings_refresh <= 0.0:
			standings_refresh = 0.15
			_update_standings()
		ui.update_hud(player, player_position, racers.size(), selected_mode)

func _update_cinematic_camera(_delta: float) -> void:
	if not is_instance_valid(menu_car):
		return
	var progress: float = clampf(cinematic_time / cinematic_duration, 0.0, 1.0)
	var positions: Array[Vector3] = [Vector3(1.15, 0.72, 3.1), Vector3(3.0, 0.55, 2.25), Vector3(-3.2, 1.15, 0.9), Vector3(-2.0, 0.68, -3.25), Vector3(6.9, 2.5, 7.1)]
	var targets: Array[Vector3] = [Vector3(0.62, 0.62, 1.75), Vector3(0.0, 0.52, 0.9), Vector3(0.0, 0.72, 0.0), Vector3(0.0, 0.48, -1.25), Vector3(0.0, 0.72, 0.0)]
	var scaled: float = progress * float(positions.size() - 1)
	var index: int = mini(int(scaled), positions.size() - 2)
	var blend: float = smoothstep(0.0, 1.0, scaled - index)
	camera.global_position = positions[index].lerp(positions[index + 1], blend)
	camera.look_at(targets[index].lerp(targets[index + 1], blend), Vector3.UP)
	camera.fov = lerpf(42.0, 49.0, progress)
	for light in menu_headlights:
		light.light_energy = clampf(cinematic_time * 1.4, 0.0, 1.8)

func navigate(page: String) -> void:
	if state == "loading":
		return
	get_tree().paused = false
	if state != "menu":
		_build_garage_world()
	state = "menu"
	menu_page = page
	_set_menu_camera(true)
	ui.show_page(page, _menu_context())

func show_home() -> void:
	navigate("home")

func show_garage() -> void:
	navigate("garage")

func _set_menu_camera(snap: bool = false) -> void:
	if not is_instance_valid(camera):
		return
	var desired := Vector3(6.9, 2.45, 7.1) * menu_zoom
	if snap:
		camera.global_position = desired
	else:
		camera.global_position = camera.global_position.lerp(desired, 0.2)
	camera.look_at(Vector3(0, 0.72, 0), Vector3.UP)
	camera.fov = 48.0

func _on_inspection(action: String) -> void:
	if state != "menu" or not is_instance_valid(menu_car):
		return
	menu_input_cooldown = 4.0
	match action:
		"zoom_in": menu_zoom = maxf(0.72, menu_zoom - 0.1)
		"zoom_out": menu_zoom = minf(1.35, menu_zoom + 0.1)
	var desired := Vector3(6.9, 2.45, 7.1) * menu_zoom
	var target := Vector3(0, 0.72, 0)
	match action:
		"front": desired = Vector3(0, 1.25, 6.4) * menu_zoom
		"side": desired = Vector3(6.4, 1.15, 0) * menu_zoom
		"rear": desired = Vector3(0, 1.25, -6.4) * menu_zoom
		"cabin":
			desired = Vector3(1.75, 1.25, 0.55) * menu_zoom
			target = Vector3(0, 0.86, 0.2)
	camera.global_position = desired
	camera.look_at(target, Vector3.UP)
	camera.fov = 44.0 if action == "cabin" else 48.0

func _menu_context() -> Dictionary:
	return {
		"save": save.data,
		"selectedMode": selected_mode,
		"selectedLaps": selected_laps,
		"selectedDifficulty": selected_difficulty,
		"selectedPaint": "#" + selected_paint.to_html(false),
		"track": content["tracks"][selected_track],
		"car": content["cars"][selected_car],
	}

func _on_selection_changed(category: String, index: int) -> void:
	match category:
		"car": selected_car = clampi(index, 0, content["cars"].size() - 1)
		"track": selected_track = clampi(index, 0, content["tracks"].size() - 1)
		"laps": selected_laps = [1, 2, 3][clampi(index, 0, 2)]
		"difficulty": selected_difficulty = ["rookie", "club", "pro"][clampi(index, 0, 2)]
		"mode": selected_mode = "time" if index == 1 else "quick"
	ui.show_page(menu_page, _menu_context())

func start_race(mode: String = "quick") -> void:
	if loading_in_progress:
		return
	loading_in_progress = true
	selected_mode = mode
	get_tree().paused = false
	state = "loading"
	var track_record: Dictionary = content["tracks"][selected_track]
	ui.show_loading(track_record, selected_mode)
	_new_world()
	await get_tree().process_frame
	ui.set_loading(0.1, "READING CIRCUIT DATA")
	var track_data: Dictionary = _load_json("res://" + track_record["manifest"])
	await get_tree().process_frame
	ui.set_loading(0.28, "LOADING AZURE COAST")
	var graphics: String = save.data["settings"]["graphics"]
	var track_scene: PackedScene = load("res://" + track_data["lods"]["3" if graphics == "low" else "2"])
	await get_tree().process_frame
	ui.set_loading(0.52, "PREPARING ROAD COLLISION")
	var collision_scene: PackedScene = load("res://" + track_data["collision"])
	await get_tree().process_frame
	ui.set_loading(0.7, "LOADING CORSA RS")
	var car: Dictionary = content["cars"][selected_car]
	car["rigData"] = _load_json("res://" + car["rig"])
	var player_scene: PackedScene = load("res://" + car["lods"]["3" if graphics == "low" else "2"])
	await get_tree().process_frame
	ui.set_loading(0.86, "INITIALIZING COMPETITORS" if selected_mode == "quick" else "PREPARING TIMING SYSTEM")
	var ai_scene: PackedScene = load("res://" + car["lods"]["3"])
	await get_tree().process_frame
	_build_race(track_data, track_scene, collision_scene, player_scene, ai_scene)
	ui.set_loading(1.0, "RACE READY")
	loading_in_progress = false

func _build_race(track_data: Dictionary, track_scene: PackedScene, collision_scene: PackedScene, player_scene: PackedScene, ai_scene: PackedScene) -> void:
	course = TrackScript.new()
	world_root.add_child(course)
	course.setup(track_data, track_scene, collision_scene, save.data["settings"]["graphics"])
	var racer_count: int = 4 if selected_mode == "quick" else 1
	var ai_names: Array = ["M. KESTREL", "J. NOVA", "A. VECTOR"]
	var ai_paints: Array = [Color("d7e0e4"), Color("23648a"), Color("e0a43a")]
	for index in range(racer_count):
		var is_player_car: bool = index == 0
		var vehicle: CharacterBody3D = VehicleScript.new()
		vehicle.name = "Player" if is_player_car else "AI_%d" % index
		world_root.add_child(vehicle)
		var paint: Color = selected_paint if is_player_car else ai_paints[index - 1]
		vehicle.setup(content["cars"][selected_car], course, is_player_car, index + 1, player_scene if is_player_car else ai_scene, paint, selected_difficulty, save.data["settings"]["drivingProfile"], save.data["settings"]["assists"])
		vehicle.driver_name = str(save.data["profile"]["name"]) if is_player_car else ai_names[index - 1]
		vehicle.steering_sensitivity = save.data["settings"]["steeringSensitivity"]
		var grid_index: int = 3 if is_player_car and racer_count > 1 else maxi(0, index - 1)
		var grid: Dictionary = track_data["grid"][grid_index]
		var point: Array = grid["position"]
		vehicle.global_transform = Transform3D(Basis(Vector3.UP, grid["yaw"]), Vector3(point[0], point[1] + 0.18, point[2]))
		vehicle.total_laps = selected_laps
		vehicle.finished.connect(_on_vehicle_finished)
		vehicle.impact_occurred.connect(_on_impact)
		vehicle.recovered.connect(_on_recovered)
		racers.append(vehicle)
	for vehicle in racers:
		vehicle.opponents = racers
	player = racers[0]
	player_position = racer_count
	countdown = 3.0
	countdown_number = -1
	camera_mode = 0
	state = "countdown"
	_update_race_camera(1.0, true)
	ui.show_race(course, racers, player, selected_mode)
	ui.set_message("3")
	ui.set_start_lights(0)
	_play_ui_sound("race-countdown", -7.0)
	_start_ambience()

func _begin_racing() -> void:
	state = "racing"
	for vehicle in racers:
		vehicle.race_active = true
	ui.set_message("GO", 0.9)
	ui.set_start_lights(4)
	_play_ui_sound("race-go", -5.0)

func _update_race_camera(delta: float, snap: bool = false) -> void:
	if not is_instance_valid(player):
		return
	var forward: Vector3 = player.global_basis.z.normalized()
	var right: Vector3 = player.global_basis.x.normalized()
	var target: Vector3 = player.global_position + Vector3.UP * 0.9 + forward * 3.6
	var desired: Vector3 = player.global_position - forward * 8.0 + Vector3.UP * 3.0
	if state == "countdown" and countdown > 2.15:
		desired = player.global_position + forward * 5.5 + right * 4.0 + Vector3.UP * 1.8
		target = player.global_position + Vector3.UP * 0.65
	elif camera_mode == 1:
		desired = player.global_position + forward * 0.82 + Vector3.UP * 1.08
		target = player.global_position + forward * 32.0 + Vector3.UP * 0.92
	elif camera_mode == 2:
		desired = player.global_position + forward * 2.0 + Vector3.UP * 0.43
		target = player.global_position + forward * 32.0 + Vector3.UP * 0.58
	if camera_mode == 0 and not (state == "countdown" and countdown > 2.15):
		var query := PhysicsRayQueryParameters3D.create(target, desired, 1)
		var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
		if not hit.is_empty():
			desired = hit["position"] + hit["normal"] * 0.35
	if snap:
		camera.global_position = desired
	else:
		camera.global_position = camera.global_position.lerp(desired, 1.0 - exp(-delta * (12.0 if camera_mode > 0 else 6.5)))
	camera.look_at(target, Vector3.UP)
	var speed_ratio: float = clampf(player.speed_kph / 3.6 / player.max_speed, 0.0, 1.0)
	camera.fov = lerpf(camera.fov, 58.0 + speed_ratio * 9.0, clampf(delta * 4.0, 0.0, 1.0))

func cycle_camera() -> void:
	if state != "racing" and state != "countdown":
		return
	camera_mode = (camera_mode + 1) % 3
	ui.set_message(["CHASE CAMERA", "HOOD CAMERA", "BUMPER CAMERA"][camera_mode], 1.0)

func _update_standings() -> void:
	var ordered: Array = racers.duplicate()
	ordered.sort_custom(func(a: CharacterBody3D, b: CharacterBody3D):
		if a.is_finished and b.is_finished:
			return a.finish_position < b.finish_position
		if a.is_finished != b.is_finished:
			return a.is_finished
		return a.race_progress() > b.race_progress()
	)
	player_position = ordered.find(player) + 1

func _on_vehicle_finished(vehicle: CharacterBody3D) -> void:
	if vehicle in finish_order:
		return
	finish_order.append(vehicle)
	vehicle.finish_position = finish_order.size()
	if vehicle != player:
		return
	_update_standings()
	player_position = vehicle.finish_position
	state = "results"
	for racer in racers:
		racer.race_active = false
	previous_best = save.best_lap(course.data["id"], selected_mode)
	last_new_record = save.record_race(course.data["id"], selected_mode, player_position, player.best_lap, player.race_time)
	ui.show_results(player, player_position, racers.size(), selected_mode, last_new_record, previous_best)
	_play_ui_sound("race-go", -6.0)

func restart_race() -> void:
	start_race(selected_mode)

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
	ui.restore_race()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if state == "paused":
			resume_race()
		else:
			pause_race()
	if event.is_action_pressed("camera"):
		cycle_camera()
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventKey and event.pressed):
		if state == "studio":
			_start_cinematic()
		elif state == "cinematic":
			finish_cinematic()
	if state == "menu" and is_instance_valid(menu_car):
		if event is InputEventScreenDrag:
			menu_car.rotation.y += event.relative.x * 0.012
			menu_input_cooldown = 3.0
		if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			menu_car.rotation.y += event.relative.x * 0.008
			menu_input_cooldown = 3.0
		if event is InputEventMouseButton and event.pressed:
			if event.button_index == MOUSE_BUTTON_WHEEL_UP:
				menu_zoom = maxf(0.72, menu_zoom - 0.08)
				_set_menu_camera(true)
			if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				menu_zoom = minf(1.35, menu_zoom + 0.08)
				_set_menu_camera(true)

func _on_impact(world_position: Vector3, intensity: float) -> void:
	_play_spatial_sound("heavy-impact", world_position, lerpf(-24.0, -8.0, intensity))

func _on_recovered(vehicle: CharacterBody3D) -> void:
	if vehicle == player:
		ui.set_message("BACK ON TRACK", 1.4)

func _start_ambience() -> void:
	var stream: AudioStream = _sound_stream("coastal-wind-loop")
	if stream == null:
		return
	var ambience := AudioStreamPlayer.new()
	ambience.stream = stream.duplicate()
	if ambience.stream is AudioStreamWAV:
		ambience.stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		ambience.stream.loop_end = int(ambience.stream.get_length() * ambience.stream.mix_rate)
	ambience.bus = "Music"
	ambience.volume_db = -26.0
	world_root.add_child(ambience)
	ambience.play()

func _play_ui_sound(id: String, volume: float = -8.0) -> void:
	var stream: AudioStream = _sound_stream(id)
	if stream == null:
		return
	var player_node := AudioStreamPlayer.new()
	player_node.stream = stream
	player_node.bus = "Effects"
	player_node.volume_db = volume
	add_child(player_node)
	player_node.finished.connect(player_node.queue_free)
	player_node.play()

func _play_spatial_sound(id: String, world_position: Vector3, volume: float = -8.0) -> void:
	var stream: AudioStream = _sound_stream(id)
	if stream == null or not is_instance_valid(world_root):
		return
	var player_node := AudioStreamPlayer3D.new()
	player_node.stream = stream
	player_node.bus = "Effects"
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

func _stop_audio(node: Node) -> void:
	if node is AudioStreamPlayer or node is AudioStreamPlayer3D:
		node.stop()
	for child in node.get_children():
		_stop_audio(child)

func _load_json(path: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(path))

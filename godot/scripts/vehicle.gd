extends CharacterBody3D

signal finished(vehicle: CharacterBody3D)
signal impact_occurred(world_position: Vector3, intensity: float)
signal recovered(vehicle: CharacterBody3D)

var car_data: Dictionary = {}
var course: Node3D
var opponents: Array = []
var is_player: bool = false
var driver_number: int = 1
var driver_name: String = "DRIVER"
var lane_offset: float = 0.0
var total_laps: int = 2
var difficulty: String = "club"
var driving_profile: String = "simcade"
var assists: bool = true
var steering_sensitivity: float = 1.0

var controls: Dictionary = {}
var visual: Node3D
var collision_shape: CollisionShape3D
var engine_idle: AudioStreamPlayer
var engine_high: AudioStreamPlayer
var tire_audio: AudioStreamPlayer
var wheel_nodes: Array = []
var paint_materials: Array = []
var max_speed: float = 58.0
var acceleration: float = 17.0
var speed_kph: float = 0.0
var route_index: int = 0
var next_checkpoint: int = 0
var last_checkpoint: int = 0
var laps_completed: int = 0
var crossed_start: bool = false
var race_active: bool = false
var is_finished: bool = false
var finish_position: int = 0
var race_time: float = 0.0
var best_lap: float = 0.0
var current_lap_time: float = 0.0
var lap_times: Array = []
var recovery_time: float = 0.0
var offroad: bool = false
var drifting: bool = false
var route_refresh: float = 0.0
var impact_cooldown: float = 0.0
var stuck_time: float = 0.0
var pass_offset: float = 0.0
var wheel_spin: float = 0.0
var last_forward_speed: float = 0.0
var body_acceleration: float = 0.0
var previous_speed: float = 0.0

func setup(vehicle_data: Dictionary, track: Node3D, player_controlled: bool, number: int, car_scene: PackedScene = null, paint: Color = Color("c7352b"), ai_difficulty: String = "club", profile: String = "simcade", driving_assists: bool = true) -> void:
	car_data = vehicle_data
	course = track
	is_player = player_controlled
	driver_number = number
	difficulty = ai_difficulty
	driving_profile = profile
	assists = driving_assists
	lane_offset = float((number % 3) - 1) * 1.7
	max_speed = clampf(car_data.get("performance", {}).get("topSpeed", 286) / 3.6 * 0.78, 46.0, 68.0)
	acceleration = 16.0 + clampf(car_data.get("performance", {}).get("handling", 87) - 85, -4.0, 10.0) * 0.3
	collision_layer = 2
	collision_mask = 3
	floor_snap_length = 0.9
	floor_max_angle = deg_to_rad(55.0)
	up_direction = Vector3.UP
	var dimensions: Dictionary = car_data["dimensions"]
	var shape := BoxShape3D.new()
	shape.size = Vector3(dimensions["width"] * 0.8, maxf(0.8, dimensions["height"] * 0.86), dimensions["length"] * 0.84)
	collision_shape = CollisionShape3D.new()
	collision_shape.shape = shape
	collision_shape.position.y = shape.size.y * 0.5
	add_child(collision_shape)
	if car_scene == null:
		var lod_key: String = "3" if OS.has_feature("mobile") or not is_player else "2"
		car_scene = load("res://" + car_data["lods"][lod_key])
	visual = car_scene.instantiate()
	visual.name = "VehicleVisual"
	add_child(visual)
	_apply_paint(visual, paint)
	_collect_wheels(visual)
	if is_player:
		_setup_engine_audio()

func _setup_engine_audio() -> void:
	engine_idle = AudioStreamPlayer.new()
	engine_high = AudioStreamPlayer.new()
	tire_audio = AudioStreamPlayer.new()
	engine_idle.stream = _looping_stream("res://assets/audio/runtime/engine-idle-loop.wav")
	engine_high.stream = _looping_stream("res://assets/audio/runtime/engine-high-loop.wav")
	tire_audio.stream = _looping_stream("res://assets/audio/runtime/tire-skid-loop.wav")
	engine_idle.volume_db = -19.0
	engine_high.volume_db = -60.0
	tire_audio.volume_db = -60.0
	add_child(engine_idle)
	add_child(engine_high)
	add_child(tire_audio)
	engine_idle.play()
	engine_high.play()
	tire_audio.play()

func _looping_stream(path: String) -> AudioStreamWAV:
	var stream: AudioStreamWAV = load(path).duplicate()
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = int(stream.get_length() * stream.mix_rate)
	return stream

func _physics_process(delta: float) -> void:
	impact_cooldown = maxf(0.0, impact_cooldown - delta)
	if recovery_time > 0.0:
		recovery_time -= delta
		if recovery_time <= 0.0:
			_respawn()
		_update_audio()
		return
	if course != null:
		route_index = course.advance_index(global_position, route_index)
	if is_player:
		controls = _player_controls()
	else:
		controls = _ai_controls(delta)
	if not race_active or is_finished:
		controls["throttle"] = 0.0
		controls["brake"] = 1.0
		controls["drift"] = false
	if race_active and not is_finished:
		race_time += delta
		current_lap_time += delta
	_update_movement(delta)
	if race_active and not is_finished:
		_update_checkpoints()
		_update_recovery(delta)
	_update_audio()

func _player_controls() -> Dictionary:
	return {
		"throttle": Input.get_action_strength("throttle"),
		"brake": Input.get_action_strength("brake"),
		"steer": (Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left")) * steering_sensitivity,
		"drift": Input.is_action_pressed("drift"),
	}

func _ai_controls(delta: float) -> Dictionary:
	if course == null:
		return {}
	var skill: float = {"rookie": 0.84, "club": 0.93, "pro": 1.0}.get(difficulty, 0.93)
	var desired_lane: float = lane_offset + pass_offset
	var target_data: Dictionary = course.drive_target(route_index, desired_lane)
	var local_target: Vector3 = to_local(target_data["position"])
	var angle: float = atan2(local_target.x, local_target.z)
	var forward_speed: float = maxf(0.0, velocity.dot(global_basis.z.normalized()))
	var desired_speed: float = target_data["speed"] * skill
	if absf(angle) > 0.32:
		desired_speed *= clampf(1.15 - absf(angle), 0.58, 1.0)
	var result: Dictionary = {
		"throttle": 1.0 if forward_speed < desired_speed else 0.0,
		"brake": clampf((forward_speed - desired_speed) / 8.0, 0.0, 1.0),
		"steer": clampf(angle * 2.35, -1.0, 1.0),
		"drift": false,
	}
	var avoiding: bool = false
	for opponent in opponents:
		if not is_instance_valid(opponent) or opponent == self:
			continue
		var local: Vector3 = to_local(opponent.global_position + Vector3.UP * 0.5)
		if local.z > 0.0 and local.z < 25.0 and absf(local.x) < 3.0:
			avoiding = true
			var passing_side: float = -1.0 if local.x > 0.0 else 1.0
			if absf(local.x) < 0.4:
				passing_side = -1.0 if driver_number % 2 == 0 else 1.0
			pass_offset = lerpf(pass_offset, passing_side * 3.4, clampf(delta * 1.8, 0.0, 1.0))
			if local.z < 8.0 and forward_speed > opponent.velocity.length() + 1.0:
				result["throttle"] = 0.0
				result["brake"] = maxf(result["brake"], 0.35)
	if not avoiding:
		pass_offset = lerpf(pass_offset, 0.0, clampf(delta * 0.7, 0.0, 1.0))
	return result

func _update_movement(delta: float) -> void:
	var throttle: float = controls.get("throttle", 0.0)
	var brake: float = controls.get("brake", 0.0)
	var steer: float = clampf(controls.get("steer", 0.0), -1.2, 1.2)
	drifting = controls.get("drift", false) and race_active
	var forward: Vector3 = global_basis.z.normalized()
	var right: Vector3 = global_basis.x.normalized()
	var forward_speed: float = velocity.dot(forward)
	var lateral_speed: float = velocity.dot(right)
	last_forward_speed = forward_speed
	if is_on_floor():
		var steering_speed: float = clampf(absf(forward_speed) / 6.0, 0.0, 1.0)
		var high_speed_limit: float = 1.0 - clampf(absf(forward_speed) / maxf(max_speed, 1.0), 0.0, 1.0) * 0.62
		var direction: float = 1.0 if forward_speed >= -0.5 else -1.0
		var steering_rate: float = 1.55 if driving_profile == "simcade" else 1.72
		rotation.y += steer * steering_rate * steering_speed * high_speed_limit * direction * delta
		forward = global_basis.z.normalized()
		right = global_basis.x.normalized()
		forward_speed = velocity.dot(forward)
		lateral_speed = velocity.dot(right)
		route_refresh -= delta
		if route_refresh <= 0.0 and course != null:
			route_refresh = 0.18
			offroad = course.route_distance(global_position, route_index) > course.data.get("roadWidth", 14.0) * 0.72
		var speed_limit: float = max_speed * (0.58 if offroad else 1.0)
		var engine_force: float = acceleration * (1.12 if driving_profile == "arcade" else 1.0)
		if assists and absf(lateral_speed) > 5.0:
			engine_force *= 0.72
		if throttle > 0.0:
			forward_speed = move_toward(forward_speed, speed_limit, engine_force * throttle * delta)
		if brake > 0.0:
			var brake_force: float = 34.0 if assists else 30.0
			if forward_speed > 1.0 or not race_active:
				forward_speed = move_toward(forward_speed, 0.0, brake_force * brake * delta)
			else:
				forward_speed = move_toward(forward_speed, -11.0, 9.0 * brake * delta)
		if throttle <= 0.01 and brake <= 0.01:
			forward_speed = move_toward(forward_speed, 0.0, (1.6 + absf(forward_speed) * 0.028) * delta)
		if drifting:
			forward_speed = move_toward(forward_speed, 0.0, 6.5 * delta)
		forward_speed = clampf(forward_speed, -11.0, speed_limit)
		var grip: float = 2.0 if drifting else (8.6 if driving_profile == "arcade" else 7.1)
		if offroad:
			grip *= 0.62
		if assists and not drifting:
			grip *= 1.12
		lateral_speed *= exp(-grip * delta)
		var planar: Vector3 = forward * forward_speed + right * lateral_speed
		velocity.x = planar.x
		velocity.z = planar.z
		velocity.y = -0.8
	else:
		drifting = false
		velocity.y -= 22.0 * delta
	move_and_slide()
	speed_kph = Vector2(velocity.x, velocity.z).length() * 3.6
	body_acceleration = lerpf(body_acceleration, (forward_speed - previous_speed) / maxf(delta, 0.001), clampf(delta * 5.0, 0.0, 1.0))
	previous_speed = forward_speed
	_animate_vehicle(delta, steer)
	for index in range(get_slide_collision_count()):
		var collision: KinematicCollision3D = get_slide_collision(index)
		if impact_cooldown <= 0.0 and speed_kph > 24.0 and absf(collision.get_normal().dot(forward)) < 0.75:
			impact_cooldown = 0.45
			impact_occurred.emit(collision.get_position(), clampf(speed_kph / 160.0, 0.2, 1.0))

func _animate_vehicle(delta: float, steer: float) -> void:
	wheel_spin += last_forward_speed * delta / 0.36
	for wheel in wheel_nodes:
		var node: Node3D = wheel["node"]
		node.transform = wheel["base"]
		if wheel["steering"]:
			node.rotate_object_local(Vector3.UP, -steer * 0.42)
		node.rotate_object_local(Vector3.RIGHT, wheel_spin)
	if visual != null:
		var speed_ratio: float = clampf(speed_kph / 220.0, 0.0, 1.0)
		visual.rotation.z = lerpf(visual.rotation.z, -steer * speed_ratio * 0.035, clampf(delta * 5.0, 0.0, 1.0))
		visual.rotation.x = lerpf(visual.rotation.x, clampf(-body_acceleration * 0.0015, -0.025, 0.025), clampf(delta * 4.0, 0.0, 1.0))

func _collect_wheels(node: Node) -> void:
	if node is Node3D:
		for wheel in car_data.get("rigData", {}).get("wheels", []):
			var source_name: String = wheel["sourceNode"]
			if node.name == source_name or node.name == source_name.replace(".", "_"):
				wheel_nodes.append({"node": node, "base": node.transform, "steering": wheel["steering"], "id": wheel["id"]})
	for child in node.get_children():
		_collect_wheels(child)

func _apply_paint(node: Node, color: Color) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in range(node.mesh.get_surface_count()):
			var material: Material = node.get_active_material(surface)
			if material != null and material.resource_name in car_data.get("paintMaterials", []):
				var paint: StandardMaterial3D = material.duplicate()
				paint.albedo_color = color
				paint.metallic = 0.68
				paint.roughness = 0.24
				node.set_surface_override_material(surface, paint)
				paint_materials.append(paint)
	for child in node.get_children():
		_apply_paint(child, color)

func _update_recovery(delta: float) -> void:
	if global_position.y < -40.0 or (course != null and global_position.y < course.data.get("bounds", {}).get("min", [-1000, -1000, -1000])[1] - 25.0):
		begin_recovery()
		return
	if race_active and speed_kph < 2.0 and controls.get("throttle", 0.0) > 0.5:
		stuck_time += delta
	else:
		stuck_time = maxf(0.0, stuck_time - delta * 2.0)
	if stuck_time > 5.0:
		begin_recovery()

func begin_recovery() -> void:
	if recovery_time > 0.0 or is_finished:
		return
	recovery_time = 1.25
	stuck_time = 0.0
	velocity = Vector3.ZERO
	collision_layer = 0
	collision_mask = 0

func _respawn() -> void:
	global_transform = course.checkpoint_transform(last_checkpoint)
	visible = true
	collision_layer = 2
	collision_mask = 3
	recovery_time = 0.0
	route_index = course.advance_index(global_position, int(float(last_checkpoint) / course.checkpoints.size() * course.centerline.size()))
	recovered.emit(self)

func _update_checkpoints() -> void:
	if course == null or course.checkpoints.is_empty():
		return
	var checkpoint: Dictionary = course.checkpoints[next_checkpoint]
	var point: Array = checkpoint["position"]
	var checkpoint_position := Vector3(point[0], point[1], point[2])
	var forward_data: Array = checkpoint["forward"]
	var checkpoint_forward := Vector3(forward_data[0], forward_data[1], forward_data[2]).normalized()
	var flat_difference := Vector2(global_position.x - checkpoint_position.x, global_position.z - checkpoint_position.z)
	var threshold: float = checkpoint.get("halfWidth", 7.0) + 2.0
	if flat_difference.length() > threshold or velocity.dot(checkpoint_forward) < 1.0:
		return
	last_checkpoint = next_checkpoint
	if next_checkpoint == 0:
		if crossed_start:
			laps_completed += 1
			lap_times.append(current_lap_time)
			if best_lap <= 0.0 or current_lap_time < best_lap:
				best_lap = current_lap_time
			current_lap_time = 0.0
			if laps_completed >= total_laps:
				is_finished = true
				race_active = false
				finished.emit(self)
		else:
			crossed_start = true
			current_lap_time = 0.0
	next_checkpoint = (next_checkpoint + 1) % course.checkpoints.size()

func race_progress() -> float:
	if course == null or course.centerline.is_empty():
		return 0.0
	return (float(laps_completed) + float(route_index) / float(course.centerline.size())) * course.data.get("length", 1.0)

func gear() -> String:
	var forward_speed: float = velocity.dot(global_basis.z.normalized())
	if forward_speed < -0.5:
		return "R"
	if speed_kph < 2.0:
		return "N"
	var ratio: float = clampf(speed_kph / (max_speed * 3.6), 0.0, 1.0)
	return str(clampi(int(ratio * 6.0) + 1, 1, 6))

func rpm_ratio() -> float:
	var ratio: float = clampf(speed_kph / (max_speed * 3.6), 0.0, 1.0)
	var within_gear: float = fmod(ratio * 6.0, 1.0)
	return clampf(0.25 + within_gear * 0.75 + controls.get("throttle", 0.0) * 0.08, 0.0, 1.0)

func _update_audio() -> void:
	if not is_player or engine_idle == null:
		return
	var ratio: float = rpm_ratio()
	engine_idle.pitch_scale = 0.75 + ratio * 0.7
	engine_high.pitch_scale = 0.75 + ratio * 0.95
	engine_idle.volume_db = lerpf(-18.0, -30.0, ratio)
	engine_high.volume_db = lerpf(-42.0, -15.0, ratio)
	var slipping: bool = drifting or (offroad and speed_kph > 35.0)
	tire_audio.volume_db = lerpf(tire_audio.volume_db, -20.0 if slipping else -60.0, 0.12)
	if recovery_time > 0.0:
		engine_idle.volume_db = -45.0
		engine_high.volume_db = -45.0
		tire_audio.volume_db = -60.0

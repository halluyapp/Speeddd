extends CharacterBody3D

signal tracer_fired(start: Vector3, finish: Vector3, color: Color)
signal impact_occurred(world_position: Vector3, heavy: bool)
signal missile_requested(vehicle: CharacterBody3D, target: CharacterBody3D)
signal destroyed(vehicle: CharacterBody3D, attacker: CharacterBody3D)
signal finished(vehicle: CharacterBody3D)

var car_data: Dictionary = {}
var weapon_data: Dictionary = {}
var course: Node3D
var opponents: Array = []
var is_player: bool = false
var driver_number: int = 1
var lane_offset: float = 0.0
var total_laps: int = 2

var controls: Dictionary = {}
var visual: Node3D
var weapon_root: Node3D
var collision_shape: CollisionShape3D
var engine_idle: AudioStreamPlayer
var engine_high: AudioStreamPlayer
var max_speed: float = 58.0
var acceleration: float = 20.0
var speed_kph: float = 0.0
var health: float = 100.0
var nitro: float = 65.0
var heat: float = 0.0
var missile_ammo: int = 4
var drift_score: float = 0.0
var takedowns: int = 0
var route_index: int = 0
var next_checkpoint: int = 0
var last_checkpoint: int = 0
var laps_completed: int = 0
var crossed_start: bool = false
var race_active: bool = false
var is_finished: bool = false
var race_time: float = 0.0
var best_lap: float = 0.0
var current_lap_time: float = 0.0
var respawn_time: float = 0.0
var invulnerability: float = 0.0
var weapon_cooldown: float = 0.0
var overheated: bool = false
var target: CharacterBody3D
var target_refresh: float = 0.0
var route_refresh: float = 0.0
var offroad: bool = false
var boosting: bool = false
var ai_aggression: float = 0.65

func setup(vehicle_data: Dictionary, selected_weapon: Dictionary, track: Node3D, player_controlled: bool, number: int) -> void:
	car_data = vehicle_data
	weapon_data = selected_weapon
	course = track
	is_player = player_controlled
	driver_number = number
	lane_offset = float((number % 3) - 1) * 2.1
	ai_aggression = 0.5 + float(number % 4) * 0.12
	max_speed = clampf(car_data.get("performance", {}).get("topSpeed", 300) / 3.6 * 0.78, 48.0, 70.0)
	acceleration = 18.0 + clampf(car_data.get("performance", {}).get("handling", 85) - 85, -5.0, 12.0) * 0.25
	collision_layer = 2
	collision_mask = 3
	floor_snap_length = 0.8
	floor_max_angle = deg_to_rad(55.0)
	up_direction = Vector3.UP
	var dimensions: Dictionary = car_data["dimensions"]
	var shape := BoxShape3D.new()
	shape.size = Vector3(dimensions["width"] * 0.8, maxf(0.8, dimensions["height"] * 0.86), dimensions["length"] * 0.84)
	collision_shape = CollisionShape3D.new()
	collision_shape.shape = shape
	collision_shape.position.y = shape.size.y * 0.5
	add_child(collision_shape)
	var lod_key: String = "3" if OS.has_feature("mobile") or not is_player else "2"
	visual = load("res://" + car_data["lods"][lod_key]).instantiate()
	visual.name = "VehicleVisual"
	add_child(visual)
	weapon_root = Node3D.new()
	weapon_root.name = "WeaponMount"
	weapon_root.position = Vector3(0, dimensions["height"] + 0.02, -0.25)
	add_child(weapon_root)
	var weapon_model: Node3D = load("res://" + weapon_data["lods"]["3"]).instantiate()
	weapon_model.scale = Vector3.ONE * 0.32
	weapon_root.add_child(weapon_model)
	if is_player:
		_setup_engine_audio()

func _setup_engine_audio() -> void:
	engine_idle = AudioStreamPlayer.new()
	engine_high = AudioStreamPlayer.new()
	engine_idle.stream = _looping_stream("res://assets/audio/runtime/engine-idle-loop.wav")
	engine_high.stream = _looping_stream("res://assets/audio/runtime/engine-high-loop.wav")
	engine_idle.volume_db = -19.0
	engine_high.volume_db = -60.0
	add_child(engine_idle)
	add_child(engine_high)
	engine_idle.play()
	engine_high.play()

func _looping_stream(path: String) -> AudioStreamWAV:
	var stream: AudioStreamWAV = load(path).duplicate()
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = int(stream.get_length() * stream.mix_rate)
	return stream

func _physics_process(delta: float) -> void:
	if respawn_time > 0.0:
		respawn_time -= delta
		if respawn_time <= 0.0:
			_respawn()
		return
	invulnerability = maxf(0.0, invulnerability - delta)
	weapon_cooldown = maxf(0.0, weapon_cooldown - delta)
	heat = maxf(0.0, heat - delta * (18.0 if weapon_data.get("id", "") == "rotary-cannon" else 24.0))
	if overheated and heat <= 35.0:
		overheated = false
	if course != null:
		route_index = course.advance_index(global_position, route_index)
	if is_player:
		controls = _player_controls()
	else:
		controls = _ai_controls(delta)
	if not race_active or is_finished:
		controls["throttle"] = 0.0
		controls["brake"] = 0.0
		controls["fire"] = false
		controls["nitro"] = false
	if race_active and not is_finished:
		race_time += delta
		current_lap_time += delta
	_update_movement(delta)
	_update_weapon(delta)
	if race_active and not is_finished:
		_update_checkpoints()
	if global_position.y < -40.0 or (course != null and global_position.y < course.data.get("bounds", {}).get("min", [-1000, -1000, -1000])[1] - 30.0):
		_begin_destroyed(null)
	_update_audio()

func _player_controls() -> Dictionary:
	return {
		"throttle": Input.get_action_strength("throttle"),
		"brake": Input.get_action_strength("brake"),
		"steer": Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left"),
		"drift": Input.is_action_pressed("drift"),
		"nitro": Input.is_action_pressed("nitro"),
		"fire": Input.is_action_pressed("fire"),
	}

func _ai_controls(_delta: float) -> Dictionary:
	if course == null:
		return {}
	var target_data: Dictionary = course.drive_target(route_index, lane_offset)
	var local_target: Vector3 = to_local(target_data["position"])
	var angle: float = atan2(local_target.x, local_target.z)
	var forward_speed: float = maxf(0.0, speed_kph / 3.6)
	var desired_speed: float = target_data["speed"] * (0.91 + ai_aggression * 0.09)
	var result: Dictionary = {
		"throttle": 1.0 if forward_speed < desired_speed else 0.0,
		"brake": 1.0 if forward_speed > desired_speed + 4.0 else 0.0,
		"steer": clampf(angle * 2.2, -1.0, 1.0),
		"drift": absf(angle) > 0.52 and forward_speed > 19.0,
		"nitro": absf(angle) < 0.1 and nitro > 35.0 and forward_speed > 24.0,
		"fire": false,
	}
	if is_instance_valid(target) and target.health > 0.0:
		var target_direction: Vector3 = target.global_position - global_position
		var distance: float = target_direction.length()
		var aim_angle: float = global_basis.z.normalized().dot(target_direction.normalized())
		result["fire"] = distance < 92.0 and aim_angle > 0.55 and race_active
	return result

func _update_movement(delta: float) -> void:
	var throttle: float = controls.get("throttle", 0.0)
	var brake: float = controls.get("brake", 0.0)
	var steer: float = controls.get("steer", 0.0)
	var drifting: bool = controls.get("drift", false)
	var forward: Vector3 = global_basis.z.normalized()
	var right: Vector3 = global_basis.x.normalized()
	var forward_speed: float = velocity.dot(forward)
	var lateral_speed: float = velocity.dot(right)
	if is_on_floor():
		var steering_speed: float = clampf(absf(forward_speed) / 7.0, 0.0, 1.0)
		var high_speed_limit: float = 1.0 - clampf(absf(forward_speed) / maxf(max_speed, 1.0), 0.0, 1.0) * 0.55
		var direction: float = 1.0 if forward_speed >= -0.5 else -1.0
		rotation.y += steer * 1.65 * steering_speed * high_speed_limit * direction * delta
		forward = global_basis.z.normalized()
		right = global_basis.x.normalized()
		forward_speed = velocity.dot(forward)
		lateral_speed = velocity.dot(right)
		boosting = controls.get("nitro", false) and nitro > 0.5 and throttle > 0.1 and race_active
		if boosting:
			nitro = maxf(0.0, nitro - delta * 24.0)
		else:
			nitro = minf(100.0, nitro + delta * 0.7)
		route_refresh -= delta
		if route_refresh <= 0.0 and course != null:
			route_refresh = 0.18
			offroad = course.route_distance(global_position, route_index) > course.data.get("roadWidth", 14.0) * 0.72
		var speed_limit: float = max_speed * (1.16 if boosting else 1.0) * (0.58 if offroad else 1.0)
		var engine_force: float = acceleration + (15.0 if boosting else 0.0)
		if throttle > 0.0:
			forward_speed = move_toward(forward_speed, speed_limit, engine_force * throttle * delta)
		if brake > 0.0:
			if forward_speed > 1.0:
				forward_speed = move_toward(forward_speed, 0.0, 32.0 * brake * delta)
			else:
				forward_speed = move_toward(forward_speed, -12.0, 10.0 * brake * delta)
		if throttle <= 0.01 and brake <= 0.01:
			forward_speed = move_toward(forward_speed, 0.0, (1.4 + absf(forward_speed) * 0.025) * delta)
		if drifting:
			forward_speed = move_toward(forward_speed, 0.0, 5.5 * delta)
		forward_speed = clampf(forward_speed, -12.0, speed_limit)
		var grip: float = 1.65 if drifting else 7.5
		if offroad:
			grip *= 0.7
		lateral_speed *= exp(-grip * delta)
		if absf(lateral_speed) > 2.4 and absf(forward_speed) > 11.0 and race_active:
			var drift_gain: float = absf(lateral_speed) * delta
			drift_score += drift_gain * (8.0 if is_player else 0.0)
			nitro = minf(100.0, nitro + drift_gain * 0.32)
		var planar: Vector3 = forward * forward_speed + right * lateral_speed
		velocity.x = planar.x
		velocity.z = planar.z
		velocity.y = -0.6
	else:
		boosting = false
		velocity.y -= 22.0 * delta
	move_and_slide()
	speed_kph = Vector2(velocity.x, velocity.z).length() * 3.6

func _update_weapon(delta: float) -> void:
	target_refresh -= delta
	if target_refresh <= 0.0:
		target_refresh = 0.2
		_select_target()
	if is_instance_valid(target) and weapon_root != null:
		var local_target: Vector3 = weapon_root.to_local(target.global_position + Vector3.UP * 0.6)
		var desired_yaw: float = atan2(local_target.x, local_target.z)
		weapon_root.rotation.y = lerp_angle(weapon_root.rotation.y, clampf(desired_yaw, -2.7, 2.7), clampf(delta * 7.0, 0.0, 1.0))
	if controls.get("fire", false) and race_active and not is_finished:
		_try_fire()

func _select_target() -> void:
	var best_score: float = INF
	target = null
	for opponent in opponents:
		if not is_instance_valid(opponent) or opponent == self or opponent.health <= 0.0 or opponent.respawn_time > 0.0:
			continue
		var difference: Vector3 = opponent.global_position - global_position
		var distance: float = difference.length()
		if distance > 135.0:
			continue
		var facing: float = global_basis.z.normalized().dot(difference.normalized())
		if facing < 0.15:
			continue
		var score: float = distance - facing * 18.0
		if score < best_score:
			best_score = score
			target = opponent

func _try_fire() -> void:
	if weapon_cooldown > 0.0 or overheated:
		return
	var weapon_id: String = weapon_data.get("id", "rotary-cannon")
	if weapon_id == "missile-pod":
		if not is_instance_valid(target) or missile_ammo <= 0:
			return
		weapon_cooldown = 3.0
		missile_ammo -= 1
		missile_requested.emit(self, target)
		return
	var cooldown: float = 0.12
	var damage: float = 4.0
	var heat_gain: float = 4.5
	var shot_range: float = 92.0
	var color := Color("ffb13b")
	if weapon_id == "twin-repeater":
		cooldown = 0.34
		damage = 11.0
		heat_gain = 9.0
		shot_range = 125.0
		color = Color("66e7ed")
	elif weapon_id == "pulse-projector":
		cooldown = 0.58
		damage = 17.0
		heat_gain = 13.0
		shot_range = 82.0
		color = Color("c5a3ff")
	weapon_cooldown = cooldown
	heat = minf(100.0, heat + heat_gain)
	if heat >= 100.0:
		overheated = true
	var origin: Vector3 = weapon_root.global_position + Vector3.UP * 0.35
	var direction: Vector3 = weapon_root.global_basis.z.normalized()
	if is_instance_valid(target):
		var lead: Vector3 = target.velocity * clampf(origin.distance_to(target.global_position) / 180.0, 0.0, 0.45)
		direction = (target.global_position + Vector3.UP * 0.6 + lead - origin).normalized()
	var finish: Vector3 = origin + direction * shot_range
	var query := PhysicsRayQueryParameters3D.create(origin, finish, 3)
	query.exclude = [get_rid()]
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
	if not hit.is_empty():
		finish = hit["position"]
		var collider: Object = hit["collider"]
		if collider != null and collider.has_method("apply_damage"):
			collider.apply_damage(damage, self)
	tracer_fired.emit(origin, finish, color)

func apply_damage(amount: float, attacker: CharacterBody3D) -> void:
	if health <= 0.0 or invulnerability > 0.0 or not race_active:
		return
	health = maxf(0.0, health - amount)
	impact_occurred.emit(global_position + Vector3.UP * 0.6, amount >= 20.0)
	if health <= 0.0:
		if is_instance_valid(attacker) and attacker != self:
			attacker.takedowns += 1
		_begin_destroyed(attacker)

func _begin_destroyed(attacker: CharacterBody3D) -> void:
	if respawn_time > 0.0 or is_finished:
		return
	health = 0.0
	respawn_time = 3.0
	visible = false
	collision_layer = 0
	collision_mask = 0
	velocity = Vector3.ZERO
	destroyed.emit(self, attacker)

func _respawn() -> void:
	global_transform = course.checkpoint_transform(last_checkpoint)
	visible = true
	collision_layer = 2
	collision_mask = 3
	health = 100.0
	nitro = 40.0
	heat = 0.0
	overheated = false
	invulnerability = 2.2
	respawn_time = 0.0
	route_index = course.advance_index(global_position, int(float(last_checkpoint) / course.checkpoints.size() * course.centerline.size()))

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

func weapon_status() -> String:
	if weapon_data.get("id", "") == "missile-pod":
		return "MSL %d" % missile_ammo
	if overheated:
		return "OVERHEAT"
	return "HEAT %d" % int(heat)

func _update_audio() -> void:
	if not is_player or engine_idle == null:
		return
	var ratio: float = clampf(speed_kph / 3.6 / maxf(max_speed, 1.0), 0.0, 1.2)
	engine_idle.pitch_scale = 0.75 + ratio * 0.75
	engine_high.pitch_scale = 0.75 + ratio * 0.9
	engine_idle.volume_db = lerpf(-18.0, -30.0, ratio)
	engine_high.volume_db = lerpf(-42.0, -15.0, ratio)
	if respawn_time > 0.0:
		engine_idle.volume_db = -60.0
		engine_high.volume_db = -60.0

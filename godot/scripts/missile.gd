extends Node3D

signal detonated(world_position: Vector3)

var shooter: Node3D
var target: Node3D
var projectile_data: Dictionary = {}
var direction := Vector3.FORWARD
var speed: float = 72.0
var damage: float = 34.0
var lifetime: float = 6.0

func configure(owner_vehicle: Node3D, target_vehicle: Node3D, data: Dictionary, initial_direction: Vector3) -> void:
	shooter = owner_vehicle
	target = target_vehicle
	projectile_data = data
	direction = initial_direction.normalized()
	if not projectile_data.is_empty():
		var model: Node3D = load("res://" + projectile_data["lods"]["3"]).instantiate()
		model.scale = Vector3.ONE * 0.65
		add_child(model)

func _physics_process(delta: float) -> void:
	lifetime -= delta
	if lifetime <= 0.0:
		_explode()
		return
	if is_instance_valid(target) and target.get("health") > 0.0:
		var aim_point: Vector3 = target.global_position + Vector3.UP * 0.65
		var desired: Vector3 = (aim_point - global_position).normalized()
		direction = direction.lerp(desired, clampf(delta * 3.4, 0.0, 1.0)).normalized()
	var previous: Vector3 = global_position
	var following: Vector3 = previous + direction * speed * delta
	var query := PhysicsRayQueryParameters3D.create(previous, following, 3)
	if is_instance_valid(shooter):
		query.exclude = [shooter.get_rid()]
	var hit: Dictionary = get_world_3d().direct_space_state.intersect_ray(query)
	if not hit.is_empty():
		var collider: Object = hit.get("collider")
		if collider != null and collider.has_method("apply_damage"):
			collider.apply_damage(damage, shooter)
		global_position = hit.get("position", following)
		_explode()
		return
	global_position = following
	if direction.length_squared() > 0.01:
		look_at(global_position - direction, Vector3.UP)
	if is_instance_valid(target) and global_position.distance_to(target.global_position + Vector3.UP * 0.6) < 2.0:
		target.apply_damage(damage, shooter)
		_explode()

func _explode() -> void:
	detonated.emit(global_position)
	queue_free()

extends Node3D

var data: Dictionary = {}
var centerline: Array[Vector3] = []
var checkpoints: Array = []
var visual: Node3D
var collision: Node3D

func setup(track_data: Dictionary) -> void:
	data = track_data
	checkpoints = data.get("checkpoints", [])
	for point in data.get("centerline", []):
		centerline.append(Vector3(point[0], point[1], point[2]))
	var lod_key: String = "3" if OS.has_feature("mobile") else "2"
	var visual_path: String = "res://" + data["lods"][lod_key]
	visual = load(visual_path).instantiate()
	visual.name = "TrackVisual"
	add_child(visual)
	collision = load("res://" + data["collision"]).instantiate()
	collision.name = "TrackCollision"
	add_child(collision)
	_add_collision_shapes(collision)

func _add_collision_shapes(node: Node) -> void:
	for child in node.get_children():
		if child is MeshInstance3D:
			var mesh_instance: MeshInstance3D = child
			mesh_instance.visible = false
			if mesh_instance.mesh != null:
				var body := StaticBody3D.new()
				body.name = "CourseSurface"
				body.collision_layer = 1
				body.collision_mask = 2
				mesh_instance.add_child(body)
				var shape_node := CollisionShape3D.new()
				shape_node.shape = mesh_instance.mesh.create_trimesh_shape()
				body.add_child(shape_node)
		_add_collision_shapes(child)

func advance_index(world_position: Vector3, hint: int) -> int:
	if centerline.is_empty():
		return 0
	var best: int = posmod(hint, centerline.size())
	var best_distance: float = INF
	for offset in range(-2, 10):
		var index: int = posmod(hint + offset, centerline.size())
		var distance: float = world_position.distance_squared_to(centerline[index])
		if distance < best_distance:
			best_distance = distance
			best = index
	return best

func drive_target(hint: int, lane_offset: float = 0.0) -> Dictionary:
	if centerline.is_empty():
		return {"position": Vector3.ZERO, "speed": 0.0, "index": 0}
	var index: int = posmod(hint + 5, centerline.size())
	var previous: Vector3 = centerline[posmod(index - 4, centerline.size())]
	var current: Vector3 = centerline[index]
	var following: Vector3 = centerline[posmod(index + 4, centerline.size())]
	var incoming: Vector3 = (current - previous).normalized()
	var outgoing: Vector3 = (following - current).normalized()
	var turn_angle: float = acos(clampf(incoming.dot(outgoing), -1.0, 1.0))
	var target_speed: float = clampf(58.0 - turn_angle * 150.0, 17.0, 58.0)
	var left: Vector3 = Vector3.UP.cross(outgoing).normalized()
	return {"position": current + left * lane_offset, "speed": target_speed, "index": index}

func route_distance(world_position: Vector3, hint: int) -> float:
	if centerline.is_empty():
		return 0.0
	var closest: float = INF
	for offset in range(-3, 5):
		var index: int = posmod(hint + offset, centerline.size())
		closest = minf(closest, world_position.distance_to(centerline[index]))
	return closest

func checkpoint_transform(index: int) -> Transform3D:
	var checkpoint: Dictionary = checkpoints[posmod(index, checkpoints.size())]
	var respawn: Dictionary = checkpoint["respawn"]
	var point: Array = respawn["position"]
	var origin := Vector3(point[0], point[1] + 0.15, point[2])
	var yaw: float = respawn["yaw"]
	return Transform3D(Basis(Vector3.UP, yaw), origin)

extends Control

var course: Node3D
var player: CharacterBody3D
var racers: Array = []
var route_points: PackedVector2Array = PackedVector2Array()
var minimum := Vector2.ZERO
var maximum := Vector2.ONE
var refresh: float = 0.0

func configure(track: Node3D, vehicles: Array, player_vehicle: CharacterBody3D) -> void:
	course = track
	racers = vehicles
	player = player_vehicle
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if course == null or course.centerline.is_empty():
		return
	minimum = Vector2(INF, INF)
	maximum = Vector2(-INF, -INF)
	for point in course.centerline:
		var flat := Vector2(point.x, point.z)
		minimum = minimum.min(flat)
		maximum = maximum.max(flat)
	_rebuild_route()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and course != null:
		_rebuild_route()

func _rebuild_route() -> void:
	route_points.clear()
	if course == null:
		return
	for point in course.centerline:
		route_points.append(_map_point(point))
	if route_points.size() > 1:
		route_points.append(route_points[0])

func _map_point(world_point: Vector3) -> Vector2:
	var span: Vector2 = (maximum - minimum).max(Vector2.ONE)
	var normalized := Vector2(
		(world_point.x - minimum.x) / span.x,
		1.0 - (world_point.z - minimum.y) / span.y
	)
	var available: Vector2 = size - Vector2(24, 24)
	var scale_factor: float = minf(available.x, available.y)
	# Preserve the circuit's aspect ratio inside a compact square map.
	var aspect: float = span.x / span.y
	var draw_size := Vector2(scale_factor * minf(aspect, 1.0), scale_factor / maxf(aspect, 1.0))
	var offset: Vector2 = (available - draw_size) * 0.5 + Vector2(12, 12)
	var drawn := Vector2(normalized.x * draw_size.x, normalized.y * draw_size.y)
	return offset + drawn

func _process(delta: float) -> void:
	refresh -= delta
	if refresh <= 0.0:
		refresh = 0.1
		queue_redraw()

func _draw() -> void:
	if course == null or route_points.size() < 2:
		return
	draw_style_box(_background(), Rect2(Vector2.ZERO, size))
	draw_polyline(route_points, Color(0.15, 0.23, 0.26, 1.0), 7.0, true)
	draw_polyline(route_points, Color("b8c8cb"), 2.0, true)
	for racer in racers:
		if not is_instance_valid(racer) or racer == player:
			continue
		draw_circle(_map_point(racer.global_position), 3.5, Color("ff8a68"))
	if is_instance_valid(player):
		draw_circle(_map_point(player.global_position), 5.0, Color("ff5b35"))
		draw_arc(_map_point(player.global_position), 7.0, 0.0, TAU, 20, Color.WHITE, 1.5, true)

func _background() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.045, 0.055, 0.88)
	style.border_color = Color("30434b")
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	return style

extends Sprite3D

var frame_count: int = 1
var columns: int = 1
var rows: int = 1
var frame_size := Vector2i(256, 256)
var frames_per_second: float = 24.0
var looping: bool = false
var cursor: float = 0.0

func configure(effect: Dictionary, world_size: float = 5.0) -> void:
	texture = load("res://" + effect["runtime"])
	frame_count = effect.get("frames", 1)
	columns = effect.get("columns", 1)
	rows = effect.get("rows", 1)
	frame_size = Vector2i(effect.get("frameWidth", 256), effect.get("frameHeight", 256))
	frames_per_second = maxf(1.0, effect.get("fps", 24.0))
	looping = effect.get("loop", false)
	pixel_size = world_size / float(frame_size.x)
	billboard = BaseMaterial3D.BILLBOARD_ENABLED
	shaded = false
	double_sided = true
	region_enabled = true
	region_rect = Rect2(0, 0, frame_size.x, frame_size.y)

func _process(delta: float) -> void:
	if texture == null:
		return
	cursor += delta * frames_per_second
	if cursor >= float(frame_count):
		if looping:
			cursor = fmod(cursor, float(frame_count))
		else:
			queue_free()
			return
	var frame_index: int = mini(int(cursor), frame_count - 1)
	var column: int = frame_index % columns
	var row: int = int(frame_index / columns)
	region_rect = Rect2(column * frame_size.x, row * frame_size.y, frame_size.x, frame_size.y)

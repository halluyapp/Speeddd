extends CanvasLayer

signal start_requested
signal selection_changed(category: String, index: int)
signal restart_requested
signal garage_requested
signal pause_requested
signal resume_requested

var content: Dictionary = {}
var root: Control
var menu: PanelContainer
var hud: Control
var touch: Control
var overlay: Control
var position_label: Label
var lap_label: Label
var time_label: Label
var speed_label: Label
var nitro_bar: ProgressBar
var health_bar: ProgressBar
var weapon_label: Label
var drift_label: Label
var message_label: Label
var target_label: Label
var message_time: float = 0.0
var display_font: Font
var body_font: Font
var touch_buttons: Array = []

func setup(content_data: Dictionary) -> void:
	content = content_data
	display_font = load("res://assets/fonts/space-grotesk.woff2")
	body_font = load("res://assets/fonts/inter.woff2")
	root = Control.new()
	root.name = "Interface"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ui_theme := Theme.new()
	ui_theme.default_font = body_font
	ui_theme.default_font_size = 18
	root.theme = ui_theme
	add_child(root)
	_build_menu()
	_build_hud()
	_build_touch_controls()
	show_menu()

func _style(color: Color, border: Color = Color.TRANSPARENT, radius: int = 10) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	return style

func _label(parent: Node, text: String, size: int = 18, color: Color = Color("e8f0ef"), display: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_override("font", display_font if display else body_font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	parent.add_child(label)
	return label

func _button(parent: Node, text: String, primary: bool = false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 48
	button.add_theme_font_override("font", display_font)
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_stylebox_override("normal", _style(Color("d7ff3f") if primary else Color("111b1e"), Color("d7ff3f") if primary else Color("304044"), 6))
	button.add_theme_stylebox_override("hover", _style(Color("b8dc36") if primary else Color("1c2b2f"), Color("66e7ed"), 6))
	button.add_theme_stylebox_override("pressed", _style(Color("8cae2c") if primary else Color("263a3f"), Color("d7ff3f"), 6))
	button.add_theme_color_override("font_color", Color("10160a") if primary else Color("e8f0ef"))
	button.add_theme_color_override("font_hover_color", Color("10160a") if primary else Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color("10160a") if primary else Color.WHITE)
	parent.add_child(button)
	return button

func _build_menu() -> void:
	menu = PanelContainer.new()
	menu.name = "GarageMenu"
	menu.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	menu.offset_left = 18
	menu.offset_top = 18
	menu.offset_right = 430
	menu.offset_bottom = -18
	menu.add_theme_stylebox_override("panel", _style(Color(0.025, 0.05, 0.06, 0.96), Color("26373b"), 12))
	root.add_child(menu)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_bottom", 8)
	menu.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 11)
	margin.add_child(column)
	_label(column, "VELOCITY / NATIVE 01", 12, Color("d7ff3f"), true)
	_label(column, "PROJECT\nVELOCITY", 38, Color("f2f6f5"), true)
	_label(column, "OFFLINE AI COMBAT RACING", 13, Color("66e7ed"), true)
	_label(column, "11 cars  ·  2 circuits  ·  4 weapons", 14, Color("9aabaa"))
	_label(column, "Select vehicle", 13, Color("a8b8b7"))
	var car_select := OptionButton.new()
	car_select.name = "CarSelect"
	for car in content["cars"]:
		car_select.add_item(car["name"])
	car_select.selected = 6
	car_select.custom_minimum_size.y = 44
	column.add_child(car_select)
	car_select.item_selected.connect(func(index: int): selection_changed.emit("car", index))
	_label(column, "Circuit", 13, Color("a8b8b7"))
	var track_select := OptionButton.new()
	track_select.name = "TrackSelect"
	for track in content["tracks"]:
		track_select.add_item(track["name"])
	track_select.custom_minimum_size.y = 44
	column.add_child(track_select)
	track_select.item_selected.connect(func(index: int): selection_changed.emit("track", index))
	_label(column, "Combat hardpoint", 13, Color("a8b8b7"))
	var weapon_select := OptionButton.new()
	weapon_select.name = "WeaponSelect"
	for weapon in content["weapons"]:
		weapon_select.add_item(weapon["name"])
	weapon_select.custom_minimum_size.y = 44
	column.add_child(weapon_select)
	weapon_select.item_selected.connect(func(index: int): selection_changed.emit("weapon", index))
	var start := _button(column, "START COMBAT RACE", true)
	start.pressed.connect(start_requested.emit)
	var credits := _button(column, "ASSET CREDITS")
	credits.pressed.connect(_show_credits)
	_label(column, "LOW-SPEC RULESET\n4 racers · 2 laps · AI combat · local assets", 12, Color("ffb13b"))
	_label(column, "WASD / ARROWS  Drive\nSPACE  Drift    SHIFT  Nitro\nF / CTRL  Fire    ESC  Pause", 12, Color("8da09f"))

func _build_hud() -> void:
	hud = Control.new()
	hud.name = "RaceHUD"
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	var race_panel := PanelContainer.new()
	race_panel.position = Vector2(16, 16)
	race_panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.04, 0.05, 0.88), Color("26373b"), 8))
	hud.add_child(race_panel)
	var race_column := VBoxContainer.new()
	race_column.add_theme_constant_override("separation", 1)
	race_panel.add_child(race_column)
	position_label = _label(race_column, "1 / 4", 28, Color("d7ff3f"), true)
	lap_label = _label(race_column, "LAP 1 / 2", 14, Color("e8f0ef"), true)
	time_label = _label(race_column, "00:00.000", 13, Color("9aabaa"))
	var speed_panel := PanelContainer.new()
	speed_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	speed_panel.offset_left = -220
	speed_panel.offset_right = -16
	speed_panel.offset_top = 16
	speed_panel.offset_bottom = 105
	speed_panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.04, 0.05, 0.88), Color("26373b"), 8))
	hud.add_child(speed_panel)
	var speed_column := VBoxContainer.new()
	speed_panel.add_child(speed_column)
	speed_label = _label(speed_column, "000", 38, Color("f2f6f5"), true)
	speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var kmh := _label(speed_column, "KM/H", 11, Color("66e7ed"), true)
	kmh.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var pause_button := _button(hud, "II")
	pause_button.set_anchors_preset(Control.PRESET_CENTER_TOP)
	pause_button.offset_left = -30
	pause_button.offset_right = 30
	pause_button.offset_top = 16
	pause_button.offset_bottom = 62
	pause_button.custom_minimum_size = Vector2(60, 46)
	pause_button.pressed.connect(pause_requested.emit)
	var status_panel := PanelContainer.new()
	status_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	status_panel.offset_left = 16
	status_panel.offset_right = 300
	status_panel.offset_top = -176
	status_panel.offset_bottom = -16
	status_panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.04, 0.05, 0.88), Color("26373b"), 8))
	hud.add_child(status_panel)
	var status_column := VBoxContainer.new()
	status_column.add_theme_constant_override("separation", 5)
	status_panel.add_child(status_column)
	_label(status_column, "NITRO", 11, Color("66e7ed"), true)
	nitro_bar = ProgressBar.new()
	nitro_bar.max_value = 100
	nitro_bar.show_percentage = false
	nitro_bar.custom_minimum_size.y = 10
	status_column.add_child(nitro_bar)
	_label(status_column, "VEHICLE", 11, Color("ffb13b"), true)
	health_bar = ProgressBar.new()
	health_bar.max_value = 100
	health_bar.show_percentage = false
	health_bar.custom_minimum_size.y = 10
	status_column.add_child(health_bar)
	weapon_label = _label(status_column, "HEAT 0", 13, Color("e8f0ef"), true)
	target_label = _label(status_column, "", 11, Color("ffb13b"), true)
	drift_label = _label(hud, "", 18, Color("d7ff3f"), true)
	drift_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	drift_label.offset_left = -220
	drift_label.offset_right = 220
	drift_label.offset_top = -86
	drift_label.offset_bottom = -36
	drift_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label = _label(hud, "", 42, Color("f2f6f5"), true)
	message_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	message_label.offset_left = -420
	message_label.offset_right = 420
	message_label.offset_top = 118
	message_label.offset_bottom = 190
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func _build_touch_controls() -> void:
	touch = Control.new()
	touch.name = "TouchControls"
	touch.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(touch)
	touch.visible = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
	_touch_button("steer_left", "◀", Vector2(28, 570), Vector2(96, 96))
	_touch_button("steer_right", "▶", Vector2(140, 570), Vector2(96, 96))
	_touch_button("throttle", "GO", Vector2(1150, 520), Vector2(100, 120))
	_touch_button("brake", "BRK", Vector2(1028, 574), Vector2(94, 94))
	_touch_button("fire", "FIRE", Vector2(1150, 394), Vector2(100, 100))
	_touch_button("nitro", "N2O", Vector2(906, 594), Vector2(94, 74))
	_touch_button("drift", "DRIFT", Vector2(790, 594), Vector2(94, 74))

func _touch_texture(color: Color) -> ImageTexture:
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(color)
	return ImageTexture.create_from_image(image)

func _touch_button(action: String, text: String, position: Vector2, size: Vector2) -> void:
	var button := TouchScreenButton.new()
	button.action = action
	button.position = position
	button.scale = size / 64.0
	button.texture_normal = _touch_texture(Color(0.04, 0.09, 0.1, 0.62))
	button.texture_pressed = _touch_texture(Color(0.84, 1.0, 0.25, 0.75))
	button.visibility_mode = TouchScreenButton.VISIBILITY_ALWAYS
	touch.add_child(button)
	var label := Label.new()
	label.text = text
	label.position = Vector2(8, 14)
	label.size = Vector2(48, 36)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_override("font", display_font)
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(label)
	touch_buttons.append(button)

func show_menu() -> void:
	menu.visible = true
	hud.visible = false
	_clear_overlay()

func show_race() -> void:
	menu.visible = false
	hud.visible = true
	_clear_overlay()

func update_hud(player: CharacterBody3D, race_position: int, racer_count: int) -> void:
	if player == null:
		return
	position_label.text = "%d / %d" % [race_position, racer_count]
	lap_label.text = "LAP %d / %d" % [mini(player.laps_completed + 1, player.total_laps), player.total_laps]
	time_label.text = format_time(player.race_time)
	speed_label.text = "%03d" % int(player.speed_kph)
	nitro_bar.value = player.nitro
	health_bar.value = player.health
	weapon_label.text = player.weapon_status()
	drift_label.text = "DRIFT  %06d" % int(player.drift_score) if player.drift_score > 1.0 else ""
	if player.weapon_data.get("id", "") == "missile-pod":
		target_label.text = "LOCK READY" if is_instance_valid(player.target) else "SEEK TARGET"
	elif player.invulnerability > 0.0:
		target_label.text = "SPAWN SHIELD"
	else:
		target_label.text = ""

func set_message(text: String, duration: float = 0.0) -> void:
	message_label.text = text
	message_time = duration

func _process(delta: float) -> void:
	if message_time > 0.0:
		message_time -= delta
		if message_time <= 0.0:
			message_label.text = ""

func show_pause() -> void:
	_clear_overlay()
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var panel := _center_panel(overlay, Vector2(460, 360))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	panel.add_child(column)
	_label(column, "RACE PAUSED", 30, Color("d7ff3f"), true)
	var resume := _button(column, "RESUME", true)
	resume.pressed.connect(resume_requested.emit)
	var restart := _button(column, "RESTART RACE")
	restart.pressed.connect(restart_requested.emit)
	var garage := _button(column, "RETURN TO GARAGE")
	garage.pressed.connect(garage_requested.emit)

func show_results(player: CharacterBody3D, race_position: int, racer_count: int) -> void:
	_clear_overlay()
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var panel := _center_panel(overlay, Vector2(560, 530))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	_label(column, "RACE COMPLETE", 13, Color("66e7ed"), true)
	_label(column, "P%d" % race_position, 68, Color("d7ff3f"), true)
	_label(column, "%s  /  %d RACERS" % [player.car_data["name"], racer_count], 17, Color("e8f0ef"), true)
	_label(column, "TIME     %s\nBEST LAP     %s\nDRIFT SCORE     %d\nTAKEDOWNS     %d" % [format_time(player.race_time), format_time(player.best_lap), int(player.drift_score), player.takedowns], 16, Color("a8b8b7"))
	var restart := _button(column, "RACE AGAIN", true)
	restart.pressed.connect(restart_requested.emit)
	var garage := _button(column, "GARAGE")
	garage.pressed.connect(garage_requested.emit)

func _center_panel(parent: Control, minimum: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -minimum.x * 0.5
	panel.offset_right = minimum.x * 0.5
	panel.offset_top = -minimum.y * 0.5
	panel.offset_bottom = minimum.y * 0.5
	panel.add_theme_stylebox_override("panel", _style(Color(0.025, 0.05, 0.06, 0.98), Color("d7ff3f"), 12))
	parent.add_child(panel)
	return panel

func _show_credits() -> void:
	_clear_overlay()
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var panel := _center_panel(overlay, Vector2(900, 620))
	var column := VBoxContainer.new()
	panel.add_child(column)
	_label(column, "ASSET ATTRIBUTION", 24, Color("d7ff3f"), true)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(830, 460)
	column.add_child(scroll)
	var text := _label(scroll, FileAccess.get_file_as_string("res://assets/ATTRIBUTION.txt"), 13, Color("c3cfcd"))
	text.custom_minimum_size.x = 800
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var close := _button(column, "CLOSE", true)
	close.pressed.connect(_clear_overlay)

func _clear_overlay() -> void:
	if is_instance_valid(overlay):
		overlay.queue_free()
	overlay = null

static func format_time(seconds: float) -> String:
	var safe: float = maxf(0.0, seconds)
	var minutes: int = int(safe / 60.0)
	var remaining: int = int(safe) % 60
	var milliseconds: int = int(fmod(safe, 1.0) * 1000.0)
	return "%02d:%02d.%03d" % [minutes, remaining, milliseconds]

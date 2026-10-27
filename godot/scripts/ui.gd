extends CanvasLayer

const TrackMapScript = preload("res://scripts/track_map.gd")

signal start_requested(mode: String)
signal selection_changed(category: String, index: int)
signal restart_requested
signal garage_requested
signal home_requested
signal pause_requested
signal resume_requested
signal navigation_requested(page: String)
signal setting_changed(key: String, value: Variant)
signal paint_selected(color: String)
signal profile_saved(driver_name: String)
signal intro_finished
signal camera_requested
signal inspection_requested(action: String)

const INK := Color("071016")
const PANEL := Color(0.035, 0.065, 0.085, 0.96)
const PANEL_SOFT := Color(0.04, 0.075, 0.095, 0.88)
const LINE := Color("30434b")
const TEXT := Color("edf4f5")
const MUTED := Color("91a5ac")
const ACCENT := Color("ff5b35")
const CYAN := Color("85d9e8")

var content: Dictionary = {}
var save_data: Dictionary = {}
var context: Dictionary = {}
var root: Control
var menu: Control
var menu_content: VBoxContainer
var hud: Control
var touch: Control
var overlay: Control
var position_label: Label
var lap_label: Label
var time_label: Label
var mode_label: Label
var speed_label: Label
var gear_label: Label
var rpm_bar: ProgressBar
var best_label: Label
var status_label: Label
var message_label: Label
var loading_bar: ProgressBar
var loading_stage: Label
var loading_tip: Label
var loading_tip_time: float = 0.0
var loading_tip_index: int = 0
var track_map: Control
var start_light_nodes: Array = []
var message_time: float = 0.0
var display_font: Font
var body_font: Font
var touch_buttons: Array = []
var touch_scale: float = 1.0
var current_page: String = "home"

func setup(content_data: Dictionary, profile_data: Dictionary) -> void:
	content = content_data
	save_data = profile_data
	display_font = load("res://assets/fonts/space-grotesk.woff2")
	body_font = load("res://assets/fonts/inter.woff2")
	root = Control.new()
	root.name = "Interface"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ui_theme := Theme.new()
	ui_theme.default_font = body_font
	ui_theme.default_font_size = 17
	root.theme = ui_theme
	add_child(root)
	root.resized.connect(_layout_touch_controls)
	_build_menu_chrome()
	_build_hud()
	_build_touch_controls()
	apply_settings(save_data["settings"])

func _style(color: Color, border: Color = Color.TRANSPARENT, radius: int = 8) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 13
	style.content_margin_bottom = 13
	return style

func _label(parent: Node, text: String, size: int = 17, color: Color = TEXT, display: bool = false) -> Label:
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
	button.custom_minimum_size.y = 46
	button.add_theme_font_override("font", display_font)
	button.add_theme_font_size_override("font_size", 14)
	button.add_theme_stylebox_override("normal", _style(ACCENT if primary else Color("101d25"), ACCENT if primary else LINE, 5))
	button.add_theme_stylebox_override("hover", _style(Color("ff7655") if primary else Color("192b34"), CYAN, 5))
	button.add_theme_stylebox_override("pressed", _style(Color("c94326") if primary else Color("243943"), ACCENT, 5))
	button.add_theme_stylebox_override("focus", _style(Color(0, 0, 0, 0), CYAN, 5))
	button.add_theme_color_override("font_color", Color.WHITE if primary else TEXT)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color.WHITE)
	parent.add_child(button)
	return button

func _build_menu_chrome() -> void:
	menu = Control.new()
	menu.name = "MainMenu"
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(menu)
	var top := PanelContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 20
	top.offset_right = -20
	top.offset_top = 16
	top.offset_bottom = 76
	top.add_theme_stylebox_override("panel", _style(Color(0.025, 0.05, 0.065, 0.94), LINE, 7))
	menu.add_child(top)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	top.add_child(row)
	var brand := _label(row, "APEX DRIVE", 23, TEXT, true)
	brand.custom_minimum_size.x = 190
	for page in ["home", "race", "garage", "career", "settings"]:
		var navigation := _button(row, page.to_upper())
		navigation.custom_minimum_size = Vector2(92, 38)
		navigation.pressed.connect(func(): navigation_requested.emit(page))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	var profile := _label(row, "DRIVER 01  /  ROOKIE", 12, CYAN, true)
	profile.name = "ProfileLabel"
	var panel := PanelContainer.new()
	panel.name = "PagePanel"
	panel.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	panel.offset_left = 20
	panel.offset_right = 432
	panel.offset_top = 94
	panel.offset_bottom = -20
	panel.add_theme_stylebox_override("panel", _style(PANEL, LINE, 9))
	menu.add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	menu_content = VBoxContainer.new()
	menu_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_content.add_theme_constant_override("separation", 11)
	scroll.add_child(menu_content)

func _clear_menu_content() -> void:
	for child in menu_content.get_children():
		menu_content.remove_child(child)
		child.queue_free()

func show_page(page: String, page_context: Dictionary) -> void:
	current_page = page
	context = page_context
	save_data = context["save"]
	_clear_overlay()
	menu.visible = true
	hud.visible = false
	_clear_menu_content()
	var profile_label: Label = menu.find_child("ProfileLabel", true, false)
	if profile_label != null:
		profile_label.text = str(save_data["profile"]["name"]) + "  /  ROOKIE"
	match page:
		"home": _home_page()
		"race": _race_page()
		"garage": _garage_page()
		"career": _career_page()
		"settings": _settings_page()

func _page_heading(eyebrow: String, title: String, subtitle: String = "") -> void:
	_label(menu_content, eyebrow, 11, ACCENT, true)
	_label(menu_content, title, 32, TEXT, true)
	if not subtitle.is_empty():
		var label := _label(menu_content, subtitle, 13, MUTED)
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _home_page() -> void:
	_page_heading("JAG STUDIOS  /  HOME", "EARN EVERY\nCORNER.", "A focused offline racing milestone. Real car, real circuit, no combat.")
	var car: Dictionary = context["car"]
	var track: Dictionary = context["track"]
	var card := _info_card(menu_content)
	_label(card, "SELECTED  /  " + car["name"].to_upper(), 12, CYAN, true)
	_label(card, track["name"].to_upper(), 21, TEXT, true)
	_label(card, "%d LAPS  ·  %s AI  ·  OFFLINE" % [context["selectedLaps"], context["selectedDifficulty"].to_upper()], 12, MUTED, true)
	var start := _button(menu_content, "START RACING", true)
	start.custom_minimum_size.y = 58
	start.pressed.connect(func(): start_requested.emit(context["selectedMode"]))
	var setup_button := _button(menu_content, "RACE SETUP")
	setup_button.pressed.connect(func(): navigation_requested.emit("race"))
	var best: float = float(save_data["progress"]["bestLaps"].get("azurline-circuit/quick", 0.0))
	_label(menu_content, "PERSONAL BEST\n" + (format_time(best) if best > 0.0 else "Set your first lap time."), 14, MUTED, true)
	_label(menu_content, "DRAG THE CAR TO INSPECT  ·  SCROLL TO ZOOM", 10, MUTED, true)

func _race_page() -> void:
	_page_heading("RACE  /  EVENT SETUP", "CHOOSE YOUR\nSTART.", "Conventional racing only. Power-ups and weapons are disabled.")
	var modes := HBoxContainer.new()
	modes.add_theme_constant_override("separation", 8)
	menu_content.add_child(modes)
	var quick := _button(modes, "QUICK RACE", context["selectedMode"] == "quick")
	quick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quick.pressed.connect(func(): selection_changed.emit("mode", 0))
	var time := _button(modes, "TIME TRIAL", context["selectedMode"] == "time")
	time.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	time.pressed.connect(func(): selection_changed.emit("mode", 1))
	var circuit := _info_card(menu_content)
	_label(circuit, "CIRCUIT 01  /  COAST", 11, ACCENT, true)
	_label(circuit, "AZURE COAST", 23, TEXT, true)
	_label(circuit, "2.80 KM  ·  12 CHECKPOINTS\nFast straights, heavy braking and a technical final sector.", 12, MUTED)
	_option(menu_content, "RACE LENGTH", ["1 LAP", "2 LAPS", "3 LAPS"], [1, 2, 3].find(context["selectedLaps"]), "laps")
	if context["selectedMode"] == "quick":
		_option(menu_content, "AI DIFFICULTY", ["ROOKIE", "CLUB", "PRO"], ["rookie", "club", "pro"].find(context["selectedDifficulty"]), "difficulty")
		_label(menu_content, "3 named AI opponents  ·  No rubber-band boost", 11, CYAN)
	else:
		_label(menu_content, "Solo running  ·  Personal bests saved locally", 11, CYAN)
	var start := _button(menu_content, "START QUICK RACE" if context["selectedMode"] == "quick" else "START TIME TRIAL", true)
	start.custom_minimum_size.y = 54
	start.pressed.connect(func(): start_requested.emit(context["selectedMode"]))

func _garage_page() -> void:
	var car: Dictionary = context["car"]
	_page_heading("GARAGE  /  INSPECTION", car["name"].to_upper(), "Sport Coupe  ·  Rear-drive balance  ·  Detailed local 3D asset")
	var performance: Dictionary = car["performance"]
	var specs := _info_card(menu_content)
	_label(specs, "%s  ·  %d KM/H" % [performance["power"], performance["topSpeed"]], 16, TEXT, true)
	_label(specs, "0–100  %.1f S   /   HANDLING %d" % [performance["acceleration"], performance["handling"]], 11, MUTED, true)
	_label(menu_content, "BODY PAINT", 11, CYAN, true)
	var paints := HBoxContainer.new()
	paints.add_theme_constant_override("separation", 7)
	menu_content.add_child(paints)
	for paint in [["APEX RED", "#c7352b"], ["GLACIER", "#d9e2e5"], ["OCEAN", "#23648a"], ["SOLAR", "#d79a32"]]:
		var button := _button(paints, paint[0], context["selectedPaint"].to_lower() == paint[1].to_lower())
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 10)
		button.pressed.connect(func(): paint_selected.emit(paint[1]))
	_label(menu_content, "CAMERA", 11, CYAN, true)
	var views := HBoxContainer.new()
	views.add_theme_constant_override("separation", 6)
	menu_content.add_child(views)
	for view in ["front", "side", "rear", "cabin"]:
		var button := _button(views, view.to_upper())
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 10)
		button.pressed.connect(func(): inspection_requested.emit(view))
	var zoom := HBoxContainer.new()
	zoom.add_theme_constant_override("separation", 8)
	menu_content.add_child(zoom)
	var zoom_out := _button(zoom, "−  ZOOM")
	zoom_out.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zoom_out.pressed.connect(func(): inspection_requested.emit("zoom_out"))
	var zoom_in := _button(zoom, "+  ZOOM")
	zoom_in.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zoom_in.pressed.connect(func(): inspection_requested.emit("zoom_in"))
	_label(menu_content, "Paint and inspection choices are restored on the next launch.", 11, MUTED)

func _career_page() -> void:
	_page_heading("CAREER  /  LOCAL DRIVER RECORD", str(save_data["profile"]["name"]), "Progress is stored on this device. No account or network connection is required.")
	var stats := _info_card(menu_content)
	_label(stats, "ROOKIE", 24, ACCENT, true)
	_label(stats, "%d RACES  ·  %d WINS" % [save_data["progress"]["races"], save_data["progress"]["wins"]], 14, TEXT, true)
	for mode in ["quick", "time"]:
		var best: float = float(save_data["progress"]["bestLaps"].get("azurline-circuit/" + mode, 0.0))
		_label(menu_content, ("QUICK RACE" if mode == "quick" else "TIME TRIAL") + " BEST\n" + (format_time(best) if best > 0.0 else "NO RECORDED LAP"), 13, CYAN, true)
	_label(menu_content, "RECENT RESULTS", 11, ACCENT, true)
	if save_data["progress"]["history"].is_empty():
		_label(menu_content, "Complete a race to begin your driver record.", 13, MUTED)
	else:
		for result in save_data["progress"]["history"].slice(0, 4):
			var title: String = "TIME TRIAL" if result["mode"] == "time" else "P%d  /  QUICK RACE" % int(result["position"])
			_label(menu_content, title + "\nBEST  " + format_time(float(result["bestLap"])), 12, MUTED, true)
	_label(menu_content, "Championship progression is deferred until this core race loop is validated.", 10, MUTED)

func _settings_page() -> void:
	_page_heading("SETTINGS  /  DEVICE & DRIVING", "YOUR RACE.\nYOUR RULES.", "Low is the default mobile preset. Balanced enables higher LODs, shadows and 2× MSAA.")
	_option_setting("GRAPHICS", ["LOW", "BALANCED"], ["low", "balanced"].find(save_data["settings"]["graphics"]), "graphics", ["low", "balanced"])
	_option_setting("DRIVING PROFILE", ["SIMCADE", "ARCADE"], ["simcade", "arcade"].find(save_data["settings"]["drivingProfile"]), "drivingProfile", ["simcade", "arcade"])
	_toggle_setting("DRIVING ASSISTS", "assists")
	_toggle_setting("CAMERA RESPONSE", "cameraShake")
	_slider_setting("STEERING SENSITIVITY", "steeringSensitivity", 0.7, 1.3)
	_slider_setting("TOUCH CONTROL SIZE", "touchScale", 0.8, 1.25)
	_slider_setting("MASTER VOLUME", "masterVolume", 0.0, 1.0)
	_slider_setting("ENGINE VOLUME", "engineVolume", 0.0, 1.0)
	_slider_setting("EFFECTS VOLUME", "effectsVolume", 0.0, 1.0)
	_slider_setting("AMBIENCE VOLUME", "musicVolume", 0.0, 1.0)
	_label(menu_content, "KEYBOARD\nWASD / ARROWS  Drive\nSPACE  Handbrake   C  Camera\nESC  Pause", 11, MUTED, true)
	var credits := _button(menu_content, "ASSET CREDITS")
	credits.pressed.connect(_show_credits)

func _info_card(parent: Node) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(PANEL_SOFT, LINE, 6))
	parent.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	panel.add_child(column)
	return column

func _option(parent: Node, title: String, items: Array, selected: int, category: String) -> void:
	_label(parent, title, 10, MUTED, true)
	var option := OptionButton.new()
	for item in items:
		option.add_item(item)
	option.selected = maxi(0, selected)
	option.custom_minimum_size.y = 42
	option.add_theme_font_override("font", display_font)
	option.add_theme_font_size_override("font_size", 13)
	parent.add_child(option)
	option.item_selected.connect(func(index: int): selection_changed.emit(category, index))

func _option_setting(title: String, items: Array, selected: int, key: String, values: Array) -> void:
	_label(menu_content, title, 10, MUTED, true)
	var option := OptionButton.new()
	for item in items:
		option.add_item(item)
	option.selected = maxi(0, selected)
	option.custom_minimum_size.y = 42
	menu_content.add_child(option)
	option.item_selected.connect(func(index: int):
		save_data["settings"][key] = values[index]
		setting_changed.emit(key, values[index])
	)

func _toggle_setting(title: String, key: String) -> void:
	var toggle := CheckButton.new()
	toggle.text = title
	toggle.button_pressed = save_data["settings"][key]
	toggle.custom_minimum_size.y = 38
	menu_content.add_child(toggle)
	toggle.toggled.connect(func(value: bool):
		save_data["settings"][key] = value
		setting_changed.emit(key, value)
	)

func _slider_setting(title: String, key: String, minimum: float, maximum: float) -> void:
	_label(menu_content, title, 10, MUTED, true)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = 0.05
	slider.value = save_data["settings"][key]
	slider.custom_minimum_size.y = 26
	menu_content.add_child(slider)
	slider.value_changed.connect(func(value: float):
		save_data["settings"][key] = value
		setting_changed.emit(key, value)
	)

func show_studio() -> void:
	menu.visible = false
	hud.visible = false
	_clear_overlay()
	overlay = _full_overlay(Color.BLACK)
	var center := VBoxContainer.new()
	center.set_anchors_preset(Control.PRESET_CENTER)
	center.offset_left = -320
	center.offset_right = 320
	center.offset_top = -90
	center.offset_bottom = 90
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	overlay.add_child(center)
	var mark := _label(center, "J  /  S", 18, ACCENT, true)
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var studio := _label(center, "JAG STUDIOS", 40, TEXT, true)
	studio.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var line := ColorRect.new()
	line.color = ACCENT
	line.custom_minimum_size = Vector2(1, 2)
	center.add_child(line)
	var caption := _label(center, "BUILT FOR THE DRIVE", 11, MUTED, true)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

func show_cinematic(light_version: bool = false) -> void:
	menu.visible = false
	hud.visible = false
	_clear_overlay()
	overlay = _full_overlay(Color(0, 0, 0, 0))
	var brand := _label(overlay, "APEX DRIVE", 48, TEXT, true)
	brand.position = Vector2(52, 48)
	var tagline := _label(overlay, "EARN EVERY CORNER.", 14, ACCENT, true)
	tagline.position = Vector2(56, 111)
	var studio := _label(overlay, "JAG STUDIOS  /  CORSA RS", 11, MUTED, true)
	studio.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	studio.offset_left = -310
	studio.offset_right = -52
	studio.offset_top = 58
	studio.offset_bottom = 86
	var prompt := _button(overlay, "TAP TO CONTINUE", true)
	prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	prompt.offset_left = -150
	prompt.offset_right = 150
	prompt.offset_top = -94
	prompt.offset_bottom = -42
	prompt.pressed.connect(intro_finished.emit)
	var note := _label(overlay, "SHORT LIGHTING PRESET" if light_version else "CINEMATIC LIGHTING PRESET", 10, MUTED, true)
	note.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	note.offset_left = 52
	note.offset_right = 330
	note.offset_top = -52
	note.offset_bottom = -26

func show_profile(default_name: String) -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.015, 0.03, 0.04, 0.82))
	var panel := _center_panel(overlay, Vector2(520, 390))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	panel.add_child(column)
	_label(column, "FIRST-LAUNCH SETUP", 11, ACCENT, true)
	_label(column, "NAME YOUR DRIVER", 28, TEXT, true)
	_label(column, "Your profile, settings and race records stay on this device.", 13, MUTED)
	var input := LineEdit.new()
	input.text = default_name
	input.max_length = 18
	input.placeholder_text = "DRIVER 01"
	input.custom_minimum_size.y = 52
	input.add_theme_font_size_override("font_size", 18)
	column.add_child(input)
	var continue_button := _button(column, "ENTER THE GARAGE", true)
	continue_button.pressed.connect(func(): profile_saved.emit(input.text))
	_label(column, "Offline profile  ·  No account  ·  No special permissions", 11, CYAN)

func show_loading(track: Dictionary, mode: String) -> void:
	menu.visible = false
	hud.visible = false
	_clear_overlay()
	overlay = _full_overlay(INK)
	var poster := TextureRect.new()
	poster.texture = load("res://" + track["preview"])
	poster.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	poster.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	poster.stretch_mode = TextureRect.STRETCH_SCALE
	poster.modulate = Color(0.48, 0.55, 0.6, 1.0)
	overlay.add_child(poster)
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.025, 0.035, 0.45)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(shade)
	var brand := _label(overlay, "APEX DRIVE", 34, TEXT, true)
	brand.position = Vector2(48, 38)
	var event := _label(overlay, ("QUICK RACE" if mode == "quick" else "TIME TRIAL") + "  /  " + track["name"].to_upper(), 13, ACCENT, true)
	event.position = Vector2(52, 87)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	panel.offset_left = 48
	panel.offset_right = 650
	panel.offset_top = -214
	panel.offset_bottom = -42
	panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.045, 0.06, 0.94), LINE, 8))
	overlay.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)
	_label(column, "PREPARING YOUR RACE", 21, TEXT, true)
	loading_stage = _label(column, "CHECKING LOCAL DATA", 12, CYAN, true)
	loading_bar = ProgressBar.new()
	loading_bar.max_value = 100
	loading_bar.value = 0
	loading_bar.show_percentage = false
	loading_bar.custom_minimum_size.y = 9
	column.add_child(loading_bar)
	loading_tip = _label(column, "TIP  /  Brake before the corner, then accelerate through the exit.", 12, MUTED)
	loading_tip_time = 0.0
	loading_tip_index = 0

func set_loading(progress: float, stage: String) -> void:
	if is_instance_valid(loading_bar):
		loading_bar.value = clampf(progress, 0.0, 1.0) * 100.0
	if is_instance_valid(loading_stage):
		loading_stage.text = stage

func _build_hud() -> void:
	hud = Control.new()
	hud.name = "RaceHUD"
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	var race_panel := PanelContainer.new()
	race_panel.position = Vector2(16, 16)
	race_panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.04, 0.055, 0.9), LINE, 7))
	hud.add_child(race_panel)
	var race_column := VBoxContainer.new()
	race_column.add_theme_constant_override("separation", 1)
	race_panel.add_child(race_column)
	position_label = _label(race_column, "4 / 4", 28, ACCENT, true)
	lap_label = _label(race_column, "LAP 1 / 2", 13, TEXT, true)
	time_label = _label(race_column, "00:00.000", 13, MUTED)
	mode_label = _label(race_column, "QUICK RACE", 10, CYAN, true)
	var speed_panel := PanelContainer.new()
	speed_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	speed_panel.offset_left = -224
	speed_panel.offset_right = -16
	speed_panel.offset_top = 16
	speed_panel.offset_bottom = 138
	speed_panel.add_theme_stylebox_override("panel", _style(Color(0.02, 0.04, 0.055, 0.9), LINE, 7))
	hud.add_child(speed_panel)
	var speed_column := VBoxContainer.new()
	speed_panel.add_child(speed_column)
	speed_label = _label(speed_column, "000", 40, TEXT, true)
	speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var unit := _label(speed_column, "KM/H", 10, CYAN, true)
	unit.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	gear_label = _label(speed_column, "N", 18, ACCENT, true)
	gear_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	rpm_bar = ProgressBar.new()
	rpm_bar.max_value = 1.0
	rpm_bar.show_percentage = false
	rpm_bar.custom_minimum_size.y = 5
	speed_column.add_child(rpm_bar)
	var pause_button := _button(hud, "II")
	pause_button.set_anchors_preset(Control.PRESET_CENTER_TOP)
	pause_button.offset_left = -72
	pause_button.offset_right = -12
	pause_button.offset_top = 16
	pause_button.offset_bottom = 62
	pause_button.pressed.connect(pause_requested.emit)
	var camera_button := _button(hud, "CAM")
	camera_button.set_anchors_preset(Control.PRESET_CENTER_TOP)
	camera_button.offset_left = 12
	camera_button.offset_right = 82
	camera_button.offset_top = 16
	camera_button.offset_bottom = 62
	camera_button.pressed.connect(camera_requested.emit)
	best_label = _label(hud, "", 11, CYAN, true)
	best_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	best_label.offset_left = -320
	best_label.offset_right = -16
	best_label.offset_top = 148
	best_label.offset_bottom = 176
	best_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	status_label = _label(hud, "", 14, ACCENT, true)
	status_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	status_label.offset_left = -230
	status_label.offset_right = 230
	status_label.offset_top = -112
	status_label.offset_bottom = -78
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label = _label(hud, "", 48, TEXT, true)
	message_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	message_label.offset_left = -420
	message_label.offset_right = 420
	message_label.offset_top = 122
	message_label.offset_bottom = 194
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_build_start_lights()
	track_map = TrackMapScript.new()
	track_map.position = Vector2(22, 318)
	track_map.size = Vector2(170, 156)
	hud.add_child(track_map)

func _build_start_lights() -> void:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.offset_left = -114
	panel.offset_right = 114
	panel.offset_top = 78
	panel.offset_bottom = 112
	panel.add_theme_stylebox_override("panel", _style(Color(0.015, 0.025, 0.03, 0.9), LINE, 5))
	hud.add_child(panel)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 9)
	panel.add_child(row)
	for index in range(5):
		var light := Panel.new()
		light.custom_minimum_size = Vector2(25, 15)
		light.add_theme_stylebox_override("panel", _style(Color("261a19"), Color.TRANSPARENT, 7))
		row.add_child(light)
		start_light_nodes.append(light)

func set_start_lights(stage: int) -> void:
	for index in range(start_light_nodes.size()):
		var active: bool = index < mini(5, stage * 2)
		var color: Color = Color("ff493d") if stage < 4 else Color("71ef9a")
		if not active:
			color = Color("261a19")
		start_light_nodes[index].add_theme_stylebox_override("panel", _style(color, Color.TRANSPARENT, 7))

func show_race(course: Node3D, racers: Array, player: CharacterBody3D, mode: String) -> void:
	_clear_overlay()
	menu.visible = false
	hud.visible = true
	mode_label.text = "QUICK RACE" if mode == "quick" else "TIME TRIAL"
	track_map.configure(course, racers, player)
	_layout_touch_controls()

func restore_race() -> void:
	_clear_overlay()
	menu.visible = false
	hud.visible = true

func update_hud(player: CharacterBody3D, race_position: int, racer_count: int, mode: String) -> void:
	if player == null:
		return
	position_label.text = "%d / %d" % [race_position, racer_count] if mode == "quick" else "SOLO"
	lap_label.text = "LAP %d / %d" % [mini(player.laps_completed + 1, player.total_laps), player.total_laps]
	time_label.text = format_time(player.race_time)
	speed_label.text = "%03d" % int(player.speed_kph)
	gear_label.text = player.gear() + "  /  GEAR"
	rpm_bar.value = player.rpm_ratio()
	best_label.text = "BEST  " + (format_time(player.best_lap) if player.best_lap > 0.0 else "--:--.---")
	if player.recovery_time > 0.0:
		status_label.text = "RECOVERING"
	elif player.offroad:
		status_label.text = "TRACK LIMITS  /  REDUCED GRIP"
	else:
		status_label.text = ""

func set_message(text: String, duration: float = 0.0) -> void:
	message_label.text = text
	message_time = duration

func _build_touch_controls() -> void:
	touch = Control.new()
	touch.name = "TouchControls"
	touch.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(touch)
	touch.visible = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")
	_touch_button("steer_left", "◀", "left")
	_touch_button("steer_right", "▶", "right")
	_touch_button("throttle", "THROTTLE", "throttle")
	_touch_button("brake", "BRAKE", "brake")
	_touch_button("drift", "HANDBRAKE", "drift")

func _touch_texture(color: Color) -> ImageTexture:
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(color)
	return ImageTexture.create_from_image(image)

func _touch_button(action: String, text: String, role: String) -> void:
	var button := TouchScreenButton.new()
	button.action = action
	button.texture_normal = _touch_texture(Color(0.035, 0.075, 0.095, 0.68))
	button.texture_pressed = _touch_texture(Color(1.0, 0.36, 0.21, 0.82))
	button.visibility_mode = TouchScreenButton.VISIBILITY_ALWAYS
	button.set_meta("role", role)
	touch.add_child(button)
	var label := Label.new()
	label.text = text
	label.position = Vector2(3, 20)
	label.size = Vector2(58, 26)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_override("font", display_font)
	label.add_theme_font_size_override("font_size", 9 if text.length() > 6 else 15)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(label)
	touch_buttons.append(button)

func apply_settings(settings: Dictionary) -> void:
	touch_scale = settings.get("touchScale", 1.0)
	_layout_touch_controls()

func _layout_touch_controls() -> void:
	if root == null:
		return
	var viewport_size: Vector2 = root.size
	if viewport_size.x < 100.0:
		viewport_size = Vector2(1280, 720)
	var responsive: float = clampf(minf(viewport_size.x / 1280.0, viewport_size.y / 720.0), 0.72, 1.25)
	var unit: float = responsive * touch_scale
	for button in touch_buttons:
		var role: String = button.get_meta("role")
		var base_size := Vector2(92, 92)
		var position := Vector2.ZERO
		match role:
			"left": position = Vector2(24, viewport_size.y - 132)
			"right": position = Vector2(132, viewport_size.y - 132)
			"drift":
				position = Vector2(viewport_size.x - 350, viewport_size.y - 118)
				base_size = Vector2(82, 70)
			"brake":
				position = Vector2(viewport_size.x - 246, viewport_size.y - 132)
				base_size = Vector2(94, 94)
			"throttle":
				position = Vector2(viewport_size.x - 132, viewport_size.y - 164)
				base_size = Vector2(104, 126)
		button.scale = base_size * unit / 64.0
		button.position = position

func show_pause() -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.01, 0.025, 0.035, 0.78))
	var panel := _center_panel(overlay, Vector2(460, 480))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 13)
	panel.add_child(column)
	_label(column, "RACE CONTROL", 11, CYAN, true)
	_label(column, "PAUSED", 34, TEXT, true)
	var resume := _button(column, "RESUME RACE", true)
	resume.pressed.connect(resume_requested.emit)
	var restart := _button(column, "RESTART RACE")
	restart.pressed.connect(restart_requested.emit)
	var settings := _button(column, "SETTINGS")
	settings.pressed.connect(_show_pause_settings)
	var leave := _button(column, "RETURN TO MAIN MENU")
	leave.pressed.connect(_show_abandon_confirmation)

func _show_pause_settings() -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.01, 0.025, 0.035, 0.84))
	var panel := _center_panel(overlay, Vector2(520, 520))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 13)
	panel.add_child(column)
	_label(column, "PAUSED  /  SETTINGS", 11, CYAN, true)
	_label(column, "RACE SETUP", 28, TEXT, true)
	var assists := CheckButton.new()
	assists.text = "DRIVING ASSISTS"
	assists.button_pressed = save_data["settings"]["assists"]
	column.add_child(assists)
	assists.toggled.connect(func(value: bool): setting_changed.emit("assists", value))
	var shake := CheckButton.new()
	shake.text = "CAMERA RESPONSE"
	shake.button_pressed = save_data["settings"]["cameraShake"]
	column.add_child(shake)
	shake.toggled.connect(func(value: bool): setting_changed.emit("cameraShake", value))
	_label(column, "MASTER VOLUME", 11, MUTED, true)
	var volume := HSlider.new()
	volume.min_value = 0.0
	volume.max_value = 1.0
	volume.step = 0.05
	volume.value = save_data["settings"]["masterVolume"]
	column.add_child(volume)
	volume.value_changed.connect(func(value: float): setting_changed.emit("masterVolume", value))
	_label(column, "Graphics and driving-profile changes apply from the next race.", 11, MUTED)
	var back := _button(column, "BACK TO PAUSE", true)
	back.pressed.connect(show_pause)

func _show_abandon_confirmation() -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.01, 0.02, 0.03, 0.88))
	var panel := _center_panel(overlay, Vector2(520, 310))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 15)
	panel.add_child(column)
	_label(column, "ABANDON THIS RACE?", 26, TEXT, true)
	_label(column, "The current result will not be recorded. Your existing records and settings are safe.", 13, MUTED)
	var stay := _button(column, "KEEP RACING", true)
	stay.pressed.connect(show_pause)
	var leave := _button(column, "ABANDON RACE")
	leave.pressed.connect(home_requested.emit)

func show_results(player: CharacterBody3D, race_position: int, racer_count: int, mode: String, is_record: bool, previous_best: float) -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.01, 0.025, 0.035, 0.8))
	var panel := _center_panel(overlay, Vector2(610, 570))
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	_label(column, "AZURE COAST  /  OFFICIAL RESULT", 11, CYAN, true)
	_label(column, "P%d" % race_position if mode == "quick" else "TIME TRIAL", 52 if mode == "quick" else 34, ACCENT, true)
	_label(column, "%s  /  %d RACERS" % [player.car_data["name"], racer_count] if mode == "quick" else player.car_data["name"], 15, TEXT, true)
	_label(column, "TOTAL TIME     %s\nBEST LAP          %s" % [format_time(player.race_time), format_time(player.best_lap)], 17, TEXT, true)
	if is_record:
		_label(column, "NEW PERSONAL BEST  /  SAVED LOCALLY", 13, ACCENT, true)
	elif previous_best > 0.0:
		_label(column, "PERSONAL BEST  " + format_time(previous_best), 12, MUTED, true)
	_label(column, "Result recorded  ·  No abandoned-race rewards", 11, MUTED)
	var restart := _button(column, "RACE AGAIN", true)
	restart.pressed.connect(restart_requested.emit)
	var garage := _button(column, "RETURN TO GARAGE")
	garage.pressed.connect(garage_requested.emit)
	var home := _button(column, "MAIN MENU")
	home.pressed.connect(home_requested.emit)

func _center_panel(parent: Control, minimum: Vector2) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -minimum.x * 0.5
	panel.offset_right = minimum.x * 0.5
	panel.offset_top = -minimum.y * 0.5
	panel.offset_bottom = minimum.y * 0.5
	panel.add_theme_stylebox_override("panel", _style(Color(0.025, 0.05, 0.065, 0.985), ACCENT, 9))
	parent.add_child(panel)
	return panel

func _full_overlay(color: Color) -> Control:
	var layer := Control.new()
	layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(layer)
	var background := ColorRect.new()
	background.color = color
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(background)
	return layer

func _show_credits() -> void:
	_clear_overlay()
	overlay = _full_overlay(Color(0.01, 0.025, 0.035, 0.9))
	var panel := _center_panel(overlay, Vector2(900, 620))
	var column := VBoxContainer.new()
	panel.add_child(column)
	_label(column, "LOCAL ASSET ATTRIBUTION", 23, ACCENT, true)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(830, 460)
	column.add_child(scroll)
	var text := _label(scroll, FileAccess.get_file_as_string("res://assets/ATTRIBUTION.txt"), 12, TEXT)
	text.custom_minimum_size.x = 800
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var close := _button(column, "BACK TO SETTINGS", true)
	close.pressed.connect(func(): show_page(current_page, context))

func _clear_overlay() -> void:
	if is_instance_valid(overlay):
		root.remove_child(overlay)
		overlay.queue_free()
	overlay = null
	loading_bar = null
	loading_stage = null
	loading_tip = null

func _process(delta: float) -> void:
	if message_time > 0.0:
		message_time -= delta
		if message_time <= 0.0 and is_instance_valid(message_label):
			message_label.text = ""
	if is_instance_valid(loading_tip):
		loading_tip_time += delta
		if loading_tip_time > 4.0:
			loading_tip_time = 0.0
			var tips: Array = [
				"TIP  /  Brake before the corner, then accelerate through the exit.",
				"TIP  /  Smooth steering preserves grip at high speed.",
				"TIP  /  Press C or CAM to switch chase, hood and bumper views.",
				"TIP  /  Time Trial saves your fastest valid lap on this device.",
			]
			loading_tip_index = (loading_tip_index + 1) % tips.size()
			loading_tip.text = tips[loading_tip_index]

static func format_time(seconds: float) -> String:
	var safe: float = maxf(0.0, seconds)
	var minutes: int = int(safe / 60.0)
	var remaining: int = int(safe) % 60
	var milliseconds: int = int(fmod(safe, 1.0) * 1000.0)
	return "%02d:%02d.%03d" % [minutes, remaining, milliseconds]

// const Me = imports.misc.extensionUtils.getCurrentExtension();
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import { get_current_path } from './paths.js';

const DARK = ['dark', 'adapta', 'plata', 'dracula'];

interface Settings extends GObject.Object {
    get_boolean(key: string): boolean;
    set_boolean(key: string, value: boolean): void;

    get_uint(key: string): number;
    set_uint(key: string, value: number): void;

    get_double(key: string): number;

    get_value(key: string): any;
    set_value(key: string, value: any): boolean;
    set_double(key: string, value: number): void;

    get_string(key: string): string;
    set_string(key: string, value: string): void;

    bind(key: string, object: GObject.Object, property: string, flags: any): void;
}

function settings_new_id(schema_id: string): Settings | null {
    try {
        return new Gio.Settings({ schema_id });
    } catch (why) {
        if (schema_id !== 'org.gnome.shell.extensions.user-theme') {
            // global.log(`failed to get settings for ${schema_id}: ${why}`);
        }

        return null;
    }
}

function settings_new_schema(schema: string): Settings {
    const GioSSS = Gio.SettingsSchemaSource;
    const schemaDir = Gio.File.new_for_path(get_current_path()).get_child('schemas');

    let schemaSource = schemaDir.query_exists(null)
        ? GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false)
        : GioSSS.get_default();

    const schemaObj = schemaSource.lookup(schema, true);

    if (!schemaObj) {
        throw new Error(
            'Schema ' + schema + ' could not be found for extension pop-shell' + '. Please check your installation.',
        );
    }

    return new Gio.Settings({ settings_schema: schemaObj });
}

const ACTIVE_HINT = 'active-hint';
const ACTIVE_HINT_BORDER_RADIUS = 'active-hint-border-radius';
const ACTIVE_HINT_BORDER_WIDTH = 'active-hint-border-width';
const INACTIVE_HINT = 'inactive-hint';
const PANEL_HINT = 'panel-hint';
const ROUND_WINDOWS = 'round-windows';
const INACTIVE_HINT_COLOR_RGBA = 'inactive-hint-color-rgba';
const INACTIVE_HINT_COLOR_END_RGBA = 'inactive-hint-color-end-rgba';
const INACTIVE_DIM = 'inactive-dim';
const STACKING_WITH_MOUSE = 'stacking-with-mouse';
const COLUMN_SIZE = 'column-size';
const EDGE_TILING = 'edge-tiling';
const FLOAT_RULES = 'float-rules';
const FLOAT_ABOVE = 'float-above';
const FLOAT_CENTER = 'float-center';
const FLOAT_MIN_SIZE = 'float-min-size';
const WORKSPACE_RULES = 'workspace-rules';
const WORKSPACE_BACK_AND_FORTH = 'workspace-back-and-forth';
const STARTUP_WORKSPACE = 'startup-workspace';
const GAP_INNER = 'gap-inner';
const GAP_OUTER = 'gap-outer';
const ROW_SIZE = 'row-size';
const SMART_GAPS = 'smart-gaps';
const SNAP_TO_GRID = 'snap-to-grid';
const TILE_BY_DEFAULT = 'tile-by-default';
const HINT_COLOR_RGBA = 'hint-color-rgba';
const HINT_COLOR_END_RGBA = 'hint-color-end-rgba';
const DEFAULT_RGBA_COLOR = 'rgba(251, 184, 108, 1)'; //pop-orange
const LOG_LEVEL = 'log-level';
const SHOW_SKIPTASKBAR = 'show-skip-taskbar';
const MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW = 'mouse-cursor-follows-active-window';
const MOUSE_CURSOR_FOCUS_LOCATION = 'mouse-cursor-focus-location';
const MAX_WINDOW_WIDTH = 'max-window-width';
const MOUSE_CURSOR_WARP_TO_LAST_POSITION = 'mouse-cursor-warp-to-last-position';
const ANIMATE_TILING = 'animate-tiling';
const ANIMATION_DURATION = 'animation-duration';
const FOCUS_FOLLOWS_MOUSE_FIX = 'focus-follows-mouse-fix';

function valid_color_or(rgba: string, fallback: string): string {
    return rgba && new Gdk.RGBA().parse(rgba) ? rgba : fallback;
}

export class ExtensionSettings {
    ext: Settings = settings_new_schema('org.gnome.shell.extensions.pop-shell');
    int: Settings | null = settings_new_id('org.gnome.desktop.interface');
    a11y: Settings | null = settings_new_id('org.gnome.desktop.a11y.interface');
    mutter: Settings | null = settings_new_id('org.gnome.mutter');
    shell: Settings | null = settings_new_id('org.gnome.shell.extensions.user-theme');

    // Getters

    active_hint(): boolean {
        return this.ext.get_boolean(ACTIVE_HINT);
    }

    active_hint_border_radius(): number {
        return this.ext.get_uint(ACTIVE_HINT_BORDER_RADIUS);
    }

    active_hint_border_width(): number {
        return this.ext.get_uint(ACTIVE_HINT_BORDER_WIDTH);
    }

    round_windows(): boolean {
        return this.ext.get_boolean(ROUND_WINDOWS);
    }

    panel_hint(): boolean {
        return this.ext.get_boolean(PANEL_HINT);
    }

    inactive_hint(): boolean {
        return this.ext.get_boolean(INACTIVE_HINT);
    }

    inactive_hint_color_rgba(): string {
        return valid_color_or(this.ext.get_string(INACTIVE_HINT_COLOR_RGBA), DEFAULT_RGBA_COLOR);
    }

    /** End color of the inactive hint gradient, or the start color if unset */
    inactive_hint_color_end_rgba(): string {
        return valid_color_or(this.ext.get_string(INACTIVE_HINT_COLOR_END_RGBA), this.inactive_hint_color_rgba());
    }

    inactive_dim(): number {
        return this.ext.get_double(INACTIVE_DIM);
    }

    /** Multiplier applied to border sizes, following the desktop's text scaling */
    text_scaling_factor(): number {
        return this.int ? this.int.get_double('text-scaling-factor') : 1;
    }

    stacking_with_mouse(): boolean {
        return this.ext.get_boolean(STACKING_WITH_MOUSE);
    }

    column_size(): number {
        return this.ext.get_uint(COLUMN_SIZE);
    }

    dynamic_workspaces(): boolean {
        return this.mutter ? this.mutter.get_boolean('dynamic-workspaces') : false;
    }

    /** (class pattern, title pattern) entries; empty patterns match anything */
    float_rules(): Array<[string, string]> {
        return this.ext.get_value(FLOAT_RULES).deep_unpack();
    }

    /** Appends a float rule unless an identical one exists */
    add_float_rule(wm_class: string, title: string) {
        const rules = this.float_rules();
        if (rules.some(([c, t]) => c === wm_class && t === title)) return;
        rules.push([wm_class, title]);
        this.ext.set_value(FLOAT_RULES, new (GLib as any).Variant('a(ss)', rules));
    }

    float_above(): boolean {
        return this.ext.get_boolean(FLOAT_ABOVE);
    }

    float_center(): boolean {
        return this.ext.get_boolean(FLOAT_CENTER);
    }

    float_min_size(): number {
        return this.ext.get_uint(FLOAT_MIN_SIZE);
    }

    /** (class pattern, workspace counting from 1, monitor, apply when windows open) entries */
    workspace_rules(): Array<[string, number, string, boolean]> {
        return this.ext.get_value(WORKSPACE_RULES).deep_unpack();
    }

    workspace_back_and_forth(): boolean {
        return this.ext.get_boolean(WORKSPACE_BACK_AND_FORTH);
    }

    startup_workspace(): number {
        return this.ext.get_uint(STARTUP_WORKSPACE);
    }

    gap_inner(): number {
        return this.ext.get_uint(GAP_INNER);
    }

    gap_outer(): number {
        return this.ext.get_uint(GAP_OUTER);
    }

    hint_color_rgba() {
        let rgba = this.ext.get_string(HINT_COLOR_RGBA);
        let valid_color = new Gdk.RGBA().parse(rgba);

        if (!valid_color) {
            return DEFAULT_RGBA_COLOR;
        }

        return rgba;
    }

    /** End color of the active hint gradient, or the start color if unset */
    hint_color_end_rgba(): string {
        return valid_color_or(this.ext.get_string(HINT_COLOR_END_RGBA), this.hint_color_rgba());
    }

    theme(): string {
        return this.shell ? this.shell.get_string('name') : this.int ? this.int.get_string('gtk-theme') : 'Adwaita';
    }

    /** Dark if the desktop prefers a dark style, or the theme name says so */
    is_dark(): boolean {
        if (this.int?.get_string('color-scheme') === 'prefer-dark') return true;
        const theme = this.theme().toLowerCase();
        return DARK.some((dark) => theme.includes(dark));
    }

    is_high_contrast(): boolean {
        return this.a11y?.get_boolean('high-contrast') || this.theme().toLowerCase() === 'highcontrast';
    }

    row_size(): number {
        return this.ext.get_uint(ROW_SIZE);
    }

    smart_gaps(): boolean {
        return this.ext.get_boolean(SMART_GAPS);
    }

    snap_to_grid(): boolean {
        return this.ext.get_boolean(SNAP_TO_GRID);
    }

    tile_by_default(): boolean {
        return this.ext.get_boolean(TILE_BY_DEFAULT);
    }

    workspaces_only_on_primary(): boolean {
        return this.mutter ? this.mutter.get_boolean('workspaces-only-on-primary') : false;
    }

    log_level(): number {
        return this.ext.get_uint(LOG_LEVEL);
    }

    show_skiptaskbar(): boolean {
        return this.ext.get_boolean(SHOW_SKIPTASKBAR);
    }

    mouse_cursor_follows_active_window(): boolean {
        return this.ext.get_boolean(MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW);
    }

    mouse_cursor_focus_location(): number {
        return this.ext.get_uint(MOUSE_CURSOR_FOCUS_LOCATION);
    }

    animate_tiling(): boolean {
        return this.ext.get_boolean(ANIMATE_TILING);
    }

    animation_duration(): number {
        return this.ext.get_uint(ANIMATION_DURATION);
    }

    mouse_cursor_warp_to_last_position(): boolean {
        return this.ext.get_boolean(MOUSE_CURSOR_WARP_TO_LAST_POSITION);
    }

    focus_follows_mouse_fix(): boolean {
        return this.ext.get_boolean(FOCUS_FOLLOWS_MOUSE_FIX);
    }

    max_window_width(): number {
        return this.ext.get_uint(MAX_WINDOW_WIDTH);
    }

    // Setters

    set_active_hint(set: boolean) {
        this.ext.set_boolean(ACTIVE_HINT, set);
    }

    set_active_hint_border_radius(set: number) {
        this.ext.set_uint(ACTIVE_HINT_BORDER_RADIUS, set);
    }

    set_active_hint_border_width(set: number) {
        this.ext.set_uint(ACTIVE_HINT_BORDER_WIDTH, set);
    }

    set_animate_tiling(set: boolean) {
        this.ext.set_boolean(ANIMATE_TILING, set);
    }

    set_inactive_hint(set: boolean) {
        this.ext.set_boolean(INACTIVE_HINT, set);
    }

    set_stacking_with_mouse(set: boolean) {
        this.ext.set_boolean(STACKING_WITH_MOUSE, set);
    }

    set_column_size(size: number) {
        this.ext.set_uint(COLUMN_SIZE, size);
    }

    set_edge_tiling(enable: boolean) {
        this.mutter?.set_boolean(EDGE_TILING, enable);
    }

    set_gap_inner(gap: number) {
        this.ext.set_uint(GAP_INNER, gap);
    }

    set_gap_outer(gap: number) {
        this.ext.set_uint(GAP_OUTER, gap);
    }

    set_hint_color_rgba(rgba: string) {
        let valid_color = new Gdk.RGBA().parse(rgba);

        if (valid_color) {
            this.ext.set_string(HINT_COLOR_RGBA, rgba);
        } else {
            this.ext.set_string(HINT_COLOR_RGBA, DEFAULT_RGBA_COLOR);
        }
    }

    set_row_size(size: number) {
        this.ext.set_uint(ROW_SIZE, size);
    }

    set_smart_gaps(set: boolean) {
        this.ext.set_boolean(SMART_GAPS, set);
    }

    set_snap_to_grid(set: boolean) {
        this.ext.set_boolean(SNAP_TO_GRID, set);
    }

    set_tile_by_default(set: boolean) {
        this.ext.set_boolean(TILE_BY_DEFAULT, set);
    }

    set_log_level(set: number) {
        this.ext.set_uint(LOG_LEVEL, set);
    }

    set_show_skiptaskbar(set: boolean) {
        this.ext.set_boolean(SHOW_SKIPTASKBAR, set);
    }

    set_mouse_cursor_follows_active_window(set: boolean) {
        this.ext.set_boolean(MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW, set);
    }

    set_mouse_cursor_focus_location(set: number) {
        this.ext.set_uint(MOUSE_CURSOR_FOCUS_LOCATION, set);
    }

    set_max_window_width(set: number) {
        this.ext.set_uint(MAX_WINDOW_WIDTH, set);
    }
}

import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import { get_current_path } from './paths.js';

interface Settings extends GObject.Object {
    get_boolean(key: string): boolean;
    set_boolean(key: string, value: boolean): void;

    get_uint(key: string): number;

    get_double(key: string): number;

    get_value(key: string): any;

    get_string(key: string): string;

    bind(key: string, object: GObject.Object, property: string, flags: any): void;
}

function settings_new_id(schema_id: string): Settings | null {
    try {
        return new Gio.Settings({ schema_id });
    } catch (_why) {
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
const TILE_BY_DEFAULT = 'tile-by-default';
const HINT_COLOR_RGBA = 'hint-color-rgba';
const HINT_COLOR_END_RGBA = 'hint-color-end-rgba';
const DEFAULT_RGBA_COLOR = 'rgba(251, 184, 108, 1)'; //pop-orange
const MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW = 'mouse-cursor-follows-active-window';
const MOUSE_CURSOR_FOCUS_LOCATION = 'mouse-cursor-focus-location';
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
    mutter: Settings | null = settings_new_id('org.gnome.mutter');

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

    active_hint_glow(): number {
        return this.ext.get_uint('active-hint-glow');
    }

    active_hint_glow_opacity(): number {
        return this.ext.get_double('active-hint-glow-opacity');
    }

    focus_flash(): number {
        return this.ext.get_uint('focus-flash');
    }

    /** Multiplier applied to border sizes, following the desktop's text scaling */
    text_scaling_factor(): number {
        return this.int ? this.int.get_double('text-scaling-factor') : 1;
    }

    /** (class pattern, title pattern) entries; empty patterns match anything */
    float_rules(): Array<[string, string]> {
        return this.ext.get_value(FLOAT_RULES).deep_unpack();
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

    tile_by_default(): boolean {
        return this.ext.get_boolean(TILE_BY_DEFAULT);
    }

    workspaces_only_on_primary(): boolean {
        return this.mutter ? this.mutter.get_boolean('workspaces-only-on-primary') : false;
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


    // Setters

    set_edge_tiling(enable: boolean) {
        this.mutter?.set_boolean(EDGE_TILING, enable);
    }

    set_tile_by_default(set: boolean) {
        this.ext.set_boolean(TILE_BY_DEFAULT, set);
    }
}

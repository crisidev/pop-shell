import * as log from './log.js';
import * as Rect from './rectangle.js';
import * as Tags from './tags.js';
import * as utils from './utils.js';
import type { Entity } from './ecs.js';
import type { Ext } from './extension.js';
import type { Rectangle } from './rectangle.js';
import * as scheduler from './scheduler.js';
import { Border } from './border.js';

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';


export var window_tracker = Shell.WindowTracker.get_default();

export class ShellWindow {
    entity: Entity;
    meta: Meta.Window;
    ext: Ext;
    stack: number | null = null;
    known_workspace: number;
    grab: boolean = false;
    activate_after_move: boolean = false;
    ignore_detach: boolean = false;
    was_attached_to?: [Entity, boolean | number];
    destroying: boolean = false;

    // Awaiting reassignment after a display update
    reassignment: boolean = false;

    // True if this window is currently smart-gapped
    smart_gapped: boolean = false;

    // True if pop-shell made this window always-on-top because it floats
    made_above: boolean = false;

    // True if this floating window was sent behind by clicking another window
    float_lowered: boolean = false;

    // True if workspace rules still need this window's WM class to place it
    workspace_rule_pending: boolean = false;

    // True while a tiling animation moves a clone of this window
    animating: boolean = false;

    border: null | Border = new Border();

    prev_rect: null | Rectangular = null;

    window_app: any;

    constructor(entity: Entity, window: Meta.Window, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;
        this.ext = ext;

        this.known_workspace = this.workspace_id();

        // Float fullscreen windows by default, such as Kodi.
        if (this.meta.is_fullscreen()) {
            ext.add_tag(entity, Tags.Floating);
        }

        this.bind_window_events();

        if (this.border) global.window_group.add_child(this.border.actor);

        ext.schedule_border_update();
    }

    activate(move_mouse: boolean = true): void {
        activate(this.ext, move_mouse, this.meta);
    }

    actor_exists(): boolean {
        return !this.destroying && this.meta.get_compositor_private() !== null;
    }

    private bind_window_events() {
        this.ext.window_signals
            .get_or(this.entity, () => new Array())
            .push(
                this.meta.connect('size-changed', () => {
                    this.window_changed();
                }),
                this.meta.connect('position-changed', () => {
                    this.window_changed();
                }),
                this.meta.connect('workspace-changed', () => {
                    this.workspace_changed();
                }),
                this.meta.connect('notify::wm-class', () => {
                    this.wm_class_changed();
                }),
                this.meta.connect('raised', () => {
                    this.window_raised();
                }),
            );
    }

    cmdline(): string | null {
        let pid = this.meta.get_pid(),
            out = null;
        if (-1 === pid) return out;

        const path = '/proc/' + pid + '/cmdline';
        if (!utils.exists(path)) return out;

        const result = utils.read_to_string(path);
        if (result.kind == 1) {
            out = result.value.trim();
        } else {
            log.error(`failed to fetch cmdline: ${result.value.format()}`);
        }

        return out;
    }

    icon(_ext: Ext, size: number): any {
        let icon = this.window_app.create_icon_texture(size);

        if (!icon) {
            icon = new St.Icon({
                icon_name: 'applications-other',
                icon_type: St.IconType.FULLCOLOR,
                icon_size: size,
            });
        }

        return icon;
    }

    is_maximized(): boolean {
        return this.meta.maximized_horizontally || this.meta.maximized_vertically;
    }

    /**
     * Window is maximized, 0 gapped or smart gapped
     */
    is_max_screen(): boolean {
        // log.debug(`title: ${this.meta.get_title()}`);
        // log.debug(`max: ${this.is_maximized()}, 0-gap: ${this.ext.settings.gap_inner() === 0}, smart: ${this.smart_gapped}`);
        return this.is_maximized() || this.ext.settings.gap_inner() === 0 || this.smart_gapped;
    }

    is_single_max_screen(): boolean {
        const display = this.meta.get_display();

        if (display) {
            let monitor_count = display.get_n_monitors();
            return (this.is_maximized() || this.smart_gapped) && monitor_count == 1;
        }

        return false;
    }

    is_snap_edge(): boolean {
        return this.meta.maximized_vertically && !this.meta.maximized_horizontally;
    }

    is_tilable(ext: Ext): boolean {
        let tile_checks = () => {
            let wm_class = this.meta.get_wm_class();

            if (wm_class !== null && wm_class.trim().length === 0) {
                wm_class = this.name(ext);
            }

            const role = this.meta.get_role();

            // Quake-style terminals such as Tilix's quake mode.
            if (role === 'quake') return false;

            // Steam loading window is less than 400px wide and 200px tall
            if (this.meta.get_title() === 'Steam') {
                const rect = this.rect();

                const is_dialog = rect.width < 400 && rect.height < 200;
                const is_first_login = rect.width === 432 && rect.height === 438;

                if (is_dialog || is_first_login) return false;
            }

            // Blacklist any windows that happen to leak through our filter
            // Windows that are tagged ForceTile are considered tilable despite exemption
            if (wm_class !== null && ext.conf.window_shall_float(wm_class, this.title())) {
                return ext.contains_tag(this.entity, Tags.ForceTile);
            }

            // Only normal windows will be considered for tiling
            return (
                this.meta.window_type == Meta.WindowType.NORMAL &&
                // Transient windows are most likely dialogs
                !this.is_transient() &&
                // If a window lacks a class, it's probably a web browser dialog
                wm_class !== null
            );
        };

        return !ext.contains_tag(this.entity, Tags.Floating) && tile_checks();
    }

    is_transient(): boolean {
        return this.meta.get_transient_for() !== null;
    }

    move(ext: Ext, rect: Rectangular, on_complete?: () => void) {
        if (!this.same_workspace() && this.is_maximized()) {
            return;
        }

        const max_width = ext.settings.max_window_width();
        if (max_width > 0 && rect.width > max_width) {
            rect.x += (rect.width - max_width) / 2;
            rect.width = max_width;
        }

        const clone = Rect.Rectangle.from_meta(rect);
        const meta = this.meta;
        const actor = meta.get_compositor_private();

        if (actor) {
            if (this.is_maximized()) {
                meta.unmaximize();
            }
            actor.remove_all_transitions();

            ext.movements.insert(this.entity, clone);

            ext.register({ tag: 2, window: this, kind: { tag: 1 } });
            if (on_complete) ext.register_fn(on_complete);
        }
    }

    name(ext: Ext): string {
        return ext.names.get_or(this.entity, () => 'unknown');
    }

    rect(): Rectangle {
        return Rect.Rectangle.from_meta(this.meta.get_frame_rect());
    }

    swap(ext: Ext, other: ShellWindow): void {
        let ar = this.rect().clone();
        let br = other.rect().clone();

        other.move(ext, ar);
        this.move(ext, br, () => this.ext.pointer.place_on(this.meta));
    }

    title(): string {
        const title = this.meta.get_title();
        return title ? title : this.name(this.ext);
    }

    workspace_id(): number {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            return workspace.index();
        } else {
            this.meta.change_workspace_by_index(0, false);
            return 0;
        }
    }

    /** True if the window is on screen in a state where it may carry a border or dim overlay */
    private border_base_permitted(): boolean {
        const actor = this.meta.get_compositor_private();
        if (!this.border || !actor || this.destroying) return false;

        return (
            actor.visible &&
            !this.animating &&
            actor.get_parent() === this.border.actor.get_parent() &&
            !this.meta.minimized &&
            !this.meta.is_fullscreen() &&
            (!this.is_single_max_screen() || this.is_snap_edge()) &&
            this.meta.located_on_workspace(global.workspace_manager.get_active_workspace())
        );
    }

    /**
     * Shows, styles, lays out and restacks this window's border and dim
     * overlay for the given focus state. Called from `Ext.update_borders`.
     */
    refresh_border(focused: boolean) {
        const border = this.border;
        if (!border) return;

        const settings = this.ext.settings;
        const base = this.border_base_permitted();
        const ring = base && (focused ? settings.active_hint() : settings.inactive_hint());
        const dim = base && !focused ? settings.inactive_dim() : 0;

        if (!ring && !(base && settings.inactive_dim() > 0)) {
            border.hide();
            border.set_dim(0, false);
            return;
        }

        const styles = this.ext.border_styles;
        border.set_ring_visible(ring);
        border.set_style(focused ? styles.active : styles.inactive);
        this.update_border_layout();
        border.set_dim(dim, true);
        border.show();
        this.restack_border();
    }

    same_workspace() {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            let workspace_id = workspace.index();
            return workspace_id === global.workspace_manager.get_active_workspace_index();
        }
        return false;
    }

    same_monitor() {
        return this.meta.get_monitor() === global.display.get_current_monitor();
    }

    /** Keeps the border directly above its window (and its stack tabs), so windows covering it cover the border too */
    restack_border() {
        const border = this.border?.actor;
        const actor = this.meta.get_compositor_private();
        if (!border || !actor) return;

        const parent = actor.get_parent();
        if (!parent || border.get_parent() !== parent) return;

        let above: Clutter.Actor = actor;
        if (this.stack !== null) {
            const tabs = this.ext.auto_tiler?.forest.stacks.get(this.stack)?.widgets?.tabs;
            if (tabs && actor.get_next_sibling() === tabs) above = tabs;
        }

        if (above.get_next_sibling() !== border) parent.set_child_above_sibling(border, above);
    }

    hide_border() {
        this.border?.hide();
    }

    update_border_layout() {
        const border = this.border;
        if (!border) return;

        const frame = this.meta.get_frame_rect();
        let { x, y, width, height } = frame;

        // Maximized and zero-gap windows draw their border inside the frame.
        let border_size = this.is_max_screen() || this.is_snap_edge() ? 0 : this.ext.border_styles.active.width;
        let tab_height = 0;

        if (this.stack !== null && border_size !== 0 && !this.grab) {
            const stack = this.ext.auto_tiler?.forest.stacks.get(this.stack);
            if (stack) tab_height = stack.tabs_height;
        }

        x -= border_size;
        y -= tab_height + border_size;
        width += 2 * border_size;
        height += tab_height + 2 * border_size;

        const workspace = this.meta.get_workspace();
        const screen = workspace?.get_work_area_for_monitor(this.meta.get_monitor());
        if (screen) {
            width = Math.min(width, screen.x + screen.width - x);
            height = Math.min(height, screen.y + screen.height - y);
        }

        border.set_geometry({ x, y, width, height }, frame);
    }

    private wm_class_changed() {
        if (this.workspace_rule_pending && this.meta.get_wm_class()) {
            this.workspace_rule_pending = false;
            this.ext.workspace_rules.apply(this.meta, true);
        }

        if (this.is_tilable(this.ext)) {
            this.ext.connect_window(this);
            if (!this.meta.minimized) {
                this.ext.auto_tiler?.auto_tile(this.ext, this, this.ext.init);
            }
        }

        this.sync_float_above();
    }

    /** True for normal top-level windows that pop-shell leaves floating while auto-tiling */
    is_floating_toplevel(): boolean {
        return (
            this.ext.auto_tiler !== null &&
            this.meta.window_type == Meta.WindowType.NORMAL &&
            !this.is_transient() &&
            !this.is_tilable(this.ext)
        );
    }

    /**
     * Keeps floating windows always-on-top, so that tiles raised by focus
     * (e.g. sloppy focus with auto-raise) don't bury them. Only undoes the
     * state pop-shell set itself, never one the user chose.
     */
    sync_float_above() {
        const floating = this.is_floating_toplevel();
        if (!floating) this.float_lowered = false;

        const above = this.ext.settings.float_above() && !this.float_lowered && floating;

        if (above && !this.made_above && !this.meta.is_above()) {
            this.meta.make_above();
            this.made_above = true;
        } else if (!above && this.made_above) {
            this.made_above = false;
            if (this.meta.is_above()) this.meta.unmake_above();
        }
    }

    /**
     * Where a floating window of size `base` goes: grown to the configured
     * minimum share of the monitor's work area, and centered on it if
     * float-center is set.
     */
    float_rect(base: Rectangular): Rectangular {
        const settings = this.ext.settings;
        const area = this.meta.get_work_area_current_monitor();
        const min = settings.float_min_size() / 100;

        const width = Math.min(area.width, Math.max(base.width, Math.round(area.width * min)));
        const height = Math.min(area.height, Math.max(base.height, Math.round(area.height * min)));

        if (!settings.float_center()) return { x: base.x, y: base.y, width, height };

        return {
            x: area.x + Math.round((area.width - width) / 2),
            y: area.y + Math.round((area.height - height) / 2),
            width,
            height,
        };
    }

    /** Applies `float_rect` to the window's current frame */
    place_floating() {
        const frame = this.meta.get_frame_rect();
        const { x, y, width, height } = this.float_rect(frame);

        if (x !== frame.x || y !== frame.y || width !== frame.width || height !== frame.height) {
            this.meta.move_resize_frame(true, x, y, width, height);
        }
    }

    private window_changed() {
        this.ext.schedule_border_update();
    }

    private window_raised() {
        this.ext.schedule_border_update();
    }

    private workspace_changed() {
        this.ext.schedule_border_update();
    }
}

/// Activates a window, and moves the mouse point.
export function activate(ext: Ext, move_mouse: boolean, win: Meta.Window) {
    try {
        // Return if window was destroyed.
        if (!win.get_compositor_private()) return;

        // Return if window is being destroyed.
        if (ext.get_window(win)?.destroying) return;

        // Return if window has override-redirect set.
        if (win.is_override_redirect()) return;

        const workspace = win.get_workspace();
        if (!workspace) return;

        scheduler.setForeground(win);

        win.unminimize();
        workspace.activate_with_focus(win, global.get_current_time());
        win.raise();

        // Keyboard and programmatic activations bring the pointer along; the
        // pointer module skips it when the pointer is already there.
        if (move_mouse) {
            ext.register_fn(() => ext.pointer.follow(win));
        } else if (global.display.get_focus_window() !== win) {
            ext.pointer.suppress(win);
        }
    } catch (error) {
        log.error(`failed to activate window: ${error}`);
    }
}

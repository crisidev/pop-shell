import * as focus from './focus.js';

import type { Ext } from './extension.js';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Windows smaller than this (in both dimensions) never pull the pointer */
const MIN_WINDOW_SIZE = 10;

/** How long the pointer must rest on a window before the slow-mouse fix focuses it */
const FOCUS_DWELL_MS = 50;

/** Inset from the frame edge for the corner focus locations */
const CORNER_INSET = 8;

interface Point {
    x: number;
    y: number;
}

function inside(rect: Rectangular, x: number, y: number): boolean {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function warp(x: number, y: number) {
    global.stage.get_context().get_backend().get_default_seat().warp_pointer(Math.round(x), Math.round(y));
}

/**
 * Pointer handling: the pointer follows keyboard-driven focus changes, and
 * slow pointer movements that mutter's sloppy focus misses still focus the
 * window under the pointer.
 *
 * A focus change moves the pointer unless the change evidently came from
 * the pointer itself: it is already inside the window (sloppy focus), a
 * button is held (a click), or it rests on shell chrome such as the top
 * bar, the dock or a notification.
 */
export class Pointer {
    private ext: Ext;

    /** Pointer position inside each window, relative to its frame, saved when warping away */
    private positions: Map<Meta.Window, Point> = new Map();

    /** Window whose next focus change must not move the pointer (activated with move_mouse = false) */
    private suppressed: Meta.Window | null = null;

    /** Last focused window, to save the pointer position before warping away from it */
    private focused: Meta.Window | null = null;

    private wm_prefs = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });

    private sloppy: boolean = false;

    private motion_signal: number | null = null;

    private prefs_signal: number | null = null;

    // Window under the pointer, cached until the pointer leaves its frame
    private hover: Meta.Window | null = null;
    private hover_rect: Rectangular | null = null;

    /** Latest pointer position inside `hover`, relative to its frame */
    private hover_point: Point | null = null;

    // Slow-mouse focus fix
    private fix_focus: boolean = false;
    private dwell: number | null = null;

    constructor(ext: Ext) {
        this.ext = ext;
    }

    enable() {
        this.prefs_signal = this.wm_prefs.connect('changed::focus-mode', () => this.update_motion());
        this.update_motion();
    }

    disable() {
        if (this.prefs_signal !== null) this.wm_prefs.disconnect(this.prefs_signal);
        this.prefs_signal = null;
        this.stop_motion();
        this.positions.clear();
        this.suppressed = null;
        this.focused = null;
    }

    /**
     * Starts or stops pointer tracking after a settings change. It feeds the
     * slow-mouse fix (sloppy focus only) and the last pointer position in
     * each window.
     */
    update_motion() {
        this.sloppy = this.wm_prefs.get_string('focus-mode') !== 'click';
        this.fix_focus = this.sloppy && this.ext.settings.focus_follows_mouse_fix();
        if (this.fix_focus || this.ext.settings.mouse_cursor_warp_to_last_position()) {
            if (this.motion_signal === null) {
                this.motion_signal = global.stage.connect('motion-event', (_: any, event: any) => {
                    this.on_motion(event);
                    return Clutter.EVENT_PROPAGATE;
                });
            }
        } else {
            this.stop_motion();
        }

        if (!this.fix_focus) this.cancel_dwell();
    }

    private stop_motion() {
        if (this.motion_signal !== null) global.stage.disconnect(this.motion_signal);
        this.motion_signal = null;
        this.cancel_dwell();
        this.invalidate_hover();
    }

    /** The next focus change to `win` leaves the pointer where it is */
    suppress(win: Meta.Window) {
        this.suppressed = win;
    }

    forget(win: Meta.Window) {
        this.positions.delete(win);
        if (this.suppressed === win) this.suppressed = null;
        if (this.focused === win) this.focused = null;
        if (this.hover === win) this.invalidate_hover();
    }

    /** Window geometry or stacking changed: the cached hover target may be stale */
    invalidate_hover() {
        this.commit_hover_point();
        this.hover = null;
        this.hover_rect = null;
    }

    /** Remembers where the pointer last was inside the hovered window */
    private commit_hover_point() {
        if (this.hover && this.hover_point) this.positions.set(this.hover, this.hover_point);
        this.hover_point = null;
    }

    /**
     * Called for every focus change to a managed window. `by_click` says
     * whether a mouse button was held when focus moved.
     */
    on_focus_changed(win: Meta.Window, by_click: boolean) {
        const previous = this.focused;
        this.focused = win;
        this.invalidate_hover();

        if (this.suppressed === win) {
            this.suppressed = null;
            return;
        }

        if (by_click) return;

        // Wait for pending tiling moves, so the pointer lands where the window ends up.
        this.ext.register_fn(() => this.follow(win, previous));
    }

    /** Moves the pointer onto `win` if the rules allow it; for explicit activations */
    follow(win: Meta.Window, previous: Meta.Window | null = this.focused) {
        if (!this.may_warp(win)) return;
        this.save_position(previous, win);
        this.warp_onto(win);
    }

    /** Moves the pointer onto `win` unconditionally (setting permitting), e.g. after swapping tiles */
    place_on(win: Meta.Window) {
        if (this.ext.settings.mouse_cursor_follows_active_window()) this.warp_onto(win);
    }

    private may_warp(win: Meta.Window): boolean {
        if (!this.ext.settings.mouse_cursor_follows_active_window()) return false;

        // Windows on every workspace (an app parked on a secondary monitor)
        // take focus when a workspace has nothing else: don't chase them.
        // Summoning one moves the pointer explicitly (place_on).
        if (win.is_on_all_workspaces()) return false;

        if (Main.overview.visible || Main.modalCount > 0) return false;
        if (global.display.get_focus_window() !== win || !win.get_compositor_private()) return false;

        const frame = win.get_frame_rect();
        if (frame.width < MIN_WINDOW_SIZE && frame.height < MIN_WINDOW_SIZE) return false;

        const [x, y] = global.get_pointer();
        if (inside(frame, x, y)) return false;

        return !this.over_chrome(x, y);
    }

    /** True if the pointer rests on shell UI (top bar, dock, notifications, menus) rather than windows */
    private over_chrome(x: number, y: number): boolean {
        const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        return actor !== null && actor !== global.stage && !global.window_group.contains(actor);
    }

    /** Saves the pointer position in the window being left by a keyboard-driven focus change */
    private save_position(previous: Meta.Window | null, next: Meta.Window) {
        if (!previous || previous === next || !this.ext.settings.mouse_cursor_warp_to_last_position()) return;
        if (!previous.get_compositor_private()) return;

        const [x, y] = global.get_pointer();
        const frame = previous.get_frame_rect();
        if (inside(frame, x, y)) this.positions.set(previous, { x: x - frame.x, y: y - frame.y });
    }

    private warp_onto(win: Meta.Window) {
        const frame = win.get_frame_rect();

        const last = this.ext.settings.mouse_cursor_warp_to_last_position() ? this.positions.get(win) : undefined;
        if (last && last.x < frame.width && last.y < frame.height) {
            warp(frame.x + last.x, frame.y + last.y);
            return;
        }

        const key = Object.keys(focus.FocusPosition)[this.ext.settings.mouse_cursor_focus_location()];
        const location = focus.FocusPosition[key as keyof typeof focus.FocusPosition];
        const left = frame.x + CORNER_INSET;
        const top = frame.y + CORNER_INSET;
        const right = frame.x + frame.width - 2 * CORNER_INSET;
        const bottom = frame.y + frame.height - 2 * CORNER_INSET;

        switch (location) {
            case focus.FocusPosition.TopRight:
                return warp(right, top);
            case focus.FocusPosition.BottomLeft:
                return warp(left, bottom);
            case focus.FocusPosition.BottomRight:
                return warp(right, bottom);
            case focus.FocusPosition.Center:
                return warp(frame.x + frame.width / 2, frame.y + frame.height / 2);
            default:
                return warp(left, top);
        }
    }

    /**
     * Per motion event this only checks a cached rectangle and records the
     * position in it; the window under the pointer is looked up when the
     * pointer leaves it.
     *
     * The slow-mouse fix: mutter's sloppy focus can miss slow movements
     * across window edges, so a single timer runs while the pointer rests on
     * an unfocused window and focuses it.
     */
    private on_motion(event: any) {
        if (Main.overview.visible || Main.modalCount > 0) return;

        const [x, y] = event.get_coords();
        if (this.hover && this.hover_rect && inside(this.hover_rect, x, y)) {
            this.hover_point = { x: x - this.hover_rect.x, y: y - this.hover_rect.y };
            return;
        }

        this.commit_hover_point();
        const win = this.window_at(x, y);
        this.hover = win;
        this.hover_rect = win ? win.get_frame_rect() : null;
        if (win && this.hover_rect) this.hover_point = { x: x - this.hover_rect.x, y: y - this.hover_rect.y };

        this.cancel_dwell();
        if (!this.fix_focus || !win || win === global.display.get_focus_window()) return;

        this.dwell = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_DWELL_MS, () => {
            this.dwell = null;
            const target = this.hover;
            const focused = this.ext.focus_window();
            // A float on top keeps focus until a click (see Ext.float_keeps_focus).
            if (focused?.made_above && this.ext.settings.float_above()) return GLib.SOURCE_REMOVE;
            if (target && target === win && target !== global.display.get_focus_window()) {
                target.focus(global.get_current_time());
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    private cancel_dwell() {
        if (this.dwell !== null) GLib.source_remove(this.dwell);
        this.dwell = null;
    }

    /** Topmost visible normal window under the given stage position */
    private window_at(x: number, y: number): Meta.Window | null {
        const workspace = global.workspace_manager.get_active_workspace();
        const actors = global.get_window_actors();

        for (let i = actors.length - 1; i >= 0; i -= 1) {
            const actor = actors[i];
            if (!actor.visible) continue;

            const win = actor.get_meta_window();
            if (!win || win.window_type !== Meta.WindowType.NORMAL || win.minimized) continue;
            if (!win.located_on_workspace(workspace)) continue;

            if (inside(win.get_frame_rect(), x, y)) return win;
        }

        return null;
    }
}

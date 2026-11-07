import type { Ext } from './extension.js';
import type { ShellWindow } from './window.js';
import * as Lib from './lib.js';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Open animations: GNOME's own, none, or pop-shell's */
export type OpenStyle = 'gnome' | 'none' | 'grow' | 'zoom' | 'fade';

/** Close animations: GNOME's own, none, or pop-shell's */
export type CloseStyle = 'gnome' | 'none' | 'shrink' | 'zoom' | 'fade';

/** Side of a window that faces the sibling it shares a fork with */
type Edge = 'left' | 'right' | 'top' | 'bottom';

/** How long a new window may stay hidden waiting to be tiled before it opens where it is */
const TILE_WAIT_MS = 300;

/** Scale zoom animations start from (open) or end at (close) */
const ZOOM_SCALE = 0.9;

interface Opening {
    /** Set once mutter maps the window */
    mapped: boolean;
    /** Tile rectangle pop-shell moved the window to, once it has */
    target: Rectangular | null;
    /** Fallback for windows that never get tiled (floats) */
    timeout: number | null;
}

interface Running {
    actor: Clutter.Actor;
    /** The window's actor, hidden while a clone animates in its place (open only) */
    source: Clutter.Actor | null;
    /** The opening window, whose border waits for the animation to end */
    window: ShellWindow | null;
}

/**
 * Window open and close animations, replacing GNOME's for normal windows
 * when the open-animation or close-animation setting picks one of
 * pop-shell's styles.
 *
 * Opening: GNOME's effect is skipped and the window kept hidden until
 * pop-shell tiles it, then a clone of it animates into its tile; "grow"
 * expands it out of the edge it shares with its sibling, so it comes out of
 * the split. Windows that don't get tiled (floats) zoom in where they are.
 *
 * Closing: when the window is unmanaged a snapshot of it replaces it, and
 * animates while the remaining tiles move into its space; "shrink"
 * collapses it into the sibling taking its place.
 */
export class WindowEffects {
    private ext: Ext;

    private opening: Map<Meta.Window, Opening> = new Map();

    private running: Set<Running> = new Set();

    private map_signal: number | null = null;

    constructor(ext: Ext) {
        this.ext = ext;
    }

    enable() {
        this.map_signal = global.window_manager.connect('map', (_: any, actor: any) => this.on_map(actor));
    }

    disable() {
        if (this.map_signal !== null) global.window_manager.disconnect(this.map_signal);
        this.map_signal = null;

        for (const [meta, opening] of this.opening) this.forget_opening(meta, opening);
        for (const run of [...this.running]) this.finish(run);
    }

    private animating(): boolean {
        return St.Settings.get().enable_animations && !Main.overview.visible;
    }

    private open_style(): OpenStyle {
        return this.ext.settings.open_animation() as OpenStyle;
    }

    private close_style(): CloseStyle {
        return this.ext.settings.close_animation() as CloseStyle;
    }

    private duration(): number {
        return this.ext.settings.open_close_duration();
    }

    /** Called when a window is created, before mutter maps it */
    on_created(meta: Meta.Window) {
        const style = this.open_style();
        if (style === 'gnome' || meta.window_type !== Meta.WindowType.NORMAL) return;

        const actor = meta.get_compositor_private();
        if (!actor) return;

        // GNOME's effect goes either way; pop-shell's replaces it.
        (Main.wm as any).skipNextEffect(actor);
        if (style === 'none' || !this.animating()) return;

        this.opening.set(meta, { mapped: false, target: null, timeout: null });
    }

    private on_map(actor: any) {
        const meta: Meta.Window | null = actor.get_meta_window?.() ?? null;
        const opening = meta ? this.opening.get(meta) : undefined;
        if (!meta || !opening) return;

        opening.mapped = true;

        if (opening.target) {
            this.open(meta, opening.target);
            return;
        }

        // Not tiled yet: stay hidden for a moment instead of flashing where mutter placed it.
        actor.opacity = 0;
        opening.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TILE_WAIT_MS, () => {
            opening.timeout = null;
            if (this.opening.get(meta) === opening) this.open(meta, meta.get_frame_rect());
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Called by the tile animator when it moves `window` to `rect`. Returns
     * true if the window is opening, in which case the open animation takes
     * the place of the move animation.
     */
    claim_open(window: ShellWindow, rect: Rectangular): boolean {
        const opening = this.opening.get(window.meta);
        if (!opening) return false;

        opening.target = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        if (opening.mapped) this.open(window.meta, opening.target);
        return true;
    }

    private forget_opening(meta: Meta.Window, opening: Opening) {
        this.opening.delete(meta);
        if (opening.timeout !== null) GLib.source_remove(opening.timeout);
        opening.timeout = null;
        const actor = meta.get_compositor_private();
        if (actor) actor.opacity = 255;
    }

    /** Plays the open animation of `meta` into `rect` (its frame rectangle) */
    private open(meta: Meta.Window, rect: Rectangular) {
        const opening = this.opening.get(meta);
        if (opening) this.forget_opening(meta, opening);

        const actor = meta.get_compositor_private();
        if (!actor || !this.animating()) return;

        // A clone would show a window from another workspace on this one.
        if (!meta.located_on_workspace(global.workspace_manager.get_active_workspace())) return;

        const to = buffer_rect(meta, rect);
        const window = this.ext.get_window(meta);
        let style = this.open_style();
        const edge = style === 'grow' && window ? this.sibling_edge(window) : null;
        if (style === 'grow' && !edge) style = 'zoom';

        const clone = new Clutter.Clone({ source: actor, reactive: false });
        global.window_group.insert_child_above(clone, actor);
        actor.opacity = 0;

        const run: Running = { actor: clone, source: actor, window };
        if (window) {
            window.animating = true;
            this.ext.schedule_border_update();
        }
        this.running.add(run);
        const done = () => this.finish(run);

        clone.set_position(to.x, to.y);
        clone.set_size(to.width, to.height);

        const ease: any = {
            duration: this.duration(),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: done,
        };

        if (style === 'grow' && edge) {
            const from = collapse(to, edge);
            clone.set_position(from.x, from.y);
            clone.set_size(from.width, from.height);
            clone.opacity = 128;
            Object.assign(ease, { ...to, opacity: 255 });
        } else if (style === 'zoom') {
            clone.set_pivot_point(0.5, 0.5);
            clone.set_scale(ZOOM_SCALE, ZOOM_SCALE);
            clone.opacity = 0;
            Object.assign(ease, { scale_x: 1, scale_y: 1, opacity: 255 });
        } else {
            clone.opacity = 0;
            Object.assign(ease, { opacity: 255 });
        }

        clone.ease(ease);
    }

    /** Called when `window` is about to be unmanaged, before GNOME's close effect */
    on_unmanaging(window: ShellWindow) {
        const meta = window.meta;
        const opening = this.opening.get(meta);
        if (opening) this.forget_opening(meta, opening);

        const style = this.close_style();
        if (style === 'gnome' || meta.window_type !== Meta.WindowType.NORMAL) return;

        const actor: any = meta.get_compositor_private();
        if (!actor) return;

        (Main.wm as any).skipNextEffect(actor);
        if (style === 'none' || !this.animating()) return;
        if (!actor.visible || meta.minimized || !window.same_workspace()) return;

        let content: any = null;
        try {
            content = actor.paint_to_content(null);
        } catch (_) {
            return;
        }
        if (!content) return;

        const from = { x: actor.x, y: actor.y, width: actor.width, height: actor.height };
        const snapshot = new Clutter.Actor({ content, reactive: false });
        snapshot.set_position(from.x, from.y);
        snapshot.set_size(from.width, from.height);
        global.window_group.insert_child_above(snapshot, actor);

        const run: Running = { actor: snapshot, source: null, window: null };
        this.running.add(run);

        const ease: any = {
            duration: this.duration(),
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            opacity: 0,
            onStopped: () => this.finish(run),
        };

        const edge = style === 'shrink' ? this.sibling_edge(window) : null;
        if (edge) {
            Object.assign(ease, collapse(from, edge));
        } else if (style === 'zoom' || style === 'shrink') {
            snapshot.set_pivot_point(0.5, 0.5);
            Object.assign(ease, { scale_x: ZOOM_SCALE, scale_y: ZOOM_SCALE });
        }

        snapshot.ease(ease);
    }

    private finish(run: Running) {
        if (!this.running.delete(run)) return;
        run.actor.destroy();
        if (run.source) run.source.opacity = 255;
        if (run.window) {
            run.window.animating = false;
            this.ext.schedule_border_update();
        }
    }

    /** The side of `window` facing the sibling it shares its fork with, if it has one */
    private sibling_edge(window: ShellWindow): Edge | null {
        const fork = this.ext.auto_tiler?.get_parent_fork(window.entity);
        if (!fork || !fork.right) return null;

        const is_window = (node: any) => node.inner.kind === 2 && node.inner.entity === window.entity;
        const horizontal = fork.orientation === Lib.Orientation.HORIZONTAL;

        if (is_window(fork.left)) return horizontal ? 'right' : 'bottom';
        if (is_window(fork.right)) return horizontal ? 'left' : 'top';
        return null;
    }
}

/** The actor (buffer) rectangle of `meta` when its frame is at `frame`, keeping client-side margins */
function buffer_rect(meta: Meta.Window, frame: Rectangular): Rectangular {
    const f = meta.get_frame_rect();
    const b = meta.get_buffer_rect();
    return {
        x: frame.x + b.x - f.x,
        y: frame.y + b.y - f.y,
        width: frame.width + b.width - f.width,
        height: frame.height + b.height - f.height,
    };
}

/** `rect` collapsed to a line along its `edge` */
function collapse(rect: Rectangular, edge: Edge): Rectangular {
    switch (edge) {
        case 'left':
            return { x: rect.x, y: rect.y, width: 1, height: rect.height };
        case 'right':
            return { x: rect.x + rect.width - 1, y: rect.y, width: 1, height: rect.height };
        case 'top':
            return { x: rect.x, y: rect.y, width: rect.width, height: 1 };
        case 'bottom':
            return { x: rect.x, y: rect.y + rect.height - 1, width: rect.width, height: 1 };
    }
}

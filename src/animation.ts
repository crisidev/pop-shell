import type { Ext } from './extension.js';
import type { ShellWindow } from './window.js';

import Clutter from 'gi://Clutter';
import St from 'gi://St';

interface Running {
    window: ShellWindow;
    actor: Clutter.Actor;
    clone: Clutter.Actor;
}

function same(a: Rectangular, b: Rectangular): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Eases tiled windows into their new place.
 *
 * Wayland clients commit their new size asynchronously, so the window
 * itself is moved and resized at once and kept transparent, while a clone
 * of it glides from the old rectangle to the new one. When the clone
 * arrives it is dropped and the window shown again.
 */
export class TileAnimator {
    private ext: Ext;

    private running: Map<Meta.Window, Running> = new Map();

    constructor(ext: Ext) {
        this.ext = ext;
    }

    private enabled(): boolean {
        return this.ext.settings.animate_tiling() && St.Settings.get().enable_animations;
    }

    /** Moves `window` to `rect`, animating the change when enabled */
    move(window: ShellWindow, actor: Clutter.Actor, rect: Rectangular) {
        const meta = window.meta;
        this.finish(meta);

        const frame = meta.get_frame_rect();
        const from = meta.get_buffer_rect();

        const animate =
            this.enabled() &&
            actor.visible &&
            !window.grab &&
            this.ext.grab_op === null &&
            window.same_workspace() &&
            from.width > 0 &&
            from.height > 0 &&
            !same(frame, rect);

        meta.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
        meta.move_frame(true, rect.x, rect.y);

        if (!animate) return;

        // Keep the buffer's offsets around the frame (shadows, client decorations).
        const to = {
            x: rect.x + from.x - frame.x,
            y: rect.y + from.y - frame.y,
            width: rect.width + from.width - frame.width,
            height: rect.height + from.height - frame.height,
        };

        const clone = new Clutter.Clone({
            source: actor,
            reactive: false,
            x: from.x,
            y: from.y,
            width: from.width,
            height: from.height,
        });

        global.window_group.insert_child_above(clone, actor);
        actor.opacity = 0;
        window.animating = true;
        this.running.set(meta, { window, actor, clone });
        this.ext.schedule_border_update();

        clone.ease({
            ...to,
            duration: this.ext.settings.animation_duration(),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.finish(meta),
        });
    }

    /** Ends the animation of `meta`, if any, showing the window in place */
    finish(meta: Meta.Window) {
        const running = this.running.get(meta);
        if (!running) return;

        this.running.delete(meta);
        running.clone.destroy();
        running.actor.opacity = 255;
        running.window.animating = false;
        this.ext.schedule_border_update();
    }

    finish_all() {
        for (const meta of [...this.running.keys()]) this.finish(meta);
    }
}

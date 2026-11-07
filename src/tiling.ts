import * as GrabOp from './grab_op.js';
import * as Log from './log.js';
import * as Rect from './rectangle.js';
import * as window from './window.js';
import * as geom from './geom.js';
import * as exec from './executor.js';

import type { Entity } from './ecs.js';
import type { Rectangle } from './rectangle.js';
import type { Ext } from './extension.js';
import { AutoTiler } from './auto_tiler.js';

import Meta from 'gi://Meta';
const { ShellWindow } = window;

export enum Direction {
    Left,
    Up,
    Right,
    Down,
}

export class Tiler {
    private keybindings: Object;

    window: Entity | null = null;

    resizing_window: boolean = false;

    queue: exec.ChannelExecutor<() => void> = new exec.ChannelExecutor();

    constructor(ext: Ext) {
        this.keybindings = {
            'management-orientation': () => this.toggle_orientation(ext),
            'tile-resize-left': () => this.resize(ext, Direction.Left),
            'tile-resize-down': () => this.resize(ext, Direction.Down),
            'tile-resize-up': () => this.resize(ext, Direction.Up),
            'tile-resize-right': () => this.resize(ext, Direction.Right),
            'tile-accept': () => this.accept(ext),
            'tile-reject': () => this.exit(ext),
        };
    }

    toggle_orientation(ext: Ext) {
        const window = ext.focus_window();
        if (window && ext.auto_tiler) {
            ext.auto_tiler.toggle_orientation(ext, window);
            ext.register_fn(() => window.activate(true));
        }
    }

    move(
        ext: Ext,
        window: Entity | null,
        focus: () => window.ShellWindow | number | null,
    ) {
        if (!window) return;
        const win = ext.windows.get(window);
        if (!win) return;

        const place_pointer = () => {
            ext.register_fn(() => win.activate(true));
        };

        if (ext.auto_tiler && win.is_tilable(ext)) {
            if (this.queue.length === 2) return;
            this.queue.send(() => {
                const focused = ext.focus_window();
                if (focused) {
                    // The window that the focused window is being moved onto
                    const move_to = focus();

                    if (move_to !== null) this.move_auto(ext, focused, move_to);
                    place_pointer();
                }
            });
        }
    }

    move_auto_(
        ext: Ext,
        mov1: Rectangle,
        mov2: Rectangle,
        callback: (m: Rectangle, a: Rectangle, mov: Rectangle) => boolean,
    ) {
        if (ext.auto_tiler && this.window) {
            const entity = ext.auto_tiler.attached.get(this.window);
            if (entity) {
                const fork = ext.auto_tiler.forest.forks.get(entity);
                const window = ext.windows.get(this.window);

                if (!fork || !window) return;

                const workspace_id = ext.workspace_id(window);

                const toplevel = ext.auto_tiler.forest.find_toplevel(workspace_id);

                if (!toplevel) return;

                const topfork = ext.auto_tiler.forest.forks.get(toplevel);

                if (!topfork) return;

                const toparea = topfork.area as Rect.Rectangle;

                const before = window.rect();

                const grab_op = new GrabOp.GrabOp(this.window as Entity, before);

                let crect = grab_op.rect.clone();

                let resize = (mov: Rectangle, func: (m: Rectangle, a: Rectangle, mov: Rectangle) => boolean) => {
                    if (func(toparea, crect, mov) || crect.eq(grab_op.rect)) return;

                    (ext.auto_tiler as AutoTiler).forest.resize(
                        ext,
                        entity,
                        fork,
                        this.window as Entity,
                        grab_op.operation(crect),
                        crect,
                    );
                    grab_op.rect = crect.clone();
                };

                resize(mov1, callback);
                resize(mov2, callback);

                ext.auto_tiler.forest.arrange(ext, fork.workspace);

                ext.register_fn(() => ext.set_overlay(window.rect()));
            }
        }
    }

    overlay_watch(ext: Ext, window: window.ShellWindow) {
        ext.register_fn(() => {
            if (window) {
                ext.set_overlay(window.rect());
                window.activate(false);
            }
        });
    }

    resize_auto(ext: Ext, direction: Direction) {
        let mov1: [number, number, number, number], mov2: [number, number, number, number];

        const hrow = 64;
        const hcolumn = 64;

        switch (direction) {
            case Direction.Left:
                mov1 = [hrow, 0, -hrow, 0];
                mov2 = [0, 0, -hrow, 0];
                break;
            case Direction.Right:
                mov1 = [0, 0, hrow, 0];
                mov2 = [-hrow, 0, hrow, 0];
                break;
            case Direction.Up:
                mov1 = [0, hcolumn, 0, -hcolumn];
                mov2 = [0, 0, 0, -hcolumn];
                break;
            default:
                mov1 = [0, 0, 0, hcolumn];
                mov2 = [0, -hcolumn, 0, hcolumn];
        }

        this.move_auto_(ext, new Rect.Rectangle(mov1), new Rect.Rectangle(mov2), (work_area, crect, mov) => {
            crect.apply(mov);
            let before = crect.clone();
            crect.clamp(work_area);
            const diff = before.diff(crect);
            crect.apply(new Rect.Rectangle([0, 0, -diff.x, -diff.y]));
            return false;
        });
    }

    move_auto(ext: Ext, focused: window.ShellWindow, move_to: window.ShellWindow | number) {
        let watching: null | window.ShellWindow = null;

        const at = ext.auto_tiler;
        if (at) {
            if (move_to instanceof ShellWindow) {
                // Siblings swap places; other windows split the one they move onto.
                const parent = at.windows_are_siblings(focused.entity, move_to.entity);
                if (parent) {
                    const fork = at.forest.forks.get(parent);
                    if (fork) {
                        if (!fork.right) {
                            Log.error('move_auto: detected as sibling, but fork lacks right branch');
                            return;
                        }

                        const temp = fork.right;
                        fork.right = fork.left;
                        fork.left = temp;

                        at.tile(ext, fork, fork.area);
                        watching = focused;
                    }
                }

                if (!watching) {
                    let movement = { src: focused.meta.get_frame_rect() };

                    focused.ignore_detach = true;
                    at.detach_window(ext, focused.entity);
                    at.attach_to_window(ext, move_to, focused, movement);
                    watching = focused;
                }
            } else {
                focused.ignore_detach = true;
                at.detach_window(ext, focused.entity);
                at.attach_to_workspace(ext, focused, [move_to, ext.active_workspace()]);
                watching = focused;
            }
        }

        if (watching) {
            this.overlay_watch(ext, watching);
        } else {
            ext.set_overlay(focused.rect());
        }
    }

    move_left(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            move_window_or_monitor(ext, ext.focus_selector.left, Meta.DisplayDirection.LEFT),
        );
    }

    move_down(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            move_window_or_monitor(ext, ext.focus_selector.down, Meta.DisplayDirection.DOWN),
        );
    }

    move_up(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            move_window_or_monitor(ext, ext.focus_selector.up, Meta.DisplayDirection.UP),
        );
    }

    move_right(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            move_window_or_monitor(ext, ext.focus_selector.right, Meta.DisplayDirection.RIGHT),
        );
    }

    /** Resizes the tiled window in management mode */
    resize(ext: Ext, direction: Direction) {
        if (!this.window || !ext.auto_tiler) return;
        this.resizing_window = true;
        this.resize_auto(ext, direction);
        this.resizing_window = false;
    }

    /** Enters management mode, which resizes tiled windows (floating windows have none) */
    enter(ext: Ext) {
        if (!this.window) {
            const win = ext.focus_window();
            if (!win || !ext.auto_tiler || !win.is_tilable(ext)) return;

            this.window = win.entity;

            if (win.is_maximized()) {
                win.meta.unmaximize();
            }

            // Set overlay to match window
            ext.set_overlay(win.rect());
            ext.overlay.visible = true;

            ext.keybindings.disable(ext.keybindings.window_focus).enable(this.keybindings);
        }
    }

    /** Leaves management mode; resizes already apply as they are made */
    accept(ext: Ext) {
        this.exit(ext);
    }

    exit(ext: Ext) {
        this.queue.clear();

        if (this.window) {
            this.window = null;

            // Disable overlay
            ext.overlay.visible = false;

            // Disable tiling keybindings
            ext.keybindings.disable(this.keybindings).enable(ext.keybindings.window_focus);
        }
    }

}

export function locate_monitor(
    win: window.ShellWindow,
    direction: Meta.DisplayDirection,
): [number, Rectangular] | null {
    if (!win.actor_exists()) return null;

    const from = win.meta.get_monitor();
    const ref = win.meta.get_work_area_for_monitor(from) as any;
    const n_monitors = global.display.get_n_monitors();

    const { UP, DOWN, LEFT } = Meta.DisplayDirection;

    let origin: [number, number];
    let exclude: (rect: Rectangular) => boolean;

    if (direction === UP) {
        origin = [ref.x + ref.width / 2, ref.y];
        exclude = (rect: Rectangular) => {
            return rect.y > ref.y;
        };
    } else if (direction === DOWN) {
        origin = [ref.x + ref.width / 2, ref.y + ref.height];
        exclude = (rect: Rectangular) => rect.y < ref.y;
    } else if (direction === LEFT) {
        origin = [ref.x, ref.y + ref.height / 2];
        exclude = (rect: Rectangular) => rect.x > ref.x;
    } else {
        origin = [ref.x + ref.width, ref.y + ref.height / 2];
        exclude = (rect: Rectangular) => rect.x < ref.x;
    }

    let next: [number, number, Rectangular] | null = null;

    for (let mon = 0; mon < n_monitors; mon += 1) {
        if (mon === from) continue;

        const work_area = win.meta.get_work_area_for_monitor(mon);

        if (!work_area || exclude(work_area)) continue;

        const weight = geom.shortest_side(origin, work_area);

        if (next === null || next[1] > weight) {
            next = [mon, weight, work_area];
        }
    }

    return next ? [next[0], next[2]] : null;
}

function move_window_or_monitor(
    ext: Ext,
    method: (ext: Ext, window: window.ShellWindow | null) => window.ShellWindow | null,
    direction: Meta.DisplayDirection,
): () => window.ShellWindow | number | null {
    return () => {
        let next_window = method.call(ext.focus_selector, ext, null);
        next_window = next_window?.actor_exists() ? next_window : null;

        // Check if a display exists between the next window and the focused window.
        const focus = ext.focus_window();
        if (focus) {
            // Return display number if the next window didn't exist.
            const next_monitor = locate_monitor(focus, direction);
            if (!next_window) return next_monitor ? next_monitor[0] : null;

            // If no monitor found, or next window is on the same display, pick the window.
            if (!next_monitor || focus.meta.get_monitor() == next_window.meta.get_monitor()) return next_window;

            // If the next window is not contained within the next display, return the display.
            return Rect.Rectangle.from_meta(next_monitor[1]).contains(next_window.rect())
                ? next_window
                : next_monitor[0];
        }

        return next_window;
    };
}

import * as GrabOp from './grab_op.js';
import * as Lib from './lib.js';
import * as Log from './log.js';
import * as Node from './node.js';
import * as Rect from './rectangle.js';
import * as window from './window.js';
import * as geom from './geom.js';
import * as exec from './executor.js';

import type { Entity } from './ecs.js';
import type { Rectangle } from './rectangle.js';
import type { Ext } from './extension.js';
import type { NodeStack } from './node.js';
import { AutoTiler } from './auto_tiler.js';
import { Fork } from './fork.js';

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

    moving: boolean = false;
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
            'toggle-stacking': () => this.toggle_stacking(ext),
        };
    }

    toggle_orientation(ext: Ext) {
        const window = ext.focus_window();
        if (window && ext.auto_tiler) {
            ext.auto_tiler.toggle_orientation(ext, window);
            ext.register_fn(() => window.activate(true));
        }
    }

    toggle_stacking(ext: Ext) {
        ext.auto_tiler?.toggle_stacking(ext);
        const win = ext.focus_window();
        if (win) this.overlay_watch(ext, win);
    }

    unstack_from_fork(
        ext: Ext,
        stack: NodeStack,
        focused: window.ShellWindow,
        fork: Fork,
        left: Node.Node,
        right: Node.Node,
        is_left: boolean,
    ): null | Fork {
        if (!ext.auto_tiler) return null;

        const forest = ext.auto_tiler.forest;
        const new_fork = forest.create_fork(left, right, fork.area, fork.workspace, fork.monitor);

        if (is_left) {
            fork.left = Node.Node.fork(new_fork[0]);
        } else {
            fork.right = Node.Node.fork(new_fork[0]);
        }

        // Associate the new fork with its parent
        ext.auto_tiler.forest.parents.insert(new_fork[0], fork.entity);

        // Update parent assignments
        forest.on_attach(new_fork[0], focused.entity);
        for (const e of stack.entities) {
            forest.on_attach(new_fork[0], e);
        }

        return new_fork[1];
    }

    move(
        ext: Ext,
        window: Entity | null,
        direction: Direction,
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

                    this.moving = true;

                    if (ext.auto_tiler) {
                        const s = ext.auto_tiler.find_stack(focused.entity);
                        if (s) {
                            this.move_from_stack(ext, s, focused, direction);
                            this.moving = false;
                            place_pointer();
                            return;
                        }
                    }

                    if (move_to !== null) this.move_auto(ext, focused, move_to, direction === Direction.Left);
                    this.moving = false;
                    place_pointer();
                }
            });
        }
    }

    move_alongside_stack(
        ext: Ext,
        [fork, branch, is_left]: [Fork, Node.Node, boolean],
        focused: window.ShellWindow,
        direction: Direction,
    ) {
        let new_fork: null | Fork = null;

        if (fork.is_toplevel && fork.smart_gapped) {
            fork.smart_gapped = false;
            let rect = ext.monitor_work_area(fork.monitor);

            rect.x += ext.gap_outer;
            rect.y += ext.gap_outer;
            rect.width -= ext.gap_outer * 2;
            rect.height -= ext.gap_outer * 2;

            fork.set_area(rect);
        }

        let orientation: Lib.Orientation, reverse: boolean;

        const { HORIZONTAL, VERTICAL } = Lib.Orientation;

        switch (direction) {
            case Direction.Left:
                orientation = HORIZONTAL;
                reverse = false;
                break;
            case Direction.Right:
                orientation = HORIZONTAL;
                reverse = true;
                break;
            case Direction.Up:
                orientation = VERTICAL;
                reverse = false;
                break;
            default:
                orientation = VERTICAL;
                reverse = true;
        }

        if (!ext.auto_tiler) return;

        const inner = branch.inner as NodeStack;
        Node.stack_remove(ext.auto_tiler.forest, inner, focused.entity);
        ext.auto_tiler.detach_window(ext, focused.entity);

        focused.stack = null;

        if (fork.right) {
            let left, right;
            if (reverse) {
                left = branch;
                right = Node.Node.window(focused.entity);
            } else {
                left = Node.Node.window(focused.entity);
                right = branch;
            }

            const inner = branch.inner as NodeStack;

            new_fork = this.unstack_from_fork(ext, inner, focused, fork, left, right, is_left);
        } else if (reverse) {
            fork.right = Node.Node.window(focused.entity);
        } else {
            fork.right = fork.left;
            fork.left = Node.Node.window(focused.entity);
        }

        let modifier = new_fork ?? fork;
        modifier.set_orientation(orientation);
        ext.auto_tiler.forest.on_attach(modifier.entity, focused.entity);
        ext.auto_tiler.tile(ext, fork, fork.area);
        this.overlay_watch(ext, focused);
    }

    move_from_stack(
        ext: Ext,
        [fork, branch, is_left]: [Fork, Node.Node, boolean],
        focused: window.ShellWindow,
        direction: Direction,
        force_detach: boolean = false,
    ) {
        if (!ext.auto_tiler) return;

        const inner = branch.inner as NodeStack;

        if (inner.entities.length === 1) {
            ext.auto_tiler.toggle_stacking(ext);
            this.overlay_watch(ext, focused);
            return;
        }

        let new_fork: null | Fork = null;

        if (fork.is_toplevel && fork.smart_gapped) {
            fork.smart_gapped = false;
            let rect = ext.monitor_work_area(fork.monitor);

            rect.x += ext.gap_outer;
            rect.y += ext.gap_outer;
            rect.width -= ext.gap_outer * 2;
            rect.height -= ext.gap_outer * 2;

            fork.set_area(rect);
        }

        const forest = ext.auto_tiler.forest;
        const fentity = focused.entity;

        const detach = (orient: Lib.Orientation, reverse: boolean) => {
            if (!ext.auto_tiler) return;
            focused.stack = null;

            if (fork.right) {
                let left, right;
                if (reverse) {
                    left = branch;
                    right = Node.Node.window(fentity);
                } else {
                    left = Node.Node.window(fentity);
                    right = branch;
                }

                new_fork = this.unstack_from_fork(ext, inner, focused, fork, left, right, is_left);
            } else if (reverse) {
                fork.right = Node.Node.window(fentity);
            } else {
                fork.right = fork.left;
                fork.left = Node.Node.window(fentity);
            }

            let modifier = new_fork ?? fork;
            modifier.set_orientation(orient);
            forest.on_attach(modifier.entity, fentity);
            ext.auto_tiler.tile(ext, fork, fork.area);
            this.overlay_watch(ext, focused);
        };

        switch (direction) {
            case Direction.Left:
                if (force_detach) {
                    Node.stack_remove(forest, inner, fentity);
                    detach(Lib.Orientation.HORIZONTAL, false);
                } else if (!Node.stack_move_left(ext, forest, inner, fentity)) {
                    detach(Lib.Orientation.HORIZONTAL, false);
                }

                ext.auto_tiler.update_stack(ext, inner);
                break;

            case Direction.Right:
                if (force_detach) {
                    Node.stack_remove(forest, inner, fentity);
                    detach(Lib.Orientation.HORIZONTAL, true);
                } else if (!Node.stack_move_right(ext, forest, inner, fentity)) {
                    detach(Lib.Orientation.HORIZONTAL, true);
                }

                ext.auto_tiler.update_stack(ext, inner);
                break;

            case Direction.Up:
                Node.stack_remove(forest, inner, fentity);
                detach(Lib.Orientation.VERTICAL, false);
                break;

            case Direction.Down:
                Node.stack_remove(forest, inner, fentity);
                detach(Lib.Orientation.VERTICAL, true);
                break;
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

    move_auto(
        ext: Ext,
        focused: window.ShellWindow,
        move_to: window.ShellWindow | number,
        stack_from_left: boolean = true,
    ) {
        let watching: null | window.ShellWindow = null;

        const at = ext.auto_tiler;
        if (at) {
            if (move_to instanceof ShellWindow) {
                // Check if we are moving onto a stack, and if so, move into the stack.
                const stack_info = at.find_stack(move_to.entity);
                if (stack_info) {
                    const [stack_fork, branch] = stack_info;
                    const stack = branch.inner as NodeStack;

                    const placement = { auto: 0 };

                    focused.ignore_detach = true;
                    at.detach_window(ext, focused.entity);

                    at.forest.on_attach(stack_fork.entity, focused.entity);
                    at.update_stack(ext, stack);

                    at.tile(ext, stack_fork, stack_fork.area);

                    focused.ignore_detach = true;
                    at.detach_window(ext, focused.entity);
                    at.attach_to_window(ext, move_to, focused, placement, stack_from_left);
                    watching = focused;
                } else {
                    const parent = at.windows_are_siblings(focused.entity, move_to.entity);
                    if (parent) {
                        const fork = at.forest.forks.get(parent);
                        if (fork) {
                            if (!fork.right) {
                                Log.error('move_auto: detected as sibling, but fork lacks right branch');
                                return;
                            }

                            if (fork.left.inner.kind === 3) {
                                Node.stack_remove(at.forest, fork.left.inner, focused.entity);
                                focused.stack = null;
                            } else {
                                const temp = fork.right;

                                fork.right = fork.left;
                                fork.left = temp;

                                at.tile(ext, fork, fork.area);
                                watching = focused;
                            }
                        }
                    }

                    if (!watching) {
                        let movement = { src: focused.meta.get_frame_rect() };

                        focused.ignore_detach = true;
                        at.detach_window(ext, focused.entity);
                        at.attach_to_window(ext, move_to, focused, movement, false);
                        watching = focused;
                    }
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
            Direction.Left,
            move_window_or_monitor(ext, ext.focus_selector.left, Meta.DisplayDirection.LEFT),
        );
    }

    move_down(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            Direction.Down,
            move_window_or_monitor(ext, ext.focus_selector.down, Meta.DisplayDirection.DOWN),
        );
    }

    move_up(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            Direction.Up,
            move_window_or_monitor(ext, ext.focus_selector.up, Meta.DisplayDirection.UP),
        );
    }

    move_right(ext: Ext, window?: Entity) {
        this.move(
            ext,
            window ?? this.window,
            Direction.Right,
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

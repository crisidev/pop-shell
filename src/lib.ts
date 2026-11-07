import * as log from './log.js';
import * as rectangle from './rectangle.js';

import type { Rectangle } from './rectangle.js';

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

export enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}

export function ok<T, X>(input: T | null, func: (a: T) => X | null): X | null {
    return input ? func(input) : null;
}

export function bench<T>(name: string, callback: () => T): T {
    const start = new Date().getMilliseconds();
    const value = callback();
    const end = new Date().getMilliseconds();

    log.info(`bench ${name}: ${end - start} ms elapsed`);

    return value;
}

// Fetch rectangle that represents the cursor
export function cursor_rect(): Rectangle {
    let [x, y] = global.get_pointer();
    return new rectangle.Rectangle([x, y, 1, 1]);
}

/** True while a mouse button is held down, e.g. when focus changes because of a click */
export function pointer_button_pressed(): boolean {
    const [, , mods] = global.get_pointer();
    const buttons =
        Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK | Clutter.ModifierType.BUTTON3_MASK;
    return (mods & buttons) !== 0;
}

/** True while a keyboard modifier is held, e.g. when focus moves through a keybinding */
export function modifier_pressed(): boolean {
    const [, , mods] = global.get_pointer();
    const modifiers =
        Clutter.ModifierType.SHIFT_MASK |
        Clutter.ModifierType.CONTROL_MASK |
        Clutter.ModifierType.MOD1_MASK |
        Clutter.ModifierType.SUPER_MASK |
        Clutter.ModifierType.MOD4_MASK;
    return (mods & modifiers) !== 0;
}

/// Missing from the Clutter API is an Actor children iterator
export function* get_children(actor: Clutter.Actor): IterableIterator<Clutter.Actor> {
    let nth = 0;
    let children = actor.get_n_children();

    while (nth < children) {
        const child = actor.get_child_at_index(nth);
        if (child) yield child;
        nth += 1;
    }
}

export function join<T>(iterator: IterableIterator<T>, next_func: (arg: T) => void, between_func: () => void) {
    ok(iterator.next().value, (first) => {
        next_func(first);

        for (const item of iterator) {
            between_func();
            next_func(item);
        }
    });
}

export function is_keyboard_op(op: number): boolean {
    const window_flag_keyboard = Meta.GrabOp.KEYBOARD_MOVING & ~Meta.GrabOp.WINDOW_BASE;
    return (op & window_flag_keyboard) != 0;
}

export function is_resize_op(op: number): boolean {
    const window_dir_mask =
        (Meta.GrabOp.RESIZING_N | Meta.GrabOp.RESIZING_E | Meta.GrabOp.RESIZING_S | Meta.GrabOp.RESIZING_W) &
        ~Meta.GrabOp.WINDOW_BASE;
    return (
        (op & window_dir_mask) != 0 ||
        (op & Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN) == Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN
    );
}

export function is_move_op(op: number): boolean {
    return !is_resize_op(op);
}

/// Useful in the event that you want to reuse an actor in the future
export function recursive_remove_children(actor: Clutter.Actor) {
    for (const child of get_children(actor)) {
        recursive_remove_children(child);
    }

    actor.remove_all_children();
}

export function separator(): any {
    return new St.BoxLayout({ styleClass: 'pop-shell-separator', x_expand: true });
}

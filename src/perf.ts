/**
 * Opt-in timing of pop-shell's own code, for finding what blows the frame
 * budget. Off unless `perf-threshold` (milliseconds) is above 0. Then every
 * entry point (keybinding, signal handler, later, timeout) that takes at
 * least that long logs its call tree, with the time spent in each
 * instrumented method and in the Mutter, Clutter, St and GSettings calls
 * made under it. Every 10 seconds of activity a summary of all entry points
 * is logged too.
 *
 * Read it with:
 *   journalctl -o cat -f "$(which gnome-shell)" | grep -A40 'PERF'
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as log from './log.js';

const SUMMARY_INTERVAL_S = 10;

/** Children shorter than this are folded into one line, in milliseconds */
const FOLD_MS = 0.05;

interface Node {
    name: string;
    count: number;
    /** Microseconds */
    total: number;
    max: number;
    kids: Map<string, Node>;
}

interface Frame {
    node: Node;
    start: number;
}

interface Patch {
    proto: any;
    method: string;
    func: any;
}

/** Minimum duration of an entry point to log, in milliseconds; 0 disables */
let threshold = 0;
const stack: Frame[] = [];
const patches: Patch[] = [];
const summary = new Map<string, { count: number; total: number; max: number }>();
let summary_source: number | null = null;

/** [prototype, label, methods] of pop-shell classes, registered at startup */
let targets: Array<[any, string, string[]]> = [];

/** Calls into GNOME libraries, recorded only beneath pop-shell code */
const NATIVE: Array<[any, string, string[]]> = [
    [
        (Meta as any).Window.prototype,
        'Meta.Window',
        [
            'move_resize_frame',
            'move_frame',
            'raise',
            'lower',
            'focus',
            'activate',
            'make_above',
            'unmake_above',
            'maximize',
            'unmaximize',
            'minimize',
            'unminimize',
            'change_workspace_by_index',
            'move_to_monitor',
            'get_frame_rect',
            'get_buffer_rect',
        ],
    ],
    [
        (Clutter as any).Actor.prototype,
        'Clutter.Actor',
        [
            'set_child_above_sibling',
            'set_child_below_sibling',
            'set_position',
            'set_size',
            'show',
            'hide',
            'ease',
            'remove_all_transitions',
        ],
    ],
    [
        (St as any).Widget.prototype,
        'St.Widget',
        ['set_style', 'add_style_class_name', 'remove_style_class_name', 'set_style_class_name'],
    ],
    [
        (Gio as any).Settings.prototype,
        'GSettings',
        ['get_boolean', 'get_uint', 'get_int', 'get_double', 'get_string', 'get_value', 'get_enum', 'get_strv'],
    ],
];

/** What queued the event being run (its path when queued), for traces */
let origin: string | null = null;

/** The chain of timed calls being run, outermost first, and what queued it */
export function path(): string {
    const p = stack.map((f) => f.node.name).join(' > ');
    return origin ? `${p} <- ${origin}` : p;
}

/** Runs a queued event's `fn` remembering `queued_by` (its `path()` when queued) */
export function with_origin<T>(queued_by: string | undefined, fn: () => T): T {
    const prev = origin;
    origin = queued_by ?? null;
    try {
        return fn();
    } finally {
        origin = prev;
    }
}

/** Logs `msg` with a timestamp and the code path that led to it, while timing is on */
export function trace(msg: string) {
    if (threshold === 0) return;
    log.log(`[TRACE] ${(now() / 1000).toFixed(1)} ${msg} | ${path() || 'from mutter'}`);
}

/** Short description of a window for traces */
export function describe(meta: Meta.Window | null): string {
    if (!meta) return 'none';
    return `${meta.get_wm_class()}:${(meta.get_title() ?? '').slice(0, 24)}`;
}

export function enabled(): boolean {
    return threshold > 0;
}

/** Registers the pop-shell methods to time, as [prototype, label, methods] */
export function register(list: Array<[any, string, string[]]>) {
    targets = list;
}

/** Turns timing on or off: `ms` is the minimum duration of an entry point to log */
export function configure(ms: number) {
    const was = threshold > 0;
    threshold = ms;
    if (ms > 0 && !was) install();
    else if (ms === 0 && was) uninstall();
}

function now(): number {
    return GLib.get_monotonic_time();
}

function enter(name: string) {
    let node: Node;
    const parent = stack[stack.length - 1];
    if (parent) {
        node = parent.node.kids.get(name) as Node;
        if (!node) {
            node = { name, count: 0, total: 0, max: 0, kids: new Map() };
            parent.node.kids.set(name, node);
        }
    } else {
        node = { name, count: 0, total: 0, max: 0, kids: new Map() };
    }
    stack.push({ node, start: now() });
}

function exit() {
    const frame = stack.pop();
    if (!frame) return;
    const elapsed = now() - frame.start;
    const node = frame.node;
    node.count += 1;
    node.total += elapsed;
    if (elapsed > node.max) node.max = elapsed;
    if (stack.length === 0) on_root(node);
}

/** Times `fn` as `name`: an entry point when nothing else is being timed */
export function span<T>(name: string, fn: () => T): T {
    if (threshold === 0) return fn();
    enter(name);
    try {
        return fn();
    } finally {
        exit();
    }
}

/** Wraps a callback (signal handler, keybinding) so that it is timed as `name` */
export function wrap<F extends (...args: any[]) => any>(name: string, fn: F): F {
    return function (this: any, ...args: any[]) {
        if (threshold === 0) return fn.apply(this, args);
        return span(name, () => fn.apply(this, args));
    } as F;
}

function patch(proto: any, label: string, method: string, nested_only: boolean) {
    const func = proto[method];
    if (typeof func !== 'function') return;
    const name = `${label}.${method}`;
    patches.push({ proto, method, func });
    proto[method] = function (this: any, ...args: any[]) {
        if (threshold === 0 || (nested_only && stack.length === 0)) return func.apply(this, args);
        enter(name);
        try {
            return func.apply(this, args);
        } finally {
            exit();
        }
    };
}

function install() {
    for (const [proto, label, methods] of targets) {
        for (const m of methods) patch(proto, label, m, false);
    }
    for (const [proto, label, methods] of NATIVE) {
        for (const m of methods) patch(proto, label, m, true);
    }
    log.log(`[PERF] timing on, logging entry points over ${threshold}ms (${patches.length} methods)`);
}

function uninstall() {
    for (const { proto, method, func } of patches.splice(0).reverse()) proto[method] = func;
    stack.length = 0;
    summary.clear();
    if (summary_source !== null) GLib.source_remove(summary_source);
    summary_source = null;
    log.log('[PERF] timing off');
}

function on_root(node: Node) {
    const entry = summary.get(node.name);
    if (entry) {
        entry.count += 1;
        entry.total += node.total;
        if (node.total > entry.max) entry.max = node.total;
    } else {
        summary.set(node.name, { count: 1, total: node.total, max: node.total });
    }

    if (summary_source === null) {
        summary_source = GLib.timeout_add(GLib.PRIORITY_LOW, SUMMARY_INTERVAL_S * 1000, () => {
            summary_source = null;
            log_summary();
            return GLib.SOURCE_REMOVE;
        });
    }

    if (node.total / 1000 >= threshold) log.log('[PERF] ' + format(node));
}

function ms(us: number): string {
    return (us / 1000).toFixed(2) + 'ms';
}

function line(node: Node): string {
    let out = node.name;
    if (node.count > 1) out += ` x${node.count}`;
    out += ` ${ms(node.total)}`;
    if (node.count > 1) out += ` (max ${ms(node.max)})`;
    return out;
}

function format(root: Node): string {
    const lines = [line(root)];

    const walk = (node: Node, depth: number) => {
        const indent = '  '.repeat(depth);
        const kids = [...node.kids.values()].sort((a, b) => b.total - a.total);
        let folded = 0,
            folded_us = 0,
            kids_us = 0;
        for (const kid of kids) {
            kids_us += kid.total;
            if (kid.total / 1000 < FOLD_MS) {
                folded += 1;
                folded_us += kid.total;
                continue;
            }
            lines.push(indent + line(kid));
            walk(kid, depth + 1);
        }
        if (folded) lines.push(`${indent}... ${folded} more ${ms(folded_us)}`);
        if (kids.length && node.total - kids_us >= FOLD_MS * 1000) {
            lines.push(`${indent}(self ${ms(node.total - kids_us)})`);
        }
    };

    walk(root, 1);
    return lines.join('\n');
}

function log_summary() {
    if (summary.size === 0) return;
    const rows = [...summary.entries()].sort((a, b) => b[1].total - a[1].total);
    const lines = rows
        .slice(0, 15)
        .map(([name, s]) => `  ${name} x${s.count} total ${ms(s.total)} max ${ms(s.max)}`);
    log.log(`[PERF] summary of the last ${SUMMARY_INTERVAL_S}s\n` + lines.join('\n'));
    summary.clear();
}

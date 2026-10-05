import * as log from './log.js';

import type { Ext } from './extension.js';
import type { ShellWindow } from './window.js';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** How many workspaces have pop-switch-workspace/pop-move-workspace keybindings */
export const WORKSPACE_KEYS = 10;

/** How long to wait for the startup overview before giving up on hiding it */
const STARTUP_OVERVIEW_TIMEOUT_MS = 5000;

interface WorkspaceRule {
    class: RegExp;
    /** 0-based workspace index */
    workspace: number;
    /** '' (any), 'primary', 'secondary', or a connector name such as 'eDP-1' */
    monitor: string;
    /** Move new windows as they open, not only when rebalancing */
    on_open: boolean;
}

/**
 * App-to-workspace rules (the `workspace-rules` key), workspace switching
 * with back-and-forth, and the startup workspace.
 */
export class Workspaces {
    private ext: Ext;

    private rules: WorkspaceRule[] = [];

    private current: number = global.workspace_manager.get_active_workspace_index();

    private previous: number | null = null;

    /** Window focused before a workspace key summoned an app on another monitor */
    private summoned_from: Meta.Window | null = null;

    constructor(ext: Ext) {
        this.ext = ext;
        this.load_rules();
    }

    load_rules() {
        this.rules = [];

        const value = this.ext.settings.workspace_rules();
        for (const [pattern, workspace, monitor, on_open] of value) {
            if (workspace < 1) continue;
            try {
                this.rules.push({ class: new RegExp(pattern, 'i'), workspace: workspace - 1, monitor, on_open });
            } catch (why) {
                log.warn(`workspace-rules: invalid class pattern '${pattern}': ${why}`);
            }
        }
    }

    private rule_for(meta: Meta.Window): WorkspaceRule | null {
        const classes = [meta.get_wm_class(), meta.get_wm_class_instance()].filter((c) => c) as string[];
        if (classes.length === 0) return null;
        return this.rules.find((rule) => classes.some((c) => rule.class.test(c))) ?? null;
    }

    /** Index of the monitor a rule asks for, or null if it has no constraint or the monitor is absent */
    private rule_monitor(rule: WorkspaceRule): number | null {
        const display = global.display;
        const primary = display.get_primary_monitor();

        switch (rule.monitor) {
            case '':
                return null;
            case 'primary':
                return primary;
            case 'secondary':
                for (let i = 0; i < display.get_n_monitors(); i += 1) {
                    if (i !== primary) return i;
                }
                return null;
            default: {
                const index = global.backend.get_monitor_manager().get_monitor_for_connector(rule.monitor);
                return index >= 0 ? index : null;
            }
        }
    }

    /** True if windows on this monitor live outside the workspaces (workspaces-only-on-primary) */
    private off_workspaces(monitor: number): boolean {
        return this.ext.settings.workspaces_only_on_primary() && monitor !== global.display.get_primary_monitor();
    }

    /**
     * Moves a window to where its rule says. Returns true if a rule matched.
     * Windows asked for on a monitor that isn't connected fall back to the
     * rule's workspace. While `opening`, only on-open rules apply.
     */
    apply(meta: Meta.Window, opening: boolean): boolean {
        if (meta.window_type !== Meta.WindowType.NORMAL || meta.get_transient_for() !== null) return false;

        const rule = this.rule_for(meta);
        if (!rule || (opening && !rule.on_open)) return false;

        const monitor = this.rule_monitor(rule);
        if (monitor !== null && meta.get_monitor() !== monitor) {
            meta.move_to_monitor(monitor);
        }

        if (monitor !== null && this.off_workspaces(monitor)) return true;

        const workspace = Math.min(rule.workspace, global.workspace_manager.get_n_workspaces() - 1);
        if (!meta.is_on_all_workspaces() && meta.get_workspace()?.index() !== workspace) {
            meta.change_workspace_by_index(workspace, false);
        }

        return true;
    }

    /** Re-applies every rule to every window */
    rebalance(notify: boolean) {
        let moved = 0;
        for (const window of this.ext.windows.values()) {
            if (this.apply(window.meta, false)) moved += 1;
        }

        if (notify) Main.notify('Pop Shell', `Rebalanced ${moved} window${moved === 1 ? '' : 's'}`);
    }

    on_active_workspace_changed() {
        const active = global.workspace_manager.get_active_workspace_index();
        if (active === this.current) return;
        this.previous = this.current;
        this.current = active;
    }

    /** Handles a `pop-switch-workspace-N` keybinding (`index` is 0-based) */
    switch_to(index: number) {
        if (this.summon(index)) return;

        let target = index;
        if (target === this.current && this.ext.settings.workspace_back_and_forth() && this.previous !== null) {
            target = this.previous;
        }

        const workspace = global.workspace_manager.get_workspace_by_index(target);
        if (!workspace || target === this.current) return;

        // Switch with the target window focused, so focus lands once instead of
        // going to the workspace's default window first and then moving.
        const window = this.ext.workspace_target(target);
        if (window) {
            workspace.activate_with_focus(window.meta, global.get_current_time());
        } else {
            workspace.activate(global.get_current_time());
        }
    }

    /** Handles a `pop-move-workspace-N` keybinding (`index` is 0-based) */
    move_to(index: number) {
        const win = this.ext.focus_window();
        if (!win || index >= global.workspace_manager.get_n_workspaces()) return;
        win.meta.change_workspace_by_index(index, false);
    }

    /**
     * With more than one monitor, a workspace key whose rule puts its app on
     * a monitor outside the workspaces focuses that app instead; pressing
     * it again goes back to the window focused before.
     */
    private summon(index: number): boolean {
        if (global.display.get_n_monitors() < 2) return false;

        const rule = this.rules.find((r) => r.workspace === index);
        if (!rule) return false;

        const monitor = this.rule_monitor(rule);
        if (monitor === null || !this.off_workspaces(monitor)) return false;

        let target: ShellWindow | null = null;
        for (const window of this.ext.windows.values()) {
            if (this.rule_for(window.meta) === rule && !window.meta.minimized) {
                target = window;
                break;
            }
        }

        if (!target) return false;

        const focused = global.display.get_focus_window();
        if (focused === target.meta) {
            const back = this.summoned_from;
            this.summoned_from = null;
            if (back && this.ext.get_window(back)) back.activate(global.get_current_time());
            return true;
        }

        this.summoned_from = focused;
        target.activate(true);
        const meta = target.meta;
        this.ext.register_fn(() => this.ext.pointer.place_on(meta));
        return true;
    }

    /** Forgets a window that is going away */
    on_window_destroyed(meta: Meta.Window) {
        if (this.summoned_from === meta) this.summoned_from = null;
    }

    /**
     * At session start, once startup windows are placed, switches to the
     * startup workspace and hides the overview GNOME opens on login.
     */
    startup() {
        const index = this.ext.settings.startup_workspace() - 1;
        if (index < 0 || !Main.layoutManager._startingUp) return;

        const id = Main.layoutManager.connect('startup-complete', () => {
            Main.layoutManager.disconnect(id);

            global.workspace_manager.get_workspace_by_index(index)?.activate(global.get_current_time());

            if (Main.overview.visible) {
                Main.overview.hide();
                return;
            }

            const shown = Main.overview.connect('shown', () => {
                Main.overview.disconnect(shown);
                GLib.source_remove(timeout);
                Main.overview.hide();
            });

            const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, STARTUP_OVERVIEW_TIMEOUT_MS, () => {
                Main.overview.disconnect(shown);
                return false;
            });
        });
    }
}

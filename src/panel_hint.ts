import type { Ext } from './extension.js';

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Border, BorderStyle } from './border.js';

/**
 * Draws the active hint's gradient border around the top bar.
 *
 * The bar's own border width and corner radius come from the shell theme,
 * so the hint lines up with it. The hint shows only while the theme's bar
 * border is transparent: a theme (or extension) that colors the border
 * takes over, and the hint comes back once it is transparent again.
 */
export class PanelHint {
    private ext: Ext;

    private border: Border | null = null;

    private signals: Array<[any, number]> = [];

    constructor(ext: Ext) {
        this.ext = ext;
    }

    enable() {
        if (this.border || !this.ext.settings.panel_hint()) return;

        const panel = Main.panel;
        const box = Main.layoutManager.panelBox;

        this.border = new Border();
        Main.layoutManager.uiGroup.insert_child_above(this.border.actor, box);

        const update = () => this.update();
        this.signals = [
            [panel, panel.connect('notify::allocation', update)],
            [panel, panel.connect('style-changed', update)],
            [box, box.connect('notify::allocation', update)],
            [box, box.connect('notify::visible', update)],
            [Main.sessionMode, Main.sessionMode.connect('updated', update)],
            [Main.overview, Main.overview.connect('showing', update)],
            [Main.overview, Main.overview.connect('hidden', update)],
        ];

        this.update();
    }

    disable() {
        for (const [object, id] of this.signals) object.disconnect(id);
        this.signals = [];
        this.border?.destroy();
        this.border = null;
    }

    /** Follows the panel-hint setting */
    sync() {
        if (this.ext.settings.panel_hint()) {
            this.enable();
            this.update();
        } else {
            this.disable();
        }
    }

    update() {
        const border = this.border;
        if (!border) return;

        const panel = Main.panel;
        const box = Main.layoutManager.panelBox;
        const node = panel.get_theme_node();
        const color = node.get_border_color(St.Side.TOP);

        const offIsland =
            Main.sessionMode.isLocked ||
            Main.sessionMode.isGreeter ||
            Main.overview.visible ||
            panel.has_style_class_name('unlock-screen') ||
            panel.has_style_class_name('login-screen');

        if (!box.visible || !panel.visible || offIsland || color.alpha > 0) {
            border.hide();
            return;
        }

        // Theme node lengths are in physical pixels; BorderStyle takes logical ones.
        const scale = this.ext.dpi;
        const width = Math.max(1, Math.round(node.get_border_width(St.Side.TOP) / scale));
        const radius = Math.round(node.get_border_radius(St.Corner.TOPLEFT) / scale);
        const s = this.ext.settings;
        border.set_style(new BorderStyle(s.hint_color_rgba(), s.hint_color_end_rgba(), width, radius, scale));

        const [x, y] = panel.get_transformed_position();
        const [w, h] = panel.get_transformed_size();
        const rect = { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
        border.set_geometry(rect, rect);
        border.show();
    }
}

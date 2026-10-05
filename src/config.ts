import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export var CONF_FILE: string = GLib.get_user_config_dir() + '/pop-shell/config.json';

export interface FloatRule {
    class?: string;
    title?: string;
    disabled?: boolean;
}

export const DEFAULT_FLOAT_RULES: Array<FloatRule> = [
    { class: 'Authy Desktop' },
    { class: 'Com.github.amezin.ddterm' },
    { class: 'Com.github.donadigo.eddy' },
    { class: 'Conky' },
    { title: 'Discord Updater' },
    { class: 'Enpass', title: 'Enpass Assistant' },
    { class: 'Floating Window Exceptions' },
    { class: 'Gjs', title: 'Settings' },
    { class: 'Gnome-initial-setup' },
    { class: 'Gnome-terminal', title: 'Preferences – General' },
    { class: 'Guake' },
    { class: 'Io.elementary.sideload' },
    { title: 'JavaEmbeddedFrame' },
    { class: 'KotatogramDesktop', title: 'Media viewer' },
    { class: 'Mozilla VPN' },
    { class: 'update-manager', title: 'Software Updater' },
    { class: 'Solaar' },
    { class: 'Steam', title: '^((?!Steam).)*$' },
    { class: 'Steam', title: '^.*(Guard|Login).*' },
    { class: 'TelegramDesktop', title: 'Media viewer' },
    { class: 'Zotero', title: 'Quick Format Citation' },
    { class: 'firefox', title: '^(?!.*Mozilla Firefox).*$' },
    { class: 'gnome-screenshot' },
    { class: 'ibus-.*' },
    { class: 'jetbrains-toolbox' },
    { class: 'jetbrains-webstorm', title: 'Customize WebStorm' },
    { class: 'jetbrains-webstorm', title: 'License Activation' },
    { class: 'jetbrains-webstorm', title: 'Welcome to WebStorm' },
    { class: 'krunner' },
    { class: 'pritunl' },
    { class: 're.sonny.Junction' },
    { class: 'system76-driver' },
    { class: 'tilda' },
    { class: 'zoom' },
    { class: '^.*action=join.*$' },
    { class: 'gjs' },
];

export interface WindowRule {
    class?: string;
    title?: string;
    disabled?: boolean;
}

/**
 * These windows will skip showing in Overview, Thumbnails or SwitcherList
 * And any rule here should be added on the DEFAULT_RULES above
 */
export const SKIPTASKBAR_EXCEPTIONS: Array<WindowRule> = [
    { class: 'Conky' },
    { class: 'gjs' },
    { class: 'Guake' },
    { class: 'Com.github.amezin.ddterm' },
    { class: 'plank' },
];

export interface FloatRule {
    class?: string;
    title?: string;
}

interface CompiledRule {
    class: RegExp | null;
    title: RegExp | null;
    disabled: boolean;
}

function compile(rules: Array<FloatRule>): Array<CompiledRule> {
    const compiled: Array<CompiledRule> = [];
    for (const rule of rules) {
        try {
            compiled.push({
                class: rule.class ? new RegExp(rule.class, 'i') : null,
                title: rule.title ? new RegExp(rule.title, 'i') : null,
                disabled: rule.disabled === true,
            });
        } catch (why) {
            log(`pop-shell: invalid float rule ${JSON.stringify(rule)}: ${why}`);
        }
    }
    return compiled;
}

/**
 * Float rules (the float-rules setting plus the built-in ones) and the few
 * options still read from ~/.config/pop-shell/config.json.
 */
export class Config {
    /** Float rules from the float-rules setting, checked before the built-in ones */
    #float: Array<FloatRule> = [];

    /** Compiled float rules, rebuilt when the setting changes */
    #compiled_float: Array<CompiledRule> | null = null;

    /**
     * List of Windows with skip taskbar true but still hidden in Overview,
     * Switchers, Workspace Thumbnails
     */
    skiptaskbarhidden: Array<WindowRule> = [];

    /** Logs window details on focus of window */
    log_on_focus: boolean = false;

    /** Sets the rules coming from the float-rules setting */
    set_extra_float(rules: Array<FloatRule>) {
        this.#float = rules;
        this.#compiled_float = null;
    }

    window_shall_float(wclass: string, title: string): boolean {
        if (this.#compiled_float === null) {
            this.#compiled_float = compile(this.#float.concat(DEFAULT_FLOAT_RULES));
        }

        for (const rule of this.#compiled_float) {
            if (rule.class && !rule.class.test(wclass)) continue;
            if (rule.title && !rule.title.test(title)) continue;
            return !rule.disabled;
        }

        return false;
    }

    skiptaskbar_shall_hide(meta_window: any) {
        let wmclass = meta_window.get_wm_class();
        let wmtitle = meta_window.get_title();

        if (!meta_window.is_skip_taskbar()) return false;

        for (const rule of this.skiptaskbarhidden.concat(SKIPTASKBAR_EXCEPTIONS)) {
            if (rule.class) {
                if (!new RegExp(rule.class, 'i').test(wmclass)) {
                    continue;
                }
            }

            if (rule.title) {
                if (!new RegExp(rule.title, 'i').test(wmtitle)) {
                    continue;
                }
            }

            return rule.disabled ? false : true;
        }

        return false;
    }

    /** Reads config.json, if there is one; a missing file leaves the defaults */
    reload() {
        try {
            const file = Gio.File.new_for_path(CONF_FILE);
            if (!file.query_exists(null)) return;

            const [, buffer] = file.load_contents(null);
            const conf = JSON.parse(new TextDecoder().decode(buffer));
            this.log_on_focus = conf.log_on_focus === true;
            this.skiptaskbarhidden = Array.isArray(conf.skiptaskbarhidden) ? conf.skiptaskbarhidden : [];
        } catch (why) {
            log(`pop-shell: error loading ${CONF_FILE}: ${why}`);
        }
    }
}

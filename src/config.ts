interface FloatRule {
    class?: string;
    title?: string;
}

const DEFAULT_FLOAT_RULES: Array<FloatRule> = [
    { class: 'Authy Desktop' },
    { class: 'Com.github.amezin.ddterm' },
    { class: 'Com.github.donadigo.eddy' },
    { class: 'Conky' },
    { title: 'Discord Updater' },
    { class: 'Enpass', title: 'Enpass Assistant' },
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

interface CompiledRule {
    class: RegExp | null;
    title: RegExp | null;
}

function compile(rules: Array<FloatRule>): Array<CompiledRule> {
    const compiled: Array<CompiledRule> = [];
    for (const rule of rules) {
        try {
            compiled.push({
                class: rule.class ? new RegExp(rule.class, 'i') : null,
                title: rule.title ? new RegExp(rule.title, 'i') : null,
            });
        } catch (why) {
            log(`pop-shell: invalid float rule ${JSON.stringify(rule)}: ${why}`);
        }
    }
    return compiled;
}

/** Float rules: the float-rules setting, then the built-in ones */
export class Config {
    /** Float rules from the float-rules setting, checked before the built-in ones */
    #float: Array<FloatRule> = [];

    /** Compiled float rules, rebuilt when the setting changes */
    #compiled_float: Array<CompiledRule> | null = null;

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
            return true;
        }

        return false;
    }
}

// simplified log4j levels
export enum LOG_LEVELS {
    OFF,
    ERROR,
    WARN,
    INFO,
    DEBUG,
}

let settings: any = null;
let cached_level: number | null = null;

/**
 * The current level, read once and then kept up to date through a
 * settings signal, so logging doesn't create a GSettings object per call.
 */
export function log_level(): number {
    if (cached_level === null) {
        // log.js is at the level of prefs.js where the popshell Ext instance
        // is not yet available or visible, so we have to use the built in
        // ExtensionUtils to get the current settings
        settings = globalThis.popShellExtension.getSettings();
        settings.connect('changed::log-level', () => (cached_level = settings.get_uint('log-level')));
        cached_level = settings.get_uint('log-level') as number;
    }

    return cached_level;
}

export function log(text: string) {
    (globalThis as any).log('pop-shell: ' + text);
}

export function error(text: string) {
    if (log_level() > LOG_LEVELS.OFF) log('[ERROR] ' + text);
}

export function warn(text: string) {
    if (log_level() > LOG_LEVELS.ERROR) log('[WARN] ' + text);
}

export function info(text: string) {
    if (log_level() > LOG_LEVELS.WARN) log('[INFO] ' + text);
}

export function debug(text: string) {
    if (log_level() > LOG_LEVELS.INFO) log('[DEBUG] ' + text);
}

import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Cairo from 'cairo';

/** Duration of the dim overlay fade on focus changes, in milliseconds */
const DIM_FADE_MS = 120;

interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

function parse_color(color: string): Rgba | null {
    const rgba = new Gdk.RGBA();
    if (!color || !rgba.parse(color)) return null;
    return { r: rgba.red, g: rgba.green, b: rgba.blue, a: rgba.alpha };
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
        a: a.a + (b.a - a.a) * t,
    };
}

function css(c: Rgba): string {
    const ch = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Math.min(1, Math.max(0, c.a)).toFixed(3)})`;
}

function edge_css(direction: 'horizontal' | 'vertical', from: Rgba, to: Rgba): string {
    const a = css(from);
    const b = css(to);
    if (a === b) return `background-color: ${a};`;
    return `background-gradient-direction: ${direction}; background-gradient-start: ${a}; background-gradient-end: ${b};`;
}

function corner_css(sides: [string, string], color: Rgba, width: number, radius: string): string {
    return (
        `border-style: solid; border-width: 0; border-color: ${css(color)}; ` +
        `border-${sides[0]}-width: ${width}px; border-${sides[1]}-width: ${width}px; ` +
        `border-radius: ${radius};`
    );
}

/**
 * Precomputed CSS for every piece of a border in one state (focused or
 * unfocused). Built once per settings change, so that focus changes only
 * swap strings instead of rebuilding them.
 *
 * The gradient runs diagonally, from `start` at the top-left corner to `end`
 * at the bottom-right corner. Along a straight edge a diagonal linear
 * gradient is itself linear, so each edge is an exact horizontal or vertical
 * St gradient between the colors of its two corners.
 */
export class BorderStyle {
    /** CSS for top, right, bottom, left, top-left, top-right, bottom-right, bottom-left */
    readonly pieces: string[];

    /** Border width in stage pixels */
    readonly width: number;

    /** Corner piece size in stage pixels */
    readonly corner: number;

    /** Outer corner radius in stage pixels */
    readonly radius: number;

    constructor(start: string, end: string, width: number, radius: number, scale: number) {
        const s = parse_color(start) ?? { r: 1, g: 1, b: 1, a: 1 };
        const e = parse_color(end) ?? s;
        const m = mix(s, e, 0.5);

        // CSS lengths are logical pixels: St multiplies them by the scale factor.
        const corner = Math.max(radius, width);
        const r = `${radius}px`;

        this.pieces = [
            edge_css('horizontal', s, m),
            edge_css('vertical', m, e),
            edge_css('horizontal', m, e),
            edge_css('vertical', s, m),
            corner_css(['top', 'left'], s, width, `${r} 0 0 0`),
            corner_css(['top', 'right'], m, width, `0 ${r} 0 0`),
            corner_css(['bottom', 'right'], e, width, `0 0 ${r} 0`),
            corner_css(['bottom', 'left'], m, width, `0 0 0 ${r}`),
        ];

        this.width = width * scale;
        this.corner = corner * scale;
        this.radius = radius * scale;
    }
}

/**
 * A glow around a rounded box: a 9-slice image, hollow inside the box, that
 * St's border-image stretches around any window size. The image is drawn
 * once per color and size and kept in the runtime directory.
 */
export class GlowStyle {
    readonly css: string;

    /** How far the glow reaches outside the box, in stage pixels */
    readonly spread: number;

    /**
     * `blur` and `radius` (the box's corner radius) are logical pixels;
     * `scale` turns them into stage pixels.
     */
    constructor(start: string, end: string, radius: number, blur: number, scale: number) {
        const s = parse_color(start) ?? { r: 1, g: 1, b: 1, a: 1 };
        const e = parse_color(end) ?? s;
        const c = mix(s, e, 0.5);

        const spread = Math.max(1, Math.round(blur * scale));
        const corner = Math.max(0, Math.round(radius * scale));
        this.spread = spread;

        const key = `${css({ ...c, a: 1 }).replace(/[^0-9,]/g, '')}-${spread}-${corner}`;
        const path = `${glow_dir()}/glow-${key}.png`;
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) draw_glow(path, c, spread, corner);

        // The slices are the corners: glow plus box corner, in image pixels.
        this.css = `border-image: url("file://${path}") ${spread + corner};`;
    }
}

function glow_dir(): string {
    const dir = `${GLib.get_user_runtime_dir()}/pop-shell`;
    GLib.mkdir_with_parents(dir, 0o700);
    return dir;
}

/**
 * Draws the glow image: transparent inside a rounded box with `corner`
 * radius whose edge is `spread` pixels from the image's, and outside it the
 * color fading out quadratically over `spread` pixels.
 */
function draw_glow(path: string, color: Rgba, spread: number, corner: number) {
    const k = spread + corner;
    const size = 2 * k + 1;
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, size, size);
    const cr = new Cairo.Context(surface);
    const half = size / 2;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            // Distance outside the box, measured from its corner arcs.
            const cx = Math.max(0, Math.abs(x + 0.5 - half) - (half - k));
            const cy = Math.max(0, Math.abs(y + 0.5 - half) - (half - k));
            const d = Math.hypot(cx, cy) - corner;
            if (d <= 0) continue;

            const t = Math.max(0, 1 - d / spread);
            if (t === 0) continue;
            cr.setSourceRGBA(color.r, color.g, color.b, color.a * t * t);
            cr.rectangle(x, y, 1, 1);
            cr.fill();
        }
    }

    // Write to a temporary name first: another window may be reading it.
    const tmp = `${path}.${GLib.get_monotonic_time()}`;
    surface.writeToPNG(tmp);
    cr.$dispose();
    Gio.File.new_for_path(tmp).move(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE, null, null);
}

type GlowMode = 'off' | 'steady' | 'flash';

/**
 * A window border drawn from eight plain St actors (four gradient edges and
 * four rounded corners) plus an optional dim overlay over the window.
 *
 * St paints and caches these natively, so a border costs nothing per frame:
 * no offscreen buffers, no shaders running over the whole window area, and
 * no JS in the paint path.
 */
export class Border {
    readonly actor: St.Widget = new St.Widget({
        style_class: 'pop-shell-active-hint',
        reactive: false,
        visible: false,
    });

    private overlay: St.Widget = new St.Widget({
        style_class: 'pop-shell-dim',
        style: 'background-color: black;',
        reactive: false,
        opacity: 0,
    });

    /**
     * Soft glow around the window, stacked by its owner right below the
     * window actor (and not parented by the border). Shows steadily or
     * flashes once (focus changes).
     */
    readonly glow: St.Widget = new St.Widget({ reactive: false, visible: false });

    private glow_mode: GlowMode = 'off';

    private glow_style: GlowStyle | null = null;

    /** Opacity a flash settles to: the steady glow's, or 0 to hide it */
    private glow_settle: { style: GlowStyle | null; opacity: number } | null = null;

    /** The border's outer rectangle, which the glow surrounds */
    private outer: Rectangular | null = null;

    private pieces: St.Widget[] = [];

    private style: BorderStyle | null = null;

    private geometry: number[] = [];

    private ring_visible: boolean = true;

    private overlay_radius: number = 0;

    constructor() {
        this.actor.add_child(this.overlay);
        for (let i = 0; i < 8; i += 1) {
            const piece = new St.Widget({
                style_class: i < 4 ? 'pop-shell-border-edge' : 'pop-shell-border-corner',
                reactive: false,
            });
            this.pieces.push(piece);
            this.actor.add_child(piece);
        }
    }

    destroy() {
        this.glow.destroy();
        this.actor.destroy();
    }

    private set_glow_style(style: GlowStyle) {
        if (this.glow_style === style) return;
        const spread_changed = this.glow_style?.spread !== style.spread;
        this.glow_style = style;
        this.glow.set_style(style.css);
        if (spread_changed) this.place_glow();
    }

    private place_glow() {
        const outer = this.outer;
        const spread = this.glow_style?.spread ?? 0;
        if (!outer) return;
        this.glow.set_position(outer.x - spread, outer.y - spread);
        this.glow.set_size(outer.width + 2 * spread, outer.height + 2 * spread);
    }

    /**
     * Shows the glow steadily at `opacity` (0 to 1), or hides it when `css`
     * is null. A running flash finishes first and
     * then settles to this state.
     */
    set_glow(css: GlowStyle | null, opacity: number) {
        const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);

        if (this.glow_mode === 'flash') {
            this.glow_settle = { style: css, opacity: css ? alpha : 0 };
            return;
        }

        if (!css) {
            if (this.glow_mode === 'off') return;
            this.glow.remove_all_transitions();
            this.glow.hide();
            this.glow_mode = 'off';
            return;
        }

        if (this.glow_mode === 'steady' && this.glow_style === css && this.glow.opacity === alpha) return;

        this.set_glow_style(css);
        this.glow.remove_all_transitions();
        this.glow_mode = 'steady';
        this.glow.opacity = alpha;
        this.glow.show();
    }

    /**
     * Flashes the glow: shows `css` fully opaque, then fades over
     * `duration` milliseconds to the steady glow (`settle_css` at
     * `settle_opacity`), or out when `settle_css` is null.
     */
    flash(css: GlowStyle, duration: number, settle_css: GlowStyle | null, settle_opacity: number) {
        this.glow.remove_all_transitions();
        this.glow_settle = {
            style: settle_css,
            opacity: settle_css ? Math.round(Math.min(1, Math.max(0, settle_opacity)) * 255) : 0,
        };
        this.glow_mode = 'flash';
        this.set_glow_style(css);
        this.glow.opacity = 255;
        this.glow.show();

        this.glow.ease({
            opacity: this.glow_settle.style === css ? this.glow_settle.opacity : 0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: (finished: boolean) => {
                // An interrupting call (hide, another flash) takes over.
                if (!finished || this.glow_mode !== 'flash') return;
                const settle = this.glow_settle;
                this.glow_settle = null;
                this.glow_mode = 'off';
                this.glow.hide();
                if (settle?.style) this.set_glow(settle.style, settle.opacity / 255);
            },
        });
    }

    set_style(style: BorderStyle) {
        if (this.style === style) return;
        const prev = this.style;
        this.style = style;

        style.pieces.forEach((css, i) => {
            if (prev?.pieces[i] !== css) this.pieces[i].set_style(css);
        });

        if (prev?.width !== style.width || prev?.corner !== style.corner) {
            this.geometry = [];
        }
    }

    /**
     * Lays out the border inside `outer`, with the dim overlay covering
     * `frame`. Both are in stage coordinates. Does nothing if unchanged.
     */
    set_geometry(outer: Rectangular, frame: Rectangular) {
        const geometry = [outer.x, outer.y, outer.width, outer.height, frame.x, frame.y, frame.width, frame.height];
        if (this.geometry.length && geometry.every((v, i) => v === this.geometry[i])) return;
        this.geometry = geometry;

        const { x, y, width: W, height: H } = outer;
        this.actor.set_position(x, y);
        this.actor.set_size(W, H);
        this.outer = { x, y, width: W, height: H };
        this.place_glow();
        this.overlay.set_position(frame.x - x, frame.y - y);
        this.overlay.set_size(frame.width, frame.height);

        if (!this.style) return;

        const w = Math.min(this.style.width, W / 2, H / 2);
        const c = Math.min(this.style.corner, W / 2, H / 2);
        const span_x = Math.max(0, W - 2 * c);
        const span_y = Math.max(0, H - 2 * c);

        const boxes = [
            [c, 0, span_x, w],
            [W - w, c, w, span_y],
            [c, H - w, span_x, w],
            [0, c, w, span_y],
            [0, 0, c, c],
            [W - c, 0, c, c],
            [W - c, H - c, c, c],
            [0, H - c, c, c],
        ];

        boxes.forEach(([px, py, pw, ph], i) => {
            const piece = this.pieces[i];
            piece.set_position(px, py);
            piece.set_size(pw, ph);
        });
    }

    /** Rounds the dim overlay's corners (in logical pixels), to match rounded windows */
    set_overlay_radius(radius: number) {
        if (this.overlay_radius === radius) return;
        this.overlay_radius = radius;
        this.overlay.set_style(`background-color: black; border-radius: ${radius}px;`);
    }

    /** Shows or hides the border ring, leaving the dim overlay alone */
    set_ring_visible(visible: boolean) {
        if (this.ring_visible === visible) return;
        this.ring_visible = visible;
        for (const piece of this.pieces) piece.visible = visible;
    }

    /** Fades the dim overlay to `alpha` (0 = no dimming) */
    set_dim(alpha: number, animate: boolean) {
        const opacity = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
        if (this.overlay.opacity === opacity && !this.overlay.get_transition('opacity')) return;

        this.overlay.remove_all_transitions();
        if (animate && this.actor.visible) {
            this.overlay.ease({ opacity, duration: DIM_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        } else {
            this.overlay.opacity = opacity;
        }
    }

    show() {
        this.actor.show();
    }

    hide() {
        this.actor.hide();
        if (this.glow_mode !== 'off') {
            this.glow.remove_all_transitions();
            this.glow.hide();
            this.glow_mode = 'off';
            this.glow_settle = null;
        }
    }

    get visible(): boolean {
        return this.actor.visible;
    }
}

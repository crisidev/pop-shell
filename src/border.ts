import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
import St from 'gi://St';

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
        this.actor.destroy();
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
    }

    get visible(): boolean {
        return this.actor.visible;
    }
}

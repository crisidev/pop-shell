import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

/** Name of the effect on window actors */
export const CORNERS_EFFECT = 'pop-shell-rounded-corners';

const DECLARATIONS = `
uniform vec4 bounds;        // frame rectangle inside the actor: x0, y0, x1, y1 (px)
uniform float clip_radius;  // corner radius (px)
uniform vec2 actor_size;    // actor size (px)
`;

// Only fragments in the corner squares outside the radius are touched;
// everything else passes through with a single comparison.
const CODE = `
vec2 p = cogl_tex_coord0_in.xy * actor_size;
vec2 c0 = bounds.xy + clip_radius;
vec2 c1 = bounds.zw - clip_radius;
vec2 q = max(max(c0 - p, p - c1), vec2(0.0));
if (q.x > 0.0 && q.y > 0.0) {
    cogl_color_out *= clamp(clip_radius - length(q) + 0.5, 0.0, 1.0);
}
`;

/**
 * GNOME 49 and 50 build shader effects on Shell.GLSLEffect. GNOME 51 removed
 * it for Clutter.ShaderEffect, which takes the same GLSL as a Cogl snippet
 * and sets uniforms by name. Each base gets its own class, since GJS only
 * takes virtual functions in the class body.
 */
const GLSLEffect: any = (Shell as any).GLSLEffect;

/** A rounded corners effect, whichever base it is built on */
export interface RoundedCorners {
    enabled: boolean;
    set_enabled(enabled: boolean): void;
    /** Sets the frame rectangle (relative to the actor) to round, and the radius */
    set_geometry(frame: Rectangular, actor_width: number, actor_height: number, radius: number): void;
}

const Effect: any = GLSLEffect
    ? GObject.registerClass(
          class RoundedCornersEffect extends GLSLEffect {
              vfunc_build_pipeline() {
                  this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, CODE, false);
              }

              set_floats(name: string, components: number, values: number[]) {
                  this.set_uniform_float(this.get_uniform_location(name), components, values);
              }
          },
      )
    : GObject.registerClass(
          class RoundedCornersEffect extends (Clutter as any).ShaderEffect {
              vfunc_get_static_snippet() {
                  return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, CODE);
              }

              set_floats(name: string, components: number, values: number[]) {
                  this.set_uniform_float(name, components, values);
              }
          },
      );

Effect.prototype.set_geometry = function (
    this: any,
    frame: Rectangular,
    actor_width: number,
    actor_height: number,
    radius: number,
) {
    const geometry = [frame.x, frame.y, frame.width, frame.height, actor_width, actor_height, radius];
    const prev: number[] | undefined = this._geometry;
    if (prev && geometry.every((v, i) => v === prev[i])) return;
    this._geometry = geometry;

    this.set_floats('bounds', 4, [frame.x, frame.y, frame.x + frame.width, frame.y + frame.height]);
    this.set_floats('clip_radius', 1, [radius]);
    this.set_floats('actor_size', 2, [actor_width, actor_height]);
    this.queue_repaint();
};

/**
 * Clips a window actor's corners to a radius, so that windows match the
 * rounded hints around them. Works on the actor's texture, so it costs an
 * offscreen buffer per window: enable it only where the corners show.
 */
export function new_rounded_corners(): RoundedCorners {
    return new Effect();
}

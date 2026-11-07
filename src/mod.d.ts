declare const global: Global, log: any;

interface Global {
    get_current_time(): number;
    get_pointer(): [number, number, number];
    get_window_actors(): Array<Meta.WindowActor>;
    log(msg: string): void;

    backend: Meta.Backend;
    compositor: Meta.Compositor;
    display: Meta.Display;
    stage: Clutter.Actor;
    window_group: Clutter.Actor;
    window_manager: Meta.WindowManager;
    workspace_manager: Meta.WorkspaceManager;
}

declare class TextDecoder {
    constructor(label?: string);
    decode(input?: Uint8Array): string;
}

interface ImportMeta {
    url: string;
}

interface Rectangular {
    x: number;
    y: number;
    width: number;
    height: number;
}

declare type SignalID = number;

declare module 'resource://*';

declare module 'gi://Gio' {
    let Gio: any;
    export default Gio;
}

declare module 'gi://St' {
    let St: any;
    export default St;
}

declare module 'gi://Clutter' {
    let Clutter: any;
    export default Clutter;
}

declare module 'gi://Shell' {
    let Shell: any;
    export default Shell;
}

declare module 'gi://Cogl' {
    let Cogl: any;
    export default Cogl;
}

declare module 'gi://Mtk' {
    let Mtk: any;
    export default Mtk;
}

declare module 'gi://Meta' {
    let Meta: any;
    export default Meta;
}

declare module 'gi://Gdk' {
    let Gdk: any;
    export default Gdk;
}

declare module 'gi://GObject' {
    let GObject: any;
    export default GObject;
}

declare module 'gi://GLib' {
    class GLib {
        PRIORITY_DEFAULT: number;
        PRIORITY_LOW: number;
        SOURCE_REMOVE: boolean;
        SOURCE_CONTINUE: boolean;

        get_monotonic_time(): number;

        idle_add(priority: any, callback: () => boolean): number;

        source_remove(id: SignalID): void;

        timeout_add(priority: number, ms: number, callback: () => boolean): number;

        get_user_config_dir(): string;
        get_user_runtime_dir(): string;
        file_test(filename: string, test: number): boolean;
        mkdir_with_parents(path: string, mode: number): number;
        FileTest: { EXISTS: number };
    }
    let gLib: GLib;
    export default gLib;
}

declare namespace GObject {
    interface Object {
        connect(signal: string, callback: (...args: any) => boolean | void): SignalID;
        disconnect(id: SignalID): void;

        ref(): this;
    }
}

declare namespace Clutter {
    enum AnimationMode {
        EASE_OUT_QUAD = 3,
    }

    interface Actor extends Rectangular, GObject.Object {
        visible: boolean;
        opacity: number;

        add(child: Actor): void;
        add_child(child: Actor): void;
        destroy(): void;
        ease(params: Object): void;
        hide(): void;
        get_child_at_index(nth: number): Clutter.Actor | null;
        get_n_children(): number;
        get_next_sibling(): Clutter.Actor | null;
        get_previous_sibling(): Clutter.Actor | null;
        add_effect_with_name(name: string, effect: any): void;
        remove_effect_by_name(name: string): void;
        insert_child_above(child: Actor, sibling: Actor | null): void;
        contains(descendant: Clutter.Actor): boolean;
        get_actor_at_pos(mode: number, x: number, y: number): Clutter.Actor | null;
        get_parent(): Clutter.Actor | null;
        get_transition(param: string): any | null;
        queue_redraw(): void;
        remove_all_children(): void;
        remove_all_transitions(): void;
        set_child_above_sibling(child: Actor, sibling: Actor | null): void;
        set_child_below_sibling(child: Actor, sibling: Actor | null): void;
        set_position(x: number, y: number): void;
        set_size(width: number, height: number): void;
        show(): void;
        get_context(): Clutter.Context;
    }

    interface ActorBox {
        new (x: number, y: number, width: number, height: number): ActorBox;
    }

    interface Seat extends GObject.Object {
        warp_pointer(x: number, y: number): void;
    }

    interface Backend extends GObject.Object {
        get_default_seat(): Seat;
    }

    interface Context extends GObject.Object {
        get_backend(): Backend;
    }
}

declare namespace Meta {
    enum DisplayDirection {
        UP,
        DOWN,
        LEFT,
        RIGHT,
    }

    interface Display extends GObject.Object {
        get_current_monitor(): number;
        get_focus_window(): null | Meta.Window;
        get_monitor_index_for_rect(rect: Rectangular): number;
        get_monitor_geometry(monitor: number): null | Rectangular;
        get_n_monitors(): number;
        get_primary_monitor(): number;
        get_tab_list(list: number, workspace: Meta.Workspace | null): Array<Meta.Window>;
    }

    interface Window extends Clutter.Actor {
        minimized: Readonly<boolean>;
        window_type: Readonly<any>;
        maximized_horizontally: Readonly<boolean>;
        maximized_vertically: Readonly<boolean>;

        activate(time: number): void;
        change_workspace_by_index(workspace: number, append: boolean): void;
        delete(timestamp: number): void;
        get_buffer_rect(): Rectangular;
        get_compositor_private(): Clutter.Actor | null;
        get_display(): Meta.Display | null;
        get_frame_rect(): Rectangular;
        get_monitor(): number;
        get_pid(): number;
        get_role(): null | string;
        get_stable_sequence(): number;
        get_title(): null | string;
        get_transient_for(): Window | null;
        get_wm_class(): string | null;
        get_wm_class_instance(): string | null;
        get_work_area_current_monitor(): Rectangular;
        get_work_area_for_monitor(monitor: number): null | Rectangular;
        get_workspace(): Workspace;
        is_above(): boolean;
        is_fullscreen(): boolean;
        is_on_all_workspaces(): boolean;
        is_override_redirect(): boolean;
        focus(timestamp: number): void;
        located_on_workspace(workspace: Workspace): boolean;
        move_to_monitor(monitor: number): void;
        make_above(): void;
        move_frame(user_op: boolean, x: number, y: number): void;
        move_resize_frame(user_op: boolean, x: number, y: number, w: number, h: number): boolean;
        raise(): void;
        unmake_above(): void;
        unmaximize(): void;
        unminimize(): void;
    }

    interface MonitorManager extends GObject.Object {
        get_monitor_for_connector(connector: string): number;
    }

    interface Backend extends GObject.Object {
        get_monitor_manager(): MonitorManager;
    }

    interface Laters extends GObject.Object {
        add(when: number, func: () => boolean): number;
        remove(id: number): void;
    }

    interface Compositor extends GObject.Object {
        get_laters(): Laters;
    }

    interface WindowActor extends Clutter.Actor {
        get_meta_window(): Meta.Window;
    }

    interface WindowManager extends GObject.Object {}

    interface Workspace extends GObject.Object {
        activate(time: number): boolean;
        activate_with_focus(window: Meta.Window, timestamp: number): void;
        get_work_area_for_monitor(monitor: number): null | Rectangular;
        index(): number;
        list_windows(): Array<Meta.Window>;
    }

    interface WorkspaceManager extends GObject.Object {
        append_new_workspace(activate: boolean, timestamp: number): Workspace;
        get_active_workspace(): Workspace;
        get_active_workspace_index(): number;
        get_n_workspaces(): number;
        get_workspace_by_index(index: number): null | Workspace;
    }
}

declare namespace St {
    interface Widget extends Clutter.Actor {
        add(child: St.Widget): void;
        get_theme_node(): any;
        hide(): void;
        set_style(inlinecss: string): boolean;
        show(): void;
    }

}

declare module 'cairo' {
    const Cairo: any;
    export default Cairo;
}

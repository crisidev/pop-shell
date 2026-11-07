# Options

Every option is a GSettings key in the `org.gnome.shell.extensions.pop-shell` schema. There is no
preferences window: set them with `gsettings`, `dconf` or home-manager. Changes apply immediately, without
restarting the shell.

Keys marked **fork** are not in upstream Pop Shell. Sizes in pixels follow GNOME's text scaling factor.

- [Setting options](#setting-options)
- [Window hints](#window-hints)
- [Tiling](#tiling)
- [Floating windows](#floating-windows)
- [Workspaces and monitors](#workspaces-and-monitors)
- [Pointer and focus](#pointer-and-focus)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Debugging](#debugging)

## Setting options

```sh
P=org.gnome.shell.extensions.pop-shell
gsettings set $P tile-by-default true
gsettings set $P hint-color-rgba 'rgb(122,162,247)'
gsettings set $P hint-color-end-rgba 'rgb(187,154,247)'
gsettings set $P inactive-dim 0.15
gsettings set $P workspace-rules "[('firefox', 2, '', true), ('^kitty\$', 1, '', false)]"
gsettings set $P float-rules "[('^org\\.gnome\\.Nautilus\$', '')]"
gsettings set $P pop-switch-workspace-2 "['<Super>2']"
```

With home-manager, unsigned integers (`u`) need `lib.hm.gvariant.mkUint32` and tuples `mkTuple`:

```nix
dconf.settings."org/gnome/shell/extensions/pop-shell" = with lib.hm.gvariant; {
  tile-by-default = true;
  active-hint = true;
  active-hint-border-width = mkUint32 2;
  hint-color-rgba = "rgb(122,162,247)";
  hint-color-end-rgba = "rgb(187,154,247)";
  inactive-hint = true;
  inactive-dim = 0.15;
  active-hint-glow = mkUint32 14;
  focus-flash = mkUint32 400;
  workspace-rules = [ (mkTuple [ "firefox" (mkUint32 2) "" true ]) ];
  float-rules = [ (mkTuple [ "^org\\.gnome\\.Nautilus$" "" ]) ];
};
```

Colors are any CSS color GTK understands: `rgb(…)`, `rgba(…)`, `#rrggbb` or a name.

## Window hints

Borders, glow and dimming around windows. They are drawn from plain St actors and cached images, with no
shaders and no work per frame, and they follow windows while tiling animations move them. Gaps are
measured between borders, so `gap-inner` and `gap-outer` are the space you see.

| Key | Type | Default | Description |
|---|---|---|---|
| `active-hint` | `b` | `false` | Draw a border around the focused window |
| `hint-color-rgba` | `s` | `'rgba(251, 184, 108, 1)'` | Border color of the focused window; the start (top-left) of its gradient. Stack tabs use it too |
| `hint-color-end-rgba` **fork** | `s` | `''` | End (bottom-right) color of the focused border's diagonal gradient. Empty for a solid color |
| `active-hint-border-width` **fork** | `u` | `3` | Border width, 1–10, for focused and unfocused windows |
| `active-hint-border-radius` | `u` | `5` | Corner radius of borders, 0–30, and of rounded windows |
| `inactive-hint` **fork** | `b` | `false` | Also draw a border around unfocused windows |
| `inactive-hint-color-rgba` **fork** | `s` | `'rgba(251, 184, 108, 0.3)'` | Start color of unfocused borders |
| `inactive-hint-color-end-rgba` **fork** | `s` | `''` | End color of unfocused borders. Empty for a solid color |
| `inactive-dim` **fork** | `d` | `0.0` | Opacity, 0–0.8, of a black overlay over unfocused windows; it fades in and out on focus changes. 0 disables it |
| `active-hint-glow` **fork** | `u` | `0` | Radius, 0–64, of a soft glow around the focused window, in the mix of the border colors. Only the outside of the window glows, so translucent windows aren't tinted. 0 disables it |
| `active-hint-glow-opacity` **fork** | `d` | `0.6` | Opacity of the glow, 0–1 |
| `focus-flash` **fork** | `u` | `0` | When focus moves by keyboard, flash the focused window's glow and fade it back over this many milliseconds (up to 2000). Without a glow, a 12 px one flashes and fades out. Pointer focus doesn't flash. 0 disables it |
| `round-windows` **fork** | `b` | `false` | Round window corners to sit inside the borders. Off for maximized, edge-to-edge and fullscreen windows. Costs a GPU buffer per visible window |
| `panel-hint` **fork** | `b` | `false` | Draw the focused border's gradient around the top bar, for themes whose bar border is transparent. Hidden on the lock and login screens and over the overview |

## Tiling

| Key | Type | Default | Description |
|---|---|---|---|
| `tile-by-default` | `b` | `false` | Turn auto-tiling on at login (toggle it with `toggle-tiling`) |
| `gap-inner` | `u` | `2` | Gap between tiled windows |
| `gap-outer` | `u` | `2` | Gap between tiled windows and the screen edges |
| `smart-gaps` | `b` | `false` | No outer gap when a monitor's workspace holds a single tiled window |
| `max-window-width` | `u` | `0` | Maximum width of tiled windows, centered in their tile. 0 disables it |
| `stacking-with-mouse` | `b` | `true` | Dropping a window onto another one with the mouse stacks them |
| `animate-tiling` **fork** | `b` | `false` | Ease tiled windows into their new place. Follows GNOME's animation setting |
| `animation-duration` **fork** | `u` | `150` | Length of tiling animations, 50–1000 milliseconds |

## Floating windows

| Key | Type | Default | Description |
|---|---|---|---|
| `float-rules` **fork** | `a(ss)` | `[]` | Windows that float instead of tiling, as `(class, title)` regular expressions, case-insensitive, matched against the WM class and the title; `''` matches anything. Checked before the rules in `~/.config/pop-shell/config.json` and the built-in ones. Find a window's class with Looking Glass (`Alt`+`F2`, `lg`, Windows) |
| `float-above` **fork** | `b` | `true` | Floating windows stay above tiles. With sloppy focus, a float keeps focus when only the pointer moves onto a tile. Clicking another window sends floats back to normal stacking until one is focused again; keyboard focus changes move focus but leave floats on top |
| `float-center` **fork** | `b` | `true` | New floating windows, and windows toggled to floating, open centered on their monitor |
| `float-min-size` **fork** | `u` | `50` | Minimum size of floating windows, 0–100 % of the work area. 0 disables it |

## Workspaces and monitors

| Key | Type | Default | Description |
|---|---|---|---|
| `workspace-rules` **fork** | `a(susb)` | `[]` | Where apps go, as `(class, workspace, monitor, on-open)`. See below |
| `workspace-back-and-forth` **fork** | `b` | `true` | Pressing the key of the current workspace goes back to the previous one |
| `startup-workspace` **fork** | `u` | `0` | Workspace, from 1, to land on at login, with the overview hidden. 0 disables it |
| `pop-switch-workspace-1` … `-10` **fork** | `as` | `[]` | Switch to a workspace, landing on its last focused window |
| `pop-move-workspace-1` … `-10` **fork** | `as` | `[]` | Move the focused window to a workspace |
| `rebalance-windows` **fork** | `as` | `[]` | Move every window to where its workspace rule puts it |

Workspace rules, in detail:

- `class` is a case-insensitive regular expression matched against the window's WM class and instance.
- `workspace` counts from 1.
- `monitor` is `''` (any), `'primary'`, `'secondary'`, or a connector name such as `'eDP-1'` or `'DP-2'`.
- With `on-open`, new windows move as they open. Without it the rule only applies when windows are
  rebalanced: the `rebalance-windows` key, or a monitor change.
- With `workspaces-only-on-primary`, a window on another monitor is on every workspace. Its rule's
  workspace then counts only when that monitor isn't connected. Pressing that workspace's
  `pop-switch-workspace-N` key focuses the app on the other monitor instead, and pressing it again goes
  back to the window you came from.

Monitors are tracked by connector: when monitors are renumbered (docking, hotplug) their tiling trees
stay with them, and windows of a monitor that went away move to the primary one.

## Pointer and focus

The pointer follows keyboard focus changes, unless the change evidently came from the pointer: it is
already inside the window, a button is held, or it rests on shell UI such as the top bar, the dock or a
notification. It waits until moved windows have settled and been drawn, so sloppy focus can't bounce
focus between windows.

| Key | Type | Default | Description |
|---|---|---|---|
| `mouse-cursor-follows-active-window` | `b` | `true` | Move the pointer onto windows focused by keyboard |
| `mouse-cursor-focus-location` | `u` | `0` | Where the pointer lands: 0 top left, 1 top right, 2 bottom left, 3 bottom right, 4 center |
| `mouse-cursor-warp-to-last-position` **fork** | `b` | `false` | Land where the pointer last was in that window instead, when it has been there |
| `focus-follows-mouse-fix` **fork** | `b` | `true` | With sloppy focus, focus the window under a resting pointer when GNOME misses a slow movement across a window edge |

## Keyboard shortcuts

Shortcuts are string arrays in GTK accelerator syntax, such as `['<Super>Return', '<Super>KP_Enter']`;
`[]` disables one. `make configure` also changes some GNOME shortcuts that clash with these.

Global:

| Key | Default | Action |
|---|---|---|
| `focus-left`, `-down`, `-up`, `-right` | `<Super>` + arrow, keypad arrow, or `h` `j` `k` `l` | Focus the window in that direction |
| `tile-enter` | `<Super>Return`, `<Super>KP_Enter` | Enter window management mode |
| `toggle-tiling` | `<Super>y` | Turn auto-tiling on or off |
| `toggle-floating` | `<Super>g` | Float or tile the focused window |
| `tile-orientation` | `<Super>o` | Toggle the orientation of the focused window's split |
| `toggle-stacking-global` | `<Super>s` | Turn the focused window's place in the tree into a stack (tabs), or back |
| `tile-move-left-global`, `-down`, `-up`, `-right` | `[]` | Move the focused tile in that direction, without entering management mode |

The workspace shortcuts (`pop-switch-workspace-N`, `pop-move-workspace-N`, `rebalance-windows`) are in
[Workspaces and monitors](#workspaces-and-monitors). Moving a window to the next workspace or monitor
uses GNOME's own shortcuts (`move-to-workspace-*`, `move-to-monitor-*`).

Window management mode resizes the focused tiled window; it doesn't open on floating windows, which you
move and resize with the mouse. In it:

| Key | Default | Action |
|---|---|---|
| `tile-resize-left`, `-down`, `-up`, `-right` | `<Shift>` + arrow, keypad arrow, or `h` `j` `k` `l` | Shrink or grow the window, 64 px per press |
| `management-orientation` | `o` | Toggle the split orientation |
| `toggle-stacking` | `s` | Stack or unstack |
| `tile-accept` | `Return`, `KP_Enter` | Leave the mode (resizes apply as you make them) |
| `tile-reject` | `Escape` | Leave the mode |

## Debugging

| Key | Type | Default | Description |
|---|---|---|---|
| `log-level` | `u` | `0` | Logging to the shell's journal: 0 off, 1 errors, 2 warnings, 3 info, 4 debug |

Read the logs with `journalctl -o cat -f "$(which gnome-shell)" | grep pop-shell`.

`~/.config/pop-shell/config.json` can set `log_on_focus` to log every focused window.

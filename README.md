

# Pop Shell (crisidev fork)

https://github.com/user-attachments/assets/819550b1-52cb-486e-af02-d30908601296

A fork of [Pop Shell](https://github.com/pop-os/shell), System76's GNOME Shell extension that adds
i3-style tiling to GNOME: keyboard-driven focus and movement, an auto-tiling tree, and
floating windows that coexist with it.

This fork targets **GNOME 49, 50 and 51 on Wayland** only (branch `master_noble`). It adds window hints and
effects, workspace and float rules, and pointer handling, removes what Wayland-only GNOME no longer
needs, and is configured entirely through GSettings, so a whole setup can be declared in dconf or
home-manager. Every option is documented in **[OPTIONS.md](OPTIONS.md)**.

## What's different from upstream

### Added

- **Window hints**: borders with a diagonal two-color gradient, borders around unfocused windows,
  dimming of unfocused windows, a soft glow around the focused window that flashes when focus moves by
  keyboard, rounded window corners to match, and the gradient around the top bar. All drawn without
  shaders or per-frame work, and they stay on windows while they slide into place.
- **Tiling animations**: tiled windows ease into their new place.
- **Floating windows**: float rules as a setting (regular expressions on class and title), floats that
  stay above tiles and keep focus under sloppy focus, open centered, and have a minimum size.
- **Workspaces**: rules that send apps to a workspace and monitor (primary, secondary or a connector),
  on open or on demand; per-workspace switch shortcuts with back-and-forth; a startup workspace;
  and, with several monitors, workspace keys that summon an app parked on another monitor.
- **Pointer**: the pointer follows keyboard focus, to a chosen spot or to where it last was in that
  window, without fighting sloppy focus; slow pointer movements that GNOME's sloppy focus misses still
  focus the window under the pointer.
- **Monitors**: followed by connector, so tiling trees survive renumbering when docking, and windows of
  an unplugged monitor move to the primary.

### Fixed

- Focus bouncing between windows (and the dimming blinking with it) when moving, opening or closing
  tiles: pointer warps wait for windows to settle and be drawn before sloppy focus can react.
- Windows on all workspaces no longer wobble and steal focus on secondary monitors.
- GNOME 49, 50 and 51 APIs (Mutter 17, 18 and 19).

### Removed

- The launcher, and the D-Bus methods only it used (`ClearNotifications` stays).
- The preferences window and the top bar menu: every option is a GSettings key.
- The GTK color picker and floating exceptions dialogs: colors and float rules are settings.
- The floating-mode grid (`snap-to-grid`, `column-size`, `row-size`), and moving and swapping windows
  inside window management mode, which now only resizes tiles. Tiles move with
  `tile-move-*-global`.
- Pop Shell's move-to-monitor and move-to-workspace up/down shortcuts: GNOME's own do the same.
- `smart-gaps` and `max-window-width`.
- `~/.config/pop-shell/config.json`: float rules are the `float-rules` setting.
- Light, dark and high contrast stylesheets, and the theme watching that switched them: hints take
  their colors from the settings.
- Showing windows that skip the taskbar (minimized to tray) in the overview and Alt+Tab.
- Stacks (windows tabbed together in one tile), with `toggle-stacking`, `toggle-stacking-global` and
  `stacking-with-mouse`: dropping a window onto another always splits it.
- The System76 scheduler integration.
- Window title hiding and other X11-only code, and support for GNOME before 49.

## Install

You need GNU Make and TypeScript (`tsc`).

```sh
git clone -b master_noble https://github.com/crisidev/pop-shell
cd pop-shell
make local-install   # build, install to ~/.local/share/gnome-shell/extensions
make configure       # once: apply pop-shell's keyboard shortcuts and mutter settings
```

Log out and back in (GNOME Shell can't reload on Wayland), then enable the extension:
`gnome-extensions enable pop-shell@system76.com`. To remove it, run `make uninstall` and reset the
keyboard shortcuts in GNOME Settings.

## Configure

```sh
P=org.gnome.shell.extensions.pop-shell
gsettings set $P tile-by-default true
gsettings set $P active-hint true
gsettings set $P hint-color-rgba 'rgb(122,162,247)'
gsettings set $P hint-color-end-rgba 'rgb(187,154,247)'
gsettings set $P inactive-dim 0.15
gsettings set $P active-hint-glow 14
gsettings set $P animate-tiling true
```

See [OPTIONS.md](OPTIONS.md) for every key, home-manager examples and the keyboard shortcuts.

## Use

- `Super` + arrows (or `h` `j` `k` `l`): focus the window in that direction.
- `Super` + `Return`: window management mode, to resize the focused tile with `Shift` + arrows;
  `Return` or `Escape` leaves it. Bind `tile-move-*-global` to move tiles around.
- `Super` + `y`: toggle auto-tiling. `Super` + `g`: float or tile a window. `Super` + `o`: toggle a
  split's orientation.
- `pop-switch-workspace-N` switches workspace; GNOME's `move-to-workspace-N` moves windows to one.

## Develop

The extension is written in TypeScript and transpiled to the GNOME Shell's ES modules.

- `make local-install` rebuilds and installs; `make debug` also follows the shell's log.
- On Wayland, log out and back in to load a build, or run a nested shell with `make nested`.
- `TESTING.md` has a manual test checklist.

## License

GNU General Public License, version 3.0: see [LICENSE](LICENSE). Pop Shell is by System76 and its
contributors.

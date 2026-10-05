# Pop Shell

Pop Shell is a keyboard-driven layer for GNOME Shell which allows for quick and sensible navigation and management of windows. The core feature of Pop Shell is the addition of advanced tiling window management — a feature that has been highly sought within our community. For many — ourselves included — i3wm has become the leading competitor to the GNOME desktop.

Tiling window management in GNOME is virtually nonexistent, which makes the desktop awkward to interact with when your needs exceed that of two windows at a given time. Luckily, GNOME Shell is an extensible desktop with the foundations that make it possible to implement a tiling window manager on top of the desktop.

Therefore, we see an opportunity here to advance the usability of the GNOME desktop to better accommodate the needs of our community with Pop Shell. Advanced tiling window management is a must for the desktop, so we've merged i3-like tiling window management with the GNOME desktop for the best of both worlds.

[![](./screenshot.webp)](https://raw.githubusercontent.com/pop-os/shell/master/screenshot.webp)

---

## About this fork

This is [crisidev/pop-shell](https://github.com/crisidev/pop-shell), a personal fork of Pop Shell for
**GNOME 49 and 50 on Wayland** (branch `master_noble`). It adds the ricing and workflow features below,
drops what Wayland-only GNOME no longer needs, and keeps everything configurable through GSettings, so a
whole setup can be declared in dconf (for example from home-manager).

### Window hints

Borders are drawn from plain St actors (four gradient edges, four rounded corners): no shaders or
offscreen buffers, and no work per frame.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `active-hint-border-width` | `u` | `3` | Border width in pixels, for focused and unfocused windows |
| `hint-color-end-rgba` | `s` | `''` | Gradient end color (bottom-right); `hint-color-rgba` is the start (top-left). Empty for a solid color |
| `inactive-hint` | `b` | `false` | Also draw a border around unfocused windows |
| `inactive-hint-color-rgba`, `inactive-hint-color-end-rgba` | `s` | | Gradient of the unfocused border |
| `inactive-dim` | `d` | `0.0` | Opacity of a black overlay over unfocused windows (0 disables) |
| `panel-hint` | `b` | `false` | Draw the active hint around the top bar while the theme's bar border is transparent |

Sizes follow `text-scaling-factor`. Gaps are measured between borders, so `gap-inner` and `gap-outer`
are the space you actually see. Stack tabs use the hint colors as well.

### Floating windows

| Key | Type | Default | Meaning |
|---|---|---|---|
| `float-rules` | `a(ss)` | `[]` | `(class, title)` regular expressions (case-insensitive, `''` matches anything) of windows that float |
| `float-above` | `b` | `true` | Floats stay above tiles (so sloppy focus doesn't bury them) until another window is clicked |
| `float-center` | `b` | `true` | New floats, and windows toggled to floating, open centered |
| `float-min-size` | `u` | `50` | Minimum float size, as a percentage of the work area (0 disables) |

### Workspaces

| Key | Type | Default | Meaning |
|---|---|---|---|
| `workspace-rules` | `a(susb)` | `[]` | `(class, workspace, monitor, on-open)`: apps' workspace (from 1) and monitor (`''`, `primary`, `secondary` or a connector). On-open rules place new windows; all rules apply on rebalance and after monitor changes |
| `workspace-back-and-forth` | `b` | `true` | Pressing the current workspace's key goes back to the previous workspace |
| `startup-workspace` | `u` | `0` | Workspace (from 1) to land on at login, with the overview hidden; 0 disables |
| `pop-switch-workspace-1` … `-10` | `as` | `[]` | Switch to a workspace. With several monitors, a workspace whose rule parks its app on a monitor outside the workspaces focuses that app instead, and toggles back |
| `pop-move-workspace-1` … `-10` | `as` | `[]` | Move the focused window to a workspace |
| `rebalance-windows` | `as` | `[]` | Re-apply every workspace rule |

### Pointer

The pointer follows focus changes unless they evidently came from the pointer: it is already inside the
window, a button is held, or it rests on the top bar, the dock or a notification.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `mouse-cursor-follows-active-window` | `b` | `true` | Enable pointer following |
| `mouse-cursor-focus-location` | `u` | `0` | Where it lands: 0 top-left … 4 center |
| `mouse-cursor-warp-to-last-position` | `b` | `false` | Return to the last pointer position inside each window instead |
| `focus-follows-mouse-fix` | `b` | `true` | Focus the window under a resting pointer when sloppy focus misses a slow movement |

The `com.System76.PopShell` D-Bus service also offers `ClearNotifications`.

### Animations

| Key | Type | Default | Meaning |
|---|---|---|---|
| `animate-tiling` | `b` | `false` | Ease tiled windows into their new place (also in the panel menu; follows GNOME's animation setting) |
| `animation-duration` | `u` | `150` | Animation length in milliseconds |

### Removed

The launcher (use any launcher you like), window title hiding and other X11-only code, the GTK 3 color
picker and floating exceptions dialogs (colors and float rules are settings), and support for GNOME
releases before 49.

### Example

```sh
P=org.gnome.shell.extensions.pop-shell
gsettings set $P inactive-hint true
gsettings set $P hint-color-rgba 'rgb(122,162,247)'
gsettings set $P hint-color-end-rgba 'rgb(187,154,247)'
gsettings set $P workspace-rules "[('firefox', 2, '', true), ('^kitty\$', 1, '', false)]"
gsettings set $P pop-switch-workspace-2 "['<Super>2']"
gsettings set $P float-rules "[('^org\\.gnome\\.Nautilus\$', '')]"
```

---

## Table of Contents

- [About this fork](#about-this-fork): What this fork adds and removes
- [The Proposal](#the-proposal): Possible upstreaming into GNOME
- [The Problem](#the-problem): Why we need this in GNOME
- [Installation](#installation): For those wanting to install this on their distribution
- The Solution:
  - [Shared Features](#shared-features): Behaviors shared between stacking and auto-tiling modes
  - [Floating Mode](#floating-mode): Behaviors specific to the floating mode
  - [Tiling Mode](#tiling-mode): Behaviors specific to the auto-tiling mode
- [Developers](#developers): Guide for getting started with development
---

## The Proposal

A proposal for integration of the tiling window management features from Pop Shell into GNOME is currently under development. It will be created as a GitLab issue on GNOME Shell for future discussion, once we have invested our time into producing a functioning prototype, and learned what does and does not work in practice.

Ideally, the features explored in Pop Shell will be available for any environment using Mutter — far extending the half-monitor tiling capability currently present. By starting out as a shell extension, anyone using GNOME Shell can install this onto their system, without having to install a Pop-specific fork of GNOME on their system.

---

## The Problem

So, why is this a problem for us, and why do so many of our users switch to i3wm?

### Displays are large, and windows are many

GNOME currently only supports half-tiling, which tiles one window to one side of the screen, and another window to the other side of the screen. If you have more than two windows, it is expected to place them on separate workspaces, monitors, or to alternate between windows with `Alt` + `Tab`.

This tends to work fine if you only have a small handful of applications. If you need more than two windows at a time on a display, your only option is to manually drag windows into position, and resize them to fit alongside each other — a very time-consuming process that could easily be automated and streamlined.

### Displays are large. Very, **very** large

Suppose you are a lucky — or perhaps unlucky — owner of an ultra-wide display. A maximized window will have much of its preferences and controls dispersed across the far left and far right corners. The application may place a panel with buttons on the far left, while other buttons get shifted to either the distant center or far right.

Half-tiling in this scenario means that each window will be as large as an entire 2560x1440 or 4K display. In either scenario, at such extreme sizes, the mouse becomes completely useless — and applications become unbearable to use — in practice.

### Fighting the window manager is futile

As you struggle with fighting the window manager, it quickly becomes clear that any attempt to manage windows in a traditional stacking manner — where you need to manually move windows into place, and then manually resize them — is futile. Humans are nowhere near as precise or as quick as algorithms at aligning windows alongside each other on a display.

### Why not switch to i3wm?

The GNOME desktop comes with many useful desktop integration features, which are lost when switching to an i3wm session. Although possible to connect various GNOME session services to an i3wm session, much of the GNOME desktop experience is still lost in the process. The application overview, the GNOME panel, and GNOME extensions.

Even worse, many users are completely unfamiliar with tiling window managers, and may never feel comfortable switching "cold turkey" to one. By offering tiling window management as a feature that can be opted into, we can empower the user to ease into gaining greater control over their desktop, so that the idea of tiling window management suddenly becomes accessible.

There are additionally those who do want the traditional stacking window management experience, but they also want to be able to opt into advanced tiling window management, too. So it should be possible to opt into tiling window management as necessary. Other operating systems have successfully combined tiling window management features with the traditional stacking window management experience, and we feel that we can do this with GNOME as well.

---

## Installation

Use the branch corresponding to your GNOME Shell version (`git checkout branch_name`):

- **GNOME 3.36 through 41:** Use the `master_focal` branch.
- **GNOME 42 through 44:** Use the `master_jammy` branch.
- **GNOME 45:** Use the `master_mantic` branch.
- **GNOME 46+:** Use the `master_noble` branch. In this fork, `master_noble` supports GNOME 49 and 50.

GNU Make and TypeScript are also required to build the project.

Proper functionality of the shell requires modifying GNOME's default keyboard shortcuts. For a local installation, run `make local-install`. In this fork it only builds, installs and recompiles the user schema directory; run `make configure` once to apply pop-shell's default keyboard shortcuts and mutter settings. On Wayland, log out and back in to load a new build, or try it with `make nested`.

If you want to uninstall the extension, you may invoke `make uninstall`, and then open the "Keyboard Shortcuts" panel in GNOME Settings to select the "Reset All.." button in the header bar.

> Note that if you are packaging for your Linux distribution, many features in Pop Shell will not work out of the box because they require changes to GNOME's default keyboard shortcuts. A local install is necessary if you aren't packaging your GNOME session with these default keyboard shortcuts unset or changed.

### Packaging status

- [Fedora](https://src.fedoraproject.org/rpms/gnome-shell-extension-pop-shell/): `sudo dnf install gnome-shell-extension-pop-shell xprop`
- [Gentoo](https://packages.gentoo.org/packages/gnome-extra/gnome-shell-extension-pop-shell): `emerge gnome-shell-extension-pop-shell`
- [openSUSE Tumbleweed](https://build.opensuse.org/package/show/openSUSE:Factory/gnome-shell-extension-pop-shell): `sudo zypper install gnome-shell-extension-pop-shell`
- [Arch Linux](https://aur.archlinux.org/packages/?O=0&K=gnome-shell-extension-pop-shell) (Using Yay as AUR helper):
    - `yay -S gnome-shell-extension-pop-shell`
    - For precompiled binary version: `yay -S gnome-shell-extension-pop-shell-bin`
    - For GitHub repository version: `yay -S gnome-shell-extension-pop-shell-git`

---

## Shared Features

Features that are shared between stacking and auto-tiling modes.

### Directional Keys

These are key to many of the shortcuts utilized by tiling window managers. This document will henceforth refer to these keys as `<Direction>`, which default to the following keys:

- `Left` or `h`
- `Down` or `j`
- `Up` or `k`
- `Right` or `l`

### Overridden GNOME Shortcuts

- `Super` + `q`: Close window
- `Super` + `m`: Maximize the focused window
- `Super` + `,`: Minimize the focused window
- `Super` + `Esc`: Lock screen
- `Super` + `f`: Files
- `Super` + `e`: Email
- `Super` + `b`: Web Browser
- `Super` + `t`: Terminal

### Window Management Mode

> This mode is activated with `Super` + `Return`.

Window management mode activates additional keyboard control over the size and location of the currently-focused window. The behavior of this mode changes slightly based on whether you are in auto-tile mode, or in the default stacking mode. In the default mode, an overlay is displayed snapped to a grid, which represents a possible future location and size of your focused window. This behavior changes slightly in auto-tiling mode, where resizes are performed immediately and overlays are only shown when swapping windows.

Activating this enables the following behaviors:

- `<Direction>`
  - In default mode, this will move the displayed overlay around based on a grid
  - In auto-tile mode, this will resize the window
- `Shift` + `<Direction>`
  - In default mode, this will resize the overlay
  - In auto-tile mode, this will do nothing
- `Ctrl` + `<Direction>`
  - Selects a window in the given direction of the overlay
  - When `Return` is pressed, window positions will be swapped
- `Shift` + `Ctrl` + `<Direction>`
  - In auto-tile mode, this resizes in the opposite direction
- `O`: Toggles between horizontal and vertical tiling in auto-tile mode
- `~`: Toggles between floating and tiling in auto-tile mode
- `Return`: Applies the changes that have been requested
- `Esc`: Cancels any changes that were requested

### Window Focus Switching

When not in window management mode, pressing `Super` + `<Direction>` will shift window focus to a window in the given direction. This is calculated based on the distance between the center of the side of the focused window that the window is being shifted from, and the opposite side of windows surrounding it.

Switching focus to the left will calculate from the center of the east side of the focused window to the center of the west side of all other windows. The window with the least distance is the window we pick.

### Launcher

Removed in this fork. Upstream Pop Shell integrates [pop-launcher](https://github.com/pop-os/launcher).

### Inner and Outer Gaps

Gaps improve the aesthetics of tiled windows and make it easier to grab the edge of a specific window. We've decided to add support for inner and outer gaps, and made these settings configurable in the extension's popup menu.

### Hiding Window Title Bars

Removed in this fork: it relied on X11 window properties, which Wayland-only GNOME does not have.

---

## Floating Mode

This is the default mode of Pop Shell, which combines traditional stacking window management, with optional tiling window management features.

### Display Grid

In this mode, displays are split into a grid of columns and rows. When entering tile mode, windows are snapped to this grid as they are placed. The number of rows and columns are configurable in the extension's popup menu in the panel.

### Snap-to-Grid

An optional feature to improve your tiling experience is the ability to snap windows to the grid when using your mouse to move and resize them. This provides the same precision as entering window management mode to position a window with your keyboard, but with the convenience and familiarity of a mouse. This feature can be enabled through the extension's popup menu.

---

## Tiling Mode

Disabled by default, this mode manages windows using a tree-based tiling window manager. Similar to i3, each node of the tree represents two branches. A branch may be a window, a fork containing more branches, or a stack that contains many windows. Each branch represents a rectangular area of space on the screen, and can be subdivided by creating more branches inside of a branch. As windows are created, they are assigned to the window or stack that is actively focused, which creates a new fork on a window, or attaches the window to the focused stack. As windows are destroyed, the opposite is performed to compress the tree and rearrange windows to their new dimensions.

### Keyboard Shortcuts

- `Super` + `O`
  - Toggles the orientation of a fork's tiling orientation
- `Super` + `G`
  - Toggles a window between floating and tiling.
  - See [#customizing the window float list](#customizing-the-floating-window-list)

### Customizing the Floating Window List

In this fork, the `float-rules` setting holds `(class, title)` regular expressions of windows that float
(see [About this fork](#about-this-fork)), checked before pop-shell's built-in rules. To add one from the
desktop, pick "Add Floating Exception" in the extension's menu and click a window in the overview. Window
classes can be found with Looking Glass (`Alt` + `F2`, `lg`, Windows tab).

The floating exceptions dialog and the float list in `config.json` are gone; `config.json` now only holds
the `log_on_focus` and `skiptaskbarhidden` debugging options.

## Developers

Due to the risky nature of plain JavaScript, this GNOME Shell extension is written in [TypeScript](https://www.typescriptlang.org/). In addition to supplying static type-checking and self-documenting classes and interfaces, it allows us to write modern JavaScript syntax whilst supporting the generation of code for older targets.

Please install the following as dependencies when developing:

- [`Node.js`](https://nodejs.org/en/) LTS+ (v12+)
- Latest `npm` (comes with NodeJS)
- `npm install typescript@latest`

While working on the shell, `make local-install` rebuilds and installs it, and `make debug` also follows the shell's log. GNOME Shell cannot restart in place on Wayland: log out and back in, or run a nested shell with `make nested`.

[Discussions welcome on Pop Chat](https://chat.pop-os.org/pop-os/channels/development)

## License

Licensed under the GNU General Public License, Version 3.0, ([LICENSE](LICENSE) or https://www.gnu.org/licenses/gpl-3.0.en.html)

### Contribution

Any contribution intentionally submitted for inclusion in the work by you shall be licensed under the GNU GPLv3.

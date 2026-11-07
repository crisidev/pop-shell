# Testing

This document provides a guideline for testing and verifying the expected behaviors of the project. When a patch is ready for testing, the checklists may be copied and marked as they are proven to be working.

## Logs

To begin watching logs, open a terminal with the following command:

```
journalctl -o cat -n 0 -f "$(which gnome-shell)" | grep -v warning
```

Note that because the logs are from GNOME Shell, there will be messages from all installed extensions, and GNOME Shell itself. Pop Shell is fairly chatty though, so the majority of the logs should be from Pop Shell. Pop Shell logs are usually prepended with `pop-shell:`, but sometimes GNOME has internal errors and warnings surrounding those logs that could be useful for pointing to an issue that we can resolve in Pop Shell.

## Checklists

Tasks for a tester to verify when approving a patch. Use complex window layouts and at least two displays. Turn on active hint during testing.

## With tiling enabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows moved with the keyboard tile into place
- [ ] Windows moved with the mouse tile into place
- [ ] Tiles move with `tile-move-*-global` (test with different size windows)
- [ ] Windows can be resized with the keyboard in window management mode (Test resizing four windows above, below, right, and left to ensure shortcut consistency)
- [ ] Windows can be resized with the mouse
- [ ] Minimizing a window detaches it from the tree and re-tiles remaining windows
- [ ] Unminimizing a window returns it to the slot and split it had
- [ ] Closing a window in a 2x2 layout keeps the remaining split direction
- [ ] Dropping a window onto a sibling with the mouse splits it on the side nearest the pointer
- [ ] Maximizing with the keyboard (`Super` `M`) covers tiled windows
- [ ] Unmaximizing with keyboard (`Super` `M`) re-tiles into place
- [ ] Maximizing with the mouse covers tiled windows
- [ ] Unmaximizing with mouse re-tiles into place
- [ ] Full-screening removes the active hint and full-screens on one display 
- [ ] Unfull-screening adds the active hint and re-tiles into place
- [ ] Maximizing a YouTube video fills the screen and unmaximizing retiles the browser in place
- [ ] VIM shortcuts work as direction keys
- [ ] `Super` `O` changes window orientation
- [ ] `Super` `G` floats and then re-tiles a window
- [ ] Window management mode doesn't open on a floating window
- [ ] `Super` `Q` Closes a window
- [ ] Turn off auto-tiling. New windows launch floating.
- [ ] Turn on auto-tiling. Windows automatically tile.
- [ ] Disabling and enabling auto-tiling correctly handles minimized, maximized, fullscreen, floating, and non-floating windows (This test needs a better definition, steps, or to be separated out.)

### Workspaces

- [ ] Windows can be moved to another workspace with the keyboard
- [ ] Windows can be moved to another workspace with the mouse
- [ ] Windows can be moved to workspaces between existing workspaces
- [ ] Moving windows to another workspace re-tiled the previous and new workspace
- [ ] Active hint is present on the new workspace and once the window is returned to its previous workspace
- [ ] Floating windows move across workspaces
- [ ] Remove windows from the 2nd worspace in a 3 workspace setup. The 3rd workspace becomes the 2nd workspace, and tiling is unaffected by the move.

### Displays

- [ ] Windows move across displays with `tile-move-*-global`
- [ ] Windows move across displays with the mouse
- [ ] Changing the primary display moves the top bar. Window heights adjust on all monitors for the new position.
- [ ] Unplug a display - windows from the display retile on a new workspace on the remaining display
- [ ] Plug an additional display into a laptop - windows and workspaces don't changes
- [ ] NOTE: Add vertical monitor layout test

### Float rules

- [ ] Add a window to `float-rules`-- it should float immediately.
- [ ] Close and re-open the window-- it should float when opened.

### Notifications

- [ ] An app that wants attention (e.g. a terminal bell on another workspace) doesn't show an "is ready" notification.

## With Tiling Disabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows can be moved and resized with the mouse
- [ ] Windows can be half-tiled left and right with `Ctrl``Super``left`/`right`

### Displays

- [ ] Windows move across displays with the mouse

### Miscellaneous

- [ ] Close all windows-- no icons should be active in the GNOME launcher.
- [ ] With tiling still disabled, minimize the single window. The active hint should go away.
- [ ] Maximize a window, then open another app with the Activities overview. The newly-opened app should be visible and focused.

# Plan: GNOME Shell extension showing Claude status in the top bar

## Context

The user wants an at-a-glance indicator of Anthropic's service health (status.claude.com) without leaving the terminal/desktop. We considered a kitty plugin first; kitty has only one tab bar (top OR bottom) and the maintainer explicitly does not support a second status bar, so the only kitty-native options were either moving the tab bar to the bottom or running a screen-wide `panel` kitten. Both compromise the user's existing setup.

A GNOME Shell extension is a better fit: Ubuntu 24.04 already ships GNOME 46 with the modern ES-module extension API. A small extension can place an indicator in the top panel's status area (next to network/volume/power), polling Statuspage.io's public JSON and showing a colored dot + short label. It works system-wide regardless of which terminal/app is focused, and clicking it opens a dropdown with per-component detail.

## Approach

A single, self-contained GNOME Shell extension under `~/.local/share/gnome-shell/extensions/claude-status@local/`. Two files only — `metadata.json` and `extension.js`. No GSettings schema (no user-configurable options in v1). No build step.

### Architecture

- `Extension` subclass with `enable()` / `disable()` lifecycle
- `PanelMenu.Button` registered via `Main.panel.addToStatusArea('claude-status', this._indicator)`
- Inside the button:
  - A horizontal `St.BoxLayout` containing a colored dot (`St.Label` with markup or `St.Icon`) and a short label (`St.Label` with text like `Claude: OK` / `Claude: degraded`)
  - A `PopupMenu` populated dynamically with one row per Statuspage component (name + status), a divider, "Last updated HH:MM:SS", a "Refresh now" item, and an "Open status page" item that calls `Gio.AppInfo.launch_default_for_uri('https://status.claude.com/', null)`
- Polling: `GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, this._refresh.bind(this))`; ID stored on `this._timeoutId` and removed via `GLib.Source.remove()` in `disable()`
- HTTP: `Soup.Session` (libsoup 3, imported as `gi://Soup?version=3.0`), `session.send_and_read_async()` against `https://status.claude.com/api/v2/components.json`. Async — never block the shell thread.
- Compute overall indicator from the worst component:
  - `operational` → green `●`
  - `under_maintenance` → blue `●`
  - `degraded_performance` → yellow `●`
  - `partial_outage` → orange `●`
  - `major_outage` → red `●`
- On HTTP failure: keep the previous value, set the dot to gray `●` and label to `Claude: ?`, log via `console.warn` (visible with `journalctl /usr/bin/gnome-shell`)

### Cleanup contract (critical for GNOME extensions)

Everything created in `enable()` must be undone in `disable()`:
- `GLib.Source.remove(this._timeoutId)` then `this._timeoutId = null`
- `this._soupSession?.abort()`, drop reference
- `this._indicator?.destroy()`, `this._indicator = null`

## Files

All paths under `~/.local/share/gnome-shell/extensions/claude-status@local/`:

| Path             | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `metadata.json`  | UUID, name, description, `"shell-version": ["46"]`        |
| `extension.js`   | The whole extension (~150 lines)                          |

`metadata.json` sketch:

```json
{
  "uuid": "claude-status@local",
  "name": "Claude Status",
  "description": "Shows status.claude.com health in the top bar.",
  "shell-version": ["46"],
  "url": "https://status.claude.com/"
}
```

`extension.js` import skeleton (GNOME 45+ ES-module style):

```javascript
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
```

The indicator class is a `GObject.registerClass`-wrapped subclass of `PanelMenu.Button` that owns the Soup session, timer, and menu items. The exported `default class extends Extension` simply instantiates/destroys it.

## Installation & development loop

One-time install:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/claude-status@local
# drop metadata.json and extension.js into that directory
gnome-extensions enable claude-status@local
```

Reload after edits — Ubuntu 24.04 defaults to **Wayland**, where `Alt+F2 → r` does **not** work. Two options:

1. Log out and back in (clean, slow).
2. Run a nested shell for development:
   ```bash
   dbus-run-session -- gnome-shell --nested --wayland
   ```
   This opens a windowed GNOME session you can iterate inside without disturbing your real session.

Logs: `journalctl --user -f -o cat /usr/bin/gnome-shell` (filter to extension output with `grep claude-status`).

Packaging for backup/share (optional, not required for personal use):

```bash
gnome-extensions pack ~/.local/share/gnome-shell/extensions/claude-status@local
```

## Verification

1. After install + enable, the top bar shows a `●` dot next to a `Claude: <state>` label, between the existing indicators (placement depends on `addToStatusArea` position arg — default goes to the right group).
2. Click the indicator — popup lists each component (claude.ai, API, Console, …) with its individual status, last-update timestamp, "Refresh now", "Open status page".
3. "Open status page" launches the default browser to https://status.claude.com/.
4. "Refresh now" triggers an immediate fetch; the timestamp updates and any state change is reflected within ~1s.
5. Disconnect network → after the next poll, dot turns gray and label becomes `Claude: ?`; previous component details stay (cached); no shell crash, no error in journal beyond the logged warning.
6. `gnome-extensions disable claude-status@local` → indicator disappears immediately, no timers remain (`journalctl` shows no further fetch attempts).
7. Re-enable → fresh indicator with current data.

## Trade-offs / gotchas

- **Wayland dev loop is slower** than X11. The nested-shell workaround above is the standard remedy.
- **GNOME version compatibility**: pinned to GNOME 46. If the user upgrades Ubuntu later, bump `shell-version` after testing — the API has changed at most majors (e.g. the ES-module switch at 45).
- **Soup version**: libsoup3 is correct for GNOME 46. Do **not** import without the explicit `?version=3.0` — older code on the web uses libsoup2 and won't load.
- **No GSettings v1**: poll interval, endpoint, and click behavior are hard-coded. Adding a preferences UI is a follow-up if the user wants it (would need `prefs.js` + a `.gschema.xml`).
- **Status page rate limits**: Statuspage.io has generous limits; 60-second polling from one client is well within them.

## Out of scope (intentionally)

- Publishing to extensions.gnome.org (requires review, manifest changes; not needed for personal use)
- Desktop notifications on state change (easy add-on later: `Main.notify()` when transitioning to a worse state)
- Custom icons / theming (uses Unicode `●` to avoid shipping asset files)
- Preferences dialog


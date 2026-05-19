# Claude Status

A small GNOME Shell extension (GNOME 46) that puts a colored dot + label in
the top bar showing the current health of https://status.claude.com/.
Click it to see the per-component status, last refresh time, and a link to
the status page.

## Install

On the host (not inside the devcontainer):

```bash
./install.sh
gnome-extensions enable claude-status@local
```

Then log out and back in (Wayland) so GNOME Shell reloads.

## Develop

`install.sh` symlinks `claude-status@local/` into
`~/.local/share/gnome-shell/extensions/`, so edits to `extension.js` are
picked up by the next shell reload — no re-install needed.

Optional, for IDE checking only:

```bash
npm install
```

Pulls in `@girs/*` TypeScript definitions so editors resolve `gi://` and
`resource:///org/gnome/shell/*` imports. Zero runtime impact.

## Logs

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell | grep claude-status
```

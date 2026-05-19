#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)/claude-status@local"
DEST="$HOME/.local/share/gnome-shell/extensions/claude-status@local"

mkdir -p "$HOME/.local/share/gnome-shell/extensions"
ln -sfn "$SRC_DIR" "$DEST"
echo "Linked $DEST -> $SRC_DIR"
echo "Now enable: gnome-extensions enable claude-status@local"
echo "Reload shell: log out + back in (Wayland), or Alt+F2 r (X11)."

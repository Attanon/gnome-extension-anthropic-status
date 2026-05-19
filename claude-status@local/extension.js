import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Soup from 'gi://Soup?version=3.0';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const ENDPOINT = 'https://status.claude.com/api/v2/components.json';
const POLL_SECONDS = 300;

const STATUS_RANK = ['operational', 'under_maintenance', 'degraded_performance',
                     'partial_outage', 'major_outage'];
const COLORS = {
    operational: '#3ddc84', under_maintenance: '#3da7dc',
    degraded_performance: '#f5c518', partial_outage: '#f08a24',
    major_outage: '#e0443a', unknown: '#9aa0a6',
};

const ClaudeIndicator = GObject.registerClass(
class ClaudeIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Claude Status');

        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this._dot = new St.Label({ text: '●', y_align: 2 });
        this._dot.set_style(`color: ${COLORS.unknown};`);
        this._label = new St.Label({ text: 'Claude: …', y_align: 2 });
        box.add_child(this._dot);
        box.add_child(this._label);
        this.add_child(box);

        this._componentsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._componentsSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._timestampItem = new PopupMenu.PopupMenuItem('Last updated: never', { reactive: false });
        this.menu.addMenuItem(this._timestampItem);
        const refreshItem = new PopupMenu.PopupMenuItem('Refresh now');
        refreshItem.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refreshItem);
        const openItem = new PopupMenu.PopupMenuItem('Open status page');
        openItem.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri('https://status.claude.com/', null);
        });
        this.menu.addMenuItem(openItem);

        this._session = new Soup.Session();
        this._session.timeout = 10;
        this._refresh();
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, POLL_SECONDS,
            () => { this._refresh(); return GLib.SOURCE_CONTINUE; }
        );
    }

    _refresh() {
        const msg = Soup.Message.new('GET', ENDPOINT);
        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
            try {
                const bytes = sess.send_and_read_finish(res);
                if (msg.status_code !== 200) throw new Error(`HTTP ${msg.status_code}`);
                const text = new TextDecoder().decode(bytes.get_data());
                const json = JSON.parse(text);
                this._applyComponents(json.components || []);
            } catch (e) {
                console.warn(`claude-status: fetch failed: ${e}`);
                this._dot.set_style(`color: ${COLORS.unknown};`);
                this._label.set_text('Claude: ?');
                this._timestampItem.label.set_text(`Last updated: failed at ${this._nowHMS()}`);
            }
        });
    }

    _applyComponents(components) {
        let worstIdx = 0;
        for (const c of components) {
            const idx = STATUS_RANK.indexOf(c.status);
            if (idx > worstIdx) worstIdx = idx;
        }
        const overall = STATUS_RANK[worstIdx];
        this._dot.set_style(`color: ${COLORS[overall]};`);
        this._label.set_text(`Claude: ${overall === 'operational' ? 'OK' : overall.replace('_', ' ')}`);

        this._componentsSection.removeAll();
        for (const c of components) {
            const item = new PopupMenu.PopupMenuItem(`${c.name} — ${c.status}`, { reactive: false });
            this._componentsSection.addMenuItem(item);
        }
        this._timestampItem.label.set_text(`Last updated: ${this._nowHMS()}`);
    }

    _nowHMS() {
        return GLib.DateTime.new_now_local().format('%H:%M:%S');
    }

    destroy() {
        if (this._timeoutId) { GLib.Source.remove(this._timeoutId); this._timeoutId = null; }
        this._session?.abort();
        this._session = null;
        super.destroy();
    }
});

export default class ClaudeStatusExtension extends Extension {
    enable() {
        this._indicator = new ClaudeIndicator();
        Main.panel.addToStatusArea('claude-status', this._indicator);
    }
    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}

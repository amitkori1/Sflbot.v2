// Tiny JSON database with atomic, debounced writes (safe against crashes mid-write).
const fs = require('fs');
const path = require('path');
const config = require('./config');

fs.mkdirSync(config.DATA_DIR, { recursive: true });
const DB_FILE = path.join(config.DATA_DIR, 'data.json');
const TMP_FILE = DB_FILE + '.tmp';

const defaults = () => ({
    notes: [],
    filters: {},
    afk: { active: false, reason: null, since: 0 },
    greetings: {},   // { jid: { welcome, goodbye } }
    antilink: {},    // { jid: true|false }
    sudo: [],
    settings: {},    // { autobio, workType }
});

let db = defaults();

function load() {
    for (const file of [DB_FILE, TMP_FILE]) {
        try {
            if (fs.existsSync(file)) {
                db = { ...defaults(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
                return;
            }
        } catch (e) {
            console.error(`⚠️  Could not read ${path.basename(file)}: ${e.message}`);
        }
    }
}

let timer = null;
function writeNow() {
    try {
        fs.writeFileSync(TMP_FILE, JSON.stringify(db, null, 2));
        fs.renameSync(TMP_FILE, DB_FILE);
    } catch (e) {
        console.error('⚠️  Failed to save data.json:', e.message);
    }
}
function save() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; writeNow(); }, 300);
}
function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    writeNow();
}
process.on('exit', () => { if (timer) writeNow(); });

load();

const Notes = {
    getAll: () => db.notes || [],
    add: (note) => { db.notes.push(note); save(); },
    deleteAll: () => { db.notes = []; save(); },
};

const Filters = {
    get: (jid) => db.filters?.[jid] || [],
    set: (jid, pattern, reply) => {
        db.filters[jid] = db.filters[jid] || [];
        const i = db.filters[jid].findIndex(f => f.pattern === pattern);
        if (i >= 0) db.filters[jid][i] = { pattern, reply };
        else db.filters[jid].push({ pattern, reply });
        save();
    },
    delete: (jid, pattern) => {
        const before = (db.filters[jid] || []).length;
        db.filters[jid] = (db.filters[jid] || []).filter(f => f.pattern !== pattern);
        save();
        return db.filters[jid].length < before;
    },
};

const AFK = {
    get: () => db.afk || { active: false, reason: null, since: 0 },
    set: (reason) => { db.afk = { active: true, reason, since: Math.floor(Date.now() / 1000) }; save(); },
    clear: () => { db.afk = { active: false, reason: null, since: 0 }; save(); },
};

const Greetings = {
    get: (jid, type) => db.greetings?.[jid]?.[type] || null,
    set: (jid, type, text) => { db.greetings[jid] = db.greetings[jid] || {}; db.greetings[jid][type] = text; save(); },
    delete: (jid, type) => { if (db.greetings[jid]) { delete db.greetings[jid][type]; save(); } },
};

const AntiLink = {
    // per-group value wins; otherwise fall back to the ANTI_LINK env default
    isOn: (jid) => (jid in db.antilink ? !!db.antilink[jid] : config.ANTI_LINK),
    set: (jid, on) => { db.antilink[jid] = !!on; save(); },
};

const Sudo = {
    all: () => [...new Set([...config.SUDO, ...(db.sudo || [])])],
    add: (num) => { if (!db.sudo.includes(num)) { db.sudo.push(num); save(); } },
    remove: (num) => { db.sudo = db.sudo.filter(n => n !== num); save(); },
};

const Settings = {
    get: (key, def) => (key in db.settings ? db.settings[key] : def),
    set: (key, value) => { db.settings[key] = value; save(); },
};

module.exports = { Notes, Filters, AFK, Greetings, AntiLink, Sudo, Settings, flush };

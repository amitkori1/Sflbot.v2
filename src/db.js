// Tiny JSON database with atomic, debounced writes (safe against crashes mid-write).
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

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
    simi: { chats: {}, all: false, lang: {} },   // SimSimi chatbot state
    blocked: [],                                 // chats where the bot ignores everybody but you
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
let remoteTimer = null;
let remoteDirty = false;

function writeNow() {
    try {
        fs.writeFileSync(TMP_FILE, JSON.stringify(db, null, 2));
        fs.renameSync(TMP_FILE, DB_FILE);
    } catch (e) {
        console.error('⚠️  Failed to save data.json:', e.message);
    }
}

async function pushRemote() {
    if (!store.enabled || !remoteDirty) return;
    remoteDirty = false;
    try { await store.set('data', JSON.stringify(db)); }
    catch (e) { remoteDirty = true; console.error('⚠️  Remote data sync failed:', e.message); }
}

function save() {
    remoteDirty = true;
    if (!timer) timer = setTimeout(() => { timer = null; writeNow(); }, 300);
    if (store.enabled && !remoteTimer) remoteTimer = setTimeout(() => { remoteTimer = null; pushRemote(); }, 8000);
}

/** Synchronous local flush (used on process exit). */
function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    writeNow();
}

/** Local + remote flush; await this before exiting on SIGTERM / restart. */
async function flushAsync() {
    flush();
    if (remoteTimer) { clearTimeout(remoteTimer); remoteTimer = null; }
    await Promise.race([pushRemote(), new Promise(r => setTimeout(r, 4000))]);
}

/** Load data from the remote store (if configured). Call once before starting the bot. */
async function init() {
    if (!store.enabled) return;
    try {
        const raw = await store.get('data');
        if (raw) {
            db = { ...defaults(), ...JSON.parse(raw) };
            writeNow();
            console.log('☁️  Data restored from remote storage');
        } else if (fs.existsSync(DB_FILE)) {
            remoteDirty = true; pushRemote();   // first run: seed remote with the local file
        }
    } catch (e) {
        console.error('⚠️  Could not load remote data (using local file):', e.message);
    }
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

const Simi = {
    isOn: (jid) => !!db.simi.chats[jid],
    set: (jid, on) => { if (on) db.simi.chats[jid] = true; else delete db.simi.chats[jid]; save(); },
    all: () => !!db.simi.all,
    setAll: (on) => { db.simi.all = !!on; save(); },
    lang: (jid) => db.simi.lang[jid] || null,
    setLang: (jid, l) => { if (l) db.simi.lang[jid] = l; else delete db.simi.lang[jid]; save(); },
};

const Blocked = {
    has: (jid) => (db.blocked || []).includes(jid),
    list: () => db.blocked || [],
    add: (jid) => { if (!db.blocked.includes(jid)) { db.blocked.push(jid); save(); } },
    remove: (jid) => { db.blocked = db.blocked.filter(j => j !== jid); save(); },
};

module.exports = { Notes, Filters, AFK, Greetings, AntiLink, Sudo, Settings, Simi, Blocked, init, flush, flushAsync };

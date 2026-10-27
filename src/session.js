// Session helpers: restore the WhatsApp login from ASENA_SESSION (env) or from remote storage,
// and snapshot the session folder to remote storage so it survives redeploys.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

const dir = () => config.SESSION_DIR;
const credsFile = () => path.join(dir(), 'creds.json');
const hasLocal = () => fs.existsSync(credsFile());

/** Restore creds.json from the ASENA_SESSION env var. Returns true if restored. */
function restoreFromEnv(value = config.SESSION) {
    if (hasLocal() || !value) return false;
    if (/^ASENA/i.test(value)) {
        console.log('❌ ASENA_SESSION looks like an OLD WhatsAsena session. Old sessions do not work with the new');
        console.log('   WhatsApp library. Remove it and link again (pairing code / QR).');
        return false;
    }
    try {
        const json = Buffer.from(value, 'base64').toString('utf-8');
        const parsed = JSON.parse(json);
        if (!parsed.noiseKey) throw new Error('not a Baileys creds.json');
        if (parsed.registered === false) {
            console.log('⚠️  ASENA_SESSION is from an unfinished linking attempt (never completed), ignoring it.');
            console.log('    Remove the ASENA_SESSION variable until you have linked successfully.');
            return false;
        }
        fs.mkdirSync(dir(), { recursive: true });
        fs.writeFileSync(credsFile(), json);
        console.log('🔑 Session restored from ASENA_SESSION');
        return true;
    } catch (e) {
        console.log('❌ ASENA_SESSION is invalid (' + e.message + '). Send .session from a working bot to get a valid one.');
        return false;
    }
}

/** Current creds.json as the base64 string used for ASENA_SESSION. */
function exportBase64() {
    return hasLocal() ? fs.readFileSync(credsFile()).toString('base64') : null;
}

// ───────── remote snapshot (Upstash) ─────────
const MAX_BLOB = 900 * 1024;

function buildBlob(onlyCreds = false) {
    const files = {};
    for (const name of fs.existsSync(dir()) ? fs.readdirSync(dir()) : []) {
        if (onlyCreds && name !== 'creds.json') continue;
        const full = path.join(dir(), name);
        try {
            if (!fs.statSync(full).isFile()) continue;
            const buf = fs.readFileSync(full);
            JSON.parse(buf.toString('utf8'));                 // skip half-written files
            files[name] = buf.toString('base64');
        } catch { /* skip */ }
    }
    if (!files['creds.json']) return null;
    return zlib.gzipSync(Buffer.from(JSON.stringify({ v: 1, files }))).toString('base64');
}

let lastHash = '';
async function backupToStore(force = false) {
    if (!store.enabled || !hasLocal()) return false;
    let blob = buildBlob();
    if (blob && blob.length > MAX_BLOB) blob = buildBlob(true);    // huge accounts: creds only
    if (!blob) return false;
    const hash = crypto.createHash('sha1').update(blob).digest('hex');
    if (!force && hash === lastHash) return false;
    await store.set('session', blob);
    lastHash = hash;
    return true;
}

/** Restore the session folder from remote storage (only if there is no local session). */
async function restoreFromStore() {
    if (!store.enabled || hasLocal()) return false;
    try {
        const blob = await store.get('session');
        if (!blob) return false;
        const { files } = JSON.parse(zlib.gunzipSync(Buffer.from(blob, 'base64')).toString('utf8'));
        if (!files?.['creds.json']) return false;
        fs.mkdirSync(dir(), { recursive: true });
        for (const [name, b64] of Object.entries(files)) {
            if (/[\\/]/.test(name)) continue;                          // never write outside the folder
            fs.writeFileSync(path.join(dir(), name), Buffer.from(b64, 'base64'));
        }
        console.log('☁️  Session restored from remote storage');
        lastHash = crypto.createHash('sha1').update(blob).digest('hex');
        return true;
    } catch (e) {
        console.error('⚠️  Could not restore session from remote storage:', e.message);
        return false;
    }
}

async function clearRemote() {
    if (!store.enabled) return;
    try { await store.set('session', ''); } catch {}
}

module.exports = { hasLocal, restoreFromEnv, exportBase64, backupToStore, restoreFromStore, clearRemote };

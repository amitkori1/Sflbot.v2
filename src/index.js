const config = require('./config');
const baileys = require('@whiskeysockets/baileys');
const {
    useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore, Browsers,
} = baileys;
const makeWASocket = baileys.makeWASocket || baileys.default;
const pino = require('pino');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const db = require('./db');
const store = require('./store');
const session = require('./session');
const H = require('./helpers');
const pairPage = require('./pairpage');
const { getSocketHooks, setCategory } = require('./events');
const { handleUpsert } = require('./handler');

// ───────── runtime state ─────────
const S = {
    sock: null, connected: false, everOpen: false, lastChange: Date.now(),
    attempts: 0, starting: false, bootNotified: false,
    ignoreEnvSession: false, pairingRequested: false,
    pairing: null,            // { code, at } - the code currently valid for linking
    manualAt: 0, lastCodeReq: 0,
};

// ───────── never die on a stray error (24/7) ─────────
process.on('unhandledRejection', (e) => console.error('⚠️  Unhandled rejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('⚠️  Uncaught exception:', e?.stack || e));

let shuttingDown = false;
async function shutdown(sig) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${sig} received, saving data and exiting...`);
    try { await db.flushAsync(); } catch {}
    try { await Promise.race([session.backupToStore(true), new Promise(r => setTimeout(r, 4000))]); } catch {}
    try { S.sock?.end(undefined); } catch {}
    process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(sig));

// ───────── pairing helper (used by the /pair page) ─────────
async function requestNewCode() {
    if (S.connected) return { ok: false, message: 'Already linked.' };
    if (!config.PAIR_NUMBER) return { ok: false, message: 'PAIR_NUMBER is not set.' };
    const wait = 15000 - (Date.now() - S.lastCodeReq);
    if (wait > 0) return { ok: false, message: `Please wait ${Math.ceil(wait / 1000)}s before asking again.` };
    S.lastCodeReq = Date.now();
    S.pairing = null; S.pairingRequested = false; S.manualAt = Date.now();
    try { S.sock?.end(new Error('new pairing code requested')); } catch {}
    return { ok: true };
}

// ───────── health + pairing web server ─────────
const app = express();
app.get('/', (req, res) => res.send('SFL Bot is running!'));
app.get('/health', (req, res) => {
    res.status(S.connected ? 200 : 503).json({
        connected: S.connected, uptime: Math.round(process.uptime()), version: config.VERSION,
    });
});
pairPage.mount(app, S, { requestNewCode });
app.listen(config.PORT, '0.0.0.0', () => console.log(`🌐 Web server listening on port ${config.PORT}  (link page: /pair)`));

if (config.KEEP_ALIVE_URL) {
    console.log(`⏰ Keep-alive ping enabled -> ${config.KEEP_ALIVE_URL}`);
    setInterval(() => axios.get(config.KEEP_ALIVE_URL, { timeout: 15000 }).catch(() => {}), 10 * 60 * 1000);
}

// If we've been disconnected for 10+ minutes, exit so PM2/Docker/systemd restart us cleanly.
setInterval(() => {
    if (S.everOpen && !S.connected && Date.now() - S.lastChange > 10 * 60 * 1000) {
        console.error('❌ Disconnected for over 10 minutes. Exiting so the supervisor can restart the bot.');
        process.exit(1);
    }
}, 60 * 1000).unref();

// keep the remote session snapshot fresh (Signal keys change as messages flow)
if (store.enabled) {
    console.log('☁️  Remote storage enabled: session and data survive redeploys');
    setInterval(() => { if (S.connected) session.backupToStore().catch(e => console.error('Session backup failed:', e.message)); }, 5 * 60 * 1000).unref();
}

// ───────── plugins ─────────
const pluginDir = path.join(__dirname, 'plugins');
const CATEGORY_NAMES = require('./categories');
for (const file of fs.readdirSync(pluginDir).sort()) {
    if (!file.endsWith('.js')) continue;
    setCategory(CATEGORY_NAMES[file] || file.replace(/\.js$/, '').replace(/^./, c => c.toUpperCase()));
    try { require(path.join(pluginDir, file)); } catch (e) { console.error(`❌ Plugin ${file} failed to load:`, e.message); }
}

// ───────── main connection ─────────
const msgStore = new NodeCache({ stdTTL: 3600, maxKeys: 5000, useClones: false });

function scheduleRestart(ms) {
    setTimeout(() => startBot().catch(e => { console.error('Restart failed:', e.message); scheduleRestart(10000); }), ms);
}

async function startBot() {
    if (S.starting) return;
    S.starting = true;
    try {
        fs.mkdirSync(config.SESSION_DIR, { recursive: true });
        // order: local folder > remote storage > ASENA_SESSION env
        if (!session.hasLocal()) await session.restoreFromStore();
        if (!session.hasLocal() && !S.ignoreEnvSession) session.restoreFromEnv();

        const { state: auth, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
        const { version } = await fetchLatestBaileysVersion().catch(() => ({}));
        const logger = pino({ level: config.LOG_LEVEL });

        const sock = makeWASocket({
            version,
            logger,
            auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: !config.NO_ONLINE,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            keepAliveIntervalMs: 30000,
            getMessage: async (key) => msgStore.get(key.id),
            cachedGroupMetadata: async (jid) => H.getGroupMeta(sock, jid).catch(() => undefined),
        });
        S.sock = sock;
        S.pairingRequested = false;
        const live = () => S.sock === sock;

        // remember what we send/receive so WhatsApp can ask us to resend (avoids "waiting for this message")
        const origSend = sock.sendMessage.bind(sock);
        sock.sendMessage = async (...args) => {
            const res = await origSend(...args);
            if (res?.key?.id) { H.markSent(res.key.id); if (res.message) msgStore.set(res.key.id, res.message); }
            return res;
        };

        let backupTimer = null;
        sock.ev.on('creds.update', () => {
            Promise.resolve(saveCreds()).catch(e => console.error('Failed to save creds:', e.message));
            if (store.enabled && auth.creds.registered) {
                clearTimeout(backupTimer);
                backupTimer = setTimeout(() => session.backupToStore().catch(e => console.error('Session backup failed:', e.message)), 20000);
            }
        });

        sock.ev.on('messages.upsert', (u) => {
            if (!live()) return;
            for (const m of u.messages) if (m.key?.id && m.message) msgStore.set(m.key.id, m.message);
            handleUpsert(sock, u);
        });
        sock.ev.on('groups.update', (updates) => updates.forEach(g => g.id && H.invalidateGroup(g.id)));
        sock.ev.on('group-participants.update', (u) => H.invalidateGroup(u.id));

        for (const hook of getSocketHooks()) {
            try { hook(sock); } catch (e) { console.error('Socket hook error:', e.message); }
        }

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (!live()) return;

            if (qr) {
                if (config.PAIR_NUMBER && !sock.authState.creds.registered) {
                    if (!S.pairingRequested) {
                        S.pairingRequested = true;
                        try {
                            const code = await sock.requestPairingCode(config.PAIR_NUMBER);
                            S.pairing = { code: String(code), at: Date.now() };
                            const pretty = code?.match(/.{1,4}/g)?.join('-') || code;
                            console.log(`\n🔗 [${new Date().toISOString()}] Pairing code: ${pretty}   (valid for about 1 minute)`);
                            console.log('   Phone: WhatsApp > Linked Devices > Link a Device > "Link with phone number instead"');
                            console.log('   Tip: open /pair on your bot URL to always see the newest code.\n');
                        } catch (e) {
                            S.pairingRequested = false;
                            console.log('❌ Could not get a pairing code:', e.message);
                        }
                    }
                } else if (!config.PAIR_NUMBER) {
                    qrcode.generate(qr, { small: true });
                    console.log('\n✅ Scan the QR code above: WhatsApp > Linked Devices > Link a Device\n');
                }
            }

            if (connection === 'open') {
                S.connected = true; S.everOpen = true; S.attempts = 0; S.lastChange = Date.now(); S.pairing = null;
                console.log(`\n✅ SFL Bot connected! [${config.VERSION}]  Mode: ${db.Settings.get('workType', config.WORK_TYPE)} | Prefix: ${config.PREFIX_CHARS}\n`);

                if (config.PRINT_SESSION && !config.SESSION) {
                    setTimeout(() => { const b = session.exportBase64(); if (b) console.log('ASENA_SESSION=' + b); }, 5000);
                }
                if (store.enabled) setTimeout(() => session.backupToStore(true).catch(() => {}), 15000);

                if (config.BOOT_MESSAGE && !S.bootNotified) {
                    S.bootNotified = true;
                    const me = H.bare(sock.user.id);
                    const p = config.PREFIX;
                    let text = `✅ *SFL Bot is now Online!*\n\n*Version:* \`${config.VERSION}\`\n*Mode:* \`${db.Settings.get('workType', config.WORK_TYPE)}\`\n*Prefix:* \`${p}\`\n\nUse \`${p}help\` to see the list of commands.`;
                    if (process.env.RENDER && !config.SESSION && !store.enabled) {
                        text += `\n\n⚠️ _This host wipes its disk on restart. Send \`${p}session\` once and save the result as the ASENA_SESSION variable, or set UPSTASH_REDIS_REST_URL/TOKEN so I remember the login by myself._`;
                    }
                    sock.sendMessage(me, { text }).catch(() => {});
                }
            }

            if (connection === 'close') {
                S.connected = false; S.lastChange = Date.now();
                const code = lastDisconnect?.error?.output?.statusCode;
                const reason = Object.entries(DisconnectReason).find(([, v]) => v === code)?.[0] || 'unknown';

                if (Date.now() - S.manualAt < 8000) {      // we closed it ourselves to make a fresh pairing code
                    S.manualAt = 0;
                    console.log('🔄 Restarting connection for a fresh pairing code...');
                    return scheduleRestart(300);
                }
                console.log(`⚠️  Connection closed (code ${code}: ${reason}).`);

                if (code === DisconnectReason.loggedOut) {
                    console.log('❌ Logged out from WhatsApp. Clearing session; link the device again (pairing code / QR).');
                    fs.rmSync(config.SESSION_DIR, { recursive: true, force: true });
                    await session.clearRemote();
                    S.ignoreEnvSession = true; S.attempts = 0; S.pairing = null;
                    return scheduleRestart(3000);
                }
                if (code === DisconnectReason.connectionReplaced) {
                    console.log('⚠️  Another instance is using this session. Is the bot running twice? Retrying in 60s.');
                    return scheduleRestart(60000);
                }
                if (code === DisconnectReason.restartRequired) return scheduleRestart(500);

                S.attempts++;
                const delay = Math.min(60000, 2000 * 2 ** Math.min(S.attempts, 5));
                console.log(`🔄 Reconnecting in ${Math.round(delay / 1000)}s (attempt ${S.attempts})...`);
                scheduleRestart(delay);
            }
        });
    } finally {
        S.starting = false;
    }
}

console.log(`🤖 Starting SFL Bot ${config.VERSION}...`);
(async () => {
    await db.init();            // pulls data.json from remote storage when configured
    await startBot();
})().catch(err => {
    console.error('Fatal error on start:', err);
    scheduleRestart(10000);
});

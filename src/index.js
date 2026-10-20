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
const H = require('./helpers');
const { getSocketHooks, setCategory } = require('./events');
const { handleUpsert } = require('./handler');

// ───────── never die on a stray error (24/7) ─────────
process.on('unhandledRejection', (e) => console.error('⚠️  Unhandled rejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('⚠️  Uncaught exception:', e?.stack || e));
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
        console.log(`\n${sig} received, saving data and exiting...`);
        try { db.flush(); } catch {}
        try { S.sock?.end(undefined); } catch {}
        process.exit(0);
    });
}

// ───────── runtime state ─────────
const S = {
    sock: null, connected: false, everOpen: false, lastChange: Date.now(),
    attempts: 0, starting: false, bootNotified: false,
    ignoreEnvSession: false, pairingRequested: false,
};

// ───────── health server (Render / uptime monitors) ─────────
const app = express();
app.get('/', (req, res) => res.send('SFL Bot is running!'));
app.get('/health', (req, res) => {
    res.status(S.connected ? 200 : 503).json({
        connected: S.connected, uptime: Math.round(process.uptime()), version: config.VERSION,
    });
});
app.listen(config.PORT, '0.0.0.0', () => console.log(`🌐 Web server listening on port ${config.PORT}`));

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

// ───────── plugins ─────────
const pluginDir = path.join(__dirname, 'plugins');
const CATEGORY_NAMES = {
    'admin.js': 'Group Admin', 'antilink.js': 'Group Admin', 'greetings.js': 'Group Admin', 'tagall.js': 'Group Admin',
    'alive.js': 'Bot', 'owner.js': 'Bot', 'help.js': 'Bot', 'general.js': 'Utilities', 'web.js': 'Web & Fun',
    'sticker.js': 'Media', 'media.js': 'Media', 'ttp.js': 'Media', 'downloader.js': 'Downloaders',
    'afk.js': 'Chat', 'filters.js': 'Chat', 'notes.js': 'Chat', 'clear.js': 'Chat', 'presence.js': 'Profile',
    'profile.js': 'Profile', 'autobio.js': 'Profile',
};
for (const file of fs.readdirSync(pluginDir).sort()) {
    if (!file.endsWith('.js')) continue;
    setCategory(CATEGORY_NAMES[file] || file.replace(/\.js$/, '').replace(/^./, c => c.toUpperCase()));
    try { require(path.join(pluginDir, file)); } catch (e) { console.error(`❌ Plugin ${file} failed to load:`, e.message); }
}

// ───────── session restore from env ─────────
function restoreSessionFromEnv(credsPath) {
    if (fs.existsSync(credsPath) || !config.SESSION || S.ignoreEnvSession) return;
    if (/^ASENA/i.test(config.SESSION)) {
        console.log('❌ ASENA_SESSION looks like an OLD WhatsAsena session. Old sessions do not work with the new');
        console.log('   WhatsApp library. Leave it empty and link again (QR or PAIR_NUMBER).');
        return;
    }
    try {
        const json = Buffer.from(config.SESSION, 'base64').toString('utf-8');
        const parsed = JSON.parse(json);
        if (!parsed.noiseKey) throw new Error('not a Baileys creds.json');
        fs.writeFileSync(credsPath, json);
        console.log('🔑 Session restored from ASENA_SESSION');
    } catch (e) {
        console.log('❌ ASENA_SESSION is invalid (' + e.message + '). Run `npm run session` after logging in to get a valid one.');
    }
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
        restoreSessionFromEnv(path.join(config.SESSION_DIR, 'creds.json'));

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
            if (res?.key?.id && res.message) msgStore.set(res.key.id, res.message);
            return res;
        };

        sock.ev.on('creds.update', () => { Promise.resolve(saveCreds()).catch(e => console.error('Failed to save creds:', e.message)); });

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
                            console.log(`\n🔗 Pairing code: ${code?.match(/.{1,4}/g)?.join('-') || code}`);
                            console.log('   WhatsApp > Linked Devices > Link a Device > "Link with phone number instead"\n');
                        } catch (e) {
                            S.pairingRequested = false;
                            console.log('❌ Could not get a pairing code:', e.message);
                        }
                    }
                } else {
                    qrcode.generate(qr, { small: true });
                    console.log('\n✅ Scan the QR code above: WhatsApp > Linked Devices > Link a Device\n');
                }
            }

            if (connection === 'open') {
                S.connected = true; S.everOpen = true; S.attempts = 0; S.lastChange = Date.now();
                console.log(`\n✅ SFL Bot connected! [${config.VERSION}]  Mode: ${db.Settings.get('workType', config.WORK_TYPE)} | Prefix: ${config.PREFIX_CHARS}\n`);

                if (config.BOOT_MESSAGE && !S.bootNotified) {
                    S.bootNotified = true;
                    const me = H.bare(sock.user.id);
                    const p = config.PREFIX;
                    sock.sendMessage(me, {
                        text: `✅ *SFL Bot is now Online!*\n\n*Version:* \`${config.VERSION}\`\n*Mode:* \`${db.Settings.get('workType', config.WORK_TYPE)}\`\n*Prefix:* \`${p}\`\n\nUse \`${p}help\` to see the list of commands.`,
                    }).catch(() => {});
                }
            }

            if (connection === 'close') {
                S.connected = false; S.lastChange = Date.now();
                const code = lastDisconnect?.error?.output?.statusCode;
                const reason = Object.entries(DisconnectReason).find(([, v]) => v === code)?.[0] || 'unknown';
                console.log(`⚠️  Connection closed (code ${code}: ${reason}).`);

                if (code === DisconnectReason.loggedOut) {
                    console.log('❌ Logged out from WhatsApp. Clearing session; link the device again (QR / PAIR_NUMBER).');
                    fs.rmSync(config.SESSION_DIR, { recursive: true, force: true });
                    S.ignoreEnvSession = true; S.attempts = 0;
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
startBot().catch(err => {
    console.error('Fatal error on start:', err);
    scheduleRestart(10000);
});

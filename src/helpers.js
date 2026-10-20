const {
    downloadMediaMessage,
    normalizeMessageContent,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const NodeCache = require('node-cache');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const silentLogger = pino({ level: 'silent' });

// ───────── formatting / ids ─────────
function secondsToHms(d) {
    d = Number(d);
    const h = Math.floor(d / 3600);
    const m = Math.floor((d % 3600) / 60);
    const s = Math.floor(d % 60);
    return [h && `${h}h`, m && `${m}m`, (s || (!h && !m)) && `${s}s`].filter(Boolean).join(' ');
}

/** "1234:5@s.whatsapp.net" -> "1234@s.whatsapp.net" */
const bare = (jid) => (jid ? jid.replace(/:\d+@/, '@') : jid);
/** "1234:5@s.whatsapp.net" -> "1234" */
const num = (jid) => (jid ? jid.split('@')[0].split(':')[0] : '');
const jidToPhone = num;

function getBotIds(sock) {
    const ids = new Set();
    for (const j of [sock.user?.id, sock.user?.lid, sock.authState?.creds?.me?.id, sock.authState?.creds?.me?.lid]) {
        if (j) ids.add(bare(j));
    }
    return ids;
}

// ───────── message parsing ─────────
const unwrap = (msg) => normalizeMessageContent(msg.message) || {};

function getText(msg) {
    const m = unwrap(msg);
    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || m.documentMessage?.caption
        || '';
}

function getContext(msg) {
    const m = unwrap(msg);
    for (const key of Object.keys(m)) {
        const c = m[key]?.contextInfo;
        if (c) return c;
    }
    return null;
}

/** The message being replied to (or null). */
function getQuoted(msg) {
    const c = getContext(msg);
    if (!c?.quotedMessage) return null;
    return {
        message: normalizeMessageContent(c.quotedMessage) || c.quotedMessage,
        stanzaId: c.stanzaId,
        participant: c.participant,
    };
}

function getQuotedText(msg) {
    const q = getQuoted(msg)?.message;
    return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '';
}

function mediaTypeOf(content) {
    if (!content) return null;
    if (content.imageMessage) return 'image';
    if (content.videoMessage) return 'video';
    if (content.audioMessage) return 'audio';
    if (content.stickerMessage) return 'sticker';
    if (content.documentMessage) return 'document';
    return null;
}

async function downloadMedia(msgLike, sock) {
    const buffer = await downloadMediaMessage(
        msgLike, 'buffer', {},
        { logger: silentLogger, reuploadRequest: sock.updateMediaMessage }
    );
    return { buffer };
}

/**
 * Get media from the replied-to message, or from the command message itself
 * (e.g. an image sent with the command as its caption).
 * Returns { buffer, type, mimetype } or null.
 */
async function getMedia(sock, msg, allowed = ['image', 'video', 'audio', 'sticker', 'document']) {
    const q = getQuoted(msg);
    let content, key;
    if (q) {
        content = q.message;
        key = { remoteJid: msg.key.remoteJid, id: q.stanzaId, fromMe: false, participant: q.participant };
    } else {
        content = unwrap(msg);
        key = msg.key;
    }
    const type = mediaTypeOf(content);
    if (!type || !allowed.includes(type)) return null;
    const { buffer } = await downloadMedia({ key, message: content }, sock);
    const inner = content[type + 'Message'];
    return { buffer, type, mimetype: inner?.mimetype || '' };
}

// ───────── group helpers ─────────
const groupCache = new NodeCache({ stdTTL: 120, useClones: false });

async function getGroupMeta(sock, jid, fresh = false) {
    if (!fresh) {
        const hit = groupCache.get(jid);
        if (hit) return hit;
    }
    const meta = await sock.groupMetadata(jid);
    groupCache.set(jid, meta);
    return meta;
}
const invalidateGroup = (jid) => groupCache.del(jid);

function participantIds(p) {
    return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(bare);
}

/** Is any of the given jids an admin of this group? */
function isAdminIn(meta, jids) {
    const set = new Set(jids.filter(Boolean).map(bare));
    return meta.participants.some(p =>
        (p.admin === 'admin' || p.admin === 'superadmin') && participantIds(p).some(id => set.has(id))
    );
}

async function botIsAdmin(sock, jid) {
    const meta = await getGroupMeta(sock, jid);
    return isAdminIn(meta, [...getBotIds(sock)]);
}

// ───────── processes / network / files ─────────
function runCmd(file, args, opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { timeout: 180000, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
            if (err) {
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout: String(stdout), stderr: String(stderr) });
        });
    });
}

const binCache = {};
/** True if the binary can be executed (ffmpeg, yt-dlp, ...). Result is cached. */
async function hasBinary(name) {
    if (name in binCache) return binCache[name];
    const flag = /^ff(mpeg|probe)$/.test(path.basename(name)) ? '-version' : '--version';
    try {
        await runCmd(name, [flag], { timeout: 10000 });
        binCache[name] = true;
    } catch (e) {
        binCache[name] = e.code !== 'ENOENT';
    }
    return binCache[name];
}

const tmpPath = (ext = '') => path.join(os.tmpdir(), `sfl_${crypto.randomBytes(6).toString('hex')}${ext}`);
const rm = (...files) => files.forEach(f => { try { fs.rmSync(f, { force: true, recursive: true }); } catch {} });

const http = axios.create({
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SFLBot/3.0)' },
});

async function fetchBuffer(url, opts = {}) {
    const { data } = await http.get(url, { responseType: 'arraybuffer', ...opts });
    return Buffer.from(data);
}

module.exports = {
    silentLogger, secondsToHms, bare, num, jidToPhone, getBotIds,
    unwrap, getText, getContext, getQuoted, getQuotedText, mediaTypeOf,
    downloadMedia, getMedia,
    getGroupMeta, invalidateGroup, isAdminIn, botIsAdmin, participantIds,
    runCmd, hasBinary, tmpPath, rm, http, fetchBuffer,
};

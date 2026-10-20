// YouTube / Instagram / TikTok / Facebook / etc. downloads via yt-dlp (+ ffmpeg).
// Install yt-dlp on the server (the provided Dockerfile already does).
const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const URL_RE = /^https?:\/\/\S+$/i;
const ANSI_RE = /\x1b\[[0-9;]*m/g;

// at most 2 downloads at once so a small server doesn't fall over
let running = 0;
const MAX_PARALLEL = 2;

function lastLine(s) {
    return String(s || '').replace(ANSI_RE, '').trim().split('\n').filter(Boolean).pop() || '';
}

async function ytdlp(args, opts = {}) {
    const base = ['--no-warnings', '--no-progress', '--ignore-config', '--socket-timeout', '20'];
    if (config.YTDLP_COOKIES) base.push('--cookies', config.YTDLP_COOKIES);
    return H.runCmd(config.YTDLP_PATH, [...base, ...args], { timeout: 6 * 60 * 1000, ...opts });
}

async function ensureTools(ctx, needFfmpeg = true) {
    if (!await H.hasBinary(config.YTDLP_PATH)) {
        await ctx.reply('❌ `yt-dlp` is not installed on this server. Install it (see README) or use the Docker image.');
        return false;
    }
    if (needFfmpeg && !await H.hasBinary('ffmpeg')) {
        await ctx.reply('❌ `ffmpeg` is not installed on this server.');
        return false;
    }
    return true;
}

/** Download `target` into a temp dir. Returns { file, title, dir }. Caller must rm(dir). */
async function download(target, args) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfl_dl_'));
    try {
        const { stdout } = await ytdlp([
            '--no-playlist', '--max-filesize', '100M',
            '-o', path.join(dir, 'out.%(ext)s'),
            '--print', '%(title)s', '--no-simulate',
            ...args, '--', target,
        ]);
        const files = fs.readdirSync(dir).filter(f => !/\.(part|ytdl|json|txt)$/i.test(f));
        if (!files.length) throw new Error('Nothing was downloaded (video too long/large, or unavailable).');
        return { file: path.join(dir, files[0]), title: stdout.trim().split('\n')[0] || 'download', dir };
    } catch (e) {
        H.rm(dir);
        const hint = lastLine(e.stderr);
        if (e.message?.startsWith('Nothing')) throw e;
        throw new Error(hint ? hint.replace(/^ERROR:\s*/, '').slice(0, 200) : e.message);
    }
}

const target = (q) => (URL_RE.test(q) ? q : `ytsearch1:${q}`);
const safeName = (s) => s.replace(/[\\/:*?"<>|\n\r]/g, '').slice(0, 80) || 'file';

async function withLimit(ctx, fn) {
    if (running >= MAX_PARALLEL) return ctx.reply('⏳ Too many downloads running, try again in a minute.');
    running++;
    const wait = await ctx.reply('⏳ Downloading...');
    try { await fn(); }
    finally {
        running--;
        ctx.sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {});
    }
}

addCommand({ pattern: 'song', aliases: ['play'], desc: 'Download a song from YouTube (name or link)', usage: 'song believer imagine dragons' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.song <name or YouTube link>`');
    if (!await ensureTools(ctx)) return;
    await withLimit(ctx, async () => {
        const r = await download(target(match), [
            '-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '5',
            '--match-filters', 'duration<=?1500',
        ]);
        try { await ctx.send({ audio: fs.readFileSync(r.file), mimetype: 'audio/mpeg', fileName: `${safeName(r.title)}.mp3` }); }
        finally { H.rm(r.dir); }
    });
});

addCommand({ pattern: 'video', desc: 'Download a video from YouTube (name or link, 480p)', usage: 'video <name or link>' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.video <name or YouTube link>`');
    if (!await ensureTools(ctx)) return;
    await withLimit(ctx, async () => {
        const r = await download(target(match), [
            '-f', 'bv*[height<=480]+ba/b[height<=480]/b', '--merge-output-format', 'mp4',
            '--match-filters', 'duration<=?900',
        ]);
        try {
            const buf = fs.readFileSync(r.file);
            if (buf.length > 60 * 1024 * 1024) await ctx.send({ document: buf, mimetype: 'video/mp4', fileName: `${safeName(r.title)}.mp4` });
            else await ctx.send({ video: buf, mimetype: 'video/mp4', caption: `🎬 ${r.title}` });
        } finally { H.rm(r.dir); }
    });
});

addCommand({ pattern: 'yt', aliases: ['ytsearch'], desc: 'Search YouTube', usage: 'yt <query>' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.yt <query>`');
    if (!await ensureTools(ctx, false)) return;
    const { stdout } = await ytdlp(['--flat-playlist', '--dump-json', '--', `ytsearch5:${match}`], { timeout: 60000 });
    const items = stdout.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (!items.length) return ctx.reply('❌ No results.');
    const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '?');
    await ctx.reply('*🔎 YouTube results:*\n\n' + items.map((v, i) =>
        `*${i + 1}.* ${v.title}\n   ⏱ ${fmt(v.duration)} · ${v.channel || v.uploader || ''}\n   https://youtu.be/${v.id}`).join('\n\n'));
});

addCommand({
    pattern: 'dl', aliases: ['insta', 'tiktok', 'fb', 'ig', 'twitter'],
    desc: 'Download a video/photo from Instagram, TikTok, Facebook, X… (link)', usage: 'dl <link>',
}, async (sock, msg, match, ctx) => {
    if (!match || !URL_RE.test(match.split(/\s+/)[0])) return ctx.reply('❌ Usage: `.dl <link>`');
    if (!await ensureTools(ctx)) return;
    await withLimit(ctx, async () => {
        const r = await download(match.split(/\s+/)[0], ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4']);
        try {
            const buf = fs.readFileSync(r.file);
            const ext = path.extname(r.file).toLowerCase();
            if (/\.(mp4|webm|mkv|mov)$/.test(ext)) {
                if (buf.length > 60 * 1024 * 1024) await ctx.send({ document: buf, mimetype: 'video/mp4', fileName: `${safeName(r.title)}${ext}` });
                else await ctx.send({ video: buf, mimetype: 'video/mp4', caption: r.title });
            } else if (/\.(jpe?g|png|webp)$/.test(ext)) await ctx.send({ image: buf, caption: r.title });
            else if (/\.(mp3|m4a|ogg|opus)$/.test(ext)) await ctx.send({ audio: buf, mimetype: 'audio/mpeg' });
            else await ctx.send({ document: buf, fileName: `${safeName(r.title)}${ext}`, mimetype: 'application/octet-stream' });
        } finally { H.rm(r.dir); }
    });
});

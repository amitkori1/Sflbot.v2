// Extra tools ported from the old scrapers / someonesay / anime_sender / log / evaluators / web plugins.
const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');
const fs = require('fs');

const { http } = H;
const fail = (ctx, what) => ctx.reply(`❌ ${what}`);
const nf = (n) => (n === undefined || n === null ? '—' : Number(n).toLocaleString('en-US'));

// ───────── covid ─────────
addCommand({ pattern: 'covid', public: true, desc: 'COVID-19 statistics (world or a country)', usage: 'covid india' }, async (sock, msg, match, ctx) => {
    const url = match ? `https://disease.sh/v3/covid-19/countries/${encodeURIComponent(match.trim())}` : 'https://disease.sh/v3/covid-19/all';
    let d;
    try { d = (await http.get(url)).data; } catch (e) { return fail(ctx, e.response?.status === 404 ? 'Country not found.' : 'COVID data service is not reachable.'); }
    await ctx.reply(`🦠 *COVID-19 – ${d.country || 'World'}*\n\n*Cases:* ${nf(d.cases)} (+${nf(d.todayCases)} today)\n*Deaths:* ${nf(d.deaths)} (+${nf(d.todayDeaths)} today)\n*Recovered:* ${nf(d.recovered)}\n*Active:* ${nf(d.active)}\n*Critical:* ${nf(d.critical)}\n*Tests:* ${nf(d.tests)}`);
});

// ───────── lyrics ─────────
addCommand({ pattern: 'lyric', aliases: ['lyrics'], public: true, desc: 'Song lyrics', usage: 'lyric artist - title  |  lyric imagine' }, async (sock, msg, match, ctx) => {
    if (!match) return fail(ctx, `Usage: \`${ctx.prefix}lyric artist - title\``);
    let artist, title;
    const m = /^(.+?)\s+-\s+(.+)$/.exec(match);
    if (m) { artist = m[1].trim(); title = m[2].trim(); }
    else {
        const { data } = await http.get(`https://api.lyrics.ovh/suggest/${encodeURIComponent(match)}`);
        const hit = data?.data?.[0];
        if (!hit) return fail(ctx, 'Song not found.');
        artist = hit.artist.name; title = hit.title;
    }
    let lyrics;
    try { lyrics = (await http.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 25000 })).data?.lyrics; }
    catch { return fail(ctx, 'Lyrics not found.'); }
    if (!lyrics) return fail(ctx, 'Lyrics not found.');
    lyrics = lyrics.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    await ctx.reply(`🎵 *${title}* – ${artist}\n\n${lyrics.slice(0, 3500)}${lyrics.length > 3500 ? '\n\n_…(cut)_' : ''}`);
});

// ───────── image search (Bing) ─────────
async function bingImages(query, n) {
    const { data } = await http.get('https://www.bing.com/images/search', {
        params: { q: query, form: 'HDRSC2', first: 1, adlt: 'strict' }, timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const urls = [...String(data).matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)].map(m => m[1]);
    return [...new Set(urls)].slice(0, n * 4);
}

addCommand({ pattern: 'img', aliases: ['image'], public: true, desc: 'Search images (SafeSearch on)', usage: 'img cute cats 3' }, async (sock, msg, match, ctx) => {
    if (!match) return fail(ctx, `Usage: \`${ctx.prefix}img <search> [count 1-5]\``);
    const cm = /\s(\d)$/.exec(match);
    const count = Math.min(5, Math.max(1, cm ? Number(cm[1]) : 3));
    const query = cm ? match.slice(0, -cm[0].length) : match;
    const urls = await bingImages(query, count);
    if (!urls.length) return fail(ctx, 'No images found.');
    let sent = 0;
    for (const u of urls) {
        if (sent >= count) break;
        try {
            const { buffer, contentType } = await H.safeGetBuffer(u, { maxBytes: 8 * 1024 * 1024, timeout: 15000 });
            if (!/^image\/(jpeg|png|webp)/.test(contentType) || buffer.length < 4000) continue;
            await ctx.send({ image: buffer, caption: sent === 0 ? `🖼 ${query}` : undefined });
            sent++;
        } catch { /* try the next one */ }
    }
    if (!sent) await fail(ctx, 'I found links but could not download any of them. Try another search.');
});

// ───────── wallpapers (Wallhaven, SFW only) ─────────
addCommand({ pattern: 'wallpaper', aliases: ['wp'], public: true, desc: 'Random HD wallpaper (SFW)', usage: 'wallpaper nature' }, async (sock, msg, match, ctx) => {
    const { data } = await http.get('https://wallhaven.cc/api/v1/search', {
        params: { q: match || '', sorting: 'random', purity: '100', categories: '111', atleast: '1280x720' },
    });
    const w = data?.data?.[0];
    if (!w) return fail(ctx, 'No wallpaper found.');
    const { buffer } = await H.safeGetBuffer(w.path, { maxBytes: 25 * 1024 * 1024, timeout: 60000 });
    if (buffer.length > 8 * 1024 * 1024) await ctx.send({ document: buffer, mimetype: 'image/jpeg', fileName: `wallpaper.${w.path.split('.').pop()}` });
    else await ctx.send({ image: buffer, caption: `🌄 ${w.resolution}` });
});

// ───────── paste (replaces nekobin) ─────────
addCommand({ pattern: 'paste', aliases: ['nekobin'], public: true, desc: 'Upload replied text to paste.rs and get a link' }, async (sock, msg, match, ctx) => {
    const text = match || H.getQuotedText(msg);
    if (!text) return fail(ctx, 'Reply to a text message (or add text).');
    const { data } = await http.post('https://paste.rs/', text, { headers: { 'Content-Type': 'text/plain' }, responseType: 'text' });
    await ctx.reply(`📋 ${String(data).trim()}`);
});

// ───────── nekobot image generators ─────────
const SAY = {
    trumpsay: ['trumptweet', 'Tweet as Trump'],
    changesay: ['changemymind', '"Change my mind" sign'],
    animesay: ['kannagen', 'Anime character says it'],
};
for (const [name, [type, desc]] of Object.entries(SAY)) {
    addCommand({ pattern: name, public: true, desc: `${desc} (text)`, usage: `${name} hello world` }, async (sock, msg, match, ctx) => {
        const text = match || H.getQuotedText(msg);
        if (!text) return fail(ctx, `Usage: \`${ctx.prefix}${name} <text>\``);
        const { data } = await http.get('https://nekobot.xyz/api/imagegen', { params: { type, text: text.slice(0, 200) } });
        if (!data?.message || !/^https?:/.test(data.message)) return fail(ctx, 'The image service did not answer.');
        await ctx.send({ image: await H.fetchBuffer(data.message), caption: '' });
    });
}

// ───────── anime GIFs (SFW) ─────────
const GIF_CATS = ['hug', 'kiss', 'pat', 'cuddle', 'cry', 'bonk', 'slap', 'wave', 'smile', 'wink', 'dance', 'happy', 'poke', 'bite', 'highfive', 'blush', 'kick', 'yeet', 'smug', 'cringe'];
addCommand({ pattern: 'animegif', public: true, desc: `Random anime GIF (${GIF_CATS.slice(0, 6).join(', ')}…)`, usage: 'animegif hug' }, async (sock, msg, match, ctx) => {
    const cat = GIF_CATS.includes((match || '').toLowerCase()) ? match.toLowerCase() : 'hug';
    if (!await H.hasBinary('ffmpeg')) return fail(ctx, 'ffmpeg is not installed on this server.');
    const { data } = await http.get(`https://api.waifu.pics/sfw/${cat}`);
    const { buffer } = await H.safeGetBuffer(data.url, { maxBytes: 15 * 1024 * 1024 });
    const inp = H.tmpPath('.gif'), out = H.tmpPath('.mp4');
    fs.writeFileSync(inp, buffer);
    try {
        await H.runCmd('ffmpeg', ['-y', '-i', inp, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
        await ctx.send({ video: fs.readFileSync(out), mimetype: 'video/mp4', gifPlayback: true });
    } finally { H.rm(inp, out); }
});

// ───────── speedtest ─────────
addCommand({ pattern: 'speedtest', desc: "Test the bot server's internet speed" }, async (sock, msg, match, ctx) => {
    const wait = await ctx.reply('⏳ Testing speed...');
    try {
        const t0 = Date.now();
        await http.get('https://speed.cloudflare.com/cdn-cgi/trace', { timeout: 10000 });
        const ping = Date.now() - t0;

        const d0 = Date.now();
        const down = await http.get('https://speed.cloudflare.com/__down?bytes=20000000', { responseType: 'arraybuffer', timeout: 60000 });
        const downMbps = (down.data.byteLength * 8) / ((Date.now() - d0) / 1000) / 1e6;

        const payload = Buffer.alloc(5 * 1024 * 1024, 1);
        const u0 = Date.now();
        await http.post('https://speed.cloudflare.com/__up', payload, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 60000, maxBodyLength: Infinity });
        const upMbps = (payload.length * 8) / ((Date.now() - u0) / 1000) / 1e6;

        await ctx.reply(`🚀 *Speed test*\n\n*Ping:* ${ping} ms\n*Download:* ${downMbps.toFixed(1)} Mbps\n*Upload:* ${upMbps.toFixed(1)} Mbps`);
    } finally { sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {}); }
});

// ───────── media info ─────────
const fps = (r) => { const [a, b] = String(r || '').split('/').map(Number); return a && b ? `, ${(a / b).toFixed(2)} fps` : ''; };
addCommand({ pattern: 'mediainfo', desc: 'Technical info about a replied audio / video / image' }, async (sock, msg, match, ctx) => {
    if (!await H.hasBinary('ffmpeg')) return fail(ctx, 'ffmpeg (ffprobe) is not installed on this server.');
    const media = await H.getMedia(sock, msg, ['audio', 'video', 'image', 'sticker', 'document']);
    if (!media) return fail(ctx, 'Reply to an audio, video or image.');
    const inp = H.tmpPath();
    fs.writeFileSync(inp, media.buffer);
    try {
        const { stdout } = await H.runCmd('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inp], { timeout: 30000 });
        const j = JSON.parse(stdout);
        const f = j.format || {};
        let text = `ℹ️ *Media info*\n\n*Type:* ${media.type} (${media.mimetype || 'unknown'})\n*Format:* ${f.format_long_name || f.format_name || '—'}\n*Size:* ${(media.buffer.length / 1024 / 1024).toFixed(2)} MB`;
        if (f.duration) text += `\n*Duration:* ${H.secondsToHms(Math.round(f.duration))}`;
        if (f.bit_rate) text += `\n*Bitrate:* ${Math.round(f.bit_rate / 1000)} kb/s`;
        for (const s of j.streams || []) {
            if (s.codec_type === 'video') text += `\n\n🎞 *Video:* ${s.codec_name}, ${s.width}×${s.height}${fps(s.r_frame_rate)}`;
            if (s.codec_type === 'audio') text += `\n\n🔊 *Audio:* ${s.codec_name}, ${s.sample_rate} Hz, ${s.channels} ch`;
        }
        await ctx.reply(text);
    } finally { H.rm(inp); }
});

// ───────── report a member to the group admins ─────────
const reported = new Map();
addCommand({ pattern: 'report', public: true, onlyGroup: true, desc: 'Report the replied message to the group admins', usage: 'report spam' }, async (sock, msg, match, ctx) => {
    const q = H.getQuoted(msg);
    if (!q?.participant) return fail(ctx, 'Reply to the message you want to report.');
    const last = reported.get(ctx.sender) || 0;
    if (Date.now() - last < 60000) return fail(ctx, 'Please wait a minute before sending another report.');
    reported.set(ctx.sender, Date.now());
    const meta = await H.getGroupMeta(sock, ctx.jid, true);
    const admins = meta.participants.filter(p => p.admin).map(p => p.id);
    if (!admins.length) return fail(ctx, 'No admins found.');
    await sock.sendMessage(ctx.jid, {
        text: `🚨 *Report*\n\n*User:* @${H.num(q.participant)}\n*Reported by:* @${H.num(ctx.sender)}${match ? `\n*Reason:* ${match}` : ''}\n\n${admins.map(a => '@' + H.num(a)).join(' ')}`,
        mentions: [q.participant, ctx.sender, ...admins],
    }, { quoted: msg });
});

// ───────── log: save a group message to your own chat ─────────
addCommand({ pattern: 'log', onlyGroup: true, desc: 'Save the replied group message to your own chat' }, async (sock, msg, match, ctx) => {
    const q = H.getQuoted(msg);
    if (!q) return fail(ctx, 'Reply to a message to save it.');
    const me = H.bare(sock.user.id);
    const meta = await H.getGroupMeta(sock, ctx.jid).catch(() => null);
    const head = `📌 *Saved from:* ${meta?.subject || ctx.jid}\n*From:* wa.me/${H.num(q.participant || '')}\n`;
    const text = q.message?.conversation || q.message?.extendedTextMessage?.text || '';
    const media = await H.getMedia(sock, msg, ['image', 'video', 'audio', 'document', 'sticker']);
    if (media) {
        const key = media.type === 'sticker' ? 'sticker' : media.type;
        const content = { [key]: media.buffer, mimetype: media.mimetype || undefined };
        if (['image', 'video'].includes(media.type)) content.caption = head + (H.getQuotedText(msg) || '');
        await sock.sendMessage(me, content);
        if (!content.caption) await sock.sendMessage(me, { text: head });
    } else if (text) await sock.sendMessage(me, { text: head + '\n' + text });
    else return fail(ctx, 'I can not save that kind of message.');
    await ctx.reply('✅ Saved to your chat.');
});

// ───────── download a direct link (owner) ─────────
addCommand({ pattern: 'download', aliases: ['fetch'], desc: 'Download a direct file link and send it (max 60MB)', usage: 'download https://example.com/file.pdf' }, async (sock, msg, match, ctx) => {
    const link = (match || '').trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(link)) return fail(ctx, `Usage: \`${ctx.prefix}download <direct link>\``);
    const wait = await ctx.reply('⏳ Downloading...');
    try {
        const { buffer, contentType, url } = await H.safeGetBuffer(link);
        const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file').slice(0, 80) || 'file';
        if (/^image\/(jpeg|png|webp)/.test(contentType) && buffer.length < 8e6) await ctx.send({ image: buffer });
        else if (/^video\/mp4/.test(contentType) && buffer.length < 60e6) await ctx.send({ video: buffer, mimetype: 'video/mp4' });
        else if (/^audio\//.test(contentType)) await ctx.send({ audio: buffer, mimetype: contentType === 'audio/mpeg' ? 'audio/mpeg' : contentType });
        else await ctx.send({ document: buffer, mimetype: contentType || 'application/octet-stream', fileName: name });
    } finally { sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {}); }
});

module.exports = { bingImages };

// Online lookups & fun. All of these use free public APIs (some need an optional key in config.env).
const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');
const fs = require('fs');

const { http } = H;
const fail = (ctx, what) => ctx.reply(`❌ ${what}`);

// ───────── wikipedia ─────────
addCommand({ pattern: 'wiki', desc: 'Wikipedia summary', usage: 'wiki albert einstein' }, async (sock, msg, match, ctx) => {
    if (!match) return fail(ctx, 'Usage: `.wiki <topic>`');
    const { data: s } = await http.get('https://en.wikipedia.org/w/api.php', {
        params: { action: 'opensearch', search: match, limit: 1, format: 'json' },
    });
    const title = s?.[1]?.[0];
    if (!title) return fail(ctx, 'Nothing found.');
    const { data } = await http.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const text = `📚 *${data.title}*\n\n${data.extract}\n\n🔗 ${data.content_urls?.desktop?.page || ''}`;
    if (data.thumbnail?.source) await ctx.send({ image: { url: data.thumbnail.source }, caption: text });
    else await ctx.reply(text);
});

// ───────── github ─────────
addCommand({ pattern: 'github', aliases: ['gh'], desc: 'GitHub user info', usage: 'github torvalds' }, async (sock, msg, match, ctx) => {
    if (!match) return fail(ctx, 'Usage: `.github <username>`');
    let u;
    try { u = (await http.get(`https://api.github.com/users/${encodeURIComponent(match.trim())}`)).data; }
    catch (e) { return fail(ctx, e.response?.status === 404 ? 'User not found.' : 'GitHub is not reachable right now.'); }
    const text = `🐙 *${u.name || u.login}* (@${u.login})\n\n${u.bio ? u.bio + '\n\n' : ''}📦 *Repos:* ${u.public_repos}\n👥 *Followers:* ${u.followers} · *Following:* ${u.following}\n${u.company ? `🏢 ${u.company}\n` : ''}${u.location ? `📍 ${u.location}\n` : ''}🔗 ${u.html_url}`;
    await ctx.send({ image: { url: u.avatar_url }, caption: text });
});

// ───────── currency ─────────
addCommand({ pattern: 'currency', aliases: ['cur'], desc: 'Convert currency', usage: 'currency 10 usd inr' }, async (sock, msg, match, ctx) => {
    const m = /^([\d.,]+)\s*([a-z]{3})\s+(?:to\s+)?([a-z]{3})$/i.exec(match || '');
    if (!m) return fail(ctx, 'Usage: `.currency 10 usd inr`');
    const amount = parseFloat(m[1].replace(/,/g, '')), from = m[2].toUpperCase(), to = m[3].toUpperCase();
    let result;
    try {
        const { data } = await http.get('https://open.er-api.com/v6/latest/' + from);
        if (data.rates?.[to]) result = amount * data.rates[to];
    } catch {}
    if (result === undefined) {
        try {
            const { data } = await http.get('https://api.frankfurter.dev/v1/latest', { params: { amount, base: from, symbols: to } });
            result = data.rates?.[to];
        } catch {}
    }
    if (result === undefined) return fail(ctx, 'Could not convert. Check the currency codes.');
    await ctx.reply(`💱 *${amount.toLocaleString('en-US')} ${from}* = \`${result.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${to}\``);
});

// ───────── translate ─────────
async function translate(text, to) {
    const { data } = await http.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text },
    });
    return { text: data[0].map(p => p[0]).join(''), from: data[2] };
}

addCommand({ pattern: 'trt', aliases: ['translate'], desc: 'Translate text (reply or inline)', usage: 'trt hi hello world  |  reply + trt en' }, async (sock, msg, match, ctx) => {
    const quoted = H.getQuotedText(msg);
    let to = config.TRANSLATE_LANG, text = quoted;
    if (match) {
        const m = /^([a-z]{2}(?:-[a-z]{2,4})?)(?:\s+([\s\S]+))?$/i.exec(match);
        if (m && (quoted || m[2])) { to = m[1].toLowerCase(); text = m[2] || quoted; }
        else text = match;
    }
    if (!text) return fail(ctx, 'Usage: `.trt <lang> <text>` or reply to a message with `.trt <lang>`');
    const r = await translate(text, to);
    await ctx.reply(`🌐 *Translated* (${r.from} → ${to}):\n\n${r.text}`);
});

addCommand({ pattern: 'detectlang', desc: 'Detect the language of a replied message' }, async (sock, msg, match, ctx) => {
    const text = match || H.getQuotedText(msg);
    if (!text) return fail(ctx, 'Reply to a message or add text.');
    const r = await translate(text, 'en');
    await ctx.reply(`🔎 Detected language: *${r.from}*`);
});

// ───────── text to speech ─────────
addCommand({ pattern: 'tts', desc: 'Text to speech', usage: 'tts hello  |  tts hi|नमस्ते' }, async (sock, msg, match, ctx) => {
    let lang = config.TTS_LANG, text = match || H.getQuotedText(msg);
    const m = /^([a-z]{2}(?:-[a-z]{2,4})?)\s*\|\s*([\s\S]+)$/i.exec(text || '');
    if (m) { lang = m[1].toLowerCase(); text = m[2]; }
    if (!text) return fail(ctx, 'Usage: `.tts hello` or `.tts hi|नमस्ते`');
    if (text.length > 200) return fail(ctx, 'Text too long (max 200 characters).');

    const mp3 = await H.fetchBuffer('https://translate.google.com/translate_tts', {
        params: { ie: 'UTF-8', q: text, tl: lang, client: 'tw-ob' },
    });
    if (await H.hasBinary('ffmpeg')) {
        const inp = H.tmpPath('.mp3'), out = H.tmpPath('.ogg');
        fs.writeFileSync(inp, mp3);
        try {
            await H.runCmd('ffmpeg', ['-y', '-i', inp, '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', out]);
            return await ctx.send({ audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true });
        } finally { H.rm(inp, out); }
    }
    await ctx.send({ audio: mp3, mimetype: 'audio/mpeg' });
});

// ───────── url tools ─────────
addCommand({ pattern: 'short', desc: 'Shorten a URL', usage: 'short https://example.com/very/long' }, async (sock, msg, match, ctx) => {
    if (!/^https?:\/\//i.test(match || '')) return fail(ctx, 'Usage: `.short <link starting with http>`');
    const { data } = await http.get('https://is.gd/create.php', { params: { format: 'simple', url: match.trim() } });
    await ctx.reply(`🔗 ${String(data).trim()}`);
});

addCommand({ pattern: 'ss', aliases: ['screenshot'], desc: 'Screenshot of a website', usage: 'ss https://example.com' }, async (sock, msg, match, ctx) => {
    if (!/^https?:\/\//i.test(match || '')) return fail(ctx, 'Usage: `.ss <link starting with http>`');
    const img = await H.fetchBuffer(`https://image.thum.io/get/width/1280/crop/800/noanimate/${match.trim()}`, { timeout: 45000 });
    await ctx.send({ image: img, caption: match.trim() });
});

// ───────── movies ─────────
addCommand({ pattern: 'movie', desc: 'Movie / series info (needs OMDB_API_KEY)', usage: 'movie inception' }, async (sock, msg, match, ctx) => {
    if (!config.OMDB_API_KEY) return fail(ctx, 'Set `OMDB_API_KEY` in config.env first (free at omdbapi.com).');
    if (!match) return fail(ctx, 'Usage: `.movie <title>`');
    const { data: j } = await http.get('https://www.omdbapi.com/', { params: { apikey: config.OMDB_API_KEY, t: match, plot: 'short' } });
    if (j.Response !== 'True') return fail(ctx, 'Not found.');
    const text = `🎬 *${j.Title}* (${j.Year})\n\n⭐ *IMDb:* ${j.imdbRating}/10\n🎭 *Genre:* ${j.Genre}\n⏱ *Runtime:* ${j.Runtime}\n🎥 *Director:* ${j.Director}\n👥 *Cast:* ${j.Actors}\n\n📝 ${j.Plot}`;
    if (j.Poster && j.Poster !== 'N/A') await ctx.send({ image: { url: j.Poster }, caption: text });
    else await ctx.reply(text);
});

// ───────── fun ─────────
addCommand({ pattern: 'meme', desc: 'Random meme' }, async (sock, msg, match, ctx) => {
    const { data } = await http.get('https://meme-api.com/gimme');
    await ctx.send({ image: { url: data.url }, caption: data.title });
});

const ANIME = ['waifu', 'neko', 'shinobu', 'megumin', 'cuddle', 'cry', 'hug', 'kiss', 'pat', 'smug', 'bonk', 'wink', 'smile'];
addCommand({ pattern: 'animepic', aliases: ['neko'], desc: `Random anime picture (${ANIME.slice(0, 5).join(', ')}…)`, usage: 'animepic [waifu|neko|megumin…]' }, async (sock, msg, match, ctx) => {
    const cat = ANIME.includes((match || '').toLowerCase()) ? match.toLowerCase() : 'neko';
    const { data } = await http.get(`https://api.waifu.pics/sfw/${cat}`);
    await ctx.send({ image: { url: data.url } });
});

// ───────── location ─────────
addCommand({ pattern: 'locate', desc: 'Send a place as a location pin', usage: 'locate eiffel tower' }, async (sock, msg, match, ctx) => {
    if (!match) return fail(ctx, 'Usage: `.locate <place>`');
    const { data } = await http.get('https://nominatim.openstreetmap.org/search', { params: { q: match, format: 'json', limit: 1 } });
    if (!data?.[0]) return fail(ctx, 'Place not found.');
    await ctx.send({ location: { degreesLatitude: +data[0].lat, degreesLongitude: +data[0].lon, name: data[0].display_name.slice(0, 100) } });
});

// ───────── image tools ─────────
addCommand({ pattern: 'ocr', desc: 'Read text from an image (reply)', usage: 'ocr [language code, e.g. eng, hin]' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return fail(ctx, 'Reply to an image.');
    const form = new FormData();
    form.append('apikey', config.OCR_API_KEY);
    form.append('language', /^[a-z]{3}$/i.test(match || '') ? match.toLowerCase() : 'eng');
    form.append('file', new Blob([media.buffer], { type: media.mimetype || 'image/jpeg' }), 'image.jpg');
    const { data } = await http.post('https://api.ocr.space/parse/image', form, { timeout: 60000 });
    const text = data?.ParsedResults?.map(r => r.ParsedText).join('\n').trim();
    if (!text) return fail(ctx, data?.ErrorMessage?.toString() || 'No text found.');
    await ctx.reply(`📝 *Extracted text:*\n\n${text}`);
});

addCommand({ pattern: 'removebg', desc: 'Remove image background (needs REMOVE_BG_API_KEY)' }, async (sock, msg, match, ctx) => {
    if (!config.REMOVE_BG_API_KEY) return fail(ctx, 'Set `REMOVE_BG_API_KEY` in config.env first (free at remove.bg).');
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return fail(ctx, 'Reply to an image.');
    const form = new FormData();
    form.append('size', 'auto');
    form.append('image_file', new Blob([media.buffer], { type: media.mimetype || 'image/jpeg' }), 'image.jpg');
    let out;
    try {
        const { data } = await http.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: { 'X-Api-Key': config.REMOVE_BG_API_KEY }, responseType: 'arraybuffer', timeout: 60000,
        });
        out = Buffer.from(data);
    } catch (e) {
        return fail(ctx, `remove.bg error (${e.response?.status || e.message}). Check your API key / credits.`);
    }
    await ctx.send({ document: out, mimetype: 'image/png', fileName: 'no-background.png' });   // document keeps transparency
});

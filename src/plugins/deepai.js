// AI image & text tools via DeepAI (ported from the old deepai plugin).
// Uses DEEPAI_API_KEY (defaults to DeepAI's public demo key, which is slow/limited; add your own free key for best results).
const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');

const { http } = H;
const API = 'https://api.deepai.org/api/';

async function callDeepAI(model, fields) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        if (Buffer.isBuffer(v)) form.append(k, new Blob([v], { type: 'image/png' }), `${k}.png`);
        else form.append(k, String(v));
    }
    try {
        const { data } = await http.post(API + model, form, { headers: { 'api-key': config.DEEPAI_API_KEY }, timeout: 120000, maxBodyLength: Infinity });
        return data;
    } catch (e) {
        const status = e.response?.status;
        if (status === 401 || status === 403) throw new Error('DeepAI rejected the key. Set your own DEEPAI_API_KEY (free at deepai.org).');
        if (status === 429) throw new Error('DeepAI rate limit reached. Try again later or use your own DEEPAI_API_KEY.');
        throw new Error(e.response?.data?.err || e.message);
    }
}

/** Image in -> image out commands */
const IMAGE_TOOLS = {
    colorai: { model: 'colorizer', desc: 'Colourise a black & white photo', wait: '🎨 Colourising...' },
    waifuai: { model: 'waifu2x', desc: 'Upscale / denoise (anime style)', wait: '✨ Upscaling...' },
    superai: { model: 'torch-srgan', desc: 'Super-resolution: sharper, higher quality photo', wait: '🔍 Enhancing...' },
    dreamai: { model: 'deepdream', desc: 'DeepDream effect', wait: '🌃 Dreaming...' },
    toonai: { model: 'toonify', desc: 'Turn a face photo into a cartoon', wait: '🎭 Toonifying...' },
};

for (const [name, t] of Object.entries(IMAGE_TOOLS)) {
    addCommand({ pattern: name, desc: t.desc }, async (sock, msg, match, ctx) => {
        const media = await H.getMedia(sock, msg, ['image']);
        if (!media) return ctx.reply('❌ Reply to a photo.');
        const wait = await ctx.reply(t.wait);
        try {
            const r = await callDeepAI(t.model, { image: media.buffer });
            if (!r.output_url) throw new Error('DeepAI returned no image.');
            await ctx.send({ image: await H.fetchBuffer(r.output_url, { timeout: 60000 }), caption: `🤖 ${t.model}` });
        } finally { sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {}); }
    });
}

addCommand({ pattern: 'neuraltalkai', desc: 'Describe what is in a photo' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return ctx.reply('❌ Reply to a photo.');
    const r = await callDeepAI('neuraltalk', { image: media.buffer });
    await ctx.reply(`🖼 *I see:* ${r.output || '—'}`);
});

addCommand({ pattern: 'nudityai', desc: 'NSFW score of a photo (content moderation)' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return ctx.reply('❌ Reply to a photo.');
    const r = await callDeepAI('content-moderation', { image: media.buffer });
    await ctx.reply(`🔞 *NSFW score:* ${r.output?.nsfw_score ?? '—'}`);
});

addCommand({ pattern: 'ganstyle', desc: 'Style transfer: reply to a photo + link to a style image', usage: 'ganstyle https://example.com/style.jpg' }, async (sock, msg, match, ctx) => {
    if (!/^https?:\/\//i.test(match || '')) return ctx.reply(`❌ Usage: reply to a photo with \`${ctx.prefix}ganstyle <link to a style image>\``);
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return ctx.reply('❌ Reply to a photo.');
    const wait = await ctx.reply('♻️ Creating...');
    try {
        const style = (await H.safeGetBuffer(match.trim().split(/\s+/)[0], { maxBytes: 10 * 1024 * 1024 })).buffer;
        const r = await callDeepAI('fast-style-transfer', { content: media.buffer, style });
        if (!r.output_url) throw new Error('DeepAI returned no image.');
        await ctx.send({ image: await H.fetchBuffer(r.output_url, { timeout: 60000 }) });
    } finally { sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {}); }
});

// ───────── text tools ─────────
addCommand({ pattern: 'moodai', desc: 'Find the mood / sentiment of a text', usage: 'moodai I love this!' }, async (sock, msg, match, ctx) => {
    const text = match || H.getQuotedText(msg);
    if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}moodai <text>\``);
    const r = await callDeepAI('sentiment-analysis', { text });
    await ctx.reply(`🎭 *Mood:* ${[].concat(r.output || '—').join(', ')}`);
});

addCommand({ pattern: 'textai', desc: 'Continue a text with AI', usage: 'textai Once upon a time' }, async (sock, msg, match, ctx) => {
    const text = match || H.getQuotedText(msg);
    if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}textai <start of a text>\``);
    const r = await callDeepAI('text-generator', { text });
    await ctx.reply(String(r.output || '—').slice(0, 3500));
});

addCommand({ pattern: 'ttiai', desc: 'Text → image', usage: 'ttiai a cat astronaut' }, async (sock, msg, match, ctx) => {
    const text = match || H.getQuotedText(msg);
    if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}ttiai <what to draw>\``);
    const wait = await ctx.reply('🖌 Drawing...');
    try {
        const r = await callDeepAI('text2img', { text });
        if (!r.output_url) throw new Error('DeepAI returned no image.');
        await ctx.send({ image: await H.fetchBuffer(r.output_url, { timeout: 60000 }), caption: text.slice(0, 200) });
    } finally { sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {}); }
});

// ───────── "this X does not exist" generators (no key needed) ─────────
addCommand({ pattern: 'faceai', desc: 'AI-generated face of a person that does not exist' }, async (sock, msg, match, ctx) => {
    const img = await H.fetchBuffer('https://thispersondoesnotexist.com/', { timeout: 30000, headers: { 'Cache-Control': 'no-cache' } });
    await ctx.send({ image: img, caption: '🧑 This person does not exist' });
});

addCommand({ pattern: 'animai', desc: 'AI-generated anime face' }, async (sock, msg, match, ctx) => {
    const seed = Math.floor(Math.random() * 99999);
    const img = await H.fetchBuffer(`https://thisanimedoesnotexist.ai/results/psi-0.8/seed${String(seed).padStart(5, '0')}.png`, { timeout: 30000 });
    await ctx.send({ image: img, caption: '🎌 This anime character does not exist' });
});

addCommand({ pattern: 'deepai', desc: 'List the AI tools' }, async (sock, msg, match, ctx) => {
    const p = ctx.prefix;
    await ctx.reply(`🤖 *AI tools*\n\n*Reply to a photo:* ${Object.keys(IMAGE_TOOLS).map(n => p + n).join(' ')} ${p}neuraltalkai ${p}nudityai ${p}ganstyle <style link>\n*Text:* ${p}moodai ${p}textai ${p}ttiai\n*Random:* ${p}faceai ${p}animai`);
});

module.exports = { callDeepAI };

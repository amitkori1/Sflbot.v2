// SimSimi chatbot  +  voice tools (speech-to-text via wit.ai)
//
//   .simi <text>            ask SimSimi once                         (everyone)
//   .simi on | off          auto-chat in THIS chat                   (owner)
//   .simi all on | off      auto-chat in every private chat; in groups only when mentioned/replied (owner)
//   .simi lang <xx|auto>    language for this chat                   (owner)
//   .simi status            which provider is answering              (owner)
//   "Simi hello"            typing the trigger word works in any chat (owner) / chats with simi on
//   .voicy                  reply to a voice note -> text
//   .vtalk                  reply to a voice note -> SimSimi answers (text + voice)
//
// Providers are tried in this order and failing ones are skipped for 5 minutes:
//   1. Official SimSimi API   (needs SIMSIMI_API_KEY from workshop.simsimi.com)
//   2. api.simsimi.vn         (free, unofficial)
//   3. api.simsimi.net        (free, unofficial)
//   4. Brainshop.ai           (needs BRAINSHOP_BID + BRAINSHOP_KEY)
const { addCommand, addPassive } = require('../events');
const config = require('../config');
const { Simi } = require('../db');
const H = require('../helpers');
const fs = require('fs');

const { http } = H;

// ───────── language helpers ─────────
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

async function detectLang(text) {
    if (!/[^\x00-\x7F]/.test(text)) return 'en';           // plain ASCII: don't waste a request
    try {
        const { data } = await http.get('https://translate.googleapis.com/translate_a/single', {
            params: { client: 'gtx', sl: 'auto', tl: 'en', dt: 't', q: text.slice(0, 200) }, timeout: 8000,
        });
        const l = data?.[2];
        return LANG_RE.test(l || '') ? l : 'en';
    } catch { return 'en'; }
}

async function pickLang(jid, text) {
    const chosen = Simi.lang(jid) || config.SIMI_LANG;
    return chosen && chosen !== 'auto' ? chosen : detectLang(text);
}

// ───────── providers ─────────
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function pluck(d) {
    return clean(d?.atext ?? d?.message ?? d?.success ?? d?.text ?? d?.response ?? d?.cnt ?? d?.messages?.[0]?.response ?? '');
}

const PROVIDERS = [
    {
        name: 'SimSimi (official)',
        enabled: () => !!config.SIMSIMI_API_KEY,
        ask: async (text, lang) => {
            const body = { utext: text, lang };
            if (config.SIMI_BAD_WORDS) body.atext_bad_prob_max = 0.7;
            const { data } = await http.post('https://wsapi.simsimi.com/190410/talk', body, {
                headers: { 'Content-Type': 'application/json', 'x-api-key': config.SIMSIMI_API_KEY }, timeout: 12000,
            });
            return pluck(data);
        },
    },
    {
        name: 'api.simsimi.vn',
        enabled: () => true,
        ask: async (text, lang) => {
            const { data } = await http.post('https://api.simsimi.vn/v1/simtalk', new URLSearchParams({ text, lc: lang.split('-')[0] }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 12000,
            });
            return pluck(data);
        },
    },
    {
        name: 'api.simsimi.net',
        enabled: () => true,
        ask: async (text, lang) => {
            const { data } = await http.get('https://api.simsimi.net/v2/', {
                params: { text, lc: lang.split('-')[0], cf: 'false' }, timeout: 12000,
            });
            return pluck(data);
        },
    },
    {
        name: 'Brainshop',
        enabled: () => !!(config.BRAINSHOP_BID && config.BRAINSHOP_KEY),
        ask: async (text, lang, uid) => {
            const { data } = await http.get('http://api.brainshop.ai/get', {
                params: { bid: config.BRAINSHOP_BID, key: config.BRAINSHOP_KEY, uid, msg: text }, timeout: 12000,
            });
            return pluck(data);
        },
    },
];

const failedAt = new Map();          // provider name -> timestamp of last failure
const COOLDOWN = 5 * 60 * 1000;
const state = { last: null };

// answers that mean "I have no answer" rather than a real reply
const NO_ANSWER = /^(i do not know how to answer|i don'?t know what to say|teach me|emoticons can not be understood)/i;

async function ask(text, lang, uid = 'sfl') {
    text = clean(text).slice(0, 400);
    const errors = [];
    for (const p of PROVIDERS) {
        if (!p.enabled()) continue;
        if (Date.now() - (failedAt.get(p.name) || 0) < COOLDOWN) continue;
        try {
            const out = await p.ask(text, lang, uid);
            if (out && !NO_ANSWER.test(out)) { state.last = p.name; failedAt.delete(p.name); return { text: out, provider: p.name }; }
            if (!out) throw new Error('empty answer');
            return { text: out, provider: p.name, noAnswer: true };       // reachable, but it doesn't know
        } catch (e) {
            const code = e.response?.status;
            errors.push(`${p.name}: ${code || e.message}`);
            failedAt.set(p.name, Date.now());
        }
    }
    throw new Error(errors.length ? `SimSimi is not reachable (${errors.join('; ')})` : 'No chatbot provider is available.');
}

// ───────── safety: pace the bot so it never floods a chat ─────────
const pace = new Map();            // jid -> { last, times: [] }
function allowed(jid) {
    const now = Date.now();
    const p = pace.get(jid) || { last: 0, times: [] };
    p.times = p.times.filter(t => now - t < 10 * 60 * 1000);
    if (now - p.last < 2500 || p.times.length >= 25) { pace.set(jid, p); return false; }
    p.last = now; p.times.push(now); pace.set(jid, p);
    return true;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function chat(ctx, text, { quoted = false, voice = false } = {}) {
    const { sock, jid } = ctx;
    const lang = await pickLang(jid, text);
    sock.sendPresenceUpdate('composing', jid).catch(() => {});
    let r;
    try {
        r = await ask(text, lang, H.num(ctx.sender || jid));
    } finally {
        // a short, human-like pause (keeps the account safer than instant replies)
        await sleep(500 + Math.random() * 900);
        sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    const reply = r.noAnswer ? '🤔 …' : r.text;
    const sent = quoted ? await ctx.reply(reply) : await sock.sendMessage(jid, { text: reply });
    return { ...r, lang, sent };
}

// ───────── command ─────────
addCommand({
    pattern: 'simi', aliases: ['simsimi'], public: true,
    desc: 'Chat with SimSimi. Owner: simi on|off|all on|all off|lang xx|status', usage: 'simi hello  |  simi on  |  simi all on',
}, async (sock, msg, match, ctx) => {
    const p = ctx.prefix;
    const [sub, ...rest] = (match || '').split(/\s+/);
    const subl = (sub || '').toLowerCase();
    const arg = rest.join(' ').trim();
    const ownerOnly = () => { if (!ctx.isOwner) { ctx.reply('❌ Only the owner can change SimSimi settings.'); return true; } return false; };

    if (!match) return ctx.reply(`🤖 *SimSimi*\nAsk me anything: \`${p}simi hello\`\n\nThis chat: *${Simi.isOn(ctx.jid) ? 'auto-reply ON' : 'auto-reply OFF'}*  ·  All private chats: *${Simi.all() ? 'ON' : 'OFF'}*\nOwner: \`${p}simi on|off\`, \`${p}simi all on|off\`, \`${p}simi lang hi\`, \`${p}simi status\``);

    if (subl === 'on' || subl === 'off') {
        if (ownerOnly()) return;
        Simi.set(ctx.jid, subl === 'on');
        return ctx.reply(subl === 'on'
            ? `✅ SimSimi auto-reply is *ON* in this chat.${ctx.isGroup ? '\n_In groups I answer when mentioned, replied to, or when a message starts with "Simi"._' : ''}`
            : '✅ SimSimi auto-reply is *OFF* in this chat.');
    }
    if (subl === 'all') {
        if (ownerOnly()) return;
        const v = arg.toLowerCase();
        if (v !== 'on' && v !== 'off') return ctx.reply(`Usage: \`${p}simi all on|off\``);
        Simi.setAll(v === 'on');
        return ctx.reply(v === 'on' ? '✅ SimSimi will answer every private chat (and groups when mentioned/replied).' : '✅ SimSimi global auto-reply is *OFF*.');
    }
    if (subl === 'lang') {
        if (ownerOnly()) return;
        if (arg.toLowerCase() === 'auto') { Simi.setLang(ctx.jid, null); return ctx.reply('✅ Language: *auto-detect*'); }
        if (!LANG_RE.test(arg)) return ctx.reply(`Usage: \`${p}simi lang en|hi|id|es|auto\``);
        Simi.setLang(ctx.jid, arg);
        return ctx.reply(`✅ SimSimi language for this chat: *${arg}*`);
    }
    if (subl === 'status') {
        if (ownerOnly()) return;
        const lines = PROVIDERS.map(pr => {
            const bad = Date.now() - (failedAt.get(pr.name) || 0) < COOLDOWN;
            return `${!pr.enabled() ? '⚪' : bad ? '🔴' : '🟢'} ${pr.name}${!pr.enabled() ? ' _(no key)_' : bad ? ' _(failing, retry in a few min)_' : ''}`;
        });
        return ctx.reply(`*SimSimi providers*\n${lines.join('\n')}\n\n*Last answer from:* ${state.last || '—'}\n*Language:* ${Simi.lang(ctx.jid) || config.SIMI_LANG}`);
    }

    // plain question
    try { await chat(ctx, match, { quoted: true }); }
    catch (e) { await ctx.reply(`❌ ${e.message}`); }
});

// ───────── auto-reply (passive) ─────────
const TRIGGER = /^(simi|simsimi)\b[\s,:!-]*/i;

addPassive(async (ctx) => {
    const { sock, jid, text } = ctx;
    if (!text || text.length < 1) return;
    if (new RegExp(config.HANDLERS).test(text[0])) return;      // that is a command, not chat

    const triggered = TRIGGER.test(text);
    let input = text;

    if (ctx.fromMe) {
        if (!triggered) return;                                   // owner: only when saying "Simi ..."
        input = text.replace(TRIGGER, '');
    } else {
        const on = Simi.isOn(jid) || (Simi.all() && !ctx.isGroup);
        if (!on && !triggered) return;
        if (!on && triggered && !ctx.isOwner && !Simi.isOn(jid)) return;   // strangers need auto-reply enabled
        if (ctx.isGroup) {
            const nums = new Set([...H.getBotIds(sock)].map(H.num));
            const mentioned = (H.getContext(ctx.msg)?.mentionedJid || []).some(j => nums.has(H.num(j)));
            const replied = nums.has(H.num(H.getQuoted(ctx.msg)?.participant || ''));
            if (!mentioned && !replied && !triggered) return;
        }
        if (triggered) input = text.replace(TRIGGER, '');
    }
    input = input.replace(/@\d+/g, '').trim();
    if (!input) return;
    if (!allowed(jid)) return;
    try { await chat(ctx, input, { quoted: ctx.isGroup }); }
    catch (e) { console.error('SimSimi auto-reply failed:', e.message); }
});

// ───────── voice: speech to text (wit.ai) ─────────
/** wit.ai streams several JSON objects back-to-back; return the text of the last/final one. */
function parseWit(body) {
    const out = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') { if (depth++ === 0) start = i; }
        else if (c === '}' && --depth === 0 && start >= 0) { try { out.push(JSON.parse(body.slice(start, i + 1))); } catch {} start = -1; }
    }
    const withText = out.filter(o => typeof o.text === 'string' && o.text.trim());
    return (withText.find(o => o.is_final) || withText[withText.length - 1])?.text?.trim() || '';
}

async function recognize(buffer) {
    if (!await H.hasBinary('ffmpeg')) throw new Error('ffmpeg is not installed on this server.');
    const inp = H.tmpPath(), out = H.tmpPath('.wav');
    fs.writeFileSync(inp, buffer);
    try {
        await H.runCmd('ffmpeg', ['-y', '-i', inp, '-t', '20', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
        const { data } = await http.post('https://api.wit.ai/speech?v=20230215', fs.readFileSync(out), {
            headers: { Authorization: `Bearer ${config.WITAI_API}`, 'Content-Type': 'audio/wav' },
            responseType: 'text', transformResponse: [d => d], timeout: 30000, maxBodyLength: Infinity,
        });
        return parseWit(String(data));
    } catch (e) {
        if (e.response?.status === 401) throw new Error('wit.ai rejected the key. Set your own WITAI_API in the environment variables.');
        throw e;
    } finally { H.rm(inp, out); }
}

addCommand({ pattern: 'voicy', aliases: ['stt'], public: true, desc: 'Voice note → text (reply to a voice message, max 20s)' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['audio', 'video']);
    if (!media) return ctx.reply('❌ Reply to a voice message.');
    const text = await recognize(media.buffer);
    await ctx.reply(text ? `🗣 *Text:*\n\`\`\`${text}\`\`\`` : '❌ I could not understand that audio.');
});

addCommand({ pattern: 'vtalk', public: true, desc: 'Voice chat with SimSimi (reply to a voice note)' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['audio']);
    if (!media) return ctx.reply('❌ Reply to a voice message.');
    const heard = await recognize(media.buffer);
    if (!heard) return ctx.reply('❌ I could not understand that audio.');
    const r = await chat(ctx, heard, { quoted: true });
    // also answer with a voice note when text-to-speech is available
    try {
        if (await H.hasBinary('ffmpeg') && !r.noAnswer) {
            const mp3 = await H.fetchBuffer('https://translate.google.com/translate_tts', {
                params: { ie: 'UTF-8', q: r.text.slice(0, 200), tl: r.lang.split('-')[0], client: 'tw-ob' },
            });
            const inp = H.tmpPath('.mp3'), out = H.tmpPath('.ogg');
            fs.writeFileSync(inp, mp3);
            try {
                await H.runCmd('ffmpeg', ['-y', '-i', inp, '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', out]);
                await ctx.send({ audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true });
            } finally { H.rm(inp, out); }
        }
    } catch { /* the text answer was already sent */ }
});

module.exports = { ask, parseWit, PROVIDERS, failedAt };

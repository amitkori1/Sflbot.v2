// Owner-only tools: session export, per-chat blocking, private messages, optional shell.
const { addCommand } = require('../events');
const config = require('../config');
const { Blocked } = require('../db');
const session = require('../session');
const H = require('../helpers');
const fs = require('fs');

const fail = (ctx, what) => ctx.reply(`❌ ${what}`);

// ───────── .session: get ASENA_SESSION without reading server logs ─────────
addCommand({ pattern: 'session', desc: 'Send your login session string to your own chat (keep it secret!)' }, async (sock, msg, match, ctx) => {
    if (!ctx.fromMe) return fail(ctx, 'Only the account owner can export the session.');
    const b64 = session.exportBase64();
    if (!b64) return fail(ctx, 'No saved session found yet.');
    const me = H.bare(sock.user.id);
    await sock.sendMessage(me, { text: `🔑 *ASENA_SESSION* (anyone with this controls your WhatsApp: never share it)\n\nCopy the next message and use it as the value of the ASENA_SESSION variable. Delete both messages afterwards.` });
    await sock.sendMessage(me, { text: b64 });
    if (ctx.jid !== me) await ctx.reply('✅ Sent to your own chat (not here, for safety).');
});

// ───────── blockchat: make the bot ignore everybody except you in a chat ─────────
addCommand({ pattern: 'blockchat', desc: 'Ignore everyone but you in this chat (or a given JID)', usage: 'blockchat  |  blockchat list' }, async (sock, msg, match, ctx) => {
    if (match && match.toLowerCase() === 'list') {
        const all = [...new Set([...Blocked.list(), ...config.BLOCK_CHAT])];
        return ctx.reply(all.length ? '*🚫 Blocked chats:*\n' + all.map(j => `• ${j}`).join('\n') : '📭 No blocked chats.');
    }
    const target = (match || ctx.jid).trim();
    if (!/@(g\.us|s\.whatsapp\.net|lid)$/.test(target)) return fail(ctx, 'Give a chat JID like 12036...@g.us');
    Blocked.add(target);
    await ctx.reply(`🚫 I will now ignore everyone except you in \`${target}\`.`);
});

addCommand({ pattern: 'unblockchat', desc: 'Re-enable the bot in this chat (or a given JID)', usage: 'unblockchat [jid]' }, async (sock, msg, match, ctx) => {
    const target = (match || ctx.jid).trim();
    Blocked.remove(target);
    await ctx.reply(`✅ Chat \`${target}\` is active again.`);
});

// ───────── pmsend / pmttssend: DM the person whose message you replied to ─────────
function pmTarget(ctx) {
    const q = H.getQuoted(ctx.msg);
    return q?.participant || (!ctx.isGroup ? ctx.jid : null);
}

addCommand({ pattern: 'pmsend', desc: 'Reply to a message: send that person a private message', usage: 'pmsend Hello!' }, async (sock, msg, match, ctx) => {
    const to = pmTarget(ctx);
    if (!to) return fail(ctx, 'Reply to the person\'s message in a group.');
    if (!match) return fail(ctx, `Usage: \`${ctx.prefix}pmsend <text>\``);
    await sock.sendMessage(H.bare(to), { text: match });
    await ctx.reply('✅ Sent.');
});

addCommand({ pattern: 'pmttssend', desc: 'Reply to a message: send that person a voice message', usage: 'pmttssend {hi} Hello!' }, async (sock, msg, match, ctx) => {
    const to = pmTarget(ctx);
    if (!to) return fail(ctx, 'Reply to the person\'s message in a group.');
    if (!match) return fail(ctx, `Usage: \`${ctx.prefix}pmttssend <text>\`  (language like {hi} is optional)`);
    if (!await H.hasBinary('ffmpeg')) return fail(ctx, 'ffmpeg is not installed on this server.');
    let lang = config.TTS_LANG, text = match;
    const lm = /\{([a-z]{2})\}/.exec(match);
    if (lm) { lang = lm[1]; text = match.replace(lm[0], '').trim(); }
    if (!text || text.length > 200) return fail(ctx, 'Text must be 1–200 characters.');
    const mp3 = await H.fetchBuffer('https://translate.google.com/translate_tts', { params: { ie: 'UTF-8', q: text, tl: lang, client: 'tw-ob' } });
    const inp = H.tmpPath('.mp3'), out = H.tmpPath('.ogg');
    fs.writeFileSync(inp, mp3);
    try {
        await H.runCmd('ffmpeg', ['-y', '-i', inp, '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', out]);
        await sock.sendMessage(H.bare(to), { audio: fs.readFileSync(out), mimetype: 'audio/ogg; codecs=opus', ptt: true });
    } finally { H.rm(inp, out); }
    await ctx.reply('✅ Sent.');
});

// ───────── term: shell access (OFF unless ALLOW_TERM=true, account owner only) ─────────
addCommand({ pattern: 'term', aliases: ['sh'], desc: 'Run a shell command on the server (needs ALLOW_TERM=true)', usage: 'term ls -la' }, async (sock, msg, match, ctx) => {
    if (!config.ALLOW_TERM) return fail(ctx, 'The terminal is disabled. Set ALLOW_TERM=true in the environment variables to enable it.');
    if (!ctx.fromMe) return fail(ctx, 'The terminal can only be used by the account owner, not sudo users.');
    if (!match) return fail(ctx, `Usage: \`${ctx.prefix}term <command>\``);
    try {
        const { stdout, stderr } = await H.runCmd('sh', ['-c', match], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
        const out = (stdout + (stderr ? '\n' + stderr : '')).trim() || '(no output)';
        await ctx.reply('```' + out.slice(0, 3500) + '```');
    } catch (e) {
        await ctx.reply('```' + String(e.stderr || e.stdout || e.message).trim().slice(0, 3500) + '```');
    }
});

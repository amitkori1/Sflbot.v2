const { addCommand, addPassive } = require('../events');
const { Filters } = require('../db');

/** Pull "quoted" parts out of a string: "word" "reply"  (straight or curly quotes, or single quotes) */
function quotedParts(str) {
    const out = [];
    const re = /["“”](.+?)["“”]|'(.+?)'/gs;
    let m;
    while ((m = re.exec(str || ''))) out.push(m[1] ?? m[2]);
    return out;
}

addCommand({ pattern: 'filter', desc: 'Auto-reply filter for this chat', usage: 'filter "word" "reply"' }, async (sock, msg, match, ctx) => {
    if (!match) {
        const list = Filters.get(ctx.jid);
        if (!list.length) return ctx.reply('📭 No filters set in this chat.');
        return ctx.reply('*🔍 Active Filters:*\n\n' + list.map(f => `• \`${f.pattern}\` → ${f.reply}`).join('\n'));
    }
    const [pattern, reply] = quotedParts(match);
    if (!pattern || !reply) return ctx.reply('❌ Usage: `.filter "trigger" "reply"`');
    Filters.set(ctx.jid, pattern, reply);
    await ctx.reply(`✅ *Filter Set!*\n• Trigger: \`${pattern}\`\n• Reply: ${reply}`);
});

addCommand({ pattern: 'stop', desc: 'Remove a filter', usage: 'stop "word"' }, async (sock, msg, match, ctx) => {
    const [pattern] = quotedParts(match);
    if (!pattern) return ctx.reply('❌ Usage: `.stop "trigger"`');
    if (!Filters.delete(ctx.jid, pattern)) return ctx.reply(`❌ No filter found for: \`${pattern}\``);
    await ctx.reply(`✅ Filter \`${pattern}\` removed!`);
});

addPassive(async (ctx) => {
    if (ctx.fromMe || !ctx.text) return;   // never answer ourselves (avoids loops)
    const lower = ctx.text.toLowerCase();
    const hit = Filters.get(ctx.jid).find(f => lower.includes(f.pattern.toLowerCase()));
    if (hit) await ctx.reply(hit.reply);
});

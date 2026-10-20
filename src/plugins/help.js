const { addCommand, getCommands } = require('../events');
const config = require('../config');

addCommand({ pattern: 'help', aliases: ['menu', 'commands'], desc: 'Show commands. Usage: .help [command]' }, async (sock, msg, match, ctx) => {
    const p = config.PREFIX;
    const all = getCommands().filter(c => c.options.desc);

    if (match) {
        const q = match.toLowerCase().replace(/^[.!;]/, '');
        const cmd = all.find(c => c.names.includes(q));
        if (!cmd) return ctx.reply(`❌ No command named \`${q}\`.`);
        const o = cmd.options;
        return ctx.reply(`*${p}${o.pattern}*\n${o.desc}${o.usage ? `\n\n*Usage:* \`${p}${o.usage}\`` : ''}${cmd.names.length > 1 ? `\n*Aliases:* ${cmd.names.slice(1).map(a => p + a).join(', ')}` : ''}`);
    }

    const grouped = {};
    for (const c of all) (grouped[c.options.category] ||= []).push(`• \`${p}${c.options.pattern}\` — ${c.options.desc}`);

    let text = `🤖 *SFL Bot Commands* | ${config.VERSION}\n`;
    for (const [cat, list] of Object.entries(grouped)) text += `\n*━━ ${cat} ━━*\n${list.join('\n')}\n`;
    text += `\n_Prefix: \`${config.PREFIX_CHARS}\` | ${p}help <command> for details_`;
    await ctx.reply(text);
});

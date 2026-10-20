const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');

const custom = (value, fallback) => (value !== 'default' ? value : fallback);

function getTarget(ctx) {
    return H.getQuoted(ctx.msg)?.participant || H.getContext(ctx.msg)?.mentionedJid?.[0] || null;
}

addCommand({ pattern: 'kickme', onlyGroup: true, desc: 'Leave the current group' }, async (sock, msg, match, ctx) => {
    await ctx.reply(custom(config.KICKME_MESSAGE, '👋 Leaving this group. Goodbye!'));
    await sock.groupLeave(ctx.jid);
});

async function setBlock(ctx, action) {
    const { sock, jid } = ctx;
    const target = getTarget(ctx) || (!ctx.isGroup ? jid : null);
    if (!target) return ctx.reply(`❌ Reply to or mention a user to ${action}.`);
    await sock.updateBlockStatus(target, action);
    const mention = `@${H.num(target)}`;
    const text = action === 'block'
        ? custom(config.BLOCK_MESSAGE, `🚫 ${mention} has been *blocked*!`)
        : custom(config.UNBLOCK_MESSAGE, `✅ ${mention} has been *unblocked*!`);
    await sock.sendMessage(jid, { text, mentions: [target] });
}
addCommand({ pattern: 'block', desc: 'Block a user (reply / mention, or in their PM)' }, (s, m, x, ctx) => setBlock(ctx, 'block'));
addCommand({ pattern: 'unblock', desc: 'Unblock a user' }, (s, m, x, ctx) => setBlock(ctx, 'unblock'));

addCommand({ pattern: 'jid', desc: 'Get the JID of a user or this chat' }, async (sock, msg, match, ctx) => {
    const target = getTarget(ctx);
    await ctx.reply(target ? `📋 *User JID:*\n\`${target}\`` : `📋 *Chat JID:*\n\`${ctx.jid}\``);
});

addCommand({ pattern: 'pp', desc: 'Set your profile picture from a replied image' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['image']);
    if (!media) return ctx.reply('❌ Reply to an image to set it as your profile picture.');
    await sock.updateProfilePicture(H.bare(sock.user.id), media.buffer);
    await ctx.reply('✅ *Profile picture updated!*');
});

addCommand({ pattern: 'setbio', desc: 'Set your WhatsApp About/bio', usage: 'setbio <text>' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Provide a bio. Usage: `.setbio <text>`');
    await sock.updateProfileStatus(match);
    await ctx.reply('✅ *Bio updated successfully!*');
});

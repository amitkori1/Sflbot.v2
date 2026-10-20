const { addCommand } = require('../events');
const { Notes } = require('../db');
const H = require('../helpers');

addCommand({ pattern: 'notes', desc: 'List all saved notes' }, async (sock, msg, match, ctx) => {
    const notes = Notes.getAll();
    if (!notes.length) return ctx.reply('📭 No notes saved yet.\n\nUse `.save <text>` to save a note.');
    await ctx.reply('*📒 Saved Notes:*\n\n' + notes.map((n, i) => `*${i + 1}.* ${n}`).join('\n\n'));
});

addCommand({ pattern: 'save', desc: 'Save a note (text or reply)', usage: 'save <text>' }, async (sock, msg, match, ctx) => {
    const text = match?.trim() || H.getQuotedText(msg);
    if (!text) return ctx.reply('❌ Provide text or reply to a message.\nUsage: `.save <your note>`');
    Notes.add(text);
    await ctx.reply('✅ *Note saved successfully!*');
});

addCommand({ pattern: 'delnotes', aliases: ['deletenotes'], desc: 'Delete all saved notes' }, async (sock, msg, match, ctx) => {
    Notes.deleteAll();
    await ctx.reply('🗑️ *All notes deleted!*');
});

const { addCommand } = require('../events');

const esc = (s) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function wrap(text, max = 12) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
        else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return lines.flatMap(l => l.match(new RegExp(`.{1,${max + 4}}`, 'g')) || []).slice(0, 8);
}

function textSvg(text, color) {
    const lines = wrap(text);
    const longest = Math.max(...lines.map(l => l.length));
    const size = Math.max(34, Math.min(170, Math.floor(Math.min(480 / (longest * 0.62), 480 / (lines.length * 1.2)))));
    const startY = 256 - ((lines.length - 1) * size * 1.15) / 2;
    const tspans = lines.map((l, i) => `<text x="256" y="${startY + i * size * 1.15}" font-size="${size}">${esc(l)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<g font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle"
   fill="${color}" stroke="#000" stroke-width="${Math.max(2, size / 14)}" paint-order="stroke" stroke-linejoin="round">${tspans}</g></svg>`;
}

addCommand({
    pattern: 'ttp', desc: 'Text to sticker (optional colour: red|your text)', usage: 'ttp hello world  |  ttp #ff8800|hello',
}, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.ttp hello world`');
    let color = '#ffffff', text = match;
    const m = /^(#[0-9a-f]{3,8}|[a-z]{3,20})\s*\|\s*([\s\S]+)$/i.exec(match);
    if (m) { color = m[1]; text = m[2]; }
    if (text.length > 120) return ctx.reply('❌ Text too long (max 120 characters).');

    const sharp = require('sharp');
    const webp = await sharp(Buffer.from(textSvg(text.trim(), color))).webp({ quality: 90 }).toBuffer();
    await ctx.send({ sticker: webp });
});

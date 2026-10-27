// Text → sticker (static + animated). Rendered locally; replaces the old xteam / flamingtext APIs.
// Font: DejaVu Sans (installed in the Docker image). Latin / Greek / Cyrillic only.
const { addCommand } = require('../events');
const H = require('../helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const esc = (s) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function wrap(text, max = 12) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
        else line = (line + ' ' + word).trim();
    }
    if (line) lines.push(line);
    return lines.flatMap(l => l.match(new RegExp(`.{1,${max + 4}}`, 'gu')) || []).slice(0, 8);
}

function textSvg(text, color) {
    const lines = wrap(text);
    const longest = Math.max(...lines.map(l => [...l].length));
    const size = Math.max(34, Math.min(170, Math.floor(Math.min(480 / (longest * 0.62), 480 / (lines.length * 1.2)))));
    const startY = 256 - ((lines.length - 1) * size * 1.15) / 2;
    const tspans = lines.map((l, i) => `<text x="256" y="${(startY + i * size * 1.15).toFixed(1)}" font-size="${size}">${esc(l)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<g font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle"
   fill="${color}" stroke="#000" stroke-width="${Math.max(2, size / 14)}" paint-order="stroke" stroke-linejoin="round">${tspans}</g></svg>`;
}

async function staticSticker(text, color) {
    const sharp = require('sharp');
    return sharp(Buffer.from(textSvg(text, color))).webp({ quality: 90 }).toBuffer();
}

const RAINBOW = ['#ff3b3b', '#ff9f1c', '#ffe600', '#3ddc4a', '#18b6ff', '#a855ff', '#ff4fd8', '#ffffff'];

/** Animated sticker: the text blinks through rainbow colours. */
async function animatedSticker(text) {
    if (!await H.hasBinary('ffmpeg')) throw new Error('ffmpeg is not installed on this server.');
    const sharp = require('sharp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfl_attp_'));
    const out = path.join(dir, 'out.webp');
    try {
        for (let i = 0; i < RAINBOW.length; i++) {
            await sharp(Buffer.from(textSvg(text, RAINBOW[i]))).png().toFile(path.join(dir, `f${String(i).padStart(2, '0')}.png`));
        }
        await H.runCmd('ffmpeg', ['-y', '-framerate', '5', '-i', path.join(dir, 'f%02d.png'),
            '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '60', '-loop', '0', '-preset', 'default', '-an', out]);
        return fs.readFileSync(out);
    } finally { H.rm(dir); }
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20})\s*\|\s*([\s\S]+)$/i;
function parse(match) {
    let color = null, text = match;
    const m = COLOR_RE.exec(match || '');
    if (m) { color = m[1]; text = m[2]; }
    return { color, text: (text || '').trim() };
}

// pattern, colour, aliases, description
const VARIANTS = [
    ['ttp', '#ffffff', ['wttp'], 'Text → sticker (optional colour: red|your text)'],
    ['bttp', '#18b6ff', [], 'Text → blue sticker'],
    ['gttp', '#3ddc4a', [], 'Text → green sticker'],
    ['pttp', '#ff4fd8', [], 'Text → pink sticker'],
    ['rttp', '#ff3b3b', [], 'Text → red sticker'],
    ['yttp', '#ffe600', ['ettp'], 'Text → yellow sticker'],
    ['sttp', '#c0c0c0', ['http'], 'Text → silver sticker'],
];

for (const [name, defColor, aliases, desc] of VARIANTS) {
    addCommand({ pattern: name, aliases, public: true, desc, usage: `${name} hello world` }, async (sock, msg, match, ctx) => {
        const { color, text } = parse(match || H.getQuotedText(msg));
        if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}${name} hello world\``);
        if ([...text].length > 120) return ctx.reply('❌ Text too long (max 120 characters).');
        await ctx.send({ sticker: await staticSticker(text, color || defColor) });
    });
}

addCommand({ pattern: 'attp', public: true, desc: 'Text → animated rainbow sticker', usage: 'attp hello' }, async (sock, msg, match, ctx) => {
    const text = (match || H.getQuotedText(msg) || '').trim();
    if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}attp hello\``);
    if ([...text].length > 60) return ctx.reply('❌ Text too long (max 60 characters for animated stickers).');
    await ctx.send({ sticker: await animatedSticker(text), isAnimated: true });
});

addCommand({ pattern: 'allttp', aliases: ['ahttp'], public: true, desc: 'Text → one sticker in every colour', usage: 'allttp hi' }, async (sock, msg, match, ctx) => {
    const text = (match || H.getQuotedText(msg) || '').trim();
    if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}allttp hi\``);
    if ([...text].length > 40) return ctx.reply('❌ Text too long (max 40 characters).');
    for (const [, color] of VARIANTS.slice(0, 6)) {
        await ctx.send({ sticker: await staticSticker(text, color) });
        await new Promise(r => setTimeout(r, 700));
    }
});

module.exports = { textSvg, staticSticker, animatedSticker };

// Logo / text-effect maker + code screenshots (carbon). Rendered locally with SVG + sharp, no web API needed.
// Replaces the old textmaker (textpro / photooxy / ephoto / xteam) plugin whose services no longer exist.
// Fonts: only DejaVu is installed in the Docker image, so Latin / Greek / Cyrillic render; Hindi, Arabic, CJK need extra fonts.
const { addCommand } = require('../events');
const H = require('../helpers');

const FONT = "DejaVu Sans, Verdana, Arial, sans-serif";
const MONO = "DejaVu Sans Mono, Courier New, monospace";
const esc = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function rng(seed) {                      // deterministic pseudo-random (so the same text gives the same logo)
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function wrap(text, max = 16, maxLines = 3) {
    const lines = []; let line = '';
    for (const w of text.trim().split(/\s+/)) {
        if (w.length > max) {                                                       // very long word: hard-split
            if (line) { lines.push(line); line = ''; }
            for (let i = 0; i < w.length; i += max) lines.push(w.slice(i, i + max));
            continue;
        }
        if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
}

function layout(text) {
    const lines = wrap(text);
    const longest = Math.max(...lines.map(l => [...l].length));
    const size = Math.max(40, Math.min(210, Math.floor(Math.min(940 / (longest * 0.68), 440 / (lines.length * 1.25)))));
    const lineH = size * 1.2;
    return { lines, size, lineH, y0: 256 - ((lines.length - 1) * lineH) / 2 + size * 0.34 };
}

// one copy of the text; attrs style it, dx/dy move it
const layer = (L, attrs = '', dx = 0, dy = 0) =>
    `<g ${attrs} transform="translate(${dx} ${dy})">${L.lines.map((l, i) => `<text x="512" y="${(L.y0 + i * L.lineH).toFixed(1)}">${esc(l)}</text>`).join('')}</g>`;

const glow = (id, r) => `<filter id="${id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="${r}"/></filter>`;
const grad = (id, stops, vertical = true) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const bg = (fill) => `<rect width="1024" height="512" fill="${fill}"/>`;
const stars = (seed, n, color = '#fff') => { const r = rng(seed); return Array.from({ length: n }, () => `<circle cx="${(r() * 1024).toFixed(0)}" cy="${(r() * 512).toFixed(0)}" r="${(r() * 1.8 + .3).toFixed(1)}" fill="${color}" opacity="${(r() * .7 + .3).toFixed(2)}"/>`).join(''); };

// ───────── styles: (layout, text, color?) -> svg inner markup ─────────
const STYLES = {
    neon: { desc: 'Glowing neon sign', color: '#00e5ff', build: (L, t, c) => `<defs>${glow('g1', 14)}${glow('g2', 5)}</defs>${bg('#0a0a14')}
        ${layer(L, `fill="none" stroke="${c}" stroke-width="${L.size / 7}" filter="url(#g1)" opacity=".9"`)}
        ${layer(L, `fill="none" stroke="${c}" stroke-width="${L.size / 14}" filter="url(#g2)"`)}
        ${layer(L, `fill="#fff" stroke="${c}" stroke-width="${Math.max(2, L.size / 40)}"`)}` },
    pink: { desc: 'Pink neon', color: '#ff2bd6', build: (L, t) => STYLES.neon.build(L, t, '#ff2bd6') },
    gold: { desc: 'Shiny gold', build: (L) => `<defs>${grad('gd', [[0, '#fff6c2'], [.3, '#ffd700'], [.55, '#b8860b'], [.75, '#ffe680'], [1, '#8b6508']])}${glow('sh', 6)}</defs>${bg('#140e04')}
        ${layer(L, 'fill="#000" filter="url(#sh)" opacity=".8"', 8, 10)}${layer(L, `fill="url(#gd)" stroke="#5a3d00" stroke-width="${Math.max(2, L.size / 28)}" paint-order="stroke"`)}` },
    fire: { desc: 'Burning fire', build: (L) => `<defs>${grad('fr', [[0, '#fff700'], [.35, '#ff9a00'], [.7, '#ff3d00'], [1, '#7a0000']])}${glow('fg', 16)}</defs>${bg('#100400')}
        ${layer(L, 'fill="#ff4d00" filter="url(#fg)" opacity=".85"', 0, -4)}${layer(L, `fill="url(#fr)" stroke="#3a0800" stroke-width="${Math.max(2, L.size / 30)}" paint-order="stroke"`)}` },
    ice: { desc: 'Frozen ice', build: (L) => `<defs>${grad('ic', [[0, '#ffffff'], [.5, '#a5e1ff'], [1, '#2b8ad6']])}${glow('ig', 10)}</defs>${bg('#04121f')}
        ${layer(L, 'fill="#7fd3ff" filter="url(#ig)" opacity=".8"')}${layer(L, `fill="url(#ic)" stroke="#e8f8ff" stroke-width="${Math.max(2, L.size / 40)}"`)}` },
    blood: { desc: 'Horror blood', build: (L) => `<defs>${grad('bl', [[0, '#ff2a2a'], [.55, '#d10000'], [1, '#7a0000']])}${glow('bs', 4)}${glow('bg2', 12)}</defs>${bg('#0d0000')}
        ${layer(L, 'fill="#ff0000" filter="url(#bg2)" opacity=".55"')}${layer(L, 'fill="#000" filter="url(#bs)"', 4, 8)}${layer(L, `fill="url(#bl)" stroke="#1a0000" stroke-width="${Math.max(2, L.size / 26)}" paint-order="stroke"`)}` },
    glitch: { desc: 'Digital glitch', build: (L, t) => { const r = rng(seedOf(t)); const bars = Array.from({ length: 9 }, () => { const y = r() * 480, h = 4 + r() * 22, c = r() > .5 ? '#ff0040' : '#00e5ff'; return `<rect x="${(r() * 300).toFixed(0)}" y="${y.toFixed(0)}" width="${(200 + r() * 600).toFixed(0)}" height="${h.toFixed(0)}" fill="${c}" opacity=".35"/>`; }).join('');
        return `${bg('#050505')}${bars}${layer(L, 'fill="#ff0040"', -7, -2)}${layer(L, 'fill="#00e5ff"', 7, 2)}${layer(L, 'fill="#fff"')}`; } },
    '3d': { desc: '3D extruded text', build: (L) => { const layers = Array.from({ length: 16 }, (_, i) => layer(L, `fill="hsl(215,60%,${22 + i}%)"`, 16 - i, 16 - i)).join('');
        return `<defs>${grad('bgd', [[0, '#e9f1ff'], [1, '#9db8e6']])}</defs>${bg('url(#bgd)')}${layers}${layer(L, `fill="#ffffff" stroke="#2b4f9a" stroke-width="${Math.max(2, L.size / 40)}"`)}`; } },
    rainbow: { desc: 'Rainbow gradient', build: (L) => `<defs>${grad('rb', [[0, '#ff0040'], [.2, '#ff9a00'], [.4, '#ffe600'], [.6, '#18e04a'], [.8, '#00a2ff'], [1, '#b100ff']], false)}</defs>${bg('#101018')}
        ${layer(L, `fill="url(#rb)" stroke="#fff" stroke-width="${Math.max(2, L.size / 36)}" paint-order="stroke"`)}` },
    metal: { desc: 'Chrome metal', build: (L) => `<defs>${grad('mt', [[0, '#ffffff'], [.3, '#8fa0aa'], [.5, '#2a2f33'], [.52, '#d0dae0'], [.75, '#6f8088'], [1, '#ffffff']])}</defs>${bg('#15181b')}
        ${layer(L, 'fill="#000" opacity=".6"', 5, 7)}${layer(L, `fill="url(#mt)" stroke="#101214" stroke-width="${Math.max(2, L.size / 30)}" paint-order="stroke"`)}` },
    matrix: { desc: 'Matrix code rain', build: (L, t) => { const r = rng(seedOf(t)); const cols = Array.from({ length: 46 }, (_, i) => { const x = i * 22 + 6; const n = 6 + Math.floor(r() * 14); const y0 = r() * 200;
            return Array.from({ length: n }, (_, j) => `<text x="${x}" y="${(y0 + j * 22).toFixed(0)}" font-size="20" fill="#00ff41" opacity="${(.12 + (j / n) * .5).toFixed(2)}">${'01ABCDEFXYZ'[Math.floor(r() * 11)]}</text>`).join(''); }).join('');
        return `<defs>${glow('mg', 8)}</defs>${bg('#000')}<g font-family="${MONO}">${cols}</g>${layer(L, 'fill="#00ff41" filter="url(#mg)"')}${layer(L, 'fill="#d8ffe0"')}`; } },
    light: { desc: 'Warm glowing light', build: (L) => `<defs>${glow('lg1', 22)}${glow('lg2', 8)}</defs>${bg('#0b0a10')}
        ${layer(L, 'fill="#ffd36b" filter="url(#lg1)"')}${layer(L, 'fill="#fff0b3" filter="url(#lg2)"')}${layer(L, 'fill="#fff"')}` },
    retro: { desc: 'Retro 80s sunset', build: (L) => `<defs>${grad('rt', [[0, '#ffee00'], [1, '#ff00aa']])}${grad('rbg', [[0, '#1a0033'], [1, '#5c1a7a']])}</defs>${bg('url(#rbg)')}
        ${layer(L, 'fill="#00e5ff"', 8, 8)}${layer(L, `fill="url(#rt)" stroke="#2a00a0" stroke-width="${Math.max(2, L.size / 30)}" paint-order="stroke"`)}` },
    comic: { desc: 'Comic book', build: (L) => `${bg('#ff3d3d')}<g opacity=".15">${Array.from({ length: 12 }, (_, i) => `<circle cx="${(i % 4) * 280 + 60}" cy="${Math.floor(i / 4) * 200 + 60}" r="70" fill="#fff"/>`).join('')}</g>
        ${layer(L, 'fill="#000"', 9, 9)}${layer(L, `fill="#ffd400" stroke="#000" stroke-width="${Math.max(5, L.size / 14)}" stroke-linejoin="round" paint-order="stroke"`)}` },
    space: { desc: 'Deep space', build: (L, t) => `<defs><radialGradient id="sp" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#1b1f5c"/><stop offset="1" stop-color="#02030c"/></radialGradient>${grad('st', [[0, '#8ec5ff'], [1, '#d68cff']], false)}${glow('sg', 9)}</defs>${bg('url(#sp)')}${stars(seedOf(t), 90)}
        ${layer(L, 'fill="#9a8cff" filter="url(#sg)" opacity=".8"')}${layer(L, `fill="url(#st)" stroke="#fff" stroke-width="${Math.max(1.5, L.size / 60)}"`)}` },
    sand: { desc: 'Writing in sand', build: (L, t) => { const r = rng(seedOf(t)); const dots = Array.from({ length: 500 }, () => `<circle cx="${(r() * 1024).toFixed(0)}" cy="${(r() * 512).toFixed(0)}" r="${(r() + .4).toFixed(1)}" fill="#b8944f" opacity=".5"/>`).join('');
        return `<defs>${grad('sd', [[0, '#f3dca0'], [1, '#d9b873']])}</defs>${bg('url(#sd)')}${dots}${layer(L, 'fill="#fff" opacity=".6"', -3, -3)}${layer(L, 'fill="#8a6a30" opacity=".85"', 3, 4)}${layer(L, 'fill="#c29b55"')}`; } },
    smoke: { desc: 'Smoky text', build: (L) => `<defs>${glow('sm1', 18)}${glow('sm2', 7)}</defs>${bg('#101014')}
        ${layer(L, 'fill="#9aa" filter="url(#sm1)" opacity=".7"', 0, -10)}${layer(L, 'fill="#ccd" filter="url(#sm2)" opacity=".8"', 0, -4)}${layer(L, 'fill="#fff" opacity=".95"')}` },
    graffiti: { desc: 'Street graffiti', aliases: ['graf'], build: (L) => `<defs>${glow('gs', 3)}</defs>${bg('#3a3a40')}
        ${layer(L, 'fill="#000" filter="url(#gs)"', 8, 9)}${layer(L, `fill="#ff6b00" stroke="#111" stroke-width="${Math.max(4, L.size / 12)}" stroke-linejoin="round" paint-order="stroke"`)}` },
};

const OLD_ALIASES = {      // old textmaker names -> style
    blood: ['text2blood', 'textblood'], fire: ['text2fire', 'text3fire', 'textfire', 'textmagma'], glitch: ['text2glitch', 'textglitch'],
    gold: ['text2gold', 'textgold'], rainbow: ['text2gradient', 'textgradient'], graffiti: ['text2graf', 'text3graf', 'text4graf', 'textgraf'],
    light: ['text2light', 'textlight', 'textglow'], neon: ['text2neon', 'text3neon', 'text4neon', 'text5neon', 'text6neon', 'textneon'],
    pink: ['text2pink', 'textpink'], space: ['text2space', 'text3space', 'textspace', 'textsci'], '3d': ['text3d'], sand: ['text2sand', 'text3sand', 'text4sand', 'textsand'],
    ice: ['textice', 'textsnow'], metal: ['textmetal', 'textwcolor'], matrix: ['textmatrix', 'textrobo'], retro: ['textretro'], comic: ['textjoker', 'textavengers', 'text2marvel', 'textmarvel'],
    smoke: ['textsmoke'],
};

async function render(svg, opts = {}) {
    const sharp = require('sharp');
    return sharp(Buffer.from(svg), { density: opts.density || 72 }).png().toBuffer();
}

function logoSvg(style, text, color) {
    const L = layout(text);
    const st = STYLES[style];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512"><g font-family="${FONT}" font-weight="bold" font-size="${L.size}" text-anchor="middle">${st.build(L, text, color || st.color)}</g></svg>`;
}

for (const [style, st] of Object.entries(STYLES)) {
    addCommand({
        pattern: style === 'graffiti' ? 'graffiti' : `text${style}`, aliases: [...(OLD_ALIASES[style] || []), ...(style === 'graffiti' ? ['graf'] : [])].filter(a => a !== `text${style}`),
        public: true, desc: `Logo: ${st.desc}`, usage: `text${style} Your Name`,
    }, async (sock, msg, match, ctx) => {
        const text = (match || H.getQuotedText(msg) || '').trim();
        if (!text) return ctx.reply(`❌ Usage: \`${ctx.prefix}text${style} <your text>\``);
        if ([...text].length > 60) return ctx.reply('❌ Text too long (max 60 characters).');
        await ctx.send({ image: await render(logoSvg(style, text)), caption: `✨ ${st.desc}` });
    });
}

addCommand({ pattern: 'textmaker', aliases: ['logo', 'logos'], public: true, desc: 'List logo styles, or make one', usage: 'textmaker neon Your Name' }, async (sock, msg, match, ctx) => {
    const p = ctx.prefix;
    const m = /^(\S+)\s+([\s\S]+)$/.exec(match || '');
    if (m && STYLES[m[1].toLowerCase()]) {
        const style = m[1].toLowerCase();
        if ([...m[2]].length > 60) return ctx.reply('❌ Text too long (max 60 characters).');
        return ctx.send({ image: await render(logoSvg(style, m[2])), caption: `✨ ${STYLES[style].desc}` });
    }
    await ctx.reply(`🎨 *Logo maker*\n\n${Object.entries(STYLES).map(([k, v]) => `• \`${p}text${k} <text>\` – ${v.desc}`).join('\n')}\n\n_Or: ${p}textmaker <style> <text>_`);
});

// ───────── carbon: pretty code screenshot ─────────
const KEYWORDS = new Set(('const let var function return if else for while do switch case break continue new class extends import from export default async await try catch finally throw typeof instanceof in of delete void yield static '
    + 'def lambda pass None True False and or not is with as elif except raise global print self true false null undefined int float string bool char double long public private protected void package struct enum interface fn mut pub impl use mod match').split(' '));

function highlight(line) {
    const out = []; let i = 0;
    const push = (txt, color) => out.push(`<tspan fill="${color}">${esc(txt)}</tspan>`);
    while (i < line.length) {
        const rest = line.slice(i);
        let m;
        if ((m = /^(\/\/.*|#.*)/.exec(rest))) { push(m[0], '#6a9955'); i += m[0].length; }
        else if ((m = /^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/.exec(rest))) { push(m[0], '#ce9178'); i += m[0].length; }
        else if ((m = /^\d[\d._]*/.exec(rest))) { push(m[0], '#b5cea8'); i += m[0].length; }
        else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
            const next = rest[m[0].length];
            push(m[0], KEYWORDS.has(m[0]) ? '#569cd6' : next === '(' ? '#dcdcaa' : /^[A-Z]/.test(m[0]) ? '#4ec9b0' : '#d4d4d4');
            i += m[0].length;
        } else { push(rest[0], '#d4d4d4'); i++; }
    }
    return out.join('');
}

function carbonSvg(code) {
    const lines = code.replace(/\t/g, '    ').split('\n').slice(0, 45).map(l => l.slice(0, 110));
    const FS = 22, CW = FS * 0.602, LH = 34;
    const longest = Math.max(20, ...lines.map(l => l.length));
    const innerW = Math.ceil(longest * CW + 70), innerH = lines.length * LH + 90;
    const W = innerW + 120, Hh = innerH + 120;
    const rows = lines.map((l, i) => `<text x="${60 + 36}" y="${60 + 70 + i * LH}" xml:space="preserve">${highlight(l)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><defs>${grad('cbg', [[0, '#ab4abf'], [1, '#4a7bd8']], false)}${glow('cs', 14)}</defs>
<rect width="${W}" height="${Hh}" fill="url(#cbg)"/><rect x="60" y="66" width="${innerW}" height="${innerH}" rx="14" fill="#000" opacity=".5" filter="url(#cs)"/>
<rect x="60" y="60" width="${innerW}" height="${innerH}" rx="14" fill="#1e1e1e"/><circle cx="92" cy="90" r="7" fill="#ff5f56"/><circle cx="116" cy="90" r="7" fill="#ffbd2e"/><circle cx="140" cy="90" r="7" fill="#27c93f"/>
<g font-family="${MONO}" font-size="${FS}">${rows}</g></svg>`;
}

addCommand({ pattern: 'carbon', public: true, desc: 'Make a pretty image of code (reply to a message or add code)', usage: 'carbon <code>  |  reply + carbon' }, async (sock, msg, match, ctx) => {
    const code = (match || H.getQuotedText(msg) || '').replace(/^```\w*\n?|```$/g, '');
    if (!code.trim()) return ctx.reply(`❌ Reply to a code message with \`${ctx.prefix}carbon\`, or write: \`${ctx.prefix}carbon <code>\``);
    await ctx.send({ image: await render(carbonSvg(code), { density: 144 }), caption: '💻 carbon' });
});

module.exports = { STYLES, logoSvg, carbonSvg, render, esc, rng, seedOf, wrap, grad, glow };

const { addCommand } = require('../events');
const config = require('../config');
const { secondsToHms, http } = require('../helpers');
const os = require('os');

addCommand({ pattern: 'sysd', desc: 'Show system information' }, async (sock, msg, match, ctx) => {
    const gb = (b) => (b / 1024 ** 3).toFixed(2);
    const mem = process.memoryUsage();
    await ctx.reply(`💻 *System Info*\n\n*OS:* \`${os.platform()} ${os.arch()}\`\n*CPU:* \`${os.cpus()[0]?.model || 'Unknown'}\`\n*RAM:* \`${gb(os.freemem())}GB free / ${gb(os.totalmem())}GB total\`\n*Bot memory:* \`${(mem.rss / 1024 / 1024).toFixed(0)}MB\`\n*Server uptime:* \`${secondsToHms(os.uptime())}\`\n*Bot uptime:* \`${secondsToHms(process.uptime())}\`\n*Node.js:* \`${process.version}\`\n*Bot Version:* \`${config.VERSION}\``);
});

addCommand({ pattern: 'info', desc: 'Bot info' }, async (sock, msg, match, ctx) => {
    await ctx.reply(`ℹ️ *SFL Bot Info*\n\n*Version:* \`${config.VERSION}\`\n*Prefix:* \`${config.PREFIX_CHARS}\`\n*Node.js:* \`${process.version}\``);
});

addCommand({ pattern: 'calc', desc: 'Calculate a math expression', usage: 'calc 2+2*5' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.calc 2+2`');
    const expr = match.replace(/[^0-9+\-*/%().\s]/g, '').trim();
    if (!expr) return ctx.reply('❌ Invalid math expression.');
    try {
        // only digits and operators survive the filter above
        const result = Function(`'use strict'; return (${expr})`)();
        if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('bad result');
        await ctx.reply(`🧮 *${expr}* = \`${result}\``);
    } catch {
        await ctx.reply('❌ Invalid math expression.');
    }
});

addCommand({ pattern: 'weather', desc: 'Weather for a city', usage: 'weather London' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply('❌ Usage: `.weather <city>`');
    try {
        if (config.WEATHER_API) {
            const { data: d } = await http.get('https://api.openweathermap.org/data/2.5/weather', {
                params: { q: match, units: 'metric', appid: config.WEATHER_API },
            });
            return ctx.reply(`🌍 *Weather in ${d.name}, ${d.sys?.country}*\n\n🌡 *Temp:* \`${d.main.temp}°C\` (feels ${d.main.feels_like}°C)\n🔆 *Max/Min:* \`${d.main.temp_max}°C / ${d.main.temp_min}°C\`\nℹ️ *Condition:* \`${d.weather[0].description}\`\n💧 *Humidity:* \`${d.main.humidity}%\`\n💨 *Wind:* \`${d.wind.speed} m/s\`\n☁️ *Clouds:* \`${d.clouds.all}%\``);
        }
        // no API key: wttr.in needs none
        const { data } = await http.get(`https://wttr.in/${encodeURIComponent(match)}?format=j1`);
        const c = data.current_condition[0];
        const area = data.nearest_area?.[0];
        await ctx.reply(`🌍 *Weather in ${area?.areaName?.[0]?.value || match}, ${area?.country?.[0]?.value || ''}*\n\n🌡 *Temp:* \`${c.temp_C}°C\` (feels ${c.FeelsLikeC}°C)\nℹ️ *Condition:* \`${c.weatherDesc[0].value}\`\n💧 *Humidity:* \`${c.humidity}%\`\n💨 *Wind:* \`${c.windspeedKmph} km/h\`\n☁️ *Clouds:* \`${c.cloudcover}%\``);
    } catch {
        await ctx.reply('❌ City not found or weather service unavailable.');
    }
});

addCommand({ pattern: 'scan', desc: 'Check if a number is on WhatsApp', usage: 'scan 919876543210' }, async (sock, msg, match, ctx) => {
    const n = (match || '').replace(/[^0-9]/g, '');
    if (!n) return ctx.reply('❌ Usage: `.scan 919876543210` (with country code)');
    const [res] = (await sock.onWhatsApp(`${n}@s.whatsapp.net`)) || [];
    await ctx.reply(res?.exists ? `✅ \`${n}\` is on WhatsApp.\n*JID:* \`${res.jid}\`` : `❌ \`${n}\` is not on WhatsApp.`);
});

// ───────── unit converter ─────────
const UNITS = {
    length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
    weight: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, t: 1000 },
    data: { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 },
    time: { s: 1, min: 60, h: 3600, d: 86400, wk: 604800 },
};
const TEMP = {
    c: { to: v => v, from: v => v },
    f: { to: v => (v - 32) * 5 / 9, from: v => v * 9 / 5 + 32 },
    k: { to: v => v - 273.15, from: v => v + 273.15 },
};

addCommand({ pattern: 'unit', desc: 'Convert units (length, weight, temp, data, time)', usage: 'unit 10 km mi' }, async (sock, msg, match, ctx) => {
    const m = /^(-?[\d.]+)\s*([a-z]+)\s+(?:to\s+)?([a-z]+)$/i.exec(match || '');
    if (!m) return ctx.reply('❌ Usage: `.unit 10 km mi`\n\nSupported: ' + [...Object.values(UNITS).map(g => Object.keys(g).join(', ')), 'c, f, k'].join('\n'));
    const v = parseFloat(m[1]); const a = m[2].toLowerCase(); const b = m[3].toLowerCase();
    let out;
    if (TEMP[a] && TEMP[b]) out = TEMP[b].from(TEMP[a].to(v));
    else {
        const g = Object.values(UNITS).find(g => a in g && b in g);
        if (!g) return ctx.reply(`❌ Can't convert \`${a}\` to \`${b}\`.`);
        out = v * g[a] / g[b];
    }
    await ctx.reply(`📏 *${v} ${a}* = \`${+out.toPrecision(8)} ${b}\``);
});

// Optional remote key-value storage (Upstash Redis REST - free tier, no extra npm package needed).
// When configured, your login session AND data.json survive restarts/redeploys on hosts with
// an ephemeral disk (e.g. Render free). Without it the bot works exactly as before (local files).
//
//   UPSTASH_REDIS_REST_URL   = https://xxxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN = AXxx...
const axios = require('axios');

const URL_ = (process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || '';
const PREFIX = process.env.STORE_PREFIX || 'sfl:';

const enabled = !!(URL_ && TOKEN);

async function cmd(args) {
    const { data } = await axios.post(URL_, args, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 15000,
        maxBodyLength: Infinity,
    });
    if (data?.error) throw new Error(data.error);
    return data?.result;
}

async function get(key) {
    if (!enabled) return null;
    return cmd(['GET', PREFIX + key]);
}

async function set(key, value) {
    if (!enabled) return false;
    await cmd(['SET', PREFIX + key, value]);
    return true;
}

module.exports = { enabled, get, set };

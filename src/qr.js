// One-time login helper:  npm run qr
// Shows a QR code (or a pairing code if PAIR_NUMBER is set), saves the session to ./session
// and prints a base64 string you can use as ASENA_SESSION on hosts without persistent storage.
const config = require('./config');
const baileys = require('@whiskeysockets/baileys');
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;
const makeWASocket = baileys.makeWASocket || baileys.default;
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

let pairingRequested = false;

async function connect() {
    fs.mkdirSync(config.SESSION_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            if (config.PAIR_NUMBER && !state.creds.registered) {
                if (!pairingRequested) {
                    pairingRequested = true;
                    try {
                        const code = await sock.requestPairingCode(config.PAIR_NUMBER);
                        console.log(`\n🔗 Pairing code: ${code?.match(/.{1,4}/g)?.join('-') || code}`);
                        console.log('WhatsApp > Linked Devices > Link a Device > "Link with phone number instead"\n');
                    } catch (e) { pairingRequested = false; console.log('❌ Could not get pairing code:', e.message); }
                }
            } else {
                qrcode.generate(qr, { small: true });
                console.log('\n✅ Scan the QR code above: WhatsApp > Linked Devices > Link a Device\n');
            }
        }

        if (connection === 'open') {
            console.log('\n🎉 Connected! Saving session...');
            await new Promise(r => setTimeout(r, 4000)); // let creds finish writing
            const creds = path.join(config.SESSION_DIR, 'creds.json');
            if (fs.existsSync(creds)) {
                console.log(`\nSession saved in ${config.SESSION_DIR}`);
                console.log('\nFor hosts without persistent disk, put this in ASENA_SESSION (keep it SECRET):\n');
                console.log(fs.readFileSync(creds).toString('base64'));
            }
            console.log('\nNow run: npm start\n');
            process.exit(0);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Delete the session folder and run again.');
                process.exit(1);
            }
            pairingRequested = false;
            console.log('Connection closed, reconnecting...');
            setTimeout(() => connect().catch(console.error), 1500);
        }
    });
}

console.log('🤖 SFL Bot - login\n==================\n');
connect().catch(e => { console.error(e); process.exit(1); });

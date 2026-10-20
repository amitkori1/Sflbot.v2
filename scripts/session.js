// Prints the saved session as base64 (for the ASENA_SESSION env var).  npm run session
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

const creds = path.join(config.SESSION_DIR, 'creds.json');
if (!fs.existsSync(creds)) {
    console.error(`No session found at ${creds}. Run "npm run qr" first.`);
    process.exit(1);
}
console.log('\nASENA_SESSION (keep this SECRET - anyone with it controls your WhatsApp):\n');
console.log(fs.readFileSync(creds).toString('base64'));
console.log();

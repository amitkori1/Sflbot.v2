// Plugin registry.
//   addCommand(options, handler)  – a prefixed command: handler(sock, msg, match, ctx)
//   addPassive(fn)                – runs for every incoming message: fn(ctx)
//   onSocket(fn)                  – runs for every NEW socket (first start + each reconnect): fn(sock)
const commands = [];
const passives = [];
const socketHooks = [];
let currentCategory = 'General';
const setCategory = (c) => { currentCategory = c; };

function addCommand(options, handler) {
    const opts = { fromMe: true, category: currentCategory, ...options };
    const names = [opts.pattern, ...(opts.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
    commands.push({ options: opts, names, handler });
}

const addPassive = (fn) => passives.push(fn);
const onSocket = (fn) => socketHooks.push(fn);

module.exports = {
    addCommand, addPassive, onSocket, setCategory,
    getCommands: () => commands,
    getPassives: () => passives,
    getSocketHooks: () => socketHooks,
};

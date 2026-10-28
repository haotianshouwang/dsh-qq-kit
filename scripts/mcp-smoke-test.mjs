import { spawn } from 'node:child_process';
import readline from 'node:readline';

const entry = process.argv[2];
const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15000);
  });
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

try {
  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'qq-extras-test', version: '1.0.0' }
  });
  console.log('server:', init?.serverInfo?.name, init?.serverInfo?.version);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await send('tools/list', {});
  const names = (list?.tools ?? []).map((t) => t.name);
  console.log('tools:', names.length);
  for (const n of names) console.log(' -', n);
} catch (error) {
  console.error('TEST FAILED:', error.message);
  process.exitCode = 1;
} finally {
  child.kill();
}

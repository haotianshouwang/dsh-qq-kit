import { spawn } from 'node:child_process';
import readline from 'node:readline';

const entry = process.argv[2];
const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 40000);
  });
}
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});

try {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await send('tools/list', {});
  const names = (list?.tools ?? []).map((t) => t.name);
  console.log('tools:', names.length);
  const call = await send('tools/call', { name: 'qq_search_images', arguments: { query: '鲸鱼', count: 2 } });
  const txt = call?.content?.[0]?.text ?? '';
  console.log('call qq_search_images ->', call?.isError ? 'ERROR' : 'OK');
  console.log(txt.slice(0, 300));
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  child.kill();
}

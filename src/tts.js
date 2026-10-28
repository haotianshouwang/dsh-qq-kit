// 语音合成（两档）：
//   1) 微软 Edge 神经音色（msedge-tts，可选依赖，自然度高，需要能连 speech.platform.bing.com）
//   2) Windows SAPI 离线音色（兜底，纯本机，不联网）
// 结果写进 qq-bridge 的语音库目录（默认 audio/），这样 SnowLuma 能直接读到文件。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { effectiveSettings } from './settings.js';

function voiceDir(bridgeDir, cfg) {
  const rel = String(cfg?.socialV2?.voice?.dir ?? 'audio') || 'audio';
  const dir = path.resolve(bridgeDir, rel);
  const root = bridgeDir.endsWith(path.sep) ? bridgeDir : bridgeDir + path.sep;
  if (!dir.startsWith(root)) throw new Error('语音库目录必须位于 qq-bridge 内');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const SAPI_PS1 = `param([string]$TextFile,[string]$OutFile,[int]$Rate=0)
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $zh = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' -and $_.Enabled } | Select-Object -First 1
  if ($zh) { $synth.SelectVoice($zh.VoiceInfo.Name) }
  $synth.Rate = $Rate
  $synth.SetOutputToWaveFile($OutFile)
  $synth.Speak($text)
} finally { $synth.Dispose() }
`;

function sapiScript(dir) {
  const file = path.join(dir, '.tts-sapi.ps1');
  try {
    if (fs.readFileSync(file, 'utf8') === SAPI_PS1) return file;
  } catch { /* 不存在就写 */ }
  fs.writeFileSync(file, SAPI_PS1, 'utf8');
  return file;
}

function runSapi(dir, text, rate) {
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const out = path.join(dir, `tts-${stamp}.wav`);
    const txt = path.join(dir, `tts-${stamp}.txt`);
    fs.writeFileSync(txt, String(text), 'utf8');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sapiScript(dir), '-TextFile', txt, '-OutFile', out, '-Rate', String(rate)],
      { timeout: 60000, windowsHide: true },
      (error) => {
        try { fs.unlinkSync(txt); } catch { /* 忽略 */ }
        if (error) return reject(new Error(`SAPI 合成失败：${error.message}`));
        if (!fs.existsSync(out) || fs.statSync(out).size < 1000) return reject(new Error('SAPI 没有产出有效音频'));
        resolve(out);
      }
    );
  });
}

async function runEdge(dir, text, voice, proxyUrl) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  let agent;
  if (proxyUrl) {
    try {
      const mod = await import('https-proxy-agent');
      const Cls = mod.HttpsProxyAgent ?? mod.default?.HttpsProxyAgent;
      if (Cls) agent = new Cls(proxyUrl);
    } catch { /* 没代理模块就直连 */ }
  }
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmp = path.join(dir, `.tmp-${stamp}`);
  fs.mkdirSync(tmp, { recursive: true });
  const tts = new MsEdgeTTS(agent ? { agent } : {});
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const out = await tts.toFile(tmp, String(text));
    const src = out?.audioFilePath;
    if (!src || !fs.existsSync(src) || fs.statSync(src).size < 1000) throw new Error('Edge TTS 没有产出有效音频');
    const target = path.join(dir, `tts-${stamp}.mp3`);
    fs.renameSync(src, target);
    return target;
  } finally {
    try { tts.close(); } catch { /* 忽略 */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

export async function synthesize(bridgeDir, cfg, text, { voice, rate = 0 } = {}) {
  const said = String(text ?? '').trim();
  if (!said) throw new Error('text 不能为空');
  if (said.length > 200) throw new Error('一次最多 200 字，请说短句');
  const dir = voiceDir(bridgeDir, cfg);
  const s = effectiveSettings();
  const t = cfg?.socialV2?.voice?.tts ?? {};
  const engine = String(s.ttsEngine || t.engine || 'edge').toLowerCase();
  const useVoice = String(voice || s.ttsVoice || t.voice || 'zh-CN-XiaoyiNeural');
  const proxy = String(s.proxy ?? t.proxy ?? process.env.HTTPS_PROXY ?? '');
  const rateNum = Math.max(-10, Math.min(10, Number(rate) || 0));

  if (engine !== 'sapi') {
    try {
      const file = await runEdge(dir, said, useVoice, proxy);
      return { file, engine: 'edge', voice: useVoice };
    } catch (error) {
      const file = await runSapi(dir, said, rateNum);
      return { file, engine: 'sapi', edgeError: String(error?.message ?? error) };
    }
  }
  const file = await runSapi(dir, said, rateNum);
  return { file, engine: 'sapi' };
}

/** 只保留最近 N 条合成音频，避免语音库膨胀。 */
export function pruneTts(dir, keep = 100) {
  try {
    const files = fs.readdirSync(dir)
      .filter((n) => /^tts-.*\.(wav|mp3)$/i.test(n))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const f of files.slice(keep)) {
      try { fs.unlinkSync(path.join(dir, f.n)); } catch { /* 忽略 */ }
    }
  } catch { /* 忽略 */ }
}

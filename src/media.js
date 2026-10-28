// 图片下载：只允许 http(s)，拒绝内网/环回地址，限制体积。
// 目的不是做完整的 SSRF 防御（那是 qq-bridge 的职责），
// 而是保证这个独立插件不会变成「让模型读本机文件」的通道。
const MAX_BYTES = 8 * 1024 * 1024;

const PRIVATE_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|\[?fc|\[?fd)/i;

export function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('图片地址不是合法的 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http(s) 图片地址');
  if (PRIVATE_HOST_RE.test(url.hostname)) throw new Error('拒绝访问内网/本机地址');
  return url;
}

export async function fetchImage(rawUrl, timeoutMs = 30000) {
  const url = assertPublicUrl(rawUrl);
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      accept: 'image/*,*/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`图片下载失败：HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > MAX_BYTES) throw new Error(`图片太大（${len} 字节，上限 ${MAX_BYTES}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`图片太大（${buf.length} 字节，上限 ${MAX_BYTES}）`);
  if (buf.length < 64) throw new Error('图片内容为空');
  return { buffer: buf, mimeType: mimeFromBuffer(buf), url: url.toString() };
}

export function mimeFromBuffer(buf) {
  if (!buf || buf.length < 12) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'image/jpeg';
}

export function toBase64Url(buffer) {
  return 'base64://' + buffer.toString('base64');
}

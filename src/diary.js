// 日记存储：<qq-bridge>/state/diary/YYYY-MM-DD.md
// 按天一个文件、按时间追加，纯 Markdown，用户可以直接用编辑器打开看/改。
import fs from 'node:fs';
import path from 'node:path';

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function localClock(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function diaryDir(bridgeDir) {
  const dir = path.join(bridgeDir, 'state', 'diary');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeDiary(bridgeDir, content, maxChars = 2000) {
  const text = String(content ?? '').trim();
  if (!text) throw new Error('日记内容不能为空');
  if (text.length > maxChars) throw new Error(`单条日记最多 ${maxChars} 字`);
  const dir = diaryDir(bridgeDir);
  const file = path.join(dir, `${localDate()}.md`);
  const isNew = !fs.existsSync(file);
  if (isNew) fs.writeFileSync(file, `# ${localDate()}\n`, 'utf8');
  fs.appendFileSync(file, `\n## ${localClock()}\n${text}\n`, 'utf8');
  return { date: localDate(), file: path.relative(bridgeDir, file), chars: text.length };
}

export function readDiary(bridgeDir, days = 3) {
  const n = Math.max(1, Math.min(30, Number(days) || 3));
  const dir = diaryDir(bridgeDir);
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse()
    .slice(0, n);
  return files.map((f) => ({
    date: f.replace(/\.md$/, ''),
    content: fs.readFileSync(path.join(dir, f), 'utf8').trim()
  }));
}

export function listDiaryDates(bridgeDir) {
  const dir = diaryDir(bridgeDir);
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
}

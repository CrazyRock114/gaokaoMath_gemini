import { DatabaseSync } from 'node:sqlite';
import katex from 'katex';

const db = new DatabaseSync('question_bank/gaokao_math.db');
const questions = db.prepare('SELECT uid, body, options_json, answer, solution FROM questions').all();

const segs = [];
for (const q of questions) {
  const opts = q.options_json ? JSON.parse(q.options_json) : [];
  const texts = [q.body, ...opts, String(q.answer ?? ''), String(q.solution ?? '')];
  for (const t of texts) {
    if (!t) continue;
    const re = /\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
    let m;
    while ((m = re.exec(String(t)))) {
      if (m[1] ?? m[2] ?? m[3]) segs.push([q.uid, m[0]]);
    }
  }
}

let bad = 0;
const errorTypes = {};
const badUids = new Set();
for (const [uid, s] of segs) {
  try {
    katex.renderToString(s.slice(2, -2), { throwOnError: true });
  } catch (e) {
    bad++;
    badUids.add(uid);
    const msg = e.message.split('\n')[0];
    const key = msg.slice(0, 60);
    errorTypes[key] = (errorTypes[key] || 0) + 1;
    if (bad <= 10) {
      console.log('FAIL', uid, JSON.stringify(s.slice(0, 60)), msg);
    }
  }
}

console.log(`Total scanned segments: ${segs.length}`);
console.log(`Bad segments: ${bad}`);
console.log(`Affected questions: ${badUids.size}`);
console.log('Top error types:', JSON.stringify(errorTypes, null, 2));

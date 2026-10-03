// Balance sweep: node tools/balance.mjs [extraQuery] [seconds] [seeds] [modes]  -> one line per seed x mode (greedy/sloppy)
// Runs tools/botrun.mjs for each seed in parallel batches and summarises the outcome (clear time / death / timeout).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const [extra = '', seconds = '420', seedList = '777,11,23,42,99,2024', modes = 'greedy,sloppy'] = process.argv.slice(2);
// 4th argument may be the entry instead of the modes: `balance.mjs '&planet' 1800 8 planet` = 8 planet runs (human-like + greedy)
const who = ['planet', 'region'].includes(modes) ? modes : 'town';
const ALL = '777,11,23,42,99,2024,7,3'.split(',');
const seeds = /^\d+$/.test(seedList) ? ALL.slice(0, +seedList) : seedList.split(',');
const jobs = seeds.flatMap((s) => (who === 'planet' ? ['human', 'greedy'] : modes.split(',')).map((m) => [s, m === 'sloppy' || m === 'greedy' && who === 'planet' ? '1' : '0']));
const summary = (out) => {
  if (who === 'planet') { const t = out.match(/tierAt (\{[^}]*\})/); const l = out.trim().split('\n').filter((x) => /^\d+s /.test(x)).pop() ?? ''; return `${t ? t[1] : 'no tiers'} | ${l.slice(0, 90)}`; }
  const clear = out.match(/CLEARED CITY at ([\d.]+)s best r=([\d.]+)/);
  if (clear) return `clear ${fmt(+clear[1])} r=${clear[2]}`;
  const died = out.match(/DIED at [^\n]*/);
  const last = out.trim().split('\n').filter((l) => /^\d+s /.test(l)).pop() ?? '';
  return died ? `died  ${died[0].slice(0, 60)} | ${last}` : `open  ${last}`;
};
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const results = [];
for (let i = 0; i < jobs.length; i += 4) {
  results.push(...await Promise.all(jobs.slice(i, i + 4).map(async ([s, sl]) => {
    const { stdout } = await run('node', ['tools/botrun.mjs', `&seed=${s}${extra}`, seconds, sl, who], { maxBuffer: 1 << 24 }).catch((e) => e);
    return `seed ${s.padEnd(5)} ${who === 'planet' ? (sl === '1' ? 'greedy' : 'human ') : sl === '1' ? 'sloppy' : 'greedy'}  ${summary(stdout ?? '')}`;
  })));
}
console.log(results.join('\n'));

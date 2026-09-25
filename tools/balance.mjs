// Balance sweep: node tools/balance.mjs [extraQuery] [seconds] [seeds] [modes]  -> one line per seed x mode (greedy/sloppy)
// Runs tools/botrun.mjs for each seed in parallel batches and summarises the outcome (clear time / death / timeout).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const [extra = '', seconds = '420', seedList = '777,11,23,42,99,2024', modes = 'greedy,sloppy'] = process.argv.slice(2);
const seeds = seedList.split(',');
const jobs = seeds.flatMap((s) => modes.split(',').map((m) => [s, m === 'sloppy' ? '1' : '0']));
const summary = (out) => {
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
    const { stdout } = await run('node', ['tools/botrun.mjs', `&seed=${s}${extra}`, seconds, sl], { maxBuffer: 1 << 24 }).catch((e) => e);
    return `seed ${s.padEnd(5)} ${sl === '1' ? 'sloppy' : 'greedy'}  ${summary(stdout ?? '')}`;
  })));
}
console.log(results.join('\n'));

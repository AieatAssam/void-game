// Rendered integration capture. SOFTWARE=1 forces SwiftShader; CPU_RATE=4 applies CDP CPU throttling.
// node tools/experience-check.mjs label '?q=low&region' [town|region|planet|finale]
import { chromium, channel } from './browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [label='experience', query='?q=low', stage='town'] = process.argv.slice(2);
const software=process.env.SOFTWARE === '1';
const probeFlags=process.env.NO_FPS === '1'?'&nowatch':'&fps&nowatch';
const browser=await chromium.launch({headless:process.env.HEADLESS !== '0',channel,args:['--ignore-gpu-blocklist', ...(software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const page=await browser.newPage({viewport:{width:+(process.env.WIDTH||960),height:+(process.env.HEIGHT||640)},deviceScaleFactor:1});
page.setDefaultTimeout(180000);
const errors=[], warnings=[];
if(process.env.WATER_TEXTURE_PATH) await page.route('**/textures/water/water-detail.png',route=>route.fulfill({path:resolve(process.env.WATER_TEXTURE_PATH)}));
page.on('response',r=>{if(r.status()>=400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`);});
page.on('pageerror',e=>{errors.push(e.message);console.error('pageerror',e.message);});
page.on('console',m=>{if(m.type()==='error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text().slice(0,1500)); else if(m.type()==='warning') warnings.push(m.text().slice(0,350));});
const cdp=await page.context().newCDPSession(page);
if(+process.env.CPU_RATE>1) await cdp.send('Emulation.setCPUThrottlingRate',{rate:+process.env.CPU_RATE});
const start=Date.now();
try {
 await page.goto(`http://127.0.0.1:${process.env.PORT||5174}/${query}${query.includes('?')?'&':'?'}seed=7&time=golden&nothumbs${probeFlags}`);
 if(stage==='planet'||stage==='finale') {
  if(stage==='finale') await page.waitForFunction(()=>typeof window.__finale==='function' && !!window.__game().state.asc);
  else await page.waitForFunction(()=>!!window.__planet && window.__game().state.playing);
 }
 else if(stage==='bisect') {
  await page.waitForFunction(()=>Array.isArray(window.__bisectResult),null,{timeout:180000});
  console.log(label,'bisect',JSON.stringify(await page.evaluate(()=>window.__bisectResult)));
 }
 else {
  await page.waitForSelector('#menu:not([hidden])');
  await page.locator('#play').click();
  if(stage==='region') await page.waitForFunction(()=>window.__game?.().state.phase===2 && !window.__game().state.breaking);
 }
 console.log(label,'ready',Date.now()-start,'ms');
 if(process.env.SCENE) await page.evaluate(async source => { const value = (0, eval)(source); return typeof value === 'function' ? await value() : value; }, process.env.SCENE);
 await page.waitForTimeout(3000);
 const result=await page.evaluate(async (seconds)=>{
  const g=window.__game(), gl=g.renderer.backend.gl;
  const ext=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=gl ? gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER) : 'WebGPU';
  const values=[]; let last=performance.now(),start=last;
  await new Promise(resolve=>{function frame(t){values.push(t-last);last=t;if(t-start<seconds*1000)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  values.shift();values.sort((a,b)=>a-b);
  const pct=p=>values[Math.min(values.length-1,Math.floor(values.length*p))];
  return {renderer,software:/swiftshader|llvmpipe|software/i.test(renderer),viewport:[innerWidth,innerHeight],pixels:[g.renderer.domElement.width,g.renderer.domElement.height],phase:g.state.phase,r:g.hole.r,draws:window.__info(),frame:{n:values.length,p50:pct(.5),p95:pct(.95),p99:pct(.99),worst:values.at(-1),over50:values.filter(x=>x>50).length},perf:window.__perf?.(),bisect:window.__bisectResult||null,playing:g.state.playing,loaderHidden:document.querySelector('#load')?.hidden,bodyOverflow:document.documentElement.scrollWidth>innerWidth};
 }, +(process.env.SECONDS||8));
 if(software&&!result.software) throw new Error(`Software renderer was requested but actual backend is ${result.renderer}`);
 mkdirSync('.shots',{recursive:true});
 // Keep the measured image useful for visual review; diagnostics remain in the JSON.
 await page.locator('#fps').evaluateAll(nodes=>nodes.forEach(node=>node.style.display='none'));
 const motionFrames=Number(process.env.MOTION_FRAMES||0);
 for(let i=0;i<motionFrames;i++) {
  await page.screenshot({path:`.shots/${label}-motion-${String(i).padStart(2,'0')}.png`});
  if(i+1<motionFrames) await page.waitForTimeout(2500);
 }
 await page.screenshot({path:`.shots/${label}.png`});
 result.errors=errors;result.warnings=[...new Set(warnings)];result.loadMs=Date.now()-start;
 writeFileSync(`.shots/${label}.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,perf:result.perf?{...result.perf,hitches:result.perf.hitches.slice(-5)}:null}));
 if(errors.length)process.exitCode=1;
} catch(error) { console.error(JSON.stringify({errors,warnings,error:error.message})); mkdirSync('.shots',{recursive:true}); await page.screenshot({path:`.shots/${label}-failure.png`}).catch(()=>{}); throw error; } finally {await browser.close();}

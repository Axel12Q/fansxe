const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
test('only the visible feed video autoplays, pauses offscreen and respects manual pause and modals',async t=>{
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;let callback;
 w.IntersectionObserver=class{constructor(cb){callback=cb;}observe(){}unobserve(){}};
 w.eval(fs.readFileSync('assets/js/components.js','utf8'));w.eval(fs.readFileSync('assets/js/media.js','utf8'));
 w.document.body.innerHTML=[1,2].map(()=>'<article class="post-card">'+w.FansxeComponents.video('')+'</article>').join('');
 const videos=[...w.document.querySelectorAll('video')];
 for(const video of videos){let paused=true;Object.defineProperty(video,'paused',{get:()=>paused});video.play=async()=>{paused=false;video.dispatchEvent(new w.Event('play'));};video.pause=()=>{paused=true;video.dispatchEvent(new w.Event('pause'));};w.FansxeMedia.player(video.parentElement);assert.equal(video.muted,true);}
 const entries=(a,b)=>callback(videos.map((target,i)=>({target,isIntersecting:[a,b][i]>0,intersectionRatio:[a,b][i]})));
 entries(.9,0);await new Promise(r=>setTimeout(r,0));assert.equal(videos[0].paused,false);assert.equal(videos[1].paused,true);
 entries(.2,.8);await new Promise(r=>setTimeout(r,0));assert.equal(videos[0].paused,true);assert.equal(videos[1].paused,false);
 videos[1].click();entries(.2,.9);await new Promise(r=>setTimeout(r,0));assert.equal(videos[1].paused,true);
 entries(0,0);entries(0,.9);await new Promise(r=>setTimeout(r,0));assert.equal(videos[1].paused,false);
 w.FansxeApp={activeModal:'imageModal'};w.dispatchEvent(new w.CustomEvent('fansxe:modal-opened'));assert.equal(videos[1].paused,true);
});

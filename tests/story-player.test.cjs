const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
function player(t, media='') {
    const dom=new JSDOM(`<div class="story-stage"><div class="story-segments"><span class="current"></span></div><header class="story-overlay-header"></header><div class="story-content">${media}</div><button data-story-sound>Sonido</button></div>`,{runScripts:'outside-only',pretendToBeVisual:true});
    const w=dom.window;t.after(()=>w.close());let now=1,frame,advances=0,backs=0,plays=0,pauses=0;
    w.requestAnimationFrame=fn=>{frame=fn;return 1;};w.cancelAnimationFrame=()=>{frame=null;};Object.defineProperty(w.performance,'now',{value:()=>now});
    w.HTMLMediaElement.prototype.play=function(){plays++;return Promise.resolve();};w.HTMLMediaElement.prototype.pause=()=>{pauses++;};
    w.eval(fs.readFileSync('assets/js/story-player.js','utf8'));const stage=w.document.querySelector('.story-stage');
    const control=w.FansxeStoryPlayer(stage,{next:()=>advances++,previous:()=>backs++});
    function pointer(type){const ev=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(ev,{pointerId:1,clientX:100,clientY:100,button:0});stage.querySelector('.story-content').dispatchEvent(ev);return ev;}
    return {w,stage,control,pointer,step(ms=100){now+=ms;const f=frame;frame=null;f?.(now);},get advances(){return advances},get plays(){return plays},get pauses(){return pauses}};
}
test('thought stories advance after six seconds and pause while held', async t=>{
    const c=player(t);for(let i=0;i<30;i++)c.step();assert.equal(c.advances,0);
    c.pointer('pointerdown');await new Promise(r=>setTimeout(r,200));assert.ok(c.stage.classList.contains('story-held'));
    for(let i=0;i<80;i++)c.step();assert.equal(c.advances,0);
    c.pointer('pointerup');assert.ok(!c.stage.classList.contains('story-held'));assert.equal(c.advances,0);
    for(let i=0;i<35;i++)c.step();assert.equal(c.advances,1);c.control.dispose();
});
test('photo countdown waits for the image to finish loading', t=>{
    const c=player(t,'<img class="story-full-photo">');for(let i=0;i<80;i++)c.step();assert.equal(c.advances,0);
    assert.ok(c.stage.classList.contains('story-is-loading'));
    assert.match(c.stage.querySelector('[role="status"]').textContent,/Cargando historia/);
    c.stage.querySelector('img').dispatchEvent(new c.w.Event('load'));assert.ok(!c.stage.classList.contains('story-is-loading'));for(let i=0;i<61;i++)c.step();assert.equal(c.advances,1);c.control.dispose();
});
test('video starts automatically, pauses on hold and advances on ended', async t=>{
    const c=player(t,'<video playsinline></video>'),video=c.stage.querySelector('video');video.dispatchEvent(new c.w.Event('loadeddata'));await Promise.resolve();assert.equal(c.plays,1);
    c.pointer('pointerdown');assert.ok(c.pauses>0);video.dispatchEvent(new c.w.Event('ended'));assert.equal(c.advances,0);
    await new Promise(r=>setTimeout(r,200));c.pointer('pointerup');assert.ok(c.plays>=2);video.dispatchEvent(new c.w.Event('ended'));assert.equal(c.advances,1);c.control.dispose();
});
test('a story navigation tap consumes the pointer event', t=>{
    const c=player(t);c.pointer('pointerdown');const up=c.pointer('pointerup');assert.equal(up.defaultPrevented,true);c.control.dispose();
});

(() => {
    window.FansxeStoryPlayer = (stage, { next, previous, playable = true }) => {
        const video = stage.querySelector('video'), photo = stage.querySelector('.story-full-photo');
        const raf = window.requestAnimationFrame?.bind(window) || (fn => setTimeout(() => fn(performance.now()), 16));
        const caf = window.cancelAnimationFrame?.bind(window) || clearTimeout;
        let disposed = false, paused = false, ready = !video && !photo, held = false, started = 0, elapsed = 0, frame = 0, holdTimer, pointer = null;
        const active = stage.querySelector('.story-segments .current');
        const tryPlay = async () => {
            if (!video || disposed || paused || document.hidden || !playable) return;
            try { await video.play(); }
            catch {
                video.muted = true;
                try { await video.play(); } catch { stage.classList.add('story-needs-play'); }
            }
            const sound = stage.querySelector('[data-story-sound]'); if (sound) { sound.textContent = video.muted ? 'Activar sonido' : 'Silenciar'; sound.setAttribute('aria-pressed', String(!video.muted)); }
        };
        function pause(value) { paused = value; if (value) video?.pause(); else { started = performance.now(); tryPlay(); } }
        function tick(now) {
            if (disposed) return;
            if (!started) started = now;
            if (ready && playable && !paused && !document.hidden) {
                if (!video) elapsed += Math.min(now - started, 100);
                const fraction = video ? (video.duration > 0 ? video.currentTime / video.duration : 0) : elapsed / 6000;
                active?.style.setProperty('--progress', `${Math.min(1, fraction) * 100}%`);
                if (!video && elapsed >= 6000) { next(); return; }
            }
            started = now; frame = raf(tick);
        }
        const loading = document.createElement('div');
        loading.className = 'story-loading'; loading.setAttribute('role', 'status'); loading.textContent = 'Cargando historia…';
        stage.append(loading);
        stage.classList.toggle('story-is-loading', !ready && playable);
        const loaded = () => { if (disposed) return; ready = true; stage.classList.remove('story-is-loading', 'story-media-error'); started = performance.now(); tryPlay(); };
        photo?.addEventListener('load', loaded); if (photo?.complete && photo.naturalWidth) loaded();
        video?.addEventListener('loadeddata', loaded);
        if (video?.readyState >= 2) loaded();
        const ended = () => { if (!paused && !disposed) next(); };
        video?.addEventListener('ended', ended);
        const failed = () => { if (disposed) return; stage.classList.remove('story-is-loading'); stage.classList.add('story-media-error'); ready = false; };
        video?.addEventListener('error', failed); photo?.addEventListener('error', failed);
        const down = event => {
            if (event.button > 0 || event.target.closest('button,a,input,textarea')) return;
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; held = false; pause(true);
            stage.setPointerCapture?.(event.pointerId);
            holdTimer = setTimeout(() => { held = true; stage.classList.add('story-held'); }, 180);
        };
        const context = event => { if(!event.target.closest('input,textarea,a,button'))event.preventDefault(); };
        const up = event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            clearTimeout(holdTimer); stage.classList.remove('story-held');
            const moved = Math.hypot(event.clientX-pointer.x, event.clientY-pointer.y)>20;
            const previousTap = pointer.x-stage.getBoundingClientRect().left < stage.clientWidth*.3;
            pointer = null; pause(false);
            if (!held && !moved && event.type === 'pointerup') { event.preventDefault(); event.stopPropagation(); document.dispatchEvent(new CustomEvent('fansxe:story-suppress-click')); if (video && stage.classList.contains('story-needs-play')) { stage.classList.remove('story-needs-play');tryPlay(); } else previousTap ? previous() : next(); }
        };
        const visibility = () => { if(document.hidden) video?.pause(); else {started=performance.now(); if(!paused)tryPlay();} };
        const focus = e => { if(e.target.matches('input,textarea'))pause(e.type==='focusin'); };
        const sound = async () => { video.muted=!video.muted; await tryPlay(); };
        stage.addEventListener('pointerdown',down);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);stage.addEventListener('lostpointercapture',up);
        stage.addEventListener('contextmenu',context);
        stage.addEventListener('focusin',focus);stage.addEventListener('focusout',focus);document.addEventListener('visibilitychange',visibility);
        stage.querySelector('[data-story-sound]')?.addEventListener('click',sound);
        frame=raf(tick);
        return { pause, dispose() { disposed=true;clearTimeout(holdTimer);caf(frame);video?.pause();document.removeEventListener('visibilitychange',visibility);stage.removeEventListener('pointerdown',down);stage.removeEventListener('pointerup',up);stage.removeEventListener('pointercancel',up);stage.removeEventListener('lostpointercapture',up);video?.removeEventListener('ended',ended); } };
    };
})();

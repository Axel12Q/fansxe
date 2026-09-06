// Binary media lives in IndexedDB, not in localStorage. URLs are rebuilt on reload.
(() => {
    const cache = new Map();
    const loading = new WeakMap();
    let connection;
    const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
    function validate(file, imagesOnly = false) {
        if (!types.includes(file.type) || (imagesOnly && !file.type.startsWith('image/'))) throw Error('Usa una foto JPG, PNG, WebP o GIF' + (imagesOnly ? '.' : ', o un video MP4 o WebM.'));
        const limit = file.type.startsWith('video/') ? 25 : 8;
        if (!file.size || file.size > limit * 1024 * 1024) throw Error(`El archivo debe pesar menos de ${limit} MB y no estar vacío.`);
    }
    function db() {
        if (!connection) connection = new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(Error('Este navegador no permite guardar archivos.'));
            const request = indexedDB.open('fansxe.media', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('files');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(Error('No se pudo abrir el almacenamiento de archivos.'));
            request.onblocked = () => reject(Error('Cierra otras pestañas de Fansxe e inténtalo de nuevo.'));
        }).catch(error => { connection = null; throw error; });
        return connection;
    }
    async function transaction(mode, work) {
        const database = await db();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('files', mode);
            const request = work(tx.objectStore('files'));
            tx.oncomplete = () => resolve(request?.result);
            tx.onabort = tx.onerror = () => reject(Error('No se pudo guardar el archivo. Revisa el espacio disponible en tu navegador.'));
        });
    }
    async function save(file, imagesOnly = false) {
        validate(file, imagesOnly);
        if (window.FansxeBoot) { const data = new FormData(); data.append('file', file); return (await FansxeAPI('upload', data, true)).asset; }
        const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
        const signature = {
            'image/png': bytes[0] === 137 && text(1, 4) === 'PNG',
            'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
            'image/gif': ['GIF87a', 'GIF89a'].includes(text(0, 6)),
            'image/webp': text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP',
            'video/mp4': text(4, 8) === 'ftyp',
            'video/webm': bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163
        };
        if (!signature[file.type]) throw Error('El archivo no coincide con su formato. Selecciona una foto o un video válido.');
        const id = crypto.randomUUID();
        await transaction('readwrite', files => files.put(file, id));
        return { id, kind: file.type.startsWith('video/') ? 'video' : 'image', name: file.name };
    }
    async function url(id) {
        if (window.FansxeBoot) return '/api/index.php?action=file&id=' + encodeURIComponent(id);
        if (!cache.has(id)) cache.set(id, transaction('readonly', files => files.get(id)).then(file => {
            if (!file) throw Error('El archivo ya no está en este navegador.');
            return URL.createObjectURL(file);
        }).catch(error => { cache.delete(id); throw error; }));
        return cache.get(id);
    }
    async function remove(id) {
        if (window.FansxeBoot) { await FansxeAPI('remove-file', { id }); return; }
        if (cache.has(id)) { try { URL.revokeObjectURL(await cache.get(id)); } catch {} cache.delete(id); }
        await transaction('readwrite', files => files.delete(id));
    }
    const time = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
    function player(root) {
        if (root.dataset.ready) return;
        root.dataset.ready = 'true';
        const video = root.querySelector('video');
        const controls = root.querySelector('.player-controls');
        if (!video || !controls) return;
        const play = root.querySelector('[data-video="play"]');
        const seek = root.querySelector('[data-video="seek"]');
        const mute = root.querySelector('[data-video="mute"]');
        const status = root.querySelector('.player-status');
        const refresh = () => {
            play.textContent = video.paused ? '▶' : 'Ⅱ'; play.setAttribute('aria-label', video.paused ? 'Reproducir video' : 'Pausar video');
            seek.max = Number.isFinite(video.duration) ? video.duration : 0;
            seek.value = video.currentTime || 0;
            seek.setAttribute('aria-valuetext', `${time(video.currentTime)} de ${time(video.duration)}`);
            root.querySelector('.player-time').textContent = `${time(video.currentTime)} / ${time(video.duration)}`;
            mute.textContent = video.muted ? 'Activar sonido' : 'Silenciar';
        };
        play.addEventListener('click', async () => {
            try { if (video.paused) await video.play(); else video.pause(); }
            catch { status.textContent = 'No se pudo reproducir. Prueba un MP4 H.264 o WebM compatible.'; }
        });
        video.addEventListener('play', () => { document.querySelectorAll('video').forEach(v => { if (v !== video) v.pause(); }); refresh(); });
        ['pause', 'timeupdate', 'loadedmetadata', 'volumechange', 'ended'].forEach(type => video.addEventListener(type, refresh));
        video.addEventListener('error', () => { status.textContent = 'Formato no reproducible en este navegador. Prueba otro MP4 o WebM.'; });
        seek.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value); });
        mute.addEventListener('click', () => { video.muted = !video.muted; });
        root.querySelector('[data-video="volume"]').addEventListener('input', event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; });
        root.querySelector('[data-video="speed"]').addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
        root.querySelector('[data-video="fullscreen"]').addEventListener('click', async () => {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (root.requestFullscreen) await root.requestFullscreen();
                else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
                else status.textContent = 'Pantalla completa no disponible en este navegador.';
            } catch { status.textContent = 'No se pudo abrir la pantalla completa.'; }
        });
        video.controls = false; controls.hidden = false; refresh();
    }
    async function hydrate(scope = document) {
        scope.querySelectorAll('.video-player').forEach(player);
        scope.querySelectorAll('.post-media img, .gallery-image img, .story-full-photo').forEach(el => {
            if (el.dataset.fade) return; el.dataset.fade = 'true'; el.classList.add('media-pending');
            const reveal = async () => { try { await el.decode?.(); } catch {} el.classList.remove('media-pending'); el.classList.add('media-ready'); };
            el.addEventListener('load', reveal, { once: true }); el.addEventListener('error', () => el.classList.remove('media-pending'), { once: true });
            if (el.complete && el.naturalWidth) reveal();
        });
        await Promise.all([...scope.querySelectorAll('[data-asset]')].map(el => {
            if (!loading.has(el)) loading.set(el, (async () => {
                try { const source = await url(el.dataset.asset); if (el.isConnected) el.src = source; }
                catch (error) {
                    if (!el.isConnected) return;
                    const message = document.createElement('span'); message.className = 'asset-error'; message.textContent = error.message;
                    el.replaceWith(message);
                }
            })());
            return loading.get(el);
        }));
    }
    window.FansxeMedia = { validate, save, remove, url, hydrate, player };
})();

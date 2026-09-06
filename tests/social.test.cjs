const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const root = path.resolve(__dirname, '..');

function load(file, query = '', saved = null, database = new IDBFactory()) {
    const errors = [];
    const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url: `http://localhost:8080/${file}${query}`, runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.indexedDB = database;
    w.HTMLMediaElement.prototype.pause = function () {};
    w.HTMLMediaElement.prototype.play = async function () { this.dispatchEvent(new w.Event('play')); };
    w.URL.createObjectURL = () => 'blob:http://localhost/' + crypto.randomUUID();
    w.URL.revokeObjectURL = () => {};
    w.scrollTo = () => {};
    w.tailwind = {}; w.sessionStorage.setItem('fansxe.session.v1', JSON.stringify({email: 'admin', expiresAt: Date.now() + 8640000000}));
    if (saved) w.localStorage.setItem('fansxe.demo.v1', saved);
    for (const script of d.querySelectorAll('script[src^="assets/"]')) w.eval(fs.readFileSync(path.join(root, script.getAttribute('src')), 'utf8'));
    return { w, d, errors, close: () => w.close(), snapshot: () => w.localStorage.getItem('fansxe.demo.v1') };
}
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 5)); };
const click = (ctx, selector) => { const el = ctx.d.querySelector(selector); assert.ok(el, selector); el.click(); };
const submit = (ctx, selector) => ctx.d.querySelector(selector).dispatchEvent(new ctx.w.Event('submit', { bubbles: true, cancelable: true }));
const selectFile = (ctx, selector, file) => {
    const input = ctx.d.querySelector(selector);
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
};

test('all routes initialize without script errors, missing local links or corrupted text', () => {
    for (const [file, query] of [['inicio.html', ''], ['perfil.html', ''], ['perfil.html', '?user=oficial'], ['perfil.html', '?user=luna'], ['perfil.html', '?user=missing'], ['mensajes.html', ''], ['notificaciones.html', '']]) {
        const c = load(file, query);
        assert.deepEqual(c.errors, []);
        assert.ok(!c.d.body.textContent.includes('T?'));
        assert.ok(!c.d.body.textContent.includes('demostraci?n'));
        const ownLink = [...c.d.querySelectorAll('#sidebar-slot a')].find(a => a.textContent.trim() === 'Mi perfil');
        assert.ok(ownLink.href.endsWith('perfil.html?user=demo'));
        const ids = [...c.d.querySelectorAll('[id]')].map(e => e.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const link of c.d.querySelectorAll('a[href]')) {
            const url = new URL(link.href); if (url.origin === 'http://localhost:8080') assert.ok(fs.existsSync(path.join(root, url.pathname.slice(1))));
        }
        c.close();
    }
});

test('home features multiple authors; own and other profiles share routes and correct permissions', async () => {
    const c = load('inicio.html');
    assert.equal(c.d.querySelector('.creator-strip'), null);
    assert.ok(c.d.querySelectorAll('.post-card').length >= 4);
    assert.ok(c.d.querySelector('.post-card a[href="perfil.html?user=luna"]'));
    assert.ok(c.d.querySelector('a[href="inicio.html?tag=Arte"]'));
    assert.ok(c.d.querySelector('.post-copy a[href="perfil.html?user=luna"]'));
    c.close();
    const mine = load('perfil.html');
    assert.ok(mine.d.querySelector('[data-action="edit-profile"]'));
    assert.equal(mine.d.querySelector('[data-action="follow"]'), null);
    click(mine, '[data-action="edit-profile"]');
    const form = mine.d.querySelector('#profile-form');
    form.elements.name.value = 'María'; form.elements.handle.value = 'maria_arte'; form.elements.bio.value = 'Fotos y música ✨';
    submit(mine, '#profile-form'); await flush();
    assert.equal(mine.w.FansxeStore.user('demo').name, 'María');
    assert.ok(mine.d.querySelector('.profile-info').textContent.includes('María'));
    const next = load('perfil.html', '?user=demo', mine.snapshot());
    assert.equal(next.w.FansxeStore.user('demo').handle, 'maria_arte');
    next.close(); mine.close();
    const other = load('perfil.html', '?user=diego');
    assert.equal(other.d.querySelector('[data-action="edit-profile"]'), null);
    assert.ok(other.d.querySelector('[data-action="follow"]'));
    assert.equal(other.w.FansxeStore.editProfile('diego', { name: 'Changed', handle: 'changed' }), 'forbidden');
    assert.equal(other.w.FansxeStore.editProfile('demo', { name: 'Test', handle: 'diego_explora' }), 'duplicate');
    other.close();
});

test('photo and video posts preview, persist binary data, and appear on own profile', async () => {
    const c = load('inicio.html'), database = c.w.indexedDB;
    click(c, '[data-action="compose"]');
    const photo = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,1])], 'playa.png', { type: 'image/png' });
    selectFile(c, '#post-file', photo);
    assert.ok(c.d.querySelector('#post-preview img'));
    c.d.querySelector('#post-text').value = 'Mi foto #Viajes @luna_crea';
    submit(c, '#compose-form'); await flush();
    const p = c.w.FansxeStore.posts()[0];
    assert.equal(p.type, 'fotos'); assert.equal(p.media.length, 1);
    const source = await c.w.FansxeMedia.url(p.media[0].id); assert.ok(source.startsWith('blob:'));
    const next = load('perfil.html', '?user=demo', c.snapshot(), database);
    await next.w.FansxeMedia.hydrate(next.d);
    assert.ok(next.d.querySelector('.post-card img[data-asset]').src.startsWith('blob:'));
    click(c, '[data-action="compose"]');
    selectFile(c, '#post-file', new File([new Uint8Array([0,0,0,20,102,116,121,112,109,112,52,50])], 'clip.mp4', { type: 'video/mp4' }));
    assert.ok(c.d.querySelector('#post-preview .video-player'));
    assert.equal(c.d.querySelector('#post-preview video').controls, false);
    submit(c, '#compose-form'); await flush();
    assert.equal(c.w.FansxeStore.posts()[0].type, 'videos');
    assert.ok(c.d.querySelector('.post-card .player-controls'));
    assert.deepEqual(c.errors, []);
    next.close(); c.close();
});

test('avatar and cover uploads persist, cancellation leaves profile untouched', async () => {
    const c = load('perfil.html');
    click(c, '[data-action="edit-profile"]');
    const photo = new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'perfil.png', { type: 'image/png' });
    selectFile(c, '#avatar-file', photo); selectFile(c, '#cover-file', photo);
    submit(c, '#profile-form'); await flush();
    assert.ok(c.w.FansxeStore.user('demo').avatarAsset);
    assert.ok(c.w.FansxeStore.user('demo').coverAsset);
    const original = c.w.FansxeStore.user('demo').name;
    click(c, '[data-action="edit-profile"]'); c.d.querySelector('#profile-name').value = 'Descartado';
    click(c, '#editProfileModal [data-action="close-modal"]');
    assert.equal(c.w.FansxeStore.user('demo').name, original);
    click(c, '[data-action="edit-profile"]'); click(c, '[data-action="remove-avatar"]'); submit(c, '#profile-form'); await flush();
    assert.equal(c.w.FansxeStore.user('demo').avatarAsset, null);
    c.close();
});

test('chat permits followers OR followed users, rejects unrelated users and persists attachments', async () => {
    const c = load('mensajes.html');
    assert.equal(c.w.FansxeStore.canMessage('luna'), true);
    assert.equal(c.w.FansxeStore.canMessage('diego'), false);
    assert.equal(c.w.FansxeStore.startConversation('diego'), false);
    assert.equal(c.w.FansxeStore.sendMessage('diego', 'No permitido'), false);
    click(c, '[data-action="new-chat"]'); click(c, '#chat-people [data-user="luna"]');
    c.d.querySelector('#chat-text').value = '¡Hola Luna!'; submit(c, '#chat-form'); await flush();
    assert.equal(c.w.FansxeStore.state.conversations.luna.messages.length, 1);
    selectFile(c, '#chat-file', new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'chat.png', { type: 'image/png' }));
    submit(c, '#chat-form'); await flush();
    assert.equal(c.w.FansxeStore.state.conversations.luna.messages[1].media[0].kind, 'image');
    selectFile(c, '#chat-file', new File([new Uint8Array([0,0,0,20,102,116,121,112,109,112,52,50])], 'chat.mp4', { type: 'video/mp4' }));
    submit(c, '#chat-form'); await flush();
    assert.equal(c.w.FansxeStore.state.conversations.luna.messages[2].media[0].kind, 'video');
    const next = load('mensajes.html', '?user=luna', c.snapshot(), c.w.indexedDB); await flush();
    assert.equal(next.d.querySelectorAll('.message-bubble').length, 3);
    assert.ok(next.d.querySelector('.message-bubble video'));
    c.w.FansxeStore.toggleFollow('diego'); assert.equal(c.w.FansxeStore.startConversation('diego'), true);
    assert.equal(c.w.FansxeStore.sendMessage('diego', 'Hola'), true);
    c.w.FansxeStore.toggleFollow('diego'); assert.equal(c.w.FansxeStore.sendMessage('diego', 'Bloqueado'), false);
    assert.equal(c.w.FansxeStore.startConversation('demo'), false);
    assert.deepEqual(c.errors, []); assert.deepEqual(next.errors, []);
    next.close(); c.close();
});

test('recharge selection and cancellation do not change the balance; confirmation charges once', () => {
    const c = load('inicio.html');
    click(c, '[data-action="recharge"]'); click(c, '[data-action="select-recharge"][data-amount="500"]');
    assert.equal(c.w.FansxeStore.state.balanceCents, 250);
    click(c, '[data-action="cancel-recharge"]'); assert.equal(c.w.FansxeStore.state.balanceCents, 250);
    click(c, '[data-action="select-recharge"][data-amount="1000"]');
    assert.ok(c.d.querySelector('#recharge-total').textContent.includes('12.50'));
    click(c, '[data-action="confirm-recharge"]'); assert.equal(c.w.FansxeStore.state.balanceCents, 1250);
    click(c, '[data-action="confirm-recharge"]'); assert.equal(c.w.FansxeStore.state.balanceCents, 1250);
    c.close();
});

test('media limits reject unsupported files, preserve selected attachments and allow removal', () => {
    const c = load('inicio.html'); click(c, '[data-action="compose"]');
    assert.throws(() => c.w.FansxeMedia.validate({ type: 'image/svg+xml', size: 10 }));
    assert.throws(() => c.w.FansxeMedia.validate({ type: 'video/mp4', size: 26 * 1024 * 1024 }));
    assert.throws(() => c.w.FansxeMedia.validate({ type: 'image/png', size: 0 }));
    selectFile(c, '#post-file', new File(['x'], 'photo.png', { type: 'image/png' }));
    selectFile(c, '#post-file', new File(['x'], 'bad.svg', { type: 'image/svg+xml' }));
    assert.equal(c.d.querySelectorAll('#post-preview .attachment-item').length, 1);
    click(c, '#post-preview [data-remove]'); assert.equal(c.d.querySelectorAll('#post-preview .attachment-item').length, 0);
    c.close();
});

test('custom player connects playback, seeking, mute, volume, speed and fullscreen', async () => {
    const c = load('inicio.html'); click(c, '[data-action="compose"]');
    selectFile(c, '#post-file', new File(['preview'], 'clip.mp4', { type: 'video/mp4' }));
    const player = c.d.querySelector('#post-preview .video-player'), video = player.querySelector('video');
    let paused = true, played = 0, full = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    Object.defineProperty(video, 'duration', { value: 90 });
    video.play = async () => { paused = false; played++; video.dispatchEvent(new c.w.Event('play')); };
    video.pause = () => { paused = true; video.dispatchEvent(new c.w.Event('pause')); };
    player.requestFullscreen = async () => { full = true; };
    player.querySelector('[data-video="play"]').click(); await flush(); assert.equal(played, 1);
    player.querySelector('[data-video="play"]').click(); assert.equal(paused, true);
    video.dispatchEvent(new c.w.Event('loadedmetadata'));
    const seek = player.querySelector('[data-video="seek"]'); seek.value = '30'; seek.dispatchEvent(new c.w.Event('input')); assert.equal(video.currentTime, 30);
    player.querySelector('[data-video="mute"]').click(); assert.equal(video.muted, true);
    const volume = player.querySelector('[data-video="volume"]'); volume.value = '0.5'; volume.dispatchEvent(new c.w.Event('input')); assert.equal(video.volume, 0.5); assert.equal(video.muted, false);
    const speed = player.querySelector('[data-video="speed"]'); speed.value = '1.5'; speed.dispatchEvent(new c.w.Event('change')); assert.equal(video.playbackRate, 1.5);
    player.querySelector('[data-video="fullscreen"]').click(); await flush(); assert.equal(full, true);
    video.dispatchEvent(new c.w.Event('error')); assert.ok(player.querySelector('.player-status').textContent.includes('Formato no reproducible'));
    c.close();
});

test('failed binary storage preserves the post draft and rejects a mislabeled file', async () => {
    const c = load('inicio.html'); click(c, '[data-action="compose"]');
    await assert.rejects(c.w.FansxeMedia.save(new File(['not an image'], 'fake.png', { type: 'image/png' })));
    c.w.indexedDB = null;
    c.d.querySelector('#post-text').value = 'Mi borrador';
    selectFile(c, '#post-file', new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'photo.png', { type: 'image/png' }));
    submit(c, '#compose-form'); await flush();
    assert.equal(c.w.FansxeStore.state.posts.length, 0);
    assert.equal(c.d.querySelector('#post-text').value, 'Mi borrador');
    assert.equal(c.d.querySelectorAll('#post-preview .attachment-item').length, 1);
    assert.equal(c.d.querySelector('#composeModal').classList.contains('hidden'), false);
    c.close();
});

test('Escape cancels recharge and profile likes show only the local user favorites', () => {
    const c = load('perfil.html');
    c.w.FansxeStore.toggleLike('playa');
    click(c, '[data-filter="likes"]'); assert.equal(c.d.querySelectorAll('.post-card').length, 1);
    assert.equal(c.d.querySelector('.post-card').dataset.post, 'playa');
    click(c, '[data-action="recharge"]'); click(c, '[data-amount="500"]');
    c.d.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(c.d.querySelector('#confirmRechargeModal').classList.contains('hidden'), true);
    assert.equal(c.d.querySelector('body > .flex').inert, false);
    click(c, '[data-action="confirm-recharge"]'); assert.equal(c.w.FansxeStore.state.balanceCents, 250);
    c.close();
});

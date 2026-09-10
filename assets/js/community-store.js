// Local-only account, achievements, age-review workflow and expiring stories.
(() => {
    const store = FansxeStore, key = 'fansxe.community.v1', day = 86400000;
    const idOK = id => typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id);
    const fresh = () => ({ version: 1, theme: 'light', email: 'alex@ejemplo.test', password: null, hiddenBadges: [], requests: [], storyLikes: {}, storySeen: {}, stories: [
        { id: 'story-luna', creatorId: 'luna', text: 'Un café, un cuaderno y mil ideas por dibujar. 🌙', media: [], visibility: 'public', createdAt: Date.now(), expiresAt: Date.now() + day },
        { id: 'story-diego', creatorId: 'diego', text: 'El mejor plan: salir a descubrir un lugar nuevo. ¿Te sumas?', media: [], visibility: 'public', createdAt: Date.now(), expiresAt: Date.now() + day },
        { id: 'story-oficial', creatorId: 'oficial', text: 'Un pequeño adelanto de la próxima sesión ✨', media: [], visibility: 'subscribers', createdAt: Date.now(), expiresAt: Date.now() + day }
    ] });
    const validMedia = a => a && idOK(a.id) && ['image', 'video'].includes(a.kind) && typeof a.name === 'string';
    const states = ['pending', 'approved', 'changes', 'rejected'];
    function decode(raw) {
        const value = JSON.parse(raw);
        if (!value || value.version !== 1) return fresh();
        const result = fresh();
        result.theme = value.theme === 'dark' ? 'dark' : 'light';
        if (typeof value.email === 'string') result.email = value.email.slice(0, 254);
        if (value.password && /^[0-9a-f]{32}$/.test(value.password.salt) && /^[0-9a-f]{64}$/.test(value.password.hash)) result.password = { salt: value.password.salt, hash: value.password.hash };
        result.hiddenBadges = Array.isArray(value.hiddenBadges) ? value.hiddenBadges.filter(idOK) : [];
        result.requests = Array.isArray(value.requests) ? value.requests.filter(r => r && idOK(r.id) && r.userId === 'demo' && validMedia(r.document) && r.document.kind === 'image' && states.includes(r.status)).map(r => ({ id: r.id, userId: 'demo', document: r.document, status: r.status, submittedAt: Number(r.submittedAt) || 0, reviewedAt: Number(r.reviewedAt) || null, note: String(r.note || '').slice(0, 1000) })) : [];
        result.stories = Array.isArray(value.stories) ? value.stories.filter(s => s && idOK(s.id) && store.user(s.creatorId) && typeof s.text === 'string' && s.text.length <= 1000 && Number.isFinite(s.createdAt) && Number.isFinite(s.expiresAt) && s.expiresAt === s.createdAt + day && Array.isArray(s.media) && s.media.length <= 1 && s.media.every(validMedia)).map(s => ({ ...s, visibility: s.visibility === 'subscribers' ? 'subscribers' : 'public' })) : [];
        for (const field of ['storyLikes', 'storySeen']) result[field] = value[field] && typeof value[field] === 'object' ? Object.fromEntries(Object.entries(value[field]).filter(([id, flag]) => idOK(id) && flag === true)) : {};
        return result;
    }
    let state = fresh();
    try { const raw = localStorage.getItem(key); if (raw) state = decode(raw); else localStorage.setItem(key, JSON.stringify(state)); } catch {}
    function commit(change) {
        const previous = JSON.stringify(state); change();
        try { localStorage.setItem(key, JSON.stringify(state)); }
        catch { state = decode(previous); window.dispatchEvent(new CustomEvent('fansxe:storage-error')); return false; }
        window.dispatchEvent(new CustomEvent('fansxe:change')); return true;
    }
    const latest = () => state.requests.at(-1) || null;
    const canPublishPrivate = () => latest()?.status === 'approved';
    const story = id => state.stories.find(s => s.id === id);
    const alive = s => !!s && s.createdAt <= Date.now() && s.expiresAt > Date.now();
    const visible = s => alive(s) && (s.creatorId === 'demo' || store.state.following[s.creatorId] === true);
    const canView = s => visible(s) && (s.creatorId === 'demo' || s.visibility === 'public' || store.state.subscriptions[s.creatorId] === true);
    const badgeCatalog = [
        { id: 'first-post', name: 'Primera publicación', description: 'Comparte tu primera publicación.', icon: 'photo', tone: 'purple' },
        { id: 'first-story', name: 'Una historia que contar', description: 'Publica tu primera historia.', icon: 'comment', tone: 'pink' },
        { id: 'community-100', name: 'Comunidad de 100', description: 'Alcanza 100 seguidores.', icon: 'people', tone: 'blue' },
        { id: 'community-1000', name: 'Mil conexiones', description: 'Alcanza 1,000 seguidores.', icon: 'heart', tone: 'gold' },
        { id: 'profile-complete', name: 'Con identidad propia', description: 'Añade una foto, una portada y una biografía.', icon: 'check', tone: 'green' }
    ];
    function earned(userId) {
        const u = store.user(userId); if (!u) return [];
        const followers = u.followers + (userId !== 'demo' && store.state.following[userId] ? 1 : 0);
        const flags = { 'first-post': store.posts().some(p => p.creatorId === userId), 'first-story': state.stories.some(s => s.creatorId === userId), 'community-100': followers >= 100, 'community-1000': followers >= 1000, 'profile-complete': !!((u.avatarAsset || u.avatar) && (u.coverAsset || u.cover) && u.bio?.trim()) };
        return badgeCatalog.filter(b => flags[b.id]);
    }
    const hex = bytes => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
    async function digest(password, salt) {
        const bytes = new TextEncoder().encode(password);
        const imported = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
        return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g).map(n => parseInt(n, 16))), iterations: 210000, hash: 'SHA-256' }, imported, 256));
    }
    window.FansxeCommunity = {
        deleteStory(id) { if (!state.stories.some(s => s.id === id && s.creatorId === 'demo')) return false; return commit(() => { state.stories = state.stories.filter(s => s.id !== id); delete state.storyLikes[id]; delete state.storySeen[id]; }); },
        get state() { return state; }, latest, canPublishPrivate, badgeCatalog, earned,
        shownBadges(id) { return earned(id).filter(b => id !== 'demo' || !state.hiddenBadges.includes(b.id)); },
        setBadge(id, shown) { if (!earned('demo').some(b => b.id === id)) return false; return commit(() => { state.hiddenBadges = shown ? state.hiddenBadges.filter(b => b !== id) : [...new Set([...state.hiddenBadges, id])]; }); },
        setTheme(theme) { if (!['light', 'dark'].includes(theme)) return false; return commit(() => { state.theme = theme; }); },
        setEmail(email) { email = email.trim(); if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false; return commit(() => { state.email = email; }); },
        async changePassword(current, password, confirm) {
            if (password.length < 8 || password.length > 128 || password !== confirm) return 'invalid';
            const session = window.FansxeAuth?.session();
            if (session && session.email !== 'admin') return FansxeAuth.changePassword(current, password, confirm);
            const previous = state.password;
            if (!previous && session?.email === 'admin' && current !== 'admin') return 'incorrect';
            if (previous && await digest(current, previous.salt) !== previous.hash) return 'incorrect';
            const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
            const hash = await digest(password, salt);
            if (state.password !== previous) return 'retry';
            return commit(() => { state.password = { salt, hash }; }) ? 'success' : 'storage';
        },
        submitAge(document) {
            if (!validMedia(document) || document.kind !== 'image' || ['pending', 'approved'].includes(latest()?.status)) return false;
            return commit(() => { state.requests.push({ id: crypto.randomUUID(), userId: 'demo', document, status: 'pending', submittedAt: Date.now(), reviewedAt: null, note: '' }); });
        },
        reviewAge(requestId, decision, note, confirmsAdult = false) {
            const request = latest();
            if (!request || request.id !== requestId || request.status !== 'pending' || !['approved', 'changes', 'rejected'].includes(decision)) return false;
            if (decision === 'approved' ? !confirmsAdult : !note.trim()) return false;
            return commit(() => { request.status = decision; request.note = note.trim().slice(0, 1000); request.reviewedAt = Date.now(); });
        },
        stories() { return state.stories.filter(visible).sort((a, b) => a.createdAt - b.createdAt); },
        story, canViewStory: canView,
        publishStory(text, media = [], visibility = 'public') {
            if (typeof text !== 'string' || text.trim().length > 1000 || !Array.isArray(media) || media.length > 1 || !media.every(validMedia) || (!text.trim() && !media.length) || !['public', 'subscribers'].includes(visibility) || (visibility === 'subscribers' && !canPublishPrivate())) return false;
            const createdAt = Date.now();
            return commit(() => { state.stories.push({ id: crypto.randomUUID(), creatorId: 'demo', text: text.trim(), media, visibility, createdAt, expiresAt: createdAt + day }); });
        },
        markStorySeen(id) { if (!canView(story(id)) || state.storySeen[id]) return false; return commit(() => { state.storySeen[id] = true; }); },
        toggleStoryLike(id) { if (!canView(story(id))) return false; return commit(() => { state.storyLikes[id] = !state.storyLikes[id]; }); },
        replyStory(id, text) {
            const s = story(id);
            if (!canView(s) || s.creatorId === 'demo' || typeof text !== 'string' || !text.trim() || text.trim().length > 1000) return false;
            const context = s.text ? s.text.slice(0, 100) : s.media[0]?.kind === 'video' ? 'Video' : 'Foto';
            return store.sendMessage(s.creatorId, `Respuesta a tu historia «${context}»:\n${text.trim()}`);
        }
    };
    window.addEventListener('storage', event => {
        if (event.key !== key && event.key !== null) return;
        try { state = event.newValue ? decode(event.newValue) : { ...fresh(), stories: [] }; } catch { return; }
        window.dispatchEvent(new CustomEvent('fansxe:change'));
    });
})();

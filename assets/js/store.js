(() => {
    'use strict';
    const key = 'fansxe.demo.v1'; // Preserve data from the first demo.
    const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id);
    const object = v => v && typeof v === 'object' && !Array.isArray(v);
    const validAsset = a => object(a) && validId(a.id) && ['image', 'video'].includes(a.kind) && typeof a.name === 'string';
    const assets = list => Array.isArray(list) ? list.filter(validAsset).slice(0, 4).map(a => ({ id: a.id, kind: a.kind, name: a.name.slice(0, 200) })) : [];
    const initial = () => ({ version: 1, balanceCents: 250, likes: {}, following: {}, subscriptions: {}, comments: {}, posts: [], profile: {}, conversations: {}, readNotifications: {} });
    function profileFields(value) {
        if (!object(value)) return {};
        const result = {};
        for (const [field, limit] of Object.entries({ name: 60, handle: 30, bio: 500, location: 80 })) if (typeof value[field] === 'string') result[field] = value[field].slice(0, limit);
        for (const field of ['avatarAsset', 'coverAsset']) if (value[field] === null || validId(value[field])) result[field] = value[field];
        return result;
    }
    function decode(raw) {
        const value = JSON.parse(raw);
        if (!object(value) || value.version !== 1) return initial();
        const next = initial();
        if (Number.isSafeInteger(value.balanceCents) && value.balanceCents >= 0) next.balanceCents = value.balanceCents;
        for (const field of ['likes', 'following', 'subscriptions', 'readNotifications']) if (object(value[field])) next[field] = Object.fromEntries(Object.entries(value[field]).filter(([id, flag]) => validId(id) && flag === true));
        if (object(value.comments)) for (const [id, list] of Object.entries(value.comments)) {
            if (validId(id) && Array.isArray(list)) next.comments[id] = list.filter(c => object(c) && validId(c.id) && typeof c.text === 'string' && c.text.length <= 1000).map(c => ({ id: c.id, author: 'Tú', userId: 'demo', text: c.text }));
        }
        next.profile = profileFields(value.profile);
        if (Array.isArray(value.posts)) next.posts = value.posts.filter(p => object(p) && validId(p.id) && p.creatorId === 'demo' && typeof p.text === 'string' && p.text.length <= 3000).map(p => {
            const media = assets(p.media);
            return { id: p.id, creatorId: 'demo', text: p.text, media, type: media.some(a => a.kind === 'video') ? 'videos' : media.length ? 'fotos' : 'texto', visibility: p.visibility === 'subscribers' ? 'subscribers' : 'public', likes: 0, comments: [], label: 'Tu publicación', createdAt: p.createdAt };
        });
        if (object(value.conversations)) for (const [id, conversation] of Object.entries(value.conversations)) {
            if (!validId(id) || !FansxeData.creators[id] || id === 'demo' || !object(conversation)) continue;
            next.conversations[id] = { userId: id, messages: (Array.isArray(conversation.messages) ? conversation.messages : []).filter(m => object(m) && validId(m.id) && m.senderId === 'demo' && typeof m.text === 'string' && m.text.length <= 3000).map(m => ({ id: m.id, senderId: 'demo', text: m.text, media: assets(m.media), createdAt: typeof m.createdAt === 'string' ? m.createdAt : '' })) };
        }
        return next;
    }
    let state = initial(), persistent = true;
    try { const raw = localStorage.getItem(key); if (raw) state = decode(raw); } catch { persistent = false; }
    function commit(change) {
        const previous = JSON.stringify(state);
        change();
        try { localStorage.setItem(key, JSON.stringify(state)); persistent = true; }
        catch { state = decode(previous); persistent = false; window.dispatchEvent(new CustomEvent('fansxe:storage-error')); return false; }
        window.dispatchEvent(new CustomEvent('fansxe:change'));
        return true;
    }
    const users = () => Object.values(FansxeData.creators).map(user => user.id === 'demo' ? { ...user, ...state.profile } : { ...user });
    const user = id => users().find(u => u.id === id);
    const posts = () => [...state.posts, ...FansxeData.posts];
    const post = id => posts().find(p => p.id === id);
    const canRead = p => !!p && (p.visibility === 'public' || p.creatorId === 'demo' || state.subscriptions[p.creatorId] === true);
    const canMessage = id => !!user(id) && id !== 'demo' && (state.following[id] === true || FansxeData.followers.includes(id));
    const contentValid = (text, media) => typeof text === 'string' && text.trim().length <= 3000 && Array.isArray(media) && media.length <= 4 && media.every(validAsset) && (text.trim().length > 0 || media.length > 0);
    window.FansxeStore = {
        get state() { return state; }, get persistent() { return persistent; },
        users, user, posts, post, canRead, canMessage,
        toggleLike(id) { if (!canRead(post(id))) return false; return commit(() => { state.likes[id] = !state.likes[id]; }); },
        toggleFollow(id) { if (!user(id) || id === 'demo') return false; return commit(() => { state.following[id] = !state.following[id]; }); },
        addComment(id, text) {
            if (typeof text !== 'string' || !canRead(post(id)) || !text.trim() || text.trim().length > 1000) return false;
            return commit(() => { (state.comments[id] ||= []).push({ id: crypto.randomUUID(), author: 'Tú', userId: 'demo', text: text.trim() }); });
        },
        publish(text, media = [], visibility = 'public') {
            if (!contentValid(text, media) || !['public', 'subscribers'].includes(visibility)) return false;
            if (visibility === 'subscribers' && !window.FansxeCommunity?.canPublishPrivate()) return false;
            return commit(() => { state.posts.unshift({ id: crypto.randomUUID(), creatorId: 'demo', text: text.trim(), media: assets(media), type: media.some(a => a.kind === 'video') ? 'videos' : media.length ? 'fotos' : 'texto', visibility, likes: 0, comments: [], label: 'Tu publicación', createdAt: new Date().toISOString() }); });
        },
        deletePost(id) {
            if (!state.posts.some(p => p.id === id && p.creatorId === 'demo')) return false;
            return commit(() => { state.posts = state.posts.filter(p => p.id !== id); delete state.likes[id]; delete state.comments[id]; });
        },
        editProfile(id, fields) {
            if (id !== 'demo') return 'forbidden';
            const clean = profileFields(fields);
            if (!clean.name?.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(clean.handle || '')) return 'invalid';
            if (users().some(u => u.id !== 'demo' && u.handle.toLowerCase() === clean.handle.toLowerCase())) return 'duplicate';
            clean.name = clean.name.trim(); clean.handle = clean.handle.toLowerCase();
            return commit(() => { state.profile = { ...state.profile, ...clean }; }) ? 'success' : 'storage';
        },
        startConversation(id) {
            if (!canMessage(id)) return false;
            return state.conversations[id] ? true : commit(() => { state.conversations[id] = { userId: id, messages: [] }; });
        },
        sendMessage(id, text, media = []) {
            if (!canMessage(id) || !contentValid(text, media)) return false;
            return commit(() => { const c = state.conversations[id] ||= { userId: id, messages: [] }; c.messages.push({ id: crypto.randomUUID(), senderId: 'demo', text: text.trim(), media: assets(media), createdAt: new Date().toISOString() }); });
        },
        markNotificationsRead() { return commit(() => { FansxeData.notifications.forEach(n => { state.readNotifications[n.id] = true; }); }); },
        markNotificationRead(id) {
            if (!FansxeData.notifications.some(n => n.id === id)) return false;
            if (state.readNotifications[id]) return true;
            return commit(() => { state.readNotifications[id] = true; });
        },
        recharge(cents) {
            if (![500, 1000, 2000].includes(cents) || !Number.isSafeInteger(state.balanceCents + cents)) return false;
            return commit(() => { state.balanceCents += cents; });
        },
        purchase(cents, creatorId, subscribe = false) {
            if (!user(creatorId) || creatorId === 'demo') return 'invalid';
            if (subscribe && state.subscriptions[creatorId]) return 'subscribed';
            if (subscribe) cents = user(creatorId).subscriptionCents;
            if (!Number.isSafeInteger(cents) || cents <= 0) return 'invalid';
            if (state.balanceCents < cents) return 'insufficient';
            return commit(() => { state.balanceCents -= cents; if (subscribe) state.subscriptions[creatorId] = true; }) ? 'success' : 'storage';
        }
    };
    window.addEventListener('storage', event => {
        if (event.key !== key && event.key !== null) return;
        try { state = event.newValue ? decode(event.newValue) : initial(); } catch { return; }
        window.dispatchEvent(new CustomEvent('fansxe:change'));
    });
})();

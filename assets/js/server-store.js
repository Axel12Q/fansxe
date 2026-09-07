(() => {
    let snapshot = FansxeBoot, posts = snapshot.feed.posts;
    let feedOptions = { profile: document.body.dataset.page === 'perfil' ? new URLSearchParams(location.search).get('user') || 'demo' : '' };
    const apply = next => { snapshot = next; FansxeData = next.data; FansxeBoot.session = next.session; };
    window.FansxeData = snapshot.data;
    const users = () => Object.values(FansxeData.creators), user = id => FansxeData.creators[id];
    const canRead = p => !!p && (p.creatorId === 'demo' || p.visibility === 'public' || !!snapshot.state.subscriptions[p.creatorId]);
    const canMessage = id => id !== 'demo' && !!user(id) && (!!snapshot.state.following[id] || FansxeData.followers.includes(id));
    let queue = Promise.resolve();
    function write(action, data = {}, failure = false) {
        const work = async () => {
            if (!FansxeAuth.session()) { window.FansxeRequireAccount?.(); return failure; }
            try {
                const result = await FansxeAPI(action, { ...data, feed: feedOptions });
                apply(result.snapshot);
                const first = result.snapshot.feed.posts;
                // Keep already loaded pages; refresh their content individually on the next feed load.
                if (result.post) posts = posts.map(p => p.id === result.post.id ? result.post : p);
                else if (action === 'publish') { const incoming = new Set(first.map(p => p.id)); posts = [...first, ...posts.filter(p => !incoming.has(p.id))]; }
                if (action === 'delete-post') posts = posts.filter(p => p.id !== data.id);
                window.dispatchEvent(new CustomEvent('fansxe:change', { detail: { action, id: data.id } }));
                return result.result;
            } catch (error) { window.FansxeApp?.notify(error.message); return failure; }
        };
        const next = queue.then(work, work); queue = next.catch(() => {}); return next;
    }
    window.FansxeStore = {
        write, get commerce() { return snapshot.commerce; },
        get state() { return { ...snapshot.state, gemBalance: snapshot.commerce?.balance || 0, posts }; }, persistent: true,
        users, user, posts: () => posts, post: id => posts.find(p => p.id === id), canRead, canMessage,
        async discover(offset) { const response=await fetch('/api/index.php?action=discover&offset='+offset);const result=await response.json();if(!response.ok)throw Error(result.error);for(const u of result.users)FansxeData.creators[u.id]||=u;return result; },
        async people(id, list) { const response = await fetch('/api/index.php?' + new URLSearchParams({ action: 'people', user: id, list })); const data = await response.json(); return data.ids || []; },
        toggleLike: id => write('like', { id }), toggleFollow: id => write('follow', { id }),
        addComment: (id, text) => write('comment', { id, text }),
        publish: (text, media, visibility) => write('publish', { text, media, visibility }),
        deletePost: id => write('delete-post', { id }), editProfile: (id, fields) => write('profile', { fields }, 'storage'),
        async startConversation(id) { const ok = await write('conversation', { id }); if (ok) snapshot.state.conversations[id] ||= { userId: id, messages: [] }; return ok; },
        markConversationRead: (id,lastId) => write('message-read',{id,lastId}),
        sendMessage: (id, text, media) => write('message', { id, text, media }),
        markNotificationRead: id => write('read', { id }), markNotificationsRead: () => write('read'),
        recharge: () => { FansxeApp.notify('Los pagos aún no están habilitados. No se ha realizado ningún cargo.'); return false; },
        purchase: () => { FansxeApp.notify('Suscripciones y apoyos pendientes de conectar a la pasarela de pago.'); return 'storage'; },
        get hasMore() { return snapshot.feed.hasMore; }
    };
    let generation = 0;
    FansxeStore.loadFeed = async (options, append = false) => {
        const done = window.FansxeLoading?.begin('Cargando publicaciones…') || (() => {});
        try {
        const request = ++generation;
        feedOptions = { ...options, offset: 0 };
        const params = new URLSearchParams({ action: 'feed', ...options, offset: append ? posts.length : 0 });
        const response = await fetch('/api/index.php?' + params, { credentials: 'same-origin' });
        const result = await response.json(); if (!response.ok) throw Error(result.error);
        if (request !== generation) return;
        posts = append ? [...posts, ...result.posts] : result.posts; snapshot.feed = result;
        } finally { done(); }
    };
    const catalog = [
        { id: 'first-post', name: 'Primera publicación', description: 'Comparte tu primera publicación.', icon: 'photo', tone: 'purple' },
        { id: 'first-story', name: 'Una historia que contar', description: 'Publica tu primera historia.', icon: 'comment', tone: 'pink' },
        { id: 'community-100', name: 'Comunidad de 100', description: 'Alcanza 100 seguidores.', icon: 'people', tone: 'blue' },
        { id: 'community-1000', name: 'Mil conexiones', description: 'Alcanza 1,000 seguidores.', icon: 'heart', tone: 'gold' },
        { id: 'profile-complete', name: 'Con identidad propia', description: 'Añade foto, portada y biografía.', icon: 'check', tone: 'green' }
    ];
    const latest = () => snapshot.community.requests.filter(r => r.userId === 'demo').at(-1) || null;
    const alive = s => !!s && s.expiresAt > Date.now();
    const visible = s => alive(s) && (s.creatorId === 'demo' || snapshot.state.following[s.creatorId]);
    const earned = id => {
        const u = user(id); if (!u) return [];
        const count = u.followers + (snapshot.state.following[id] ? 1 : 0);
        const flags = { 'first-post': u.firstPost, 'first-story': u.firstStory, 'community-100': count >= 100, 'community-1000': count >= 1000, 'profile-complete': u.avatarAsset && u.coverAsset && u.bio };
        return catalog.filter(b => flags[b.id]);
    };
    window.FansxeCommunity = {
        get state() { return snapshot.community; }, latest, canPublishPrivate: () => latest()?.status === 'approved' && user('demo')?.creatorStatus === 'approved', badgeCatalog: catalog, earned,
        shownBadges: id => earned(id).filter(b => !user(id)?.hiddenBadges.includes(b.id)),
        setBadge: (id, shown) => write('badge', { id, shown }), setTheme: theme => write('theme', { theme }),
        setEmail: (email, current) => write('email', { email, current }), changePassword: (current, password, confirm) => write('password', { current, password, confirm }, 'storage'),
        submitAge: document => write('age', { document, adult: true }), reviewAge: (id, decision, note, adult) => write('review', { id, decision, note, adult }),
        stories: () => snapshot.community.stories.filter(visible), story: id => snapshot.community.stories.find(s => s.id === id),
        canViewStory: s => !!s && s.available !== false && canRead(s) && (visible(s) || !!s.highlights?.length || s.creatorId === 'demo'), publishStory: (text, media, visibility) => write('publish-story', { text, media, visibility }),
        highlights: () => snapshot.community.highlights || [],
        archive: () => snapshot.community.stories.filter(s => s.creatorId === 'demo'),
        deleteStory: id => write('delete-story', { id }),
        markStorySeen: id => write('story-seen', { id }), toggleStoryLike: id => write('story-like', { id }), replyStory: (id, text) => write('story-reply', { id, text })
    };
    // Poll received activity without rewriting a post draft or replacing an open conversation.
    let polling = false;
    setInterval(async () => {
        if (document.hidden || polling || !FansxeAuth.session()) return; polling = true;
        try {
            await queue; const next = await FansxeAPI('state');
            const changed = JSON.stringify(snapshot.state.conversations) !== JSON.stringify(next.state.conversations) || JSON.stringify(snapshot.community.requests) !== JSON.stringify(next.community.requests) || JSON.stringify(snapshot.community.stories) !== JSON.stringify(next.community.stories) || JSON.stringify(snapshot.data.notifications) !== JSON.stringify(next.data.notifications);
            const incoming=Object.values(next.state.conversations).flatMap(c=>c.messages.filter(m=>m.senderId!=='demo'&&!m.read&&!Object.values(snapshot.state.conversations).some(old=>old.messages.some(x=>x.id===m.id))));
            apply(next); if(incoming.length && !incoming.every(m=>window.FansxeChat?.activeUser===m.senderId && document.body.dataset.page==='mensajes' && !window.FansxeApp?.activeModal)) window.FansxeApp?.notify('Tienes '+incoming.length+' mensaje'+(incoming.length===1?' nuevo':'s nuevos')+' en tus conversaciones.');
            if (changed) window.dispatchEvent(new CustomEvent('fansxe:change', { detail: { action: 'poll' } }));
        } catch {} finally { polling = false; }
    }, 10000);
})();

(() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const paths = {
        eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12zm10-3a3 3 0 100 6 3 3 0 000-6',
        trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
        gem: 'M6 3h12l5 7-11 12L1 10l5-7zM1 10h22M6 3l6 19 6-19',
        heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        comment: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        coin: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
        send: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
        photo: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M15 7h.01',
        check: 'M5 12l4 4L19 6',
        close: 'M6 6l12 12M6 18L18 6',
        edit: 'M12 20H4v-8L16 0l8 8L12 20zM14 2l8 8',
        people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-2a7 7 0 0114 0v2M16 3a4 4 0 010 8M19 15a5 5 0 013 4v2'
    };
    const icon = (name, filled = false) => `<svg class="icon" aria-hidden="true" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${paths[name] || paths.comment}"></path></svg>`;
    const number = n => new Intl.NumberFormat('es-MX').format(n);
    const relativeTime = value => {
        const date = new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d /.test(value) ? value.replace(' ', 'T') + 'Z' : value);
        if (!Number.isFinite(date.getTime())) return '';
        const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'Ahora';
        if (seconds < 3600) { const n = Math.floor(seconds / 60); return `Hace ${n} ${n === 1 ? 'minuto' : 'minutos'}`; }
        if (seconds < 86400) { const n = Math.floor(seconds / 3600); return `Hace ${n} ${n === 1 ? 'hora' : 'horas'}`; }
        const days = Math.floor(seconds / 86400);
        if (days === 1) return 'Ayer';
        if (days < 7) return `Hace ${days} días`;
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
    };
    const timeLabel = (value, fallback = '') => value ? `<time data-time="${escape(value)}">${escape(relativeTime(value))}</time>` : escape(fallback);
    const refreshTimes = () => document.querySelectorAll('[data-time]').forEach(el => { const raw = el.dataset.time; el.textContent = relativeTime(/^\d+$/.test(raw) ? Number(raw) : raw); });
    const profileUrl = id => `perfil.html?user=${encodeURIComponent(id)}`;
    function avatar(user, extra = '') {
        user ||= { name: 'Usuario', id: 'unknown' };
        const attrs = user.avatarAsset ? `data-asset="${escape(user.avatarAsset)}"` : user.avatar ? `src="${escape(user.avatar)}"` : '';
        return attrs ? `<img class="avatar object-cover ${extra}" ${attrs} alt="Foto de ${escape(user.name)}" loading="lazy">` : `<span class="avatar tone-${escape(user.id)} ${extra}" aria-label="${escape(user.name)}">${escape(user.name.slice(0, 2))}</span>`;
    }
    function richText(text) {
        const token = /([#@][\p{L}\p{N}_]+)/gu;
        let result = '', start = 0;
        for (const match of text.matchAll(token)) {
            result += escape(text.slice(start, match.index));
            const word = match[0], value = word.slice(1);
            const user = word[0] === '@' && FansxeStore.users().find(u => u.handle.toLowerCase() === value.toLowerCase());
            result += user ? `<a class="text-link" href="${profileUrl(user.id)}">${escape(word)}</a>` : word[0] === '#' ? `<a class="text-link" href="inicio.html?tag=${encodeURIComponent(value)}">${escape(word)}</a>` : escape(word);
            start = match.index + word.length;
        }
        return result + escape(text.slice(start));
    }
    function video(source) {
        return `<div class="video-player"><video ${source} controls playsinline muted preload="metadata"></video><button type="button" class="video-center-play" aria-label="Reproducir video" hidden>▶</button><div class="player-controls" hidden><input type="range" min="0" max="0" step="0.1" value="0" data-video="seek" aria-label="Posición del video"><div class="player-buttons"><button type="button" data-video="play" aria-label="Reproducir video">▶</button><span class="player-time">0:00 / 0:00</span><button type="button" data-video="mute">Silenciar</button><input type="range" min="0" max="1" value="1" step="0.05" data-video="volume" aria-label="Volumen"><select data-video="speed" aria-label="Velocidad"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="0.5">0.5×</option></select><button type="button" data-video="fullscreen" aria-label="Pantalla completa">⛶</button></div></div><p class="player-status" role="status"></p></div>`;
    }
    function media(items = []) {
        return `<div class="media-gallery">${items.map(a => a.kind === 'video' ? video(`data-asset="${escape(a.id)}"`) : `<button class="gallery-image" data-action="asset-photo" data-asset-id="${escape(a.id)}" aria-label="Ampliar ${escape(a.name)}"><img data-asset="${escape(a.id)}" alt="${escape(a.name)}" loading="lazy"></button>`).join('')}</div>`;
    }
    function comment(c) {
        const user = c.userId ? FansxeStore.user(c.userId) : null;
        const author = user?.name || c.author || 'Usuario';
        const picture = avatar(user || { id: c.userId || 'unknown', name: author });
        const url = c.userId ? profileUrl(c.userId) : null;
        return `<div class="comment">${url ? `<a class="comment-profile" href="${url}" aria-label="Ver perfil de ${escape(author)}">${picture}</a>` : picture}<p>${url ? `<a class="comment-author" href="${url}"><strong>${escape(author)}</strong></a>` : `<strong>${escape(author)}</strong>`} ${richText(c.text)}</p></div>`;
    }
    function post(p, expanded = false) {
        const store = FansxeStore, creator = store.user(p.creatorId), readable = store.canRead(p), subscriptionAvailable = !!creator?.privateAllowed || creator?.creatorStatus === 'approved', liked = store.state.likes[p.id] === true;
        const comments = [...p.comments, ...(store.state.comments[p.id] || [])];
        let attachment = '';
        if (!readable && window.FansxeBoot && !subscriptionAvailable) attachment = '<div class="locked-media"><strong>Contenido privado</strong><span>Suscríbete para poder verlo cuando este perfil habilite suscripciones.</span></div>';
        else if (!readable) attachment = `<button class="locked-media" data-action="subscribe" data-creator="${p.creatorId}"><span class="lock-badge">${icon('lock')}</span><strong>Contenido Exclusivo</strong><span>Suscríbete a ${escape(creator.name)} para ver esta publicación.</span><span class="button-primary">${window.FansxeBoot?.billing ? 'Desbloquear · $' + (creator.subscriptionMxn/100).toFixed(2) + ' MXN / mes' : window.FansxeBoot ? 'Desbloquear · ' + number(creator.subscriptionGems) + ' gemas / mes' : 'Desbloquear · $4.99 / mes'}</span></button>`;
        else if (p.media?.length) attachment = media(p.media);
        else if (p.image) attachment = `<button class="post-media" data-action="photo" data-post="${p.id}" aria-label="Ampliar: ${escape(p.alt)}"><img src="${escape(p.image)}" alt="${escape(p.alt)}" loading="lazy"></button>`;
        else if (p.demoVideo) attachment = '<div class="video-placeholder"><strong>Acceso de demostración desbloqueado</strong><span>Esta publicación de ejemplo todavía no tiene un video cargado.</span></div>';
        return `<article class="post-card" data-post="${p.id}"><div class="post-heading"><a class="author-link" href="${profileUrl(p.creatorId)}">${avatar(creator)}<span class="post-author"><strong>${escape(creator.name)} ${creator.verified ? '<span class="verified" aria-label="Verificado">' + icon('check') + '</span>' : ''}</strong><span>@${escape(creator.handle)} · ${timeLabel(p.createdAt, p.label)}</span></span></a><span class="post-kind">${p.visibility === 'public' ? 'Público' : 'Exclusivo'}</span>${p.creatorId === 'demo' ? `<button class="delete-post-button" data-action="delete-post" data-post="${p.id}" aria-label="Eliminar publicaci&#243;n">Eliminar</button>` : ''}</div><p class="post-copy">${richText(p.text)}</p>${attachment}<div class="post-actions"><div class="flex gap-1"><button class="reaction ${liked ? 'is-liked' : ''}" data-action="like" data-post="${p.id}" aria-label="Me gusta" aria-pressed="${liked}" ${readable ? '' : 'disabled'}>${icon('heart', liked)}<span>${number(p.likes + (liked ? 1 : 0))}</span></button><button class="reaction" data-action="comments" data-post="${p.id}" aria-label="Comentarios" aria-expanded="${expanded}" aria-controls="comments-${p.id}" ${readable ? '' : 'disabled'}>${icon('comment')}<span>${number(comments.length)}</span></button></div>${p.creatorId === 'demo' || (window.FansxeBoot && !creator.privateAllowed && creator.creatorStatus !== 'approved') ? '' : `<button class="tip-button" data-action="tip" data-creator="${p.creatorId}" data-post="${p.id}" aria-label="Enviar propina">${icon('coin')}<span>Propina</span></button>`}</div>${readable ? `<section id="comments-${p.id}" class="post-comments" ${expanded ? '' : 'hidden'}><div class="comment-list">${comments.length ? comments.map(comment).join('') : '<p class="text-sm text-vip-gray py-2">Sé el primero en comentar.</p>'}</div><form class="comment-form" data-post="${p.id}"><label class="sr-only" for="comment-input-${p.id}">Escribe un comentario</label><input id="comment-input-${p.id}" name="comment" maxlength="1000" required placeholder="Escribe un comentario..." autocomplete="off"><button type="submit" class="button-primary" aria-label="Enviar comentario">${icon('send')}</button></form></section>` : ''}</article>`;
    }
    function profile(user, filter = 'todo') {
        const own = user.id === 'demo', store = FansxeStore;
        const cover = user.coverAsset ? `data-asset="${escape(user.coverAsset)}"` : user.cover ? `src="${escape(user.cover)}"` : '';
        const count = user.postCount ?? store.posts().filter(p => p.creatorId === user.id).length;
        const followers = user.followers + (!own && store.state.following[user.id] ? 1 : 0);
        return `<div class="profile-cover tone-${user.id}">${cover ? `<button data-action="profile-photo" data-user="${user.id}" data-field="cover" aria-label="Ampliar portada"><img ${cover} alt="Portada de ${escape(user.name)}"></button>` : '<span>Tu espacio, tus historias.</span>'}</div><section class="profile-info"><div class="profile-top"><button class="profile-avatar-button" data-action="${own ? 'edit-profile' : 'profile-photo'}" data-user="${user.id}" data-field="avatar" aria-label="${own ? 'Editar mi perfil' : 'Ampliar foto de perfil'}">${avatar(user, 'profile-avatar')}</button><div class="profile-actions"><button class="button-secondary" data-action="share-profile" data-user="${user.id}" aria-label="Copiar enlace del perfil">Compartir</button>${own ? '<button class="button-primary" data-action="edit-profile">Editar perfil</button>' : `<button class="button-secondary" data-action="message" data-user="${user.id}" aria-label="Mensaje a ${escape(user.name)}">${icon('comment')}</button><button class="button-secondary ${store.state.following[user.id] ? 'is-following' : ''}" data-action="follow" data-creator="${user.id}" aria-pressed="${!!store.state.following[user.id]}"><span class="follow-text">${store.state.following[user.id] ? 'Siguiendo' : 'Seguir'}</span></button>`}</div></div><h2 class="text-2xl font-bold">${escape(user.name)} ${user.plus ? '<span class="plus-badge">PLUS</span>' : ''} ${user.verified ? '<span class="verified">' + icon('check') + '</span>' : ''}</h2><p class="text-sm text-vip-gray">@${escape(user.handle)} ${FansxeData.followers.includes(user.id) ? '<span class="follows-you">Te sigue</span>' : ''}</p><p class="profile-bio">${richText(user.bio || 'Un nuevo espacio por descubrir.')}</p>${user.location ? `<p class="text-sm text-vip-gray mb-4">${escape(user.location)}</p>` : ''}<div class="profile-stats"><span><strong>${number(count)}</strong> publicaciones</span><button data-action="people" data-list="followers" data-user="${user.id}"><strong>${number(followers)}</strong> seguidores</button>${own ? `<button data-action="people" data-list="following" data-user="demo"><strong>${Object.values(store.state.following).filter(Boolean).length}</strong> siguiendo</button>` : ''}</div>${own || (window.FansxeBoot && !user.privateAllowed) ? '' : `<button class="subscribe-wide" data-action="subscribe" data-creator="${user.id}">${store.state.subscriptions[user.id] ? 'Suscripción activa' : window.FansxeBoot?.billing ? (user.trialDays ? 'Prueba de '+user.trialDays+' días · Después ' : 'Suscribirse · ') + '$'+(user.subscriptionMxn/100).toFixed(2)+' MXN / mes' : window.FansxeBoot ? 'Suscribirse · ' + number(user.subscriptionGems) + ' gemas / mes' : 'Suscribirse y desbloquear · $4.99 / mes'}</button>`}<div id="profile-badges"></div></section>${tabs(own ? [['todo', 'Publicaciones'], ['fotos', 'Fotos'], ['videos', 'Videos'], ['likes', 'Me gusta']] : [['todo', 'Todo'], ['fotos', 'Fotos'], ['videos', 'Videos']], filter)}<div id="feed" class="feed-list"></div>`;
    }
    function tabs(items, active = 'todo') { return `<div class="feed-tabs" role="group" aria-label="Filtrar publicaciones">${items.map(([id, label]) => `<button class="feed-tab ${id === active ? 'active' : ''}" data-filter="${id}" aria-pressed="${id === active}">${label}</button>`).join('')}</div>`; }
    function person(user, action = 'message') { return `<div class="person-row"><a class="author-link" href="${profileUrl(user.id)}">${avatar(user)}<span><strong>${escape(user.name)}</strong><small>@${escape(user.handle)}${FansxeData.followers.includes(user.id) ? ' · Te sigue' : ''}</small></span></a><button class="button-secondary" data-action="${action}" data-user="${user.id}" data-creator="${user.id}">${action === 'follow' ? (FansxeStore.state.following[user.id] ? 'Siguiendo' : 'Seguir') : 'Conversar'}</button></div>`; }
    window.FansxeComponents = { escape, icon, number, relativeTime, timeLabel, refreshTimes, comment, post, avatar, media, video, richText, profile, profileUrl, tabs, person };
})();

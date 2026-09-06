(() => {
    if (!window.FansxeBoot) return;
    const set = (selector, text) => { const el = document.querySelector(selector); if (el) el.textContent = text; };
    set('.app-main > .demo-banner', FansxeBoot.guest ? 'Explora publicaciones públicas. Crea una cuenta para participar.' : 'Tu comunidad en Fansxe');
    set('#deletePostModal p', 'Se eliminarán la publicación, sus comentarios y reacciones. No puedes deshacerlo.');
    set('.notification-toolbar + .field-help', 'Actividad reciente de tu comunidad.');
    if (document.body.dataset.page === 'configuracion') {
        set('#seguridad > .field-help', 'Usa una contraseña única. Al cambiarla se cerrarán tus otras sesiones.');
        set('#password-form .field-help', 'De 8 a 128 caracteres.');
        set('#password-form button[type="submit"]', 'Guardar contraseña');
        set('#edad > .demo-banner', 'El documento se guarda de forma privada y solo puede revisarlo el equipo administrador.');
        set('#email-form .field-help', 'Este correo también se utiliza para iniciar sesión.');
        document.querySelector('#email-form button').insertAdjacentHTML('beforebegin', '<label class="form-label" for="email-current">Contraseña actual</label><input class="text-field" id="email-current" name="current" type="password" autocomplete="current-password" required maxlength="128">');
    }
    set('.admin-intro .demo-banner', 'Revisión manual de mayoría de edad. Solo las cuentas administradoras pueden acceder.');
    document.querySelectorAll('a[href="admin.html"]').forEach(el => {
        if (FansxeBoot.session?.role !== 'admin') el.remove(); else el.textContent = 'Administración';
    });
    const refresh = () => {
        set('.chat-local-note', 'Mensajes privados · Las respuestas se actualizan automáticamente.');
        document.querySelectorAll('.notification-row small').forEach(el => { el.textContent = el.textContent.replace(' · Ejemplo', ''); });
    };
    refresh(); window.addEventListener('fansxe:change', refresh); document.addEventListener('click', () => setTimeout(refresh, 0));
    if (FansxeBoot.guest) {
        const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
        document.getElementById('modals-slot').insertAdjacentHTML('beforeend', `<div id="guestModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="guestModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="guest-title" tabindex="-1"><h2 id="guest-title" class="text-xl font-bold">Forma parte de Fansxe</h2><p class="my-4">Crea tu cuenta para reaccionar, seguir personas, publicar y conversar.</p><div class="form-footer"><a class="button-secondary" href="login.html?next=${next}">Iniciar sesión</a><a class="button-primary" href="registro.html?next=${next}">Crear cuenta</a><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></div></section></div>`);
        window.FansxeRequireAccount = () => FansxeApp.openModal('guestModal');
        document.getElementById('account-link').href = 'registro.html';
        document.getElementById('account-link').innerHTML = '<span class="text-link">Únete</span>';
        document.querySelectorAll('a[href="perfil.html?user=demo"]').forEach(a => { a.href = 'login.html'; });
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-action],[data-feature],[data-commerce]'); if (!button) return;
            const allowed = ['comments','photo','asset-photo','profile-photo','share-profile','discover','discover-more','load-more','people','close-modal'];
            if ((button.dataset.action && !allowed.includes(button.dataset.action)) || button.dataset.feature || button.dataset.commerce) { event.preventDefault();event.stopImmediatePropagation();FansxeRequireAccount(); }
        }, true);
        document.addEventListener('submit', event => { if(event.target.closest('.app-main, .app-modal')) { event.preventDefault();event.stopImmediatePropagation();FansxeRequireAccount(); } }, true);
    }
})();

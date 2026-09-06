(() => {
    if (!window.FansxeBoot) return;
    const set = (selector, text) => { const el = document.querySelector(selector); if (el) el.textContent = text; };
    set('.app-main > .demo-banner', 'Tu comunidad en Fansxe · Pagos todavía no habilitados');
    set('#deletePostModal p', 'Se eliminarán la publicación, sus comentarios y reacciones. No puedes deshacerlo.');
    set('.notification-toolbar + .field-help', 'Actividad reciente de tu comunidad.');
    if (document.body.dataset.page === 'configuracion') {
        set('#seguridad > .field-help', 'Usa una contraseña única. Al cambiarla se cerrarán tus otras sesiones.');
        set('#password-form .field-help', 'De 10 a 128 caracteres.');
        set('#password-form button[type="submit"]', 'Guardar contraseña');
        set('#edad > .demo-banner', 'El documento se guarda de forma privada y solo puede revisarlo el equipo administrador.');
        set('#email-form .field-help', 'Este correo también se utiliza para iniciar sesión.');
        document.querySelector('#email-form button').insertAdjacentHTML('beforebegin', '<label class="form-label" for="email-current">Contraseña actual</label><input class="text-field" id="email-current" name="current" type="password" autocomplete="current-password" required maxlength="128">');
    }
    set('.admin-intro .demo-banner', 'Revisión manual de mayoría de edad. Solo las cuentas administradoras pueden acceder.');
    document.querySelectorAll('a[href="admin.html"]').forEach(el => {
        if (FansxeBoot.session.role !== 'admin') el.remove(); else el.textContent = 'Administración';
    });
    const refresh = () => {
        set('.chat-local-note', 'Mensajes privados · Las respuestas se actualizan automáticamente.');
        document.querySelectorAll('.notification-row small').forEach(el => { el.textContent = el.textContent.replace(' · Ejemplo', ''); });
    };
    refresh(); window.addEventListener('fansxe:change', refresh); document.addEventListener('click', () => setTimeout(refresh, 0));
})();

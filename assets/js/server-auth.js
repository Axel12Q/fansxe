// Server pages inject only the current account's public state and a CSRF token.
(() => {
    let csrf = FansxeBoot.csrf;
    window.FansxeAPI = async (action, data, raw = false) => {
        const response = await fetch('/api/index.php?action=' + encodeURIComponent(action), {
            method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
            headers: data === undefined ? {} : raw ? { 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: data === undefined ? undefined : raw ? data : JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'No se pudo completar la operación.');
        if (result.csrf || result.snapshot?.csrf) csrf = result.csrf || result.snapshot.csrf;
        return result;
    };
    const destination = () => { const next = new URLSearchParams(location.search).get('next'); return next && /^(inicio|perfil|mensajes|notificaciones|configuracion|admin|gemas|creador)\.html(?:\?[^#]*)?$/.test(next) ? next : 'inicio.html'; };
    window.FansxeAuth = {
        session: () => FansxeBoot.session, destination,
        async logout() { try { await FansxeAPI('logout', {}); location.href = 'login.html'; } catch (e) { window.FansxeApp?.notify(e.message); } }
    };
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('auth-form'), status = document.getElementById('auth-status');
        if (!form) return;
        document.querySelector('.auth-demo').textContent = 'Tu cuenta y tus archivos se guardan en Fansxe. Puedes entrar con tus datos o con Google.';
        const token = new URLSearchParams(location.search).get('token');
        if (form.dataset.mode === 'recovery' && token) {
            form.dataset.mode = 'reset';
            form.innerHTML = '<label class="form-label" for="auth-password">Nueva contraseña</label><input id="auth-password" name="password" class="text-field" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><label class="form-label" for="auth-confirm">Repetir contraseña</label><input id="auth-confirm" name="confirm" class="text-field" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><button class="public-primary auth-submit" type="submit">Guardar contraseña</button>';
        }
        document.querySelector('[data-password-toggle]')?.addEventListener('click', e => { const field = form.elements.password; field.type = field.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = field.type === 'password' ? 'Mostrar' : 'Ocultar'; });
        form.addEventListener('submit', async event => {
            event.preventDefault(); const button = form.querySelector('[type="submit"]'); if (button.disabled) return;
            button.disabled = true; status.textContent = 'Un momento…';
            try {
                const data = Object.fromEntries(new FormData(form)); data.adult = !!form.elements.adult?.checked; if (token) data.token = token;
                const result = await FansxeAPI(form.dataset.mode, data);
                if (['recovery', 'reset'].includes(form.dataset.mode)) { status.textContent = result.message; form.reset(); }
                else location.href = destination();
            } catch (error) { status.textContent = error.message; }
            finally { button.disabled = false; }
        });
    });
})();

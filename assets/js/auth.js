// Demonstration only: local accounts share the existing local social dataset.
(() => {
    const key = 'fansxe.accounts.v1', sessionKey = 'fansxe.session.v1';
    const pages = ['inicio.html', 'perfil.html', 'mensajes.html', 'notificaciones.html', 'configuracion.html'];
    const accountList = () => { try { const list = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
    const hex = buffer => [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, '0')).join('');
    async function hash(password, salt) {
        const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
        return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(salt.match(/../g).map(n => parseInt(n, 16))), iterations: 210000, hash: 'SHA-256' }, imported, 256));
    }
    function session() { try { const value = JSON.parse(sessionStorage.getItem(sessionKey)); return value && typeof value.email === 'string' && value.expiresAt > Date.now() ? value : null; } catch { return null; } }
    function start(email, name) { sessionStorage.setItem(sessionKey, JSON.stringify({ email, name, expiresAt: Date.now() + 86400000 })); }
    function destination() { const next = new URLSearchParams(location.search).get('next'); return next && pages.includes(next.split('?')[0]) ? next : 'inicio.html'; }
    window.FansxeAuth = {
        session, destination,
        async login(email, password) {
            email = email.trim().toLowerCase();
            if (email === 'admin') {
                let credential = null; try { credential = JSON.parse(localStorage.getItem('fansxe.community.v1') || '{}').password; } catch {}
                const valid = credential ? await hash(password, credential.salt) === credential.hash : password === 'admin';
                if (valid) start('admin', 'Administrador');
                return valid;
            }
            const account = accountList().find(a => a.email === email);
            if (!account || await hash(password, account.salt) !== account.hash) return false;
            start(email, account.name); return true;
        },
        async register(name, email, password, confirm, adultConfirmed = false) {
            if (adultConfirmed !== true) return 'age-required';
            email = email.trim().toLowerCase(); name = name.trim();
            if (!name || name.length > 60 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128 || password !== confirm) return 'invalid';
            if (accountList().some(a => a.email === email)) return 'duplicate';
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), digest = await hash(password, salt);
            const list = accountList(); if (list.some(a => a.email === email)) return 'duplicate';
            list.push({ name, email, salt, hash: digest, adultDeclaredAt: Date.now() }); localStorage.setItem(key, JSON.stringify(list)); start(email, name); return 'success';
        },
        async changePassword(current, password, confirm) {
            if (password.length < 10 || password.length > 128 || password !== confirm) return 'invalid';
            const email = session()?.email, previous = accountList().find(a => a.email === email);
            if (!previous || await hash(current, previous.salt) !== previous.hash) return 'incorrect';
            const salt = hex(crypto.getRandomValues(new Uint8Array(16))), digest = await hash(password, salt);
            const list = accountList(), account = list.find(a => a.email === email);
            if (!account || account.hash !== previous.hash) return 'retry';
            account.salt = salt; account.hash = digest;
            try { localStorage.setItem(key, JSON.stringify(list)); return 'success'; } catch { return 'storage'; }
        },
        logout() { sessionStorage.removeItem(sessionKey); location.href = 'login.html'; }
    };
    const filename = location.pathname.split('/').pop();
    if (pages.includes(filename) && !session()) { document.documentElement.dataset.locked = 'true'; location.replace('login.html?next=' + encodeURIComponent(filename + location.search)); }
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('auth-form'), status = document.getElementById('auth-status');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = 'true';
        document.querySelector('[data-google]')?.addEventListener('click', () => { status.textContent = 'Google todavía no está conectado. Usa el acceso de prueba o crea una cuenta local.'; });
        document.querySelector('[data-password-toggle]')?.addEventListener('click', event => { const input = form.elements.password; input.type = input.type === 'password' ? 'text' : 'password'; event.currentTarget.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar'; });
        form.addEventListener('submit', async event => {
            event.preventDefault(); const button = form.querySelector('[type="submit"]'); if (button.disabled) return;
            button.disabled = true; status.textContent = 'Un momento…';
            try {
                const mode = form.dataset.mode;
                if (mode === 'recovery') { status.textContent = 'Solicitud de prueba preparada. No se ha enviado ningún correo: la recuperación se conectará al servidor de correo con el backend.'; return; }
                if (mode === 'register') {
                    const result = await FansxeAuth.register(form.elements.name.value, form.elements.email.value, form.elements.password.value, form.elements.confirm.value, form.elements.adult.checked);
                    if (result === 'age-required') { status.textContent = 'Debes confirmar que tienes 18 años o más para crear tu cuenta.'; return; }
                    if (result !== 'success') { status.textContent = result === 'duplicate' ? 'Ese correo ya tiene una cuenta local.' : 'Revisa tus datos. Las contraseñas deben coincidir y tener al menos 10 caracteres.'; return; }
                } else if (!await FansxeAuth.login(form.elements.email.value, form.elements.password.value)) { status.textContent = 'Usuario o contraseña incorrectos.'; return; }
                location.href = destination();
            } catch { status.textContent = 'No se pudo guardar la sesión. Comprueba el almacenamiento y usa localhost o HTTPS.'; }
            finally { button.disabled = false; }
        });
    });
})();

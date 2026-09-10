// Shared desktop and mobile navigation.
window.FansxeLayout = {
sidebar: `
<aside class="hidden md:flex flex-col w-64 sticky top-8 h-[calc(100vh-4rem)] z-30">
            <div class="bg-white rounded-3xl border border-vip-border shadow-xl p-6 flex-1 flex flex-col">
                <div class="flex items-center gap-2 mb-8 cursor-pointer" onclick="window.location.href='inicio.html'">
                    <div class="w-10 h-10 bg-vip-primary rounded-xl flex items-center justify-center text-white font-bold text-xl">F</div>
                    <h1 class="text-xl font-bold text-vip-dark">Fansxe</h1>
                </div>

                <nav class="flex flex-col gap-2 flex-1">
                    <!-- Todos inactivos porque estamos en el perfil de alguien más -->
                    <a href="inicio.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg hover:text-vip-dark p-3 rounded-xl font-medium transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                        Inicio
                    </a>
                    <a href="#" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg hover:text-vip-dark p-3 rounded-xl font-medium transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                        Notificaciones
                    </a>
                    <a href="mensajes.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg hover:text-vip-dark p-3 rounded-xl font-medium transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        Mensajes
                    </a>
                    <a href="#" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg hover:text-vip-dark p-3 rounded-xl font-medium transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        Mi Perfil
                    </a>
                    <button onclick="openModal('rechargeModal')" class="flex w-full items-center gap-3 text-vip-gray hover:bg-yellow-50 hover:text-yellow-600 p-3 rounded-xl font-medium transition border-t border-vip-border mt-2 pt-4">
                        <svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Recargar Monedas
                    </button>
                </nav>

                <div class="mt-auto">
                    <button onclick="window.location.href='inicio.html'" class="w-full bg-vip-dark text-white font-semibold py-3 rounded-xl hover:bg-vip-primary transition-colors shadow-lg flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        Nuevo Post
                    </button>
                </div>
            </div>
        </aside>`,
mobile: `
    <!-- Mobile Nav (Fansxe) con Botón Menú -->
    <div class="md:hidden fixed bottom-4 w-full px-4 z-40">
        <nav class="bg-vip-dark text-white rounded-2xl shadow-2xl flex justify-around p-3 items-center border border-white/10 backdrop-blur-lg">
            <button onclick="window.location.href='inicio.html'" class="p-2 text-white/60 hover:text-white transition rounded-xl"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></button>
            <button onclick="window.location.href='inicio.html'" class="p-2 bg-vip-primary text-white rounded-xl shadow-lg transform -translate-y-2"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></button>
            <button onclick="window.location.href='mensajes.html'" class="p-2 text-white/60 hover:text-white transition relative">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                <span class="absolute top-2 right-2 w-2 h-2 bg-pink-500 rounded-full ring-2 ring-vip-dark"></span>
            </button>
            <!-- Botón de Menú Hamburguesa -->
            <button onclick="openDrawer()" class="p-2 text-white/60 hover:text-white transition"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
        </nav>
    </div>

    <!-- Menú Lateral Móvil (Drawer) -->
    <div id="mobileDrawer" class="fixed inset-0 z-[150] hidden">
        <div class="absolute inset-0 bg-vip-dark/70 backdrop-blur-sm transition-opacity" onclick="closeDrawer()"></div>
        <div class="absolute top-0 right-0 w-64 h-full bg-white shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col p-6" id="mobileDrawerContent">
            <div class="flex justify-between items-center mb-8">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-vip-primary rounded-lg flex items-center justify-center text-white font-bold">F</div>
                    <h2 class="text-lg font-bold text-vip-dark">Fansxe</h2>
                </div>
                <button onclick="closeDrawer()" class="text-vip-gray hover:text-vip-dark"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>

            <nav class="flex flex-col gap-2">
                <a href="inicio.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg p-3 rounded-xl font-medium transition">Inicio</a>
                <a href="notificaciones.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg p-3 rounded-xl font-medium transition">Notificaciones</a>
                <a href="mensajes.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg p-3 rounded-xl font-medium transition">Mensajes</a>
                <a href="perfil.html" class="flex items-center gap-3 text-vip-gray hover:bg-vip-bg p-3 rounded-xl font-medium transition">Mi Perfil</a>
                <button onclick="closeDrawer(); setTimeout(()=>openModal('rechargeModal'), 300)" class="flex items-center gap-3 text-vip-gray hover:bg-yellow-50 hover:text-yellow-600 p-3 rounded-xl font-medium transition border-t border-vip-border mt-2 pt-4">
                    Recargar Monedas
                </button>
            </nav>
        </div>
    </div>


`
};

// Demo records. Replace the store adapter with PHP API calls when a backend exists.
window.FansxeData = {
    viewer: { id: 'demo', name: 'Alex' },
    followers: ['luna'],
    creators: {
        oficial: {
            id: 'oficial', name: 'Creador Oficial', handle: 'creador_oficial', followers: 34000,
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
            subscriptionCents: 499, verified: true,
            bio: 'Fotos, viajes y momentos detrás de cámara. Bienvenido a mi espacio ✨',
            cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2000&auto=format&fit=crop',
            location: 'Ciudad de México'
        },
        demo: { id: 'demo', name: 'Alex', handle: 'alex', followers: 1, bio: 'Este es mi espacio para compartir lo que me inspira.', location: '', subscriptionCents: 499 },
        luna: { id: 'luna', name: 'Luna Torres', handle: 'luna_crea', followers: 824, bio: 'Ilustración, música y un poco de la vida cotidiana. 🌙', location: 'Guadalajara', subscriptionCents: 499 },
        diego: { id: 'diego', name: 'Diego Ruiz', handle: 'diego_explora', followers: 2150, bio: 'Caminatas, fotografía y nuevas historias por contar.', location: 'Monterrey', subscriptionCents: 499 }
    },
    notifications: [
        { id: 'n-follow', userId: 'luna', kind: 'follow', text: 'comenzó a seguirte.', time: 'Hace 15 min' },
        { id: 'n-like', userId: 'diego', kind: 'like', text: 'reaccionó a una publicación.', time: 'Ayer' },
        { id: 'n-mention', userId: 'oficial', kind: 'mention', text: 'te mencionó en una conversación.', time: 'Ayer' }
    ],
    posts: [
        { id: 'playa', creatorId: 'oficial', type: 'fotos', visibility: 'public',
          text: '¡Buenos días! Ya está disponible el nuevo set de fotos en la playa 🌊🌴',
          label: 'Hace 2 horas', likes: 1200,
          image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
          alt: 'Olas del mar en una playa de arena blanca',
          comments: [{ id: 'seed-1', author: 'User123', text: '¡Me encanta! 😍' }] },
        { id: 'luna-estudio', creatorId: 'luna', type: 'texto', visibility: 'public', text: 'Hoy toca abrir el cuaderno y dejar que las ideas fluyan. ¿Qué están creando ustedes? #ProcesoCreativo #Arte', label: 'Hace 3 horas', likes: 86, comments: [] },
        { id: 'diego-ruta', creatorId: 'diego', type: 'texto', visibility: 'public', text: 'Armando la ruta del fin de semana. @luna_crea, lleva tu cuaderno: habrá mucho que dibujar. #Comunidad #Aventura', label: 'Hace 5 horas', likes: 142, comments: [] },
        { id: 'sesion', creatorId: 'oficial', type: 'videos', visibility: 'subscribers',
          text: 'Video exclusivo de la sesión de anoche 🤫🔥 Solo para suscriptores.',
          label: 'Ayer', likes: 2400, comments: [], demoVideo: true }
    ]
};

# Fansxe

**Versión conectada:** el despliegue en IONOS usa PHP 8.4, MariaDB y Stripe en modo de prueba. Consulta [SERVER.md](SERVER.md) y [BILLING.md](BILLING.md) para acceso, credenciales, migraciones, despliegue, suscripciones, comisiones y retiros. La demo estática se conserva solo como respaldo visual cuando se abren los HTML sin PHP.

Prototipo de una red social para creadores. HTML, CSS y JavaScript sin framework de aplicación ni paso de compilación. Conserva el diseño de `perfil.html`.

## Páginas

- `index.html`: presentación pública con imágenes, animaciones y acceso al registro y al inicio de sesión.
- `login.html`, `registro.html`, `recuperar.html`: acceso local, registro y diseño de recuperación de contraseña. Acceso inicial: usuario `admin`, contraseña `admin`.
- `inicio.html`: feed de varios autores, búsqueda, filtros, seguimiento, likes, comentarios y publicaciones con texto, fotos y videos. Los hashtags filtran el feed y las menciones enlazan a perfiles. Inicio y perfiles cargan bloques de seis publicaciones al desplazarse, con botón alternativo. Puedes eliminar tus publicaciones con confirmación.
- `perfil.html` o `perfil.html?user=demo`: tu cuenta local, con edición de nombre, usuario, biografía, ubicación, foto y portada; pestañas de publicaciones, fotos, videos y Me gusta.
- `perfil.html?user=luna` (también `oficial` y `diego`): la misma plantilla para perfiles ajenos, con seguimiento, mensajes y suscripción. No tienen controles de edición.
- `mensajes.html`: conversaciones locales con personas que sigues o te siguen; texto, fotos, videos, vistas previas e historial persistente. `?user=luna` abre una conversación concreta.
- `notificaciones.html`: actividad de ejemplo; cada notificación se marca como leída al abrirla, además de la acción de marcar todas.
- `configuracion.html`: correo local, enlace a datos del perfil, contraseña de prueba, modo oscuro y verificación de edad.
- `admin.html`: revisión manual de solicitudes de edad. Está abierto sin contraseña por diseño en esta demo.

## Estructura compartida

- `assets/css/styles.css`: colores globales en `:root`, estilos, componentes y adaptación móvil.
- `assets/css/public.css`, `assets/js/public.js`: presentación y adaptación de animaciones a movimiento reducido.
- `assets/js/auth.js`, `assets/js/auth-page.js`: sesión local, contraseñas derivadas, redirecciones internas y formularios de acceso.
- `assets/js/theme.js`: conecta esos colores con Tailwind. El CDN original de Tailwind y Google Fonts requieren conexión a internet.
- `assets/js/layout.js`: navegación de escritorio y móvil, extraída del perfil original.
- `assets/js/dialogs.js`: modales y formularios compartidos.
- `assets/js/data.js`: usuarios y publicaciones de ejemplo con identificadores estables.
- `assets/js/store.js`: acciones y almacenamiento local. Este es el punto de sustitución por una API PHP; la validación de permisos y dinero deberá trasladarse al servidor.
- `assets/js/community-store.js`: preferencias de cuenta, insignias, solicitudes de edad e historias con caducidad.
- `assets/js/features.js`: vistas y formularios de Configuración, administración, insignias e historias.
- `assets/js/components.js`: tarjetas y comentarios reutilizables. Escapa el contenido del usuario antes de insertarlo en HTML.
- `assets/js/media.js`: archivos binarios en IndexedDB, reconstrucción de URLs locales y reproductor personalizado.
- `assets/js/attachments.js`: selección, previsualización, validación y retirada de adjuntos antes de guardar.
- `assets/js/chat.js`: selección de contactos, conversaciones y envío local de archivos.
- `assets/js/app.js`: inicialización de páginas, eventos, filtros y diálogos. Conserva un pequeño puente de funciones globales para el HTML original.

Los HTML cargan los scripts en el mismo orden y usan `data-page` para identificar la página. Para añadir una página, reutiliza los contenedores de navegación/modales, la hoja de estilos y la secuencia de scripts. Modifica la paleta en `:root`, no en cada página.

## Revisar localmente

Abre la carpeta con un servidor estático (por ejemplo Live Server en Visual Studio Code), o ejecuta con Python instalado:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Visita `http://127.0.0.1:8080/index.html`. Usa siempre el mismo origen/puerto: el estado de demostración se guarda por origen. Evita abrir con `file://`, donde el almacenamiento entre documentos puede comportarse de otra forma.

## Recorrido de prueba

1. En Inicio, abre los perfiles de los diferentes autores. Mi perfil siempre lleva a tu cuenta local (Alex inicialmente).
2. Edita tu nombre, foto, portada y biografía; guarda y recarga para comprobar la persistencia.
3. Publica una foto o un video con texto, #hashtags y una mención desde el selector. Revisa la vista previa, prueba quitar adjuntos y publica.
4. Abre Mi perfil y prueba sus pestañas; da like a otra publicación y búscala en Me gusta.
5. Ve a Mensajes y crea una conversación con Luna, que te sigue en la demo. Sigue a Diego para habilitarlo como contacto. Envía fotos y videos y recarga la página.
6. Selecciona un paquete de recarga y cancela: el saldo no cambia. Selecciona otro y confirma: solo entonces se añade saldo.
7. Suscríbete desde un perfil ajeno para probar acceso exclusivo. Con saldo inicial de $2.50 y una recarga de $5, la suscripción de $4.99 deja $2.51.
8. Comprueba el menú móvil y cierra los modales con Escape; Tab permanece dentro del diálogo.
9. En Editar mi perfil, si no tienes foto o portada no aparecerá el botón de quitarla. Al eliminar una imagen existente, permanecen las iniciales y el fondo predeterminado. Cancelar conserva las imágenes guardadas.
10. En Mi perfil → Insignias → Gestionar, muestra u oculta logros obtenidos. Se calculan primera publicación, primera historia, 100 y 1,000 seguidores, y perfil con foto, portada y biografía. En otros perfiles solo se ven las insignias.
11. En Configuración, cambia el tema o el correo y recarga. Para cambiar la contraseña, proporciona la actual (`admin` inicialmente para el acceso administrador). La nueva contraseña sirve para entrar a la demo. Se guarda una derivación PBKDF2 con sal aleatoria, nunca el texto original. No protege el panel de administración.
12. En Configuración → Verificación de edad, envía una imagen ficticia y consulta el estado. Abre Administración y solicita otra foto, rechaza con un motivo o aprueba confirmando haber revisado que acredita 18+. Solo la aprobación de la última solicitud habilita publicaciones e historias privadas.
13. En Inicio, crea una historia de texto, foto o video. Las historias propias pueden verse para revisarlas; las ajenas solo aparecen al seguir al autor. Una historia exclusiva además requiere suscripción. Prueba los likes y responde: aparecerá un mensaje en el chat del autor con el contexto de la historia.

Pruebas automatizadas (Node.js, dependencias exclusivamente de desarrollo):

```sh
pnpm install
pnpm test
```

## Alcance de la demo estática

La interfaz de producción sigue siendo HTML/CSS/JS estático; no necesita Node.js ni compilación en el hosting. `jsdom` y `fake-indexeddb` solo se utilizan en las pruebas. Estas comprueban las interacciones sobre documentos simulados y persistencia binaria; no sustituyen la revisión visual ni la reproducción de codecs en navegadores reales.

Todo es una simulación local: el acceso se comprueba en el navegador y las cuentas registradas comparten los datos de demostración. La sesión dura 24 horas en la pestaña. Google y recuperación por correo muestran su estado sin conexión; todavía no envían correos ni autentican con Google. El correo de Configuración es un dato del perfil y no cambia el identificador de acceso. No hay cobros, renovaciones ni entrega de mensajes a otras personas o dispositivos. Los mensajes sí se pueden redactar y conservar, con sus adjuntos, en este navegador. Los importes usan centavos enteros y se muestran en USD de demostración; la conversión a monedas queda pendiente de definir.

Una suscripción de prueba se activa una sola vez y permanece en este navegador. El post exclusivo de ejemplo no tiene un video cargado, pero puedes publicar tus propios videos. La visibilidad exclusiva es una simulación de interfaz; la protección real debe hacerse en el servidor.

Se permiten hasta cuatro adjuntos por publicación o mensaje: imágenes JPG/PNG/WebP/GIF de hasta 8 MB y videos MP4/WebM de hasta 25 MB cada uno. Se comprueba el tipo, tamaño y firma básica del archivo. La reproducción depende del codec: se recomienda MP4 H.264 o WebM compatible con el navegador. Hay mensajes de error para formatos no reproducibles y archivos que ya no están disponibles. El reproductor comparte reproducción/pausa, avance, tiempo, volumen, silencio, velocidad y pantalla completa en publicaciones, vistas previas y chat.

Las claves de datos son `fansxe.demo.v1`, `fansxe.community.v1` y `fansxe.accounts.v1` en localStorage, y `fansxe.session.v1` en sessionStorage; la base de archivos de IndexedDB es `fansxe.media`. La migración conserva las publicaciones, comentarios, likes y saldo de la primera etapa. Para reiniciar completamente la demo, elimina estos almacenamientos desde las herramientas del navegador. No usar este almacenamiento para saldos ni permisos reales. Si el navegador no puede guardar, la operación se revierte y el formulario conserva su borrador. Cambios simultáneos entre pestañas no tienen garantías transaccionales; esas garantías corresponden al futuro backend. Eliminar una publicación retira su registro, comentarios y likes; los archivos binarios permanecen localmente.

La verificación de edad es un flujo de revisión manual simulado, no un servicio de validación de identidad. Usa fotografías de documentos ficticios: se almacenan localmente y el administrador abierto puede verlas en ese mismo navegador. La casilla de mayoría de edad por sí sola no habilita contenido privado. Pendientes, solicitudes de nueva foto y rechazos mantienen el bloqueo; una respuesta con nueva imagen crea una nueva solicitud con historial. No se autentican administradores todavía.

Las historias dejan de estar disponibles exactamente a las 24 horas según el reloj del dispositivo, incluyendo likes y respuestas. Las historias de ejemplo se crean una sola vez al inicializar los datos; no se renuevan al recargar. Los registros y archivos vencidos permanecen en el almacenamiento local, aunque ya no se muestran ni permiten acciones. La eliminación física, los horarios autoritativos y la protección de acceso a archivos deberán implementarse en el backend.

Los contactos permitidos se calculan en una sola función: seguimiento saliente O entrante. Una suscripción por sí sola no permite chatear. Si deja de existir la relación, el historial sigue visible pero no permite nuevos envíos. Luna es la seguidora de ejemplo. Notificaciones contiene actividad ilustrativa, no eventos recibidos de un servidor.

Los archivos de código usan UTF-8, reforzado por `.editorconfig`; se corrigieron las cadenas que tenían `?` en lugar de tildes y símbolos.

## Hosting existente

`.github/workflows/deploy.yml` ya publica por SFTP al hacer push a `main`. Esta etapa no modifica ese flujo. Al subir el sitio deben incluirse los HTML y toda la carpeta `assets`.

## Estado conectado

La versión PHP conectada ya controla autenticación, API, base de datos, almacenamiento remoto, recargas de gemas de prueba, suscripciones, Plus, contabilidad de creadores y webhooks de Stripe. El reinicio de los saldos antiguos se hizo una sola vez con respaldo privado; no se eliminaron perfiles, publicaciones, mensajes ni verificaciones.

Para habilitar cobros reales todavía se necesita completar la revisión comercial de Stripe y definir políticas de impuestos, reembolsos, disputas y pagos manuales. No se realizan transferencias reales en la configuración actual.

## Próxima etapa

Conectar autenticación, API PHP, base de datos y almacenamiento remoto. El servidor deberá controlar autoría, permisos, relaciones, entrega de mensajes, notificaciones, suscripciones y saldo; los archivos privados solo deberán entregarse tras autorizar la solicitud.

# Fansxe en IONOS

El dominio `https://fansxe.com` usa PHP 8.4 y MariaDB. Los HTML conservan el diseño; Apache sirve las páginas de cuenta mediante `server/page.php`. Este reemplaza los adaptadores locales por `server-auth.js` y `server-store.js`. Abrir los mismos HTML con el servidor estático de Python sigue mostrando la demo local. Las nuevas pantallas comerciales necesitan PHP.

## Funciones conectadas

Registro con declaración de mayoría de edad, sesiones PHP, contraseñas Argon2id, perfiles individuales, fotos y portadas, seguidores, publicaciones públicas y privadas, likes, comentarios, eliminación propia, notificaciones, mensajes con archivos, historias de 24 horas, insignias y revisión de documentos por administradores.

El feed consulta bloques de seis registros desde la base, incluidos búsqueda y filtros. Los chats consultan actividad cada diez segundos mientras la pestaña está visible. La primera versión aún recupera el directorio de usuarios y el historial de conversaciones completo: deberán paginarse antes de escalar a una comunidad grande. Los comentarios mostrados por publicación están limitados a 200 y las notificaciones a 100.

Google está integrado mediante Firebase; los detalles aparecen al final de este documento. No existe un acceso `admin/admin` en producción. Registro solicita un username único de 3–20 caracteres ASCII (letras, números, guion bajo), además del nombre. Se admite login por correo, username o @username; las contraseñas requieren al menos 8 caracteres.

Los visitantes pueden explorar Inicio, perfiles ajenos y archivos de publicaciones públicas; las acciones de escritura y las páginas privadas exigen sesión. La sesión se recuerda durante 30 días con cookies Secure/HttpOnly/SameSite y tokens aleatorios guardados como hash en MariaDB. Puede restaurarse aunque PHP haya limpiado su sesión temporal. Logout revoca el token del dispositivo; cambiar o recuperar la contraseña revoca los anteriores.

## Pagos con Stripe en modo de prueba

Consulta [BILLING.md](BILLING.md) para suscripciones en MXN, recargas de gemas de prueba, Plus de pago único, comisiones, retiros manuales, correos y operaciones. Las recargas se procesan como pagos únicos de Stripe en modo de prueba. La verificación de identidad y la aprobación de creador se mantienen.

## Historias y experiencia móvil

Las fotos y pensamientos avanzan a los seis segundos (las fotos esperan a terminar de cargar). Los videos se reproducen al abrirse y avanzan al finalizar; si el navegador bloquea el sonido automático, se intenta reproducir silenciado y se ofrece activar sonido. Mantener pulsado pausa y oculta la interfaz; soltar reanuda. El visor contiene el video dentro de la altura visible, sin la barra de parámetros del reproductor de publicaciones.

El autor puede eliminar la historia con confirmación y consultar espectadores y likes. La lista de espectadores solo se devuelve al autor. Las propias visualizaciones y reacciones no aumentan sus estadísticas. La eliminación o caducidad bloquea el archivo aunque se conserve su URL. Las fechas recientes se presentan de forma relativa y se actualizan cada minuto.

Las reacciones y comentarios actualizan solo su tarjeta para evitar saltos de desplazamiento. Las imágenes reservan su espacio y se revelan al terminar la carga. Explorar personas añade tandas de doce perfiles con desplazamiento o botón alternativo.

## Credenciales

La configuración está exclusivamente en `/home/www/fansxe-private/config.php`, fuera de `public`, con permisos 600. Las subidas están en `/home/www/fansxe-private/media`, con directorio 700 y archivos 600. La cuenta de base proporcionada permite acceder a `dbs16096001` (sin la `b` final).

En este equipo Windows, las claves se guardaron cifradas con DPAPI en `%LOCALAPPDATA%/Fansxe/ionos.dpapi` y `admin.dpapi`. Solo la cuenta Windows que las guardó puede descifrarlas. No están en Git ni en OneDrive. Para copiar la contraseña de administración al portapapeles:

```powershell
./scripts/show-admin-password.ps1
```

Entra con usuario `admin` o correo `soporte@fansxe.com`. Puedes cambiar la contraseña desde Configuración; la copia DPAPI inicial no se actualiza automáticamente. No se reutilizó la contraseña del hosting para el administrador. Si cambias las credenciales de IONOS, actualiza también su copia local, la configuración privada y el secreto de GitHub correspondiente.

## Recuperación por correo

PHP envía desde `soporte@fansxe.com` mediante el transporte `sendmail` de IONOS. Cada enlace vence a los 30 minutos, se almacena únicamente su hash, solo puede usarse una vez y revoca las sesiones previas. Se devuelve la misma respuesta para correos existentes e inexistentes. El flujo de cambio de contraseña se prueba sin enviar correos a personas.

La recepción en un buzón externo todavía debe comprobarse desde Recuperar contraseña. Que el transporte acepte un mensaje no garantiza su entrega; el buzón, SPF/DKIM y los filtros de correo se administran en IONOS. `mail_enabled` permite desactivar temporalmente la función.

## Actualizaciones y migraciones

`database/001_initial.sql` crea las tablas de forma idempotente. `server/migrate.php` solo funciona por CLI, usa un bloqueo y registra cada migración aplicada. MariaDB realiza commits implícitos en DDL: las migraciones deben ser reanudables y compatibles con la versión anterior, no se presupone rollback de esquema.

El workflow de GitHub valida primero, sube un paquete de HTML/assets/PHP/SQL a una carpeta de versión, ejecuta migraciones con `php8.4` y copia una versión verificada a `public`, guardando antes una copia de esa carpeta. Necesita el secreto `IONOS_SSH_PASSWORD`. Verifica la clave pública SSH fijada en `scripts/ionos_known_hosts`. No publica `node_modules`, tests, Git ni credenciales. Los cambios en la base ocurren antes de activar los archivos. La copia de `public` no sustituye un respaldo de la base.

Para un despliegue manual con Python y Paramiko:

```powershell
./scripts/deploy-local.ps1
./scripts/deploy-local.ps1 -Activate AAAAMMDD-HHMMSS
```

La primera instrucción prepara la versión y migra; la segunda activa el identificador devuelto. Los respaldos están en `/home/www/backups`. Una reversión de archivos no debe deshacer datos de usuarios; para cambios destructivos futuros, exportar primero la base con las herramientas de IONOS.

## Validación y alcance

`pnpm test` cubre la demo conservada y la inicialización de los adaptadores PHP. `tests/backend_integration.py` ejecuta solicitudes HTTP a un servidor PHP temporal accesible por SSH en 127.0.0.1:18084. Crea cuentas `example.invalid` con prefijo aleatorio y elimina solo sus datos al terminar. Define `FANSXE_SSH_PASSWORD` y `FANSXE_TEST_RELEASE` para esa versión de pruebas. El servidor de pruebas no debe exponerse a internet.

Las decisiones de autorización se hacen en PHP, incluidas las descargas. Los documentos solo se entregan al propietario o a administradores; los adjuntos de mensajes solo a participantes, incluso si otro usuario tiene rol administrador. Las historias caducadas y las publicaciones eliminadas dejan de servir sus archivos. Los archivos huérfanos y los documentos conservan sus registros físicos: falta definir y automatizar la política de retención y eliminación definitiva. La revisión de edad es manual, no un proveedor externo de validación de identidad.

Hay límites de intentos de acceso y de escrituras, un máximo de 1 GB de archivos por usuario, consultas parametrizadas, CSRF y cookies de sesión HttpOnly/Secure/SameSite. Antes de abrir una operación con dinero real faltan la habilitación comercial de Stripe, moderación/denuncias, política de retención, observabilidad y respaldo periódico de base y archivos.


## Mensajes, destacadas y acceso con Google

La migración 003 añade lectura de mensajes, referencias a historias, grupos de destacadas, estilos de perfil Plus y vínculos a Firebase. Las notificaciones dentro de Fansxe se actualizan por consulta cada diez segundos; no son notificaciones push del sistema operativo. Abrir una conversación marca sus mensajes entrantes como leídos. Las historias abiertas desde una respuesta se muestran sobre el chat y el botón Atrás lo conserva.

Los autores conservan un archivo de sus historias. Las historias normales desaparecen a las 24 horas; las destacadas permanecen en el perfil hasta quitar su grupo o eliminar la historia. Las destacadas públicas pueden verse desde el perfil sin seguir al autor. Las privadas requieren suscripción vigente. Eliminar una historia retira su archivo de los accesos públicos y deja una referencia no disponible en los mensajes.

Google utiliza el proyecto fansxe-44e1f y Firebase JS 12.18.0. PHP valida firma RS256, certificados públicos de Google, audiencia, emisor, caducidad, autenticación reciente y proveedor Google con correo verificado. Las nuevas cuentas eligen username y declaran 18+. Vincular una cuenta local existente exige su contraseña. Las identidades nuevas reciben una contraseña aleatoria no divulgada; pueden establecer una usando recuperación. La sesión de la web sigue siendo PHP. Los certificados se guardan en caché fuera de public; no se necesitan claves privadas de Firebase para validar tokens. Los navegadores deben permitir la ventana emergente de Google. La prueba interactiva final requiere que el propietario entre con su cuenta Google.

El alta por contraseña y por Google envía un correo HTML de bienvenida desde soporte mediante el transporte de correo del hosting. welcome_mail registra aceptación del transporte, no lectura ni entrega definitiva. Un fallo de correo no impide crear la cuenta. Las cuentas .invalid de las pruebas no reciben correo. Se confirmó entrega a la bandeja de soporte de una muestra de la plantilla.

Plus activa cuatro colores y tres bordes limitados al perfil. Mayor visibilidad y promoción están identificadas como próximas funciones, sin alterar por ahora el orden del feed. Las compras usan Stripe en modo de prueba y los retiros se registran manualmente, sin transferencia de dinero real.


## Paneles, reproducción y correos de actividad (septiembre 2026)

Stripe añade su propia navegación a Gemas y Plus, Espacio de creador y Mis suscripciones. El panel de creador muestra ventas, comisiones, ganancias disponibles, suscriptores y pruebas; las últimas 100 suscripciones aparecen con nombre, username, estado y periodo. El administrador conserva la revisión de documentos, movimientos y retiros con datos bancarios bajo consulta autorizada. Las recargas no forman parte del saldo retirable.

El feed reproduce un solo video visible a la vez, inicialmente silenciado. Una pausa manual se conserva hasta salir de pantalla. Abrir un modal o cambiar de pestaña pausa el video. Los controles se superponen y las imágenes conservan sus proporciones naturales.

Una cuenta Google ya vinculada entra directamente. Una cuenta local existente puede vincularse con su contraseña o con un código de seis dígitos enviado al correo registrado. El código se guarda como hash en la sesión, se vincula al usuario y a la identidad Google, vence en diez minutos y está limitado por intentos. No se fusionan cuentas solo por coincidencia de correo. La prueba final de la ventana Google requiere la cuenta Google del propietario.

La migración 007 añade `activity_email` y `activity_mail_state`. Los resúmenes agrupan mensajes y notificaciones sin leer de más de 15 minutos y se envían como máximo una vez cada 24 horas por usuario. Se omiten usuarios activos durante los últimos 15 minutos y correos `.invalid`; las preferencias se cambian en Configuración. No incluyen el texto privado de los mensajes. Un fallo de transporte se vuelve a intentar como pronto una hora después. `last_sent_at` registra aceptación del transporte, no entrega en bandeja.

El mantenimiento se ejecuta con el tráfico de la web y dispone de un trabajador CLI: `php8.4 /home/www/public/server/mail-worker.php`. La cuenta SSH actual no dispone de `crontab`; para entrega regular incluso sin visitas, programar ese comando cada 15 minutos desde el panel de tareas de IONOS. No se creó una tarea de sistema inexistente. Los correos de pagos se procesan por separado de los resúmenes.

Validación adicional: `node --test tests/feed-video.test.cjs tests/google-ui.test.cjs tests/server-ui.test.cjs`; en el hosting, `php8.4 tests/activity-mail.php /ruta/de/release` usa una transacción revertida y no envía correos. Las pruebas de Stripe verifican que solo se retire dinero ganado, que la CLABE se entregue únicamente al administrador y que se requiera una referencia para marcar un retiro pagado.

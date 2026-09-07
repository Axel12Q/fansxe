# Fansxe en IONOS

El dominio `https://fansxe.com` usa PHP 8.4 y MariaDB. Los HTML conservan el diseño; Apache sirve las páginas de cuenta mediante `server/page.php`. Este reemplaza los adaptadores locales por `server-auth.js` y `server-store.js`. Abrir los mismos HTML con el servidor estático de Python sigue mostrando la demo local. Las nuevas pantallas comerciales necesitan PHP.

## Funciones conectadas

Registro con declaración de mayoría de edad, sesiones PHP, contraseñas Argon2id, perfiles individuales, fotos y portadas, seguidores, publicaciones públicas y privadas, likes, comentarios, eliminación propia, notificaciones, mensajes con archivos, historias de 24 horas, insignias y revisión de documentos por administradores.

El feed consulta bloques de seis registros desde la base, incluidos búsqueda y filtros. Los chats consultan actividad cada diez segundos mientras la pestaña está visible. La primera versión aún recupera el directorio de usuarios y el historial de conversaciones completo: deberán paginarse antes de escalar a una comunidad grande. Los comentarios mostrados por publicación están limitados a 200 y las notificaciones a 100.

Google no está habilitado: la integración Firebase se realizará por separado. No existe un acceso `admin/admin` en producción. Registro solicita un username único de 3–20 caracteres ASCII (letras, números, guion bajo), además del nombre. Se admite login por correo, username o @username; las contraseñas requieren al menos 8 caracteres.

Los visitantes pueden explorar Inicio, perfiles ajenos y archivos de publicaciones públicas; las acciones de escritura y las páginas privadas exigen sesión. La sesión se recuerda durante 30 días con cookies Secure/HttpOnly/SameSite y tokens aleatorios guardados como hash en MariaDB. Puede restaurarse aunque PHP haya limpiado su sesión temporal. Logout revoca el token del dispositivo; cambiar o recuperar la contraseña revoca los anteriores.

## Gemas y creadores: simulación comercial

`gemas.html` ofrece recargas simuladas (100, 550 y 1,200 gemas), con confirmación y precios de referencia en USD. No solicita tarjeta ni ejecuta cobros. Las gemas no tienen valor monetario y no se pueden canjear por dinero. Los endpoints antiguos de recarga en centavos permanecen deshabilitados; la nueva contabilidad se separa en `gem_ledger`.

`creador.html` permite solicitar la aprobación como creador después de verificar la edad. Son dos decisiones distintas. Por defecto nadie vende contenido. Un administrador revisa las solicitudes en `admin.html`; solo un creador aprobado puede configurar el precio mensual, publicar contenido privado y recibir suscripciones o apoyos. Los perfiles que no venden no muestran el botón de suscripción.

Las suscripciones simuladas descuentan gemas y habilitan el contenido durante 30 días. Cada venta registra precio bruto, comisión y neto, bajo transacción. La comisión provisional es 5%, configurable mediante `commission_percent`; se redondea hacia arriba a una gema. Los checkouts tienen claves de idempotencia para evitar cobros duplicados. El espacio del creador muestra ventas y saldo disponible, permite solicitar retiros de prueba desde 100 gemas y reserva ese importe. Administración puede rechazar o marcar la simulación completada; ninguna acción transfiere dinero. No se solicitan cuentas bancarias.

Plus cuesta 200 gemas de prueba por 30 días y añade una insignia al perfil. No incluye suscripciones a creadores. Migración `002_social_commerce.sql` incorpora estas tablas y columnas sin renombrar ni borrar las cuentas existentes.

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

Hay límites de intentos de acceso y de escrituras, un máximo de 1 GB de archivos por usuario, consultas parametrizadas, CSRF y cookies de sesión HttpOnly/Secure/SameSite. Antes de abrir una operación comercial faltan pagos, OAuth, moderación/denuncias, política de retención, observabilidad y respaldo periódico de base y archivos.


## Mensajes, destacadas y acceso con Google

La migración 003 añade lectura de mensajes, referencias a historias, grupos de destacadas, estilos de perfil Plus y vínculos a Firebase. Las notificaciones dentro de Fansxe se actualizan por consulta cada diez segundos; no son notificaciones push del sistema operativo. Abrir una conversación marca sus mensajes entrantes como leídos. Las historias abiertas desde una respuesta se muestran sobre el chat y el botón Atrás lo conserva.

Los autores conservan un archivo de sus historias. Las historias normales desaparecen a las 24 horas; las destacadas permanecen en el perfil hasta quitar su grupo o eliminar la historia. Las destacadas públicas pueden verse desde el perfil sin seguir al autor. Las privadas requieren suscripción vigente. Eliminar una historia retira su archivo de los accesos públicos y deja una referencia no disponible en los mensajes.

Google utiliza el proyecto fansxe-44e1f y Firebase JS 12.18.0. PHP valida firma RS256, certificados públicos de Google, audiencia, emisor, caducidad, autenticación reciente y proveedor Google con correo verificado. Las nuevas cuentas eligen username y declaran 18+. Vincular una cuenta local existente exige su contraseña. Las identidades nuevas reciben una contraseña aleatoria no divulgada; pueden establecer una usando recuperación. La sesión de la web sigue siendo PHP. Los certificados se guardan en caché fuera de public; no se necesitan claves privadas de Firebase para validar tokens. Los navegadores deben permitir la ventana emergente de Google. La prueba interactiva final requiere que el propietario entre con su cuenta Google.

El alta por contraseña y por Google envía un correo HTML de bienvenida desde soporte mediante el transporte de correo del hosting. welcome_mail registra aceptación del transporte, no lectura ni entrega definitiva. Un fallo de correo no impide crear la cuenta. Las cuentas .invalid de las pruebas no reciben correo. Se confirmó entrega a la bandeja de soporte de una muestra de la plantilla.

Plus activa cuatro colores y tres bordes limitados al perfil. Mayor visibilidad y promoción están identificadas como próximas funciones, sin alterar por ahora el orden del feed. Compras y retiros continúan siendo simulados.

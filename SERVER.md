# Fansxe en IONOS

El dominio `https://fansxe.com` usa PHP 8.4 y MariaDB. Los HTML conservan el diseño; Apache sirve las páginas de cuenta mediante `server/page.php`. Este reemplaza los adaptadores locales por `server-auth.js` y `server-store.js`. Abrir los mismos HTML con el servidor estático de Python sigue mostrando la demo local.

## Funciones conectadas

Registro con declaración de mayoría de edad, sesiones PHP, contraseñas Argon2id, perfiles individuales, fotos y portadas, seguidores, publicaciones públicas y privadas, likes, comentarios, eliminación propia, notificaciones, mensajes con archivos, historias de 24 horas, insignias y revisión de documentos por administradores.

El feed consulta bloques de seis registros desde la base, incluidos búsqueda y filtros. Los chats consultan actividad cada diez segundos mientras la pestaña está visible. La primera versión aún recupera el directorio de usuarios y el historial de conversaciones completo: deberán paginarse antes de escalar a una comunidad grande. Los comentarios mostrados por publicación están limitados a 200 y las notificaciones a 100.

Google no está habilitado: requiere un cliente OAuth y sus credenciales. Las recargas, propinas y suscripciones de pago rechazan operaciones hasta integrar una pasarela y sus webhooks verificados. Las tablas de suscripciones y contabilidad están preparadas, sin créditos ficticios. No existe un acceso `admin/admin` en producción.

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

# Pagos de Fansxe

## Estado y precios

Stripe Checkout funciona exclusivamente con credenciales `sk_test_`: no se cobra ni se transfiere dinero real. Moneda MXN. Suscripciones mensuales a creadores, apoyos de pago único y Plus permanente de $199 MXN. El precio inicial del creador es $99 MXN/mes, editable entre $20 y $10,000. Las pruebas opcionales son de 3, 7, 14 o 30 días, una vez por comprador y creador; requieren método de pago y renuevan automáticamente. Cambiar las condiciones del perfil solo afecta a nuevas altas.

Fansxe retiene el 15% del importe, redondeado al centavo superior. El coste real informado por Stripe también se descuenta del creador. No se supone una tarifa fija de procesamiento. Ejemplo: sobre $100, Fansxe recibe $15 y el creador $85 menos el coste de Stripe. Plus no incluye acceso a creadores ni promoción aún no implementada.

La aprobación de identidad y de creador se conserva. El contenido ofrecido mediante este sistema debe ser no adulto. Una integración de prueba no implica aprobación del negocio para operar con dinero real.

## Uso

- `perfil.html`: precio mensual y prueba gratuita en Editar perfil para creadores aprobados.
- `suscripciones.html`: estado, vencimiento, cancelación/reactivación, portal de recibos y métodos de pago, preferencias de novedades.
- `gemas.html`: recargas de 100, 550 o 1.200 gemas mediante Stripe en modo de prueba y Fansxe Plus como compra única. Las gemas se acreditan tras la confirmación del pago y solo sirven dentro de Fansxe; no se pueden retirar.
- `creador.html`: ingresos brutos/netos, comisiones, disponibilidad y retiros desde $100 MXN de ganancias liberadas.
- `admin.html`: movimientos y revisión de retiros. Registrar un pago requiere referencia; no hace una transferencia bancaria.

Cancelar conserva el acceso hasta el final del periodo o prueba. Los impagos no añaden acceso. Una devolución del último cobro o disputa retira el acceso asociado; una devolución posterior a un retiro puede dejar un saldo deudor. No se permite retirar recargas o saldos simulados. La CLABE se valida y cifra con Sodium; la vista general solo muestra sus últimos cuatro dígitos. Solo el administrador puede solicitar el descifrado de una solicitud concreta.

## Servidor y secretos

`/home/www/fansxe-private/stripe.php`, permisos 600, contiene `enabled`, `secret`, `webhook_secret`, `webhook_id`, `portal`, `bank_key` y `mail_key`. Está fuera de `public`, Git y los paquetes de despliegue. El contenido está codificado en base64 para transportar JSON; eso no es cifrado. La protección del archivo depende de sus permisos y ubicación. `bank_key` es una clave aleatoria de 32 bytes en base64; debe conservarse en el respaldo privado para recuperar los datos bancarios. En Windows la clave de Stripe se guarda con DPAPI en `%LOCALAPPDATA%/Fansxe/stripe-test.dpapi`.

El navegador nunca recibe la clave secreta. Los formularios de tarjeta se alojan en Stripe; Fansxe no recibe números de tarjeta ni CVV. API y webhook usan la versión `2024-06-20`. La migración `004_stripe_billing.sql` es aditiva.

Webhook: `https://fansxe.com/api/stripe-webhook.php`. Eventos: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `charge.updated`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.

Cada evento exige firma con tolerancia de cinco minutos y modo de prueba. Se vuelve a consultar Stripe para confirmar el estado actual. Los IDs de eventos y cobros son únicos; repetir un webhook no duplica ingresos. El regreso del navegador desde Checkout consulta el servidor y no acredita por parámetros de URL. Los fallos de procesamiento devuelven HTTP 500 para que Stripe reintente. No restaurar archivos anteriores que habiliten las recargas simuladas durante la operación de Stripe.

## Correos

Plantillas HTML desde soporte@fansxe.com: alta de suscripción para comprador y creador, cobros, fallos, cambios de renovación, retiros y aviso previo de renovación. `invoice.upcoming` y `customer.subscription.trial_will_end` disparan avisos; también hay revisión de periodos a tres días de vencer. Los recordatorios para volver requieren consentimiento, 21 días de inactividad y tienen un máximo de una campaña mensual.

La cola deduplica por evento y registra aceptación del transporte PHP, no entrega definitiva. Reintenta hasta tres veces. El hosting no expone `crontab`; el mantenimiento adicional se ejecuta con tráfico de la web, como máximo cada cinco minutos. Las campañas por inactividad no tienen horario garantizado. Para ejecución periódica independiente del tráfico, configurar posteriormente un programador del hosting. Los avisos de renovación dependen además de mantener activo el webhook de Stripe. El enlace firmado de baja permite desactivar novedades.

## Validación y siguientes pasos

`pnpm test` cubre las pantallas y el comportamiento de la demo conservada. `php tests/stripe-signature.php` valida firmas, caducidad, rechazo de eventos reales y CLABE. `tests/billing_integration.py` levanta PHP solo en loopback mediante SSH, crea cuentas `.invalid` y clientes Stripe aislados, y usa `pm_card_visa`. Comprueba Checkout, pruebas, renovación con factura pagada, idempotencia, Plus, permisos de retiros, cifrado y devoluciones. Cancela sus suscripciones y elimina sus cuentas al terminar. Requiere `FANSXE_SSH_PASSWORD`, `FANSXE_TEST_RELEASE` y opcionalmente `FANSXE_TEST_PORT`; lee Stripe únicamente del archivo privado. No ejecutar la antigua integración de gemas bajo la configuración de Stripe.

Antes de cobros reales: completar la habilitación de la cuenta Stripe y validar con Stripe el modelo de plataforma y pagos manuales a terceros; definir impuestos, facturación, condiciones, política de reembolsos y reservas por disputas. La cuenta consultada aún no tiene habilitados cobros ni liquidaciones reales. Cambiar de modo requiere una modificación deliberada del bloqueo de pruebas, precios, textos, configuración y webhook, además de pruebas de autenticación 3DS y fallos de tarjeta. No basta pegar una clave real.

El reinicio de dinero de demostración se realiza una sola vez con exportación privada previa. No forma parte de las migraciones ni de futuros despliegues automáticos. No elimina perfiles, contenido, mensajes ni verificaciones.

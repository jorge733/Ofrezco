# Tienda de funciones con Flow: cómo funciona y cómo activarla

ServicePlanet es gratis. La tienda del panel vende funciones extra de **pago único**, sin planes ni mensualidades.

## Dónde está cada cosa
| Archivo | Qué hace |
|---|---|
| `functions/tienda/catalogo.js` | Precios y qué se puede comprar (**la fuente de verdad**) |
| `tienda.js` | La tienda que se ve en el panel (repite los precios para mostrarlos) |
| `functions/tienda/flow.js` | Conexión con Flow |
| `functions/tienda/compras.js` | Qué hacer según lo que informa Flow |
| `functions/tienda.js` | Cloud Functions: crear el pago, recibir la confirmación y revisar pendientes cada día |

Si cambias un precio, cámbialo en `catalogo.js` y en `tienda.js`. Los tests avisan si no coinciden.

## Correr los tests
```bash
cd functions
npm test
```

## Cómo se protege el cobro
- La función se activa solo cuando el servidor le pregunta a Flow y Flow responde que está pagada. Lo que diga el navegador no cuenta.
- Si el monto que informa Flow no coincide, la compra queda en estado `revisar` y no se activa nada.
- Si alguien paga dos veces lo mismo, la compra queda en estado `duplicada` para devolverle el dinero a mano.
- Cada mañana se revisan los pagos sin confirmar, por si un aviso de Flow no llegó.
- Sin `COBROS_REALES_APROBADOS=si` en `functions/.env`, la tienda no puede abrir pagos reales.

Esos estados también dejan un error en los registros de Firebase. Conviene revisarlos, porque hoy nadie recibe un aviso automático.

## Activar los pagos
Las claves van en `functions/.env`, que no se sube a GitHub. Nunca las compartas.

1. Revisa que `PAGOS_MODO=flow-produccion` y que estén `FLOW_API_KEY` y `FLOW_SECRET`.
2. Cuando decidas empezar a cobrar, pon `COBROS_REALES_APROBADOS=si`.
3. Despliega reglas y funciones:
   ```bash
   npx -y firebase-tools deploy --only functions,firestore:rules
   ```
4. Publica el sitio con la rama `tienda`.
5. Haz una compra de prueba con tu propia tarjeta. Es dinero real y devolverlo tiene costo.

## Antes de vender (checklist)
- [ ] Preguntar a un contador cómo emitir la boleta de cada venta.
- [ ] Hacer revisar los Términos (sección 6) y la Privacidad. Después, quitar el comentario de "borrador".
- [ ] Definir la política de devoluciones.
- [ ] Probar: compra pagada, pago rechazado, pago abandonado y volver a comprar.

## Devoluciones
Hoy se hacen a mano desde el panel de Flow, sección Reembolsos. Después hay que cambiar el estado de la compra en la colección `compras` y, si corresponde, quitar la función de `publico/{uid}`.

## Agregar una función nueva
1. Constrúyela. La página pública sabe qué tiene cada negocio leyendo `publico/{uid}.funciones`.
2. Cambia `disponible` a `true` en `catalogo.js` y en `tienda.js`.

## Trabajo anterior de planes
Quedó guardado en la rama `monetizacion` y en un `git stash`, por si algún día sirve. La tienda no lo usa.

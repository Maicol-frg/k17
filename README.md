# K17 · Registro de ventas

## Despliegue con la pantalla Workers Builds

El archivo `wrangler.jsonc` configura un Cloudflare Worker con assets estáticos. La API usa la función de `functions/api/[[path]].js`, D1 guarda cuentas/pedidos/sesiones y R2 guarda imágenes.

En la pantalla de Workers Builds que conecta GitHub con el Worker, usa:

- **Project name:** `k17` (debe coincidir con `name` en `wrangler.jsonc`).
- **Build command:** `npm install`.
- **Deploy command:** `npx wrangler deploy`.
- **Preview command:** `npx wrangler preview`.
- **Root directory:** en blanco, si los archivos están en la raíz del repositorio.

Sube y confirma en GitHub `worker.mjs`, `worker-api` (el archivo `functions/api/[[path]].js`), `wrangler.jsonc`, `package.json`, `migrations/`, `public/` y `README.md`. No subas `data/k17.sqlite` ni credenciales. Al hacer el primer despliegue, Wrangler crea los recursos D1 y R2 indicados como bindings en `wrangler.jsonc`.

## Preparar la base y el primer usuario

1. Cuando el Worker esté desplegado, abre **Workers & Pages → k17 → Settings → Bindings** y confirma que existan `K17_DB` (D1) y `K17_IMAGES` (R2).
2. Abre la base D1 `K17_DB` desde **Storage & databases → D1**, abre su consola SQL y ejecuta el contenido de `migrations/0001_initial.sql` una sola vez.
3. En el Worker, abre **Settings → Variables and Secrets** y agrega `K17_SETUP_KEY` de tipo **Secret** con una frase privada aleatoria larga. Guarda para actualizar el Worker.
4. Abre la dirección `workers.dev` del Worker. En la pantalla de inicio, selecciona **Configurar cuenta inicial del dueño**. Escribe `K17_SETUP_KEY`, tu nombre, un nombre de usuario y una contraseña fuerte de al menos 12 caracteres. Esa configuración crea la cuenta administradora una sola vez. Luego elimina el secreto si quieres.
5. Entra como administrador, abre **Trabajadores → Agregar trabajador**, crea el usuario/contraseña inicial del empleado y define su comisión. El empleado podrá cambiar su propia contraseña.

## Qué hace la aplicación

- La persona trabajadora añade cliente y prendas; el servidor calcula `precio × cantidad`, suma el pedido y lo asocia al usuario de la sesión.
- Cada trabajador consulta solo sus ventas; el administrador consulta y filtra las de todos, y gestiona trabajadores y porcentajes de comisión.
- Se aceptan fotos PNG, JPG y WebP de hasta 2 MB por imagen. Se guardan en R2 y solo las pueden ver las personas autorizadas para el pedido.
- Las contraseñas se guardan con hash (scrypt local y PBKDF2-SHA-256 en Workers); las sesiones se guardan como hashes en D1 y expiran después de ocho horas.
- El porcentaje de comisión queda copiado en cada pedido al crearlo, por lo que cambiar el porcentaje después no altera los pedidos antiguos.

## Ejecución local

Para la versión local de prueba, instala Node.js 22.13 o posterior y ejecuta `npm start`; abre http://localhost:4173. Las cuentas de muestra son `admin` / `K17admin2026` y `juan` / `K17juan2026`. Cambia esas contraseñas antes de usar ventas reales. La base local está en `data/k17.sqlite`; no se importa automáticamente a Cloudflare.

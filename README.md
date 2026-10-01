# K17 · Registro de ventas

## Despliegue con la pantalla Workers Builds

El archivo `wrangler.jsonc` configura un Cloudflare Worker con assets estáticos. La API usa `functions/api/[[path]].js`, D1 guarda cuentas/pedidos/sesiones y una pequeña Web App de Google Apps Script guarda las imágenes en la carpeta privada de Google Drive del dueño. No se necesita R2.

En la pantalla de Workers Builds que conecta GitHub con el Worker, usa:

- **Project name:** `k17` (debe coincidir con `name` en `wrangler.jsonc`).
- **Build command:** `npm install`.
- **Deploy command:** `npx wrangler deploy`.
- **Preview command:** `npx wrangler preview`.
- **Root directory:** en blanco, si los archivos están en la raíz del repositorio.

Sube y confirma en GitHub `worker.mjs`, `functions/api/[[path]].js`, `wrangler.jsonc`, `package.json`, `migrations/`, `public/`, `google-drive/Code.gs` y `README.md`. No subas `data/k17.sqlite` ni secretos. No se crea ni conecta ningún bucket R2. El primer despliegue puede crear la base D1 automáticamente; si un despliegue anterior falló después de crearla, reutiliza esa base y no crees otra.

## Conectar la carpeta privada de Google Drive

1. Entra en [script.google.com](https://script.google.com) con la cuenta Gmail dueña de la carpeta y crea un proyecto. Reemplaza el contenido de `Code.gs` por el archivo `google-drive/Code.gs` de este repositorio. El ID de la carpeta K17 ya está puesto en ese archivo.
2. En **Configuración del proyecto → Propiedades del script**, agrega `K17_SECRET` con un secreto aleatorio largo. No lo compartas por chat ni lo pongas en GitHub.
3. En el editor, elige `authorizeK17Drive` y pulsa **Ejecutar**. Google pedirá autorización para que el script acceda a la carpeta.
4. Pulsa **Implementar → Nueva implementación → Aplicación web**. Selecciona **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier persona**. Implementa y copia la URL que termina en `/exec`. El acceso público al enlace está protegido por `K17_SECRET`; mantén ese secreto privado.
5. En **Workers & Pages → k17 → Settings → Variables and Secrets**, agrega dos secretos: `K17_DRIVE_URL` con la URL `/exec`, y `K17_DRIVE_KEY` con el mismo valor que `K17_SECRET`. Guarda y vuelve a desplegar el Worker.
6. Mantén la carpeta privada. Comparte esa carpeta con los correos de Google de los empleados que deban poder abrir las fotos en Drive. K17 muestra las fotos en los pedidos solo al usuario autorizado para ese pedido; al tocar la foto se abre Drive.

## Preparar la base y el primer usuario

1. Cuando el Worker esté desplegado, abre **Workers & Pages → k17 → Settings → Bindings** y confirma que exista `K17_DB` (D1).
2. Abre la base D1 `K17_DB` desde **Storage & databases → D1**, abre su consola SQL y ejecuta el contenido de `migrations/0001_initial.sql` una sola vez.
3. En el Worker, abre **Settings → Variables and Secrets** y agrega `K17_SETUP_KEY` de tipo **Secret** con una frase privada aleatoria larga. Guarda para actualizar el Worker.
4. Abre la dirección `workers.dev` del Worker. En la pantalla de inicio, selecciona **Configurar cuenta inicial del dueño**. Escribe `K17_SETUP_KEY`, tu nombre, un nombre de usuario y una contraseña fuerte de al menos 12 caracteres. Esa configuración crea la cuenta administradora una sola vez. Luego elimina el secreto si quieres.
5. Entra como administrador, abre **Trabajadores → Agregar trabajador**, crea el usuario/contraseña inicial del empleado y define su comisión. El empleado podrá cambiar su propia contraseña.

## Qué hace la aplicación

- La persona trabajadora añade cliente y prendas; el servidor calcula `precio × cantidad`, suma el pedido y lo asocia al usuario de la sesión.
- Cada trabajador consulta solo sus ventas; el administrador consulta y filtra las de todos, y gestiona trabajadores y porcentajes de comisión.
- Se aceptan fotos PNG, JPG y WebP de hasta 2 MB por imagen. Se guardan en la carpeta Drive privada y K17 las sirve solo a las personas autorizadas para el pedido.
- Las contraseñas se guardan con hash (scrypt local y PBKDF2-SHA-256 en Workers); las sesiones se guardan como hashes en D1 y expiran después de ocho horas.
- El porcentaje de comisión queda copiado en cada pedido al crearlo, por lo que cambiar el porcentaje después no altera los pedidos antiguos.

## Ejecución local

Para la versión local de prueba, instala Node.js 22.13 o posterior y ejecuta `npm start`; abre http://localhost:4173. Las cuentas de muestra son `admin` / `K17admin2026` y `juan` / `K17juan2026`. Cambia esas contraseñas antes de usar ventas reales. La base local está en `data/k17.sqlite`; no se importa automáticamente a Cloudflare.

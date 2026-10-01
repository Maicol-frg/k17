# K17 · Registro de ventas

## Uso local

Instala Node.js 22.13 o posterior, abre PowerShell en esta carpeta y ejecuta `npm start`. Abre http://localhost:4173. En esta copia local las cuentas iniciales son `admin` / `K17admin2026` y `juan` / `K17juan2026`. Cambia las contraseñas antes de usarla con ventas reales.

## Publicar en Cloudflare Pages

Este proyecto conserva `server.mjs` para el modo local. La versión pública se ejecuta mediante **Pages Functions**, usa **D1** para usuarios, pedidos y sesiones, y **R2** para las imágenes privadas de los pedidos. No subas `data/k17.sqlite`: la versión pública arranca con una base nueva; los pedidos locales no se importan automáticamente.

1. Crea un repositorio privado en GitHub. Desde **Add file → Upload files**, sube `functions/`, `migrations/`, `public/`, `package.json` y `README.md`. `server.mjs` es necesario solo para ejecutar la versión local. Confirma los archivos con **Commit changes**. `.gitignore` excluye la base local y las credenciales.
2. En Cloudflare abre **Workers & Pages → Create application → Pages → Connect to Git** y elige ese repositorio. Pon el framework en **None**, deja vacío el comando de compilación y usa `public` como directorio de salida.
3. En Cloudflare, crea una base de datos **D1**. En su consola SQL, ejecuta el contenido de `migrations/0001_initial.sql` una sola vez.
4. Crea un bucket **R2** privado. No habilites acceso público al bucket: las imágenes se sirven por la aplicación y respetan permisos de trabajador o administrador.
5. En el proyecto Pages abre **Settings → Bindings** y añade: D1 con el nombre de variable `K17_DB`, asociado a la base que creaste; R2 con el nombre `K17_IMAGES`, asociado al bucket.
6. En **Settings → Variables and Secrets**, añade `K17_SETUP_KEY` como **Secret** con una frase aleatoria larga. Guarda los cambios y vuelve a desplegar para que las funciones reciban las vinculaciones y el secreto.
7. Abre la dirección `pages.dev`. En el inicio de sesión aparecerá **Configurar cuenta inicial del dueño**. Ingresa el secreto `K17_SETUP_KEY`, el nombre, el usuario y una contraseña fuerte de al menos 12 caracteres. Esta configuración crea al primer administrador una sola vez. Luego puedes retirar el secreto del entorno.
8. Entra como administrador, crea las cuentas del equipo y asigna el porcentaje de comisión correspondiente a cada persona. Cada usuario puede cambiar su propia contraseña desde la aplicación.

Los siguientes cambios subidos a GitHub se publicarán automáticamente. Antes de depender de la aplicación en la tienda, configura copias de seguridad de D1 y comprueba los límites y precios de tu cuenta Cloudflare. En el plan gratuito, D1 tiene límites de lecturas y escrituras por día; al alcanzarlos, las consultas se pausan hasta el siguiente día. Consulta [límites y precios de D1](https://developers.cloudflare.com/d1/platform/pricing/).

## Datos y permisos

- El trabajador registra una venta y el servidor la asocia al usuario autenticado. No se acepta un ID de trabajador desde el formulario.
- El administrador ve todas las ventas; cada trabajador solo ve las propias.
- La suma de cada producto es `cantidad × precio`; el servidor calcula y guarda el total del pedido.
- La tasa de comisión vigente se guarda en cada pedido, de modo que cambiar la tasa más adelante no reescribe comisiones ya registradas.
- Contraseñas: scrypt en el modo local y PBKDF2-SHA-256 en Pages Functions. Las sesiones se guardan como hashes en D1 y caducan a las ocho horas.
- Las fotos aceptan PNG, JPG y WebP, con un máximo de 2 MB por imagen; se guardan en R2 y el servidor comprueba que quien solicita la imagen tenga permiso para ver su pedido.

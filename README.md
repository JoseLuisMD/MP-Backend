# MP-Backend

Panel interno para publicar a mano en X lo que el bot ([MP-YT-Discord](https://github.com/JoseLuisMD/MP-YT-Discord)) publica en Bluesky. La API de X es de pago, pero el enlace `x.com/intent/post` abre X con el texto ya escrito, y X genera solo la tarjeta del enlace.

- **Qué hay pendiente:** el bot apunta cada vídeo y cada noticia de Mundos Pixelados en `cola_x.json` (clave `"x"` de `proyectos.py`).
- **Qué está hecho:** `estado.json` de este repo guarda qué se ha publicado o borrado. El panel lo lee y lo escribe con la API de GitHub.
- **Archivos:** `index.html`, `estilos.css` y `panel.js`, sin build ni dependencias.

## Puesta en marcha

1. **GitHub Pages:** Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main** / **(root)** → Save. Unos minutos después queda en https://joseluismd.github.io/MP-Backend/. No hay que enlazarlo desde ningún sitio: lleva `noindex, nofollow`.
2. **Token (uno, compartido):** GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*:
   - Repository access: **Only select repositories** → `MP-Backend`
   - Permissions → Repository permissions → **Contents: Read and write** (con eso basta)
   - Caducidad: la que queráis. Cuando caduque, se genera otro y se vuelve a pegar.
3. Cada uno abre el panel, pega el token en el campo de arriba y pulsa **Guardar**. El token se queda solo en ese navegador; **Olvidar token** lo borra. Sin token el panel se ve, pero no se puede marcar ni borrar.

## Uso

- **Publicar en X:** abre X con el texto (y el enlace) ya puesto, y la tarjeta queda marcada como publicada. Si el contador pasa de 280, se recorta en la propia caja de X antes de enviar.
- **Borrar:** oculta la entrada (no se publicará). **Ver borradas** las enseña para recuperarlas.
- **Deshacer:** quita la marca de publicada.
- Los cambios se guardan al momento en `estado.json`, y cada guardado es un commit. Si los dos guardáis a la vez, el panel lo reintenta solo.

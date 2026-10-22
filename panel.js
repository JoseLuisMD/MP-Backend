// Panel para publicar a mano en X lo que el bot (repo MP-YT-Discord) publica en Bluesky.
//
// - Lo pendiente sale de cola_x.json del bot, en su rama «estado» (lo escribe common/publicadores.py, clase ColaX).
//   Los dos repos guardan su estado en una rama con el mismo nombre (RAMA_ESTADO).
// - Lo publicado y lo borrado se guarda en estado.json de este repo, en la rama «estado» (cada
//   clic es un commit: así no se mezclan con main ni redespliegan Pages), con la API de GitHub y
//   un token que cada uno pega aquí y se queda solo en su navegador (localStorage).
// - En localhost (vista previa) se leen cola_x.json (y estado.json, si lo hay) de la propia carpeta y los
//   cambios se guardan solo en el navegador.
"use strict";

const REPO_BOT = "JoseLuisMD/MP-YT-Discord";
const REPO_PANEL = "JoseLuisMD/MP-Backend";
const RAMA_ESTADO = "estado";
const API = "https://api.github.com";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const CLAVE_TOKEN = "mp-panel-x-token";
const LIMITE_X = 280;

let cola = [];           // entradas de cola_x.json, la más nueva primero
let estado = {};         // {id: {estado: "publicada" | "borrada", fecha}}
let colaCargada = false;

const $ = (id) => document.getElementById(id);

// ---------------- Token ----------------
function leerToken() {
  try { return localStorage.getItem(CLAVE_TOKEN) || ""; } catch { return ""; }
}

function guardarToken(token) {
  try { token ? localStorage.setItem(CLAVE_TOKEN, token) : localStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento */ }
}

function pintarToken() {
  const hay = Boolean(leerToken());
  $("form-token").hidden = hay;
  $("con-token").hidden = !hay;
}

// ---------------- Avisos ----------------
let temporizadorAviso;
function avisar(texto, error = false, fijo = false) {
  const aviso = $("aviso");
  clearTimeout(temporizadorAviso);
  aviso.textContent = texto;
  aviso.classList.toggle("aviso--error", error);
  aviso.hidden = !texto;
  if (texto && !error && !fijo) temporizadorAviso = setTimeout(() => (aviso.hidden = true), 2500);
}

// ---------------- API de GitHub ----------------
function cabeceras(extra = {}) {
  const token = leerToken();
  return { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

function base64AUtf8(b64) {
  const binario = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

function utf8ABase64(texto) {
  let binario = "";
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
}

async function errorDe(r) {
  if (r.status === 401) return "El token no es válido o ha caducado";
  if (r.status === 403 || r.status === 404) return "El token no tiene permiso de escritura en MP-Backend (Contents: Read and write)";
  return `GitHub respondió ${r.status}`;
}

async function leerCola() {
  if (LOCAL) {
    const r = await fetch("cola_x.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`No se pudo leer cola_x.json (${r.status})`);
    return r.json();
  }
  // La API da el archivo al momento (raw.githubusercontent.com lo guarda en caché unos minutos)
  try {
    const r = await fetch(`${API}/repos/${REPO_BOT}/contents/cola_x.json?ref=${RAMA_ESTADO}`, {
      cache: "no-store",
      headers: cabeceras({ Accept: "application/vnd.github.raw+json" }),
    });
    if (r.ok) return r.json();
  } catch { /* se prueba con raw */ }
  const r = await fetch(`https://raw.githubusercontent.com/${REPO_BOT}/${RAMA_ESTADO}/cola_x.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo leer la cola (${r.status})`);
  return r.json();
}

// estado.json con su sha (hace falta para poder escribirlo)
async function leerEstado() {
  if (LOCAL) {
    try {
      const guardado = localStorage.getItem("mp-panel-x-estado-local");
      if (guardado) return { datos: JSON.parse(guardado), sha: null };
    } catch { /* sin almacenamiento */ }
    const r = await fetch("estado.json", { cache: "no-store" });
    return { datos: r.ok ? await r.json() : {}, sha: null };
  }
  const r = await fetch(`${API}/repos/${REPO_PANEL}/contents/estado.json?ref=${RAMA_ESTADO}`, {
    cache: "no-store",
    headers: cabeceras(),
  });
  if (r.status === 404) {
    if (!leerToken()) return { datos: {}, sha: null };
    throw new Error(`No se encuentra estado.json en la rama «${RAMA_ESTADO}» de MP-Backend: hay que crearla (ver README)`);
  }
  if (!r.ok) throw new Error(await errorDe(r));
  const archivo = await r.json();
  const texto = base64AUtf8(archivo.content || "").trim();
  return { datos: texto ? JSON.parse(texto) : {}, sha: archivo.sha };
}

async function escribirEstado(datos, sha) {
  if (LOCAL) {
    try { localStorage.setItem("mp-panel-x-estado-local", JSON.stringify(datos)); } catch { /* sin almacenamiento */ }
    return true;
  }
  const r = await fetch(`${API}/repos/${REPO_PANEL}/contents/estado.json`, {
    method: "PUT",
    headers: cabeceras({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      message: "Actualizar estado del panel de X",
      branch: RAMA_ESTADO,
      content: utf8ABase64(JSON.stringify(datos, null, 2) + "\n"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (r.ok) return true;
  if (r.status === 409 || r.status === 422) return false;   // el otro ha guardado entre medias: se reintenta
  throw new Error(await errorDe(r));
}

// Aplica un cambio sobre el estado más reciente de GitHub y lo guarda (reintenta si el sha ha cambiado)
async function guardarCambio(cambio) {
  for (let intento = 0; intento < 4; intento++) {
    const { datos, sha } = await leerEstado();
    cambio(datos);
    if (colaCargada) {
      // Se olvida lo que ya no está en la cola (el bot la recorta), para que estado.json no crezca
      const ids = new Set(cola.map((e) => e.id));
      for (const id of Object.keys(datos)) if (!ids.has(id)) delete datos[id];
    }
    if (await escribirEstado(datos, sha)) {
      estado = datos;
      return;
    }
  }
  throw new Error("No se pudo guardar: el estado cambiaba a la vez. Prueba otra vez.");
}

// ---------------- Contador de caracteres de X ----------------
// Como X: cada URL cuenta 23; cada emoji, 2; las letras latinas y la puntuación habitual, 1; el resto, 2.
const URL_RE = /https?:\/\/\S+/g;
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const segmentador = "Segmenter" in Intl ? new Intl.Segmenter("es", { granularity: "grapheme" }) : null;

function pesoCaracter(cp) {
  return cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247) ? 1 : 2;
}

function caracteresX(texto) {
  texto = texto.normalize("NFC");
  let total = 0;
  texto = texto.replace(URL_RE, () => { total += 23; return ""; });
  const grafemas = segmentador ? Array.from(segmentador.segment(texto), (s) => s.segment) : Array.from(texto);
  for (const g of grafemas) {
    if (EMOJI_RE.test(g)) total += 2;
    else for (const c of g) total += pesoCaracter(c.codePointAt(0));
  }
  return total;
}

// ---------------- Pintar ----------------
const formatoFecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function tarjeta(e) {
  const nodo = $("plantilla-tarjeta").content.firstElementChild.cloneNode(true);
  const marca = estado[e.id]?.estado;
  nodo.dataset.id = e.id;
  nodo.classList.toggle("tarjeta--publicada", marca === "publicada");
  nodo.classList.toggle("tarjeta--borrada", marca === "borrada");

  const enlaceImagen = nodo.querySelector(".tarjeta__imagen");
  enlaceImagen.href = e.enlace;
  if (e.imagen) nodo.querySelector("img").src = e.imagen;
  else nodo.querySelector("img").remove();

  nodo.querySelector(".tarjeta__titulo").textContent = e.titulo || "(sin título)";
  const tiempo = nodo.querySelector("time");
  tiempo.dateTime = e.fecha;
  tiempo.textContent = e.fecha ? formatoFecha.format(new Date(e.fecha)) : "";
  nodo.querySelector(".tarjeta__marca").textContent =
    marca === "publicada" ? "✓ Publicada" : marca === "borrada" ? "Borrada" : "";

  nodo.querySelector(".tarjeta__texto").textContent = e.texto;
  const n = caracteresX(e.texto);
  const contador = nodo.querySelector(".tarjeta__caracteres");
  contador.textContent = `${n}/${LIMITE_X}` + (n > LIMITE_X ? ` · sobran ${n - LIMITE_X}` : "");
  contador.classList.toggle("tarjeta__caracteres--pasado", n > LIMITE_X);

  const hayToken = Boolean(leerToken());
  const publicar = nodo.querySelector(".boton--x");
  publicar.href = `https://x.com/intent/post?text=${encodeURIComponent(e.texto)}`;
  publicar.addEventListener("click", () => { if (hayToken && marca !== "publicada") marcar(e.id, "publicada"); });

  const deshacer = nodo.querySelector(".tarjeta__deshacer");
  deshacer.textContent = marca === "borrada" ? "Recuperar" : "Deshacer";
  deshacer.disabled = !hayToken;
  deshacer.title = hayToken ? "" : "Guarda el token para poder cambiarlo";
  deshacer.addEventListener("click", () => marcar(e.id, null));

  const borrar = nodo.querySelector(".tarjeta__borrar");
  borrar.disabled = !hayToken;
  borrar.title = hayToken ? "No publicarla y ocultarla" : "Guarda el token para poder borrar";
  borrar.addEventListener("click", () => marcar(e.id, "borrada"));
  return nodo;
}

function pintar() {
  const verBorradas = $("ver-borradas").checked;
  for (const tipo of ["video", "noticia", "resena"]) {
    const lista = $(`lista-${tipo}`);
    const entradas = cola.filter((e) => e.tipo === tipo);
    const visibles = entradas.filter((e) => verBorradas || estado[e.id]?.estado !== "borrada");
    lista.replaceChildren(...visibles.map(tarjeta));
    if (!visibles.length) {
      const vacio = document.createElement("p");
      vacio.className = "vacio";
      vacio.textContent = colaCargada ? "No hay nada por aquí." : "Cargando…";
      lista.append(vacio);
    }
    const pendientes = entradas.filter((e) => !estado[e.id]).length;
    $(`pendientes-${tipo}`).textContent = pendientes ? `· ${pendientes} pendiente${pendientes > 1 ? "s" : ""}` : "";
  }
}

// ---------------- Acciones ----------------
async function marcar(id, nuevo) {
  const anterior = estado[id];
  // Se pinta al momento y se guarda detrás; si falla, se vuelve atrás
  estado = { ...estado };
  if (nuevo) estado[id] = { estado: nuevo, fecha: new Date().toISOString() };
  else delete estado[id];
  pintar();
  avisar("Guardando…", false, true);
  try {
    await guardarCambio((datos) => {
      if (nuevo) datos[id] = { estado: nuevo, fecha: new Date().toISOString() };
      else delete datos[id];
    });
    avisar("Guardado");
  } catch (err) {
    estado = { ...estado };
    if (anterior) estado[id] = anterior;
    else delete estado[id];
    avisar(err.message, true);
  }
  pintar();
}

async function cargar() {
  avisar("Cargando…", false, true);
  try {
    const [nuevaCola, nuevoEstado] = await Promise.all([leerCola(), leerEstado()]);
    cola = Array.isArray(nuevaCola) ? nuevaCola : [];
    estado = nuevoEstado.datos || {};
    colaCargada = true;
    avisar("");
  } catch (err) {
    avisar(err.message, true);
  }
  pintar();
}

$("form-token").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const token = $("token").value.trim();
  if (!token) return;
  guardarToken(token);
  $("token").value = "";
  pintarToken();
  await cargar();
});

$("olvidar").addEventListener("click", () => {
  guardarToken("");
  pintarToken();
  pintar();
  avisar("Token olvidado en este navegador");
});

$("recargar").addEventListener("click", cargar);
$("ver-borradas").addEventListener("change", pintar);

pintarToken();
cargar();

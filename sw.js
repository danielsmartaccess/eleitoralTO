// ============================================================================
// sw.js — Service Worker do app de coleta.
//
// Estratégia (Seção 53): cache versionado do app shell (cache-first, com
// atualização em segundo plano), cache "runtime" para o CDN do supabase-js
// (necessário para o app abrir offline depois do primeiro carregamento
// online) e NENHUM cache para chamadas à API do Supabase — essas passam
// direto para a rede; se falharem por estar offline, é a fila de
// sincronização em IndexedDB (js/sync.js) que garante a entrega depois,
// não o Service Worker.
//
// Para forçar os aparelhos em campo a buscar uma versão nova do app, basta
// incrementar CACHE_VERSION — o `activate` apaga automaticamente os caches
// antigos, então nunca fica um Service Worker preso a arquivos velhos.
// ============================================================================

const CACHE_VERSION = "eleitoral-to-v2.7.3";
const CACHE_SHELL = `shell-${CACHE_VERSION}`;
const CACHE_RUNTIME = `runtime-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "./login.html",
  "./coleta.html",
  "./dashboard.html",
  "./relatorio.html",
  "./admin.html",
  "./manifest.json",
  "./css/app.css",
  "./css/coleta.css",
  "./css/dashboard.css",
  "./css/admin.css",
  "./config/pesquisa.js",
  "./config/supabase.js",
  "./js/app.js",
  "./js/utils.js",
  "./js/db.js",
  "./js/auth.js",
  "./js/supabaseClient.js",
  "./js/questionario.js",
  "./js/sync.js",
  "./js/inicio.js",
  "./js/login.js",
  "./js/coleta.js",
  "./js/dashboard.js",
  "./js/relatorio.js",
  "./js/admin.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave !== CACHE_SHELL && chave !== CACHE_RUNTIME)
            .map((chave) => caches.delete(chave))
        )
      )
      .then(() => self.clients.claim())
  );
});

function ehChamadaSupabaseApi(url) {
  return url.hostname.endsWith(".supabase.co");
}

function ehCdnModulos(url) {
  return url.hostname === "esm.sh" || url.hostname.endsWith(".esm.sh");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST/RPC via fetch() do supabase-js segue direto pra rede

  const url = new URL(request.url);

  // Nunca interceptar chamadas ao Supabase: se estiver offline, a promise
  // rejeita naturalmente e é js/sync.js quem decide o que fazer (deixar na
  // fila e tentar de novo depois), não o cache do Service Worker.
  if (ehChamadaSupabaseApi(url)) return;

  if (ehCdnModulos(url)) {
    event.respondWith(cachePrimeiroComRuntimeCache(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cachePrimeiroComAtualizacao(request));
  }
});

async function cachePrimeiroComAtualizacao(request) {
  const cache = await caches.open(CACHE_SHELL);
  const emCache = await cache.match(request);

  const buscarERenovar = fetch(request)
    .then((resposta) => {
      if (resposta && resposta.ok) cache.put(request, resposta.clone());
      return resposta;
    })
    .catch(() => null);

  return emCache || (await buscarERenovar) || Response.error();
}

async function cachePrimeiroComRuntimeCache(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const emCache = await cache.match(request);
  if (emCache) return emCache;

  try {
    const resposta = await fetch(request);
    if (resposta && resposta.ok) cache.put(request, resposta.clone());
    return resposta;
  } catch (erro) {
    return emCache || Response.error();
  }
}

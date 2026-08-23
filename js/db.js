// ============================================================================
// js/db.js — camada de persistência offline (IndexedDB).
//
// Este módulo é o coração do requisito "offline-first": toda entrevista vive
// aqui primeiro, e só é enviada ao Supabase depois de finalizada. Nenhuma
// outra parte do app deve abrir o IndexedDB diretamente — sempre passar por
// estas funções, para manter um único ponto de verdade sobre o formato dos
// registros locais.
// ============================================================================

const DB_NAME = "eleitoral_to_db";
const DB_VERSION = 1;

const STORE_ENTREVISTAS = "entrevistas";
const STORE_CONFIG_LOCAL = "config_local";

let dbPromise = null;

/** Abre (ou cria) o banco local. A promise é cacheada — só há uma conexão viva. */
export function abrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;

      if (!db.objectStoreNames.contains(STORE_ENTREVISTAS)) {
        const store = db.createObjectStore(STORE_ENTREVISTAS, { keyPath: "session_id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("sync_status", "sync_status", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CONFIG_LOCAL)) {
        db.createObjectStore(STORE_CONFIG_LOCAL, { keyPath: "chave" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function promisificarRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function comStore(nomeStore, modo, fn) {
  const db = await abrirDB();
  const tx = db.transaction(nomeStore, modo);
  const store = tx.objectStore(nomeStore);
  const resultado = await fn(store);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Entrevistas
// ---------------------------------------------------------------------------

/**
 * Grava (cria ou atualiza) uma entrevista local. Como a chave é o session_id,
 * gravar de novo com o mesmo session_id sempre sobrescreve o mesmo registro —
 * é assim que o salvamento progressivo evita duplicar a entrevista em disco.
 */
export async function salvarEntrevista(entrevista) {
  entrevista.updated_at = new Date().toISOString();
  return comStore(STORE_ENTREVISTAS, "readwrite", (store) => {
    store.put(entrevista);
  });
}

export async function obterEntrevista(sessionId) {
  return comStore(STORE_ENTREVISTAS, "readonly", (store) =>
    promisificarRequest(store.get(sessionId))
  );
}

export async function listarEntrevistas() {
  return comStore(STORE_ENTREVISTAS, "readonly", (store) =>
    promisificarRequest(store.getAll())
  );
}

/** Entrevistas iniciadas mas não finalizadas — tela "Entrevistas pendentes" (retomada). */
export async function listarEmAndamento() {
  const todas = await listarEntrevistas();
  return todas.filter((e) => e.status === "em_andamento");
}

/** Entrevistas completas que ainda não foram confirmadas pelo servidor. */
export async function listarPendentesSync() {
  const todas = await listarEntrevistas();
  return todas.filter((e) => e.status === "completo" && e.sync_status !== "sincronizado");
}

export async function marcarSincronizada(sessionId) {
  const entrevista = await obterEntrevista(sessionId);
  if (!entrevista) return;
  entrevista.sync_status = "sincronizado";
  entrevista.sync_error = null;
  entrevista.sincronizado_em = new Date().toISOString();
  return salvarEntrevista(entrevista);
}

export async function marcarErroSync(sessionId, mensagemErro) {
  const entrevista = await obterEntrevista(sessionId);
  if (!entrevista) return;
  entrevista.sync_status = "erro";
  entrevista.sync_error = mensagemErro;
  entrevista.sync_tentativas = (entrevista.sync_tentativas || 0) + 1;
  return salvarEntrevista(entrevista);
}

export async function excluirEntrevista(sessionId) {
  return comStore(STORE_ENTREVISTAS, "readwrite", (store) => {
    store.delete(sessionId);
  });
}

// ---------------------------------------------------------------------------
// Nome do pesquisador (lembrado no aparelho, sem autenticação)
// ---------------------------------------------------------------------------

const CHAVE_PESQUISADOR = "pesquisador";

export async function salvarNomePesquisador(nome) {
  return comStore(STORE_CONFIG_LOCAL, "readwrite", (store) => {
    store.put({ chave: CHAVE_PESQUISADOR, nome: (nome || "").trim() });
  });
}

export async function obterNomePesquisador() {
  const registro = await comStore(STORE_CONFIG_LOCAL, "readonly", (store) =>
    promisificarRequest(store.get(CHAVE_PESQUISADOR))
  );
  return registro?.nome || null;
}

export async function limparNomePesquisador() {
  return comStore(STORE_CONFIG_LOCAL, "readwrite", (store) => {
    store.delete(CHAVE_PESQUISADOR);
  });
}

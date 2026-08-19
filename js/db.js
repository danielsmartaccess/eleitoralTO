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
const STORE_AUDITORIA = "auditoria";
const STORE_SESSAO = "sessao_pesquisador";

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

      if (!db.objectStoreNames.contains(STORE_AUDITORIA)) {
        db.createObjectStore(STORE_AUDITORIA, { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(STORE_SESSAO)) {
        db.createObjectStore(STORE_SESSAO, { keyPath: "chave" });
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
// Auditoria local (espelha os eventos que também vão para a tabela `auditoria`
// no Supabase; mantida localmente para funcionar 100% offline).
// ---------------------------------------------------------------------------

export async function registrarAuditoriaLocal(evento) {
  const registro = { ...evento, timestamp: evento.timestamp || new Date().toISOString(), sync_status: "pendente" };
  return comStore(STORE_AUDITORIA, "readwrite", (store) => {
    store.add(registro);
  });
}

export async function listarAuditoriaLocal() {
  return comStore(STORE_AUDITORIA, "readonly", (store) =>
    promisificarRequest(store.getAll())
  );
}

export async function listarAuditoriaPendenteSync() {
  const todas = await listarAuditoriaLocal();
  return todas.filter((a) => a.sync_status !== "sincronizado");
}

export async function marcarAuditoriaSincronizada(id) {
  return comStore(STORE_AUDITORIA, "readwrite", async (store) => {
    const registro = await promisificarRequest(store.get(id));
    if (registro) {
      registro.sync_status = "sincronizado";
      store.put(registro);
    }
  });
}

// ---------------------------------------------------------------------------
// Sessão do pesquisador logado (token validado, dados de contexto)
// ---------------------------------------------------------------------------

const CHAVE_SESSAO = "sessao_atual";

export async function salvarSessaoPesquisador(sessao) {
  return comStore(STORE_SESSAO, "readwrite", (store) => {
    store.put({ chave: CHAVE_SESSAO, ...sessao });
  });
}

export async function obterSessaoPesquisador() {
  return comStore(STORE_SESSAO, "readonly", (store) =>
    promisificarRequest(store.get(CHAVE_SESSAO))
  );
}

export async function limparSessaoPesquisador() {
  return comStore(STORE_SESSAO, "readwrite", (store) => {
    store.delete(CHAVE_SESSAO);
  });
}

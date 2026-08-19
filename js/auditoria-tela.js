// ============================================================================
// js/auditoria-tela.js — tela de auditoria/supervisão (auditoria.html,
// Seção 58). Consome as views vw_auditoria_suspeitas e
// vw_auditoria_volume_dispositivo, além da tabela `auditoria` (eventos
// sync_erro). Só leitura — a decisão sobre o que fazer com uma entrevista
// sinalizada é humana, não automática.
// ============================================================================

import { exigirLoginAdmin, logoutAdmin } from "./auth.js";
import { supabase } from "./supabaseClient.js";
import { registrarServiceWorker, iniciarIndicadorConexao } from "./app.js";
import { escapeHtml, formatarDataHora, formatarDuracao, codigoCurto } from "./utils.js";

const config = window.PESQUISA_CONFIG;

async function carregarSuspeitas() {
  const { data, error } = await supabase
    .from("vw_auditoria_suspeitas")
    .select("*")
    .order("coletado_em", { ascending: false })
    .range(0, 499);

  const el = document.getElementById("tabela-suspeitas");
  if (error) {
    el.innerHTML = `<p class="texto-suave">Erro: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    el.innerHTML = `<p class="texto-suave">Nenhuma entrevista sinalizada até o momento.</p>`;
    return;
  }

  el.innerHTML = `
    <table class="tabela-simples">
      <thead><tr><th>Código</th><th>Pesquisador</th><th>Município</th><th>Duração</th><th>GPS</th><th>Motivo</th><th>Coletada em</th></tr></thead>
      <tbody>
        ${data
          .map((e) => {
            const motivos = [];
            if (e.suspeita_duracao) motivos.push("duração curta");
            if (e.sem_gps) motivos.push("sem GPS");
            return `<tr>
              <td class="mono">#${codigoCurto(e.session_id)}</td>
              <td>${escapeHtml(e.pesquisador || "-")}</td>
              <td>${escapeHtml(e.municipio || "-")}</td>
              <td>${formatarDuracao(e.duracao_seg)}</td>
              <td>${escapeHtml(e.geo_status || "-")}</td>
              <td><span class="badge badge-alerta">${escapeHtml(motivos.join(", "))}</span></td>
              <td>${formatarDataHora(e.coletado_em)}</td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

async function carregarVolumeDispositivo() {
  document.getElementById("limite-dispositivo").textContent = config.auditoria?.maxEntrevistasPorDispositivoPorDia ?? "-";

  const { data, error } = await supabase
    .from("vw_auditoria_volume_dispositivo")
    .select("*")
    .order("total_entrevistas", { ascending: false })
    .range(0, 199);

  const el = document.getElementById("tabela-dispositivos");
  if (error || !data || data.length === 0) {
    el.innerHTML = `<p class="texto-suave">Sem dados de dispositivo ainda.</p>`;
    return;
  }

  el.innerHTML = `
    <table class="tabela-simples">
      <thead><tr><th>Dispositivo</th><th>Total de entrevistas</th><th>Primeira</th><th>Última</th></tr></thead>
      <tbody>
        ${data
          .map(
            (d) => `<tr>
              <td style="max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(d.device_info || "-")}</td>
              <td class="mono">${d.total_entrevistas}</td>
              <td>${formatarDataHora(d.primeira)}</td>
              <td>${formatarDataHora(d.ultima)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

async function carregarFalhasSync() {
  const { data, error } = await supabase
    .from("auditoria")
    .select("evento, entrevista_session_id, metadata, timestamp")
    .eq("evento", "sync_erro")
    .order("timestamp", { ascending: false })
    .range(0, 199);

  const el = document.getElementById("tabela-falhas-sync");
  if (error || !data || data.length === 0) {
    el.innerHTML = `<p class="texto-suave">Nenhuma falha de sincronização registrada.</p>`;
    return;
  }

  el.innerHTML = `
    <table class="tabela-simples">
      <thead><tr><th>Entrevista</th><th>Erro</th><th>Quando</th></tr></thead>
      <tbody>
        ${data
          .map(
            (a) => `<tr>
              <td class="mono">${escapeHtml(a.entrevista_session_id || "-")}</td>
              <td>${escapeHtml(a.metadata?.erro || "-")}</td>
              <td>${formatarDataHora(a.timestamp)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

async function inicializar() {
  const usuario = await exigirLoginAdmin();
  if (!usuario) return;

  registrarServiceWorker();
  iniciarIndicadorConexao();

  await Promise.all([carregarSuspeitas(), carregarVolumeDispositivo(), carregarFalhasSync()]);

  document.getElementById("btn-sair-admin").addEventListener("click", async () => {
    await logoutAdmin();
    window.location.href = "login.html?admin=1";
  });
}

inicializar();

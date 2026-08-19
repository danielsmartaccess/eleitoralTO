// ============================================================================
// js/login.js — tela de login (login.html). Suporta os dois mecanismos de
// autenticação descritos em js/auth.js: token de pesquisador e conta
// administrativa (Supabase Auth), alternados via ?admin=1.
// ============================================================================

import { loginPesquisador, loginAdmin, obterSessaoAtual, obterUsuarioAdmin } from "./auth.js";
import { registrarEvento, EVENTOS } from "./auditoria.js";
import { registrarServiceWorker } from "./app.js";

registrarServiceWorker();

const params = new URLSearchParams(window.location.search);
const modoAdmin = params.get("admin") === "1";

document.getElementById("bloco-pesquisador").classList.toggle("oculto", modoAdmin);
document.getElementById("bloco-admin").classList.toggle("oculto", !modoAdmin);

function mostrarErro(id, mensagem) {
  const el = document.getElementById(id);
  el.textContent = mensagem;
  el.classList.remove("oculto");
}

function limparErro(id) {
  document.getElementById(id).classList.add("oculto");
}

async function redirecionarSeJaLogado() {
  if (modoAdmin) {
    const usuario = await obterUsuarioAdmin();
    if (usuario) window.location.href = "dashboard.html";
  } else {
    const sessao = await obterSessaoAtual();
    if (sessao) window.location.href = "index.html";
  }
}

document.getElementById("form-login").addEventListener("submit", async (evt) => {
  evt.preventDefault();
  limparErro("erro-login");
  const btn = document.getElementById("btn-entrar");
  const token = document.getElementById("input-token").value;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Entrando...`;
  try {
    const sessao = await loginPesquisador(token);
    await registrarEvento(EVENTOS.LOGIN, { equipeId: sessao.equipe_id, metadata: { municipio: sessao.municipio } });
    window.location.href = "index.html";
  } catch (erro) {
    mostrarErro("erro-login", erro.message);
    btn.disabled = false;
    btn.textContent = "ENTRAR";
  }
});

document.getElementById("form-login-admin").addEventListener("submit", async (evt) => {
  evt.preventDefault();
  limparErro("erro-login-admin");
  const btn = document.getElementById("btn-entrar-admin");
  const email = document.getElementById("input-email").value;
  const senha = document.getElementById("input-senha").value;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Entrando...`;
  try {
    await loginAdmin(email, senha);
    window.location.href = "dashboard.html";
  } catch (erro) {
    mostrarErro("erro-login-admin", erro.message);
    btn.disabled = false;
    btn.textContent = "ENTRAR";
  }
});

redirecionarSeJaLogado();

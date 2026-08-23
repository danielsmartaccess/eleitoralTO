// ============================================================================
// js/login.js — login administrativo (login.html), via Supabase Auth.
// O app de campo não tem login: ver index.html/js/inicio.js.
// ============================================================================

import { loginAdmin, obterUsuarioAdmin } from "./auth.js";
import { registrarServiceWorker } from "./app.js";

registrarServiceWorker();

function mostrarErro(id, mensagem) {
  const el = document.getElementById(id);
  el.textContent = mensagem;
  el.classList.remove("oculto");
}

function limparErro(id) {
  document.getElementById(id).classList.add("oculto");
}

async function redirecionarSeJaLogado() {
  const usuario = await obterUsuarioAdmin();
  if (usuario) window.location.href = "dashboard.html";
}

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

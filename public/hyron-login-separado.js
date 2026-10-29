// Login separado, sem inicializar a aplicacao privada.
const $ = (q) => document.querySelector(q);
const qs = new URLSearchParams(location.search);
const inviteToken = qs.get('invite');
const status = $('#login-status');
async function api(path, method='GET', payload) {
  const response = await fetch(path, {method, credentials:'same-origin', cache:'no-store',
    headers: payload ? {'content-type':'application/json'} : {},
    body: payload ? JSON.stringify(payload) : undefined});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || `Falha de acesso (${response.status})`);
  return data;
}
function showLogin() {
  $('#auth').hidden = !!inviteToken;
  $('#invite-signup').hidden = !inviteToken;
  status.hidden = true;
}
const mode = $('#auth-mode');
function updateMode() {
  $('#invite-wrap').hidden = mode.value !== 'register';
  $('#setup-wrap').hidden = mode.value !== 'setup';
  $('#auth-submit').textContent = mode.value === 'login' ? 'Entrar' : mode.value === 'register' ? 'Criar conta' : 'Criar administrador';
}
mode.addEventListener('change', updateMode); updateMode();
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#auth-submit'); button.disabled = true;
  $('#auth-error').textContent = '';
  try {
    const payload = { username: $('#username').value, password: $('#password').value,
      inviteCode: $('#invite').value, setupKey: $('#setup').value };
    const endpoint = mode.value === 'login' ? '/api/auth/login' : mode.value === 'register' ? '/api/auth/register' : '/api/setup';
    await api(endpoint, 'POST', payload);
    if (mode.value === 'login') location.replace('/');
    else { mode.value = 'login'; updateMode(); $('#password').value = ''; $('#auth-error').textContent = 'Conta criada! Entre com suas credenciais.'; }
  } catch (error) { $('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#invite-signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const p = $('#invite-signup-pass').value;
  if (p !== $('#invite-signup-confirm').value) { $('#invite-signup-error').textContent = 'As senhas não coincidem'; return; }
  const btn = $('#invite-signup-form button'); btn.disabled = true;
  try { await api('/api/auth/claim-invite', 'POST', {token:inviteToken, password:p}); location.replace('/'); }
  catch (e) { $('#invite-signup-error').textContent = e.message; btn.disabled = false; }
});
async function init() {
  if (inviteToken) {
    showLogin();
    try { const d = await api('/api/auth/invite-info?token='+encodeURIComponent(inviteToken)); $('#invite-signup-user').value = d.username; }
    catch (e) { $('#invite-signup-error').textContent = e.message; $('#invite-signup-form button').disabled = true; }
    return;
  }
  try { await api('/api/auth/me'); location.replace('/'); }
  catch { showLogin(); }
}
init();

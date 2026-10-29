// HYRON_ADMIN_PASSWORD_RESET_V1
(() => {
 const params=new URLSearchParams(location.search);const token=params.get('reset');
 if(token){
  history.replaceState(null,'',location.pathname); // Remove segredo da barra de endereço e do histórico visível.
  const screen=document.createElement('section');screen.className='auth-box';screen.id='hyron-reset-screen';
  screen.style.cssText='position:fixed;inset:0;z-index:2147483600;margin:auto;max-width:480px;max-height:fit-content;background:var(--panel,#151922);padding:24px;border:1px solid #777;border-radius:12px;color:inherit;box-shadow:0 0 0 100vmax rgba(0,0,0,.85)';
  screen.innerHTML='<h2>Recuperar acesso ao HYRON</h2><p id="hyr-reset-info">Verificando link...</p><form id="hyr-reset-form" hidden><label>Nova senha (mínimo 12 caracteres)<input type="password" name="pass" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Confirmar senha<input type="password" name="confirm" required minlength="12" maxlength="128" autocomplete="new-password"></label><button type="submit">Definir nova senha</button></form><p id="hyr-reset-status" role="alert"></p><a href="/">Voltar ao login</a>';
  document.body.append(screen);
  const info=screen.querySelector('#hyr-reset-info'),form=screen.querySelector('form'),status=screen.querySelector('#hyr-reset-status');
  fetch('/api/auth/reset-info?token='+encodeURIComponent(token),{credentials:'same-origin',referrerPolicy:'no-referrer'}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Link inválido');info.textContent='Conta: '+j.username;form.hidden=false;}).catch(e=>{info.textContent=e.message;});
  form.addEventListener('submit',async e=>{e.preventDefault();const password=form.elements.pass.value,confirm=form.elements.confirm.value;if(password!==confirm){status.textContent='As senhas não coincidem.';return;}const btn=form.querySelector('button');btn.disabled=true;try{const r=await fetch('/api/auth/reset-password',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token,password})});const j=await r.json();if(!r.ok)throw Error(j.error||'Falha ao redefinir');form.hidden=true;info.textContent='Senha alterada. Faça login novamente.';status.textContent='Sessões anteriores encerradas.';}catch(err){status.textContent=err.message;btn.disabled=false;}});
 }
 // Cria controle independente no painel já existente sem interferir nas linhas de usuários.
 const admin=document.getElementById('admin-panel');if(!admin)return;
 const block=document.createElement('section');block.style.cssText='padding:12px;margin-top:12px;border:1px solid currentColor;border-radius:8px';
 block.innerHTML='<h3>Recuperação de senha por link</h3><p>Confirme a identidade da pessoa antes de enviar o link. Válido por 30 minutos e uso único.</p><label>Conta <select id="hyr-reset-target"></select></label><button id="hyr-reset-generate" type="button">Gerar link de recuperação</button><p id="hyr-reset-admin-status" role="status"></p><input id="hyr-reset-url" readonly hidden aria-label="Link de recuperação"><button id="hyr-reset-copy" type="button" hidden>Copiar link</button>';
 admin.append(block);
 const target=block.querySelector('#hyr-reset-target'),status=block.querySelector('#hyr-reset-admin-status'),url=block.querySelector('#hyr-reset-url'),copy=block.querySelector('#hyr-reset-copy');
 async function refresh(){try{const r=await fetch('/api/admin/users',{credentials:'same-origin'});if(!r.ok)return;const data=await r.json();target.replaceChildren();for(const u of data.users||[]){if(u.disabled)continue;const opt=document.createElement('option');opt.value=u.id;opt.textContent=u.username+' ('+u.role+')';target.append(opt);}}catch{}}
 document.getElementById('admin')?.addEventListener('click',()=>{setTimeout(refresh,100);});
 block.querySelector('#hyr-reset-generate').addEventListener('click',async()=>{if(!target.value)return; if(!confirm('Você verificou a identidade deste usuário? O novo link invalida o anterior.'))return;status.textContent='Gerando...';url.hidden=true;copy.hidden=true;try{const r=await fetch('/api/admin/password-reset-link',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({userId:target.value})});const j=await r.json();if(!r.ok)throw Error(j.error||'Falha');url.value=j.url;url.hidden=false;copy.hidden=false;status.textContent='Link de '+j.username+' criado. Envie apenas ao titular por canal confiável.';}catch(e){status.textContent=e.message;}});
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url.value);status.textContent='Link copiado.';}catch{url.select();status.textContent='Copie o link selecionado.';}});
})();

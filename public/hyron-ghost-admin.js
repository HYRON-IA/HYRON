// HYRON v0.8.3 - Admin geral: painel Protocolo Fantasma
(() => {
  'use strict';
  const request = async (method, path, payload) => {
    const r = await fetch(path, {method, credentials:'same-origin', headers: payload?{'Content-Type':'application/json'}:{}, body:payload?JSON.stringify(payload):undefined});
    if (!r.ok) throw new Error('Operação não autorizada ou indisponível ('+r.status+').');
    return r.json();
  };
  async function init() {
    const anchor=document.getElementById('admin');
    if (!anchor || document.getElementById('hyron-ghost-open')) return;
    let current;
    try { current=(await request('GET','/api/auth/me')).user; } catch { return; }
    if (current?.role !== 'admin') return;
    const open=document.createElement('button'); open.type='button';open.id='hyron-ghost-open';open.textContent='👻 Protocolo Fantasma';open.style.margin='6px';
    anchor.insertAdjacentElement('afterend',open);
    const panel=document.createElement('section');panel.id='hyron-ghost-panel';panel.hidden=true;
    panel.style.cssText='position:fixed;z-index:99999;inset:12% 8%;overflow:auto;border:1px solid #778;padding:20px;border-radius:14px;background:#111;color:#fff;box-shadow:0 12px 50px #000b;';
    panel.innerHTML='<h2>👻 Protocolo Fantasma</h2><p>Exclusivo da administração geral. Bloqueio silencioso de ações e recebimento.</p><button type="button" id="hyron-ghost-close">Fechar</button><p id="hyron-ghost-feedback" role="status"></p><div id="hyron-ghost-users"></div>';
    document.body.append(panel);
    const feedback=panel.querySelector('#hyron-ghost-feedback'), list=panel.querySelector('#hyron-ghost-users');
    panel.querySelector('#hyron-ghost-close').onclick=()=>panel.hidden=true;
    const refresh=async()=>{const rows=(await request('GET','/api/admin/ghost')).users||[];list.replaceChildren();for(const person of rows){
      const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px;border-bottom:1px solid #333';
      const name=document.createElement('span');name.textContent=person.username+' ('+person.role+')'+(person.blocked?' — ISOLADO':'');name.style.flex='1';line.append(name);
      const button=document.createElement('button');button.type='button';button.disabled=person.id===current.id||person.role==='admin';button.textContent=person.blocked?'Desativar':'Ativar';
      button.onclick=async()=>{const enabled=!person.blocked;let reason='';if(enabled){reason=prompt('Motivo administrativo (não exibido ao usuário):')||'';if(!reason.trim())return;}if(!confirm((enabled?'Ativar':'Desativar')+' bloqueio de '+person.username+'?'))return;button.disabled=true;try{await request('PATCH','/api/admin/ghost',{id:person.id,enabled,reason});feedback.textContent='Atualizado.';await refresh();}catch(e){feedback.textContent=e.message;button.disabled=false;}};
      line.append(button);list.append(line);
    }};
    open.onclick=async()=>{panel.hidden=false;feedback.textContent='Carregando...';try{await refresh();feedback.textContent='';}catch(e){feedback.textContent=e.message;}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,800));else setTimeout(init,800);
  document.addEventListener('click',event=>{if(event.target?.closest?.('#admin'))setTimeout(init,250);});
})();

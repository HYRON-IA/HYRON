/* HYRON 0.8.5 — Painel Surto Coletivo: API autenticada já existente. */
(()=>{'use strict';
let active=null,canEdit=false,open=false,revision=0;
const q=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=document.createElement('button');btn.type='button';btn.className='hyron-surto-toggle';btn.textContent='🐍 Surto Coletivo';btn.hidden=true;btn.setAttribute('aria-expanded','false');
const modal=document.createElement('section');modal.className='hyron-surto-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Configurações do Surto Coletivo');
modal.innerHTML='<div class="hyron-surto-card"><header><strong>🐍 Surto Coletivo · V0.8.5</strong><button type="button" data-action="close" aria-label="Fechar">✕</button></header><p class="hyron-surto-hint">Configure as intervenções espontâneas apenas neste grupo.</p><div class="hyron-surto-fields"><label class="hyron-surto-enabled"><input type="checkbox" name="enabled"> Ativar intervenções</label><label>Intervalo N (mensagens humanas)<input name="interval" type="number" min="1" max="100" step="1" required></label><label>Chance de intervenção (%)<input name="chance" type="number" min="0" max="100" step="1" required></label><label>Limite de respostas por debate<input name="maxReplies" type="number" min="1" max="8" step="1" required></label></div><p class="hyron-surto-hint">A cada N mensagens humanas, uma intervenção <b>pode</b> ocorrer; ela não é obrigatória. Os internos podem permanecer em silêncio.</p><p class="hyron-surto-status" role="status" aria-live="polite"></p><footer><button type="button" data-action="cancel">Cancelar</button><button type="button" data-action="save">Salvar configurações</button></footer></div>';
document.body.append(modal);
function locate(){const panel=q('.hyron-groups-panel');const head=panel?.querySelector('.hyron-groups-row');if(head&&!btn.isConnected)head.insertBefore(btn,head.lastElementChild);return panel;}
function setStatus(s){modal.querySelector('.hyron-surto-status').textContent=s;}
function close(){modal.hidden=true;open=false;btn.setAttribute('aria-expanded','false');}
function show(){if(!active||!canEdit)return;open=true;modal.hidden=false;btn.setAttribute('aria-expanded','true');modal.querySelector('[name="enabled"]').focus();}
function populate(s){for(const name of ['interval','chance','maxReplies'])modal.querySelector('[name="'+name+'"]').value=s[name];modal.querySelector('[name="enabled"]').checked=!!s.enabled;}
async function load(id){const token=++revision;active=id;canEdit=false;close();locate();btn.hidden=true;try{const r=await fetch('/api/groups/'+encodeURIComponent(id)+'/surto',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha HTTP '+r.status);if(token!==revision)return;canEdit=!!d.canEdit;btn.hidden=!canEdit;populate(d.settings);setStatus('');}catch(e){if(token===revision){btn.hidden=true;console.warn('HYRON Surto Coletivo:',e.message);}}}
function hide(){revision++;active=null;canEdit=false;btn.hidden=true;close();}
document.addEventListener('hyron:group-selected',e=>{if(e.detail&&/^[a-f0-9-]{36}$/i.test(e.detail.groupId||''))load(e.detail.groupId);});
btn.addEventListener('click',show);
modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-action="close"],[data-action="cancel"]'))close();});
document.addEventListener('keydown',e=>{if(open&&e.key==='Escape')close();});
modal.querySelector('[data-action="save"]').addEventListener('click',async()=>{if(!active||!canEdit)return;const id=active;const payload={enabled:modal.querySelector('[name="enabled"]').checked};for(const name of ['interval','chance','maxReplies']){const el=modal.querySelector('[name="'+name+'"]');if(!el.checkValidity()){el.reportValidity();return;}payload[name]=Number(el.value);}const save=modal.querySelector('[data-action="save"]');save.disabled=true;setStatus('Salvando…');try{const r=await fetch('/api/groups/'+encodeURIComponent(id)+'/surto',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error||'Falha HTTP '+r.status);if(active!==id)return;populate(d.settings);setStatus('Configurações salvas.');setTimeout(()=>{if(active===id)close();},900);}catch(e){setStatus('Erro: '+e.message);}finally{save.disabled=false;}});
const observer=new MutationObserver(()=>{const panel=locate();if(!panel||panel.hidden||!panel.classList.contains('has-group')){if(active)hide();}});
observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
locate();
})();

// HYRON 0.8.2: in-page and (opt-in) browser notifications. No service worker.
const key='hyron-notifications-enabled';
const root=document.createElement('div');root.id='hyron-notifications-root';root.innerHTML=`<button type="button" id="hyron-notification-bell" aria-label="Notificações" title="Notificações">🔔 <span id="hyron-notification-count" hidden>0</span></button><div id="hyron-notification-popover" hidden><header><strong>Notificações</strong><button type="button" id="hyron-notification-enable">Ativar avisos do navegador</button><button type="button" id="hyron-notification-clear">Limpar</button></header><div id="hyron-notification-list"></div></div><div id="hyron-notification-toasts" aria-live="polite"></div>`;
document.body.append(root);
const bell=root.querySelector('#hyron-notification-bell');
const badge=root.querySelector('#hyron-notification-count');
const pop=root.querySelector('#hyron-notification-popover');
const list=root.querySelector('#hyron-notification-list');
const enable=root.querySelector('#hyron-notification-enable');
let notices=[];
let currentUser=null;
const seenByUser=new Map();
function redraw(){/* HYRON_083_MOBILE_BELL_MINIMAL_V1 */bell.classList.toggle('hyron-has-notifications',notices.length>0);bell.setAttribute('aria-label',notices.length ? 'Notificações não lidas: '+notices.length : 'Notificações');badge.hidden=!notices.length;badge.textContent=String(Math.min(99,notices.length));list.replaceChildren();if(!notices.length){const empty=document.createElement('p');empty.textContent='Sem notificações recentes.';list.append(empty);}for(const item of notices){const b=document.createElement('button');b.type='button';b.className='hyron-notification-entry';const title=document.createElement('strong');title.textContent=item.title;const desc=document.createElement('small');desc.textContent=item.body;b.append(title,desc);b.onclick=()=>{pop.hidden=true;notices=notices.filter(n=>n!==item);redraw();item.open?.();};list.append(b);}}
function dispatch(title,body,open,system=false){const item={title,body,open};notices.unshift(item);notices=notices.slice(0,30);redraw();const toast=document.createElement('button');toast.className='hyron-notification-toast';toast.type='button';toast.textContent=title+' — '+body;toast.onclick=()=>{toast.remove();open?.();};root.querySelector('#hyron-notification-toasts').append(toast);setTimeout(()=>toast.remove(),7000);
 if(system&&localStorage.getItem(key)==='1'&&document.hidden&&'Notification' in window&&Notification.permission==='granted'){const n=new Notification('HYRON · '+title,{body,tag:'hyron-'+Date.now()});n.onclick=()=>{window.focus();open?.();n.close();};}}
window.hyronNotify=(title,body,open,system=true)=>dispatch(title,body,open,system);
bell.onclick=()=>{pop.hidden=!pop.hidden;};root.querySelector('#hyron-notification-clear').onclick=()=>{notices=[];redraw();};
enable.onclick=async()=>{if(!('Notification' in window)){enable.textContent='Avisos indisponíveis';return;}const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem(key,'1');enable.textContent='Avisos ativados';}else{enable.textContent='Permissão não concedida';}};
if(localStorage.getItem(key)==='1')enable.textContent='Avisos ativados';
// Check private messages even when the DM panel is closed; no polling prior to login.
async function poll(){if(document.hidden&&localStorage.getItem(key)!=='1')return;try{const me=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(!me.ok){currentUser=null;return;}const d=await me.json();const id=d.user?.id;if(!id)return;
 if(currentUser!==id){currentUser=id;seenByUser.delete(id);notices=[];redraw();}
 const r=await fetch('/api/dm/threads',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const data=await r.json();const current=new Map((data.threads||[]).map(t=>[t.id,Number(t.unread)||0]));const previous=seenByUser.get(id);seenByUser.set(id,current);if(!previous)return;
 for(const t of data.threads||[]){const now=Number(t.unread)||0;const before=previous.get(t.id)||0;if(now>before){dispatch('Mensagem de '+t.partner,now-before+' nova(s) mensagem(ns)',()=>window.hyronOpenDmThread?.(t.id),true);}}
 }catch{}}
setInterval(poll,12000);setTimeout(poll,2500);
redraw();

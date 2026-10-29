// HYRON_SIDEBAR_V0524 — layout visual, sem alterar APIs, historico ou preferencias.
const app = document.querySelector('#app');
if (app && !document.querySelector('#hyron-sidebar')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = '/sidebar.css'; document.head.append(style);
  const sidebar = document.createElement('aside');
  sidebar.id = 'hyron-sidebar'; sidebar.setAttribute('aria-label', 'Menu e historico HYRON');
  const brand = document.createElement('div');brand.className='sidebar-brand';brand.innerHTML='<span class="sidebar-mark" aria-hidden="true">ϟ</span><span><strong>HYRON</strong><small>Suas conversas</small></span>';
  sidebar.append(brand);
  const historyLabel=document.createElement('h2');historyLabel.className='sidebar-title';historyLabel.textContent='Histórico';sidebar.append(historyLabel);
  const historyBar=app.querySelector('.history-bar');const search=app.querySelector('#search');const actions=app.querySelector('.actions');
  if(historyBar) sidebar.append(historyBar);
  if(search) sidebar.append(search);
  const historyList=document.createElement('div');historyList.id='sidebar-conversations';historyList.setAttribute('role','list');historyList.setAttribute('aria-label','Lista de conversas');sidebar.append(historyList);
  const management=document.createElement('div');management.className='sidebar-management';
  for(const id of ['rename','clear']){const b=app.querySelector('#'+id);if(b) management.append(b);}
  sidebar.append(management);
  if(actions) {actions.classList.add('sidebar-actions');sidebar.append(actions);}
  const tools=document.createElement('details');tools.id='hyron-voice-drawer';tools.className='sidebar-tools';
  const summary=document.createElement('summary');summary.textContent='🔊 Narração e voz';tools.append(summary);
  const voice=app.querySelector('#voice-settings');if(voice)tools.append(voice);
  sidebar.append(tools);
  const panel=app.querySelector('#admin-panel');if(panel)sidebar.append(panel);
  // HYRON_LAYOUT_COMPACT_V065B: move somente os botoes; painel Drive continua no chat.
  const driveButton=app.querySelector('#hyron-drive-open');
  if(driveButton){
    const driveMenu=document.createElement('div');
    driveMenu.className='sidebar-drive-action';
    driveMenu.append(driveButton);
    sidebar.insertBefore(driveMenu,tools);
  }
  const logoutButton=app.querySelector('#logout');
  if(logoutButton){
    const sessionMenu=document.createElement('div');
    sessionMenu.className='sidebar-session-action';
    sessionMenu.append(logoutButton);
    sidebar.append(sessionMenu);
  }
  const main=document.createElement('div');main.id='hyron-main';
  // Mantem todos os elementos do chat, login, narracao e eventos originais.
  for(const child of [...app.children]) main.append(child);
  app.prepend(main);app.prepend(sidebar);
  const header=main.querySelector('header');
  const toggle=document.createElement('button');toggle.type='button';toggle.id='sidebar-toggle';toggle.textContent='☰';toggle.setAttribute('aria-label','Abrir ou fechar menu');toggle.setAttribute('aria-controls','hyron-sidebar');toggle.setAttribute('aria-expanded','false');
  if(header) header.prepend(toggle);
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.id='sidebar-backdrop';backdrop.setAttribute('aria-label','Fechar menu lateral');app.insertBefore(backdrop,main);
  function closeMenu(){app.classList.remove('sidebar-open');toggle.setAttribute('aria-expanded','false');}
  toggle.addEventListener('click',()=>{const open=app.classList.toggle('sidebar-open');toggle.setAttribute('aria-expanded',String(open));});
  backdrop.addEventListener('click',closeMenu);
  if(driveButton)driveButton.addEventListener('click',closeMenu);
  if(logoutButton)logoutButton.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  const select=app.querySelector('#conversation');
  function renderHistory(){
    if(!select)return;
    const query=(search?.value||'').toLocaleLowerCase('pt-BR').trim();
    const choices=[...select.options].filter(x=>x.value && x.textContent.toLocaleLowerCase('pt-BR').includes(query));
    historyList.replaceChildren();
    if(!choices.length){const none=document.createElement('p');none.className='history-empty';none.textContent=query?'Nenhuma conversa encontrada.':'Nenhuma conversa ainda.';historyList.append(none);return;}
    for(const option of choices){
      const item=document.createElement('button');item.type='button';item.className='sidebar-conversation';item.textContent=option.textContent;item.title=option.textContent;item.dataset.conversationId=option.value;
      if(option.value===select.value){item.classList.add('active');item.setAttribute('aria-current','page');}
      item.addEventListener('click',()=>{if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}updateActive();closeMenu();});
      historyList.append(item);
    }
  }
  function updateActive(){for(const b of historyList.querySelectorAll('.sidebar-conversation')){const on=b.dataset.conversationId===select?.value;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}}
  if(select){new MutationObserver(()=>queueMicrotask(renderHistory)).observe(select,{childList:true,subtree:true,attributes:false});select.addEventListener('change',()=>queueMicrotask(updateActive));}
  if(search)search.addEventListener('input',renderHistory);
  const newBtn=sidebar.querySelector('#new');if(newBtn)newBtn.addEventListener('click',closeMenu);
  renderHistory();
  // Mantem o menu de administracao acessivel dentro da barra lateral.
  const admin=sidebar.querySelector('#admin');if(admin)admin.addEventListener('click',()=>tools.open=false);
}

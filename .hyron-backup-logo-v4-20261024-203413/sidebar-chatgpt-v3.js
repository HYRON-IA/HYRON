/* HYRON_SIDEBAR_CHATGPT_V3 -- módulo independente, apenas apresentação. */
(() => {
  const init = () => {
    const app=document.getElementById('app'), sidebar=document.getElementById('hyron-sidebar');
    const history=document.getElementById('sidebar-conversations');
    if(!app||!sidebar||!history||sidebar.dataset.hyronChatgptV3)return;
    sidebar.dataset.hyronChatgptV3='1';
    const small=()=>matchMedia('(max-width:850px)').matches;
    const key='hyron.sidebar.chatgpt.v3';
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
    let width=Math.max(260,Math.min(520,Number(saved.width)||340));
    let collapsed=!!saved.collapsed;
    let expanded=!!saved.expanded;
    const persist=()=>{try{localStorage.setItem(key,JSON.stringify({width,collapsed,expanded}))}catch{}};
    // Esconde apenas no modo desktop. O mobile continua usando o menu original.
    const rail=document.createElement('nav');rail.className='hyron-v3-rail';rail.setAttribute('aria-label','Acessos rápidos HYRON');
    const btn=(icon,label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=icon;b.title=label;b.setAttribute('aria-label',label);b.addEventListener('click',fn);rail.append(b);return b};
    const openBtn=btn('☰','Expandir barra lateral',()=>{collapsed=false;apply()});
    const logo=sidebar.querySelector('.sidebar-mark');
    if(logo){const glyph=document.createElement('span');glyph.className='hyron-v3-rail-logo';glyph.textContent=logo.textContent||'ϟ';rail.append(glyph)}
    btn('＋','Nova conversa',()=>sidebar.querySelector('#new')?.click());
    btn('💬','Mensagens',()=>sidebar.querySelector('#hyron-dm-open')?.click());
    btn('👥','Ala Coletiva',()=>sidebar.querySelector('#hyron-groups-open')?.click());
    btn('▤','Abrir histórico',()=>{collapsed=false;expanded=true;apply();history.scrollIntoView({block:'nearest',behavior:'auto'})});
    sidebar.append(rail);
    // Botão de recolher próximo à identidade HYRON.
    const brand=sidebar.querySelector('.sidebar-brand');
    const fold=document.createElement('button');fold.className='hyron-v3-fold';fold.type='button';fold.textContent='☰';fold.title='Recolher barra lateral';fold.setAttribute('aria-label','Recolher barra lateral');
    fold.addEventListener('click',()=>{collapsed=true;apply()});
    brand?.append(fold);
    // Reaproveita o botão de expansão já existente, sem reescrever renderização de conversas.
    let header=sidebar.querySelector('.sidebar-section-head');
    if(!header){const title=sidebar.querySelector('.sidebar-title');if(title){header=document.createElement('div');header.className='sidebar-section-head';title.before(header);header.append(title)}}
    let toggle=sidebar.querySelector('#sidebar-history-toggle');
    if(!toggle && header){toggle=document.createElement('button');toggle.id='sidebar-history-toggle';toggle.type='button';header.append(toggle)}
    if(toggle)toggle.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();expanded=!expanded;apply()},true);
    // Ajuste com arraste ao longo da borda direita, ou teclado (setas esquerda/direita).
    const grip=document.createElement('div');grip.className='hyron-v3-grip';grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Arraste para redimensionar a barra lateral');grip.tabIndex=0;sidebar.append(grip);
    let dragging=false;
    grip.addEventListener('pointerdown',ev=>{if(small()||collapsed)return;dragging=true;grip.setPointerCapture(ev.pointerId);document.documentElement.classList.add('hyron-v3-dragging');ev.preventDefault()});
    grip.addEventListener('pointermove',ev=>{if(!dragging)return;width=Math.max(260,Math.min(520,Math.min(innerWidth-420,ev.clientX)));apply(false)});
    const finish=()=>{if(!dragging)return;dragging=false;document.documentElement.classList.remove('hyron-v3-dragging');persist()};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(type,finish);
    grip.addEventListener('keydown',ev=>{if(small()||collapsed||!['ArrowLeft','ArrowRight'].includes(ev.key))return;ev.preventDefault();width=Math.max(260,Math.min(520,width+(ev.key==='ArrowRight'?20:-20)));apply()});
    function apply(save=true){
      const desktop=!small();
      sidebar.classList.toggle('hyron-rail-mode',desktop&&collapsed);
      sidebar.classList.toggle('hyron-v3-history-expanded',expanded);
            // HYRON_V3_GRID_WIDTH_FIX_64PX - prevalece sobre regras CSS anteriores.
      const actualWidth = desktop ? (collapsed ? 64 : width) : 340;
      app.style.setProperty('--hyron-v3-sidebar-width',actualWidth+'px');
      if(desktop){
        app.style.setProperty('display','grid','important');
        app.style.setProperty('grid-template-columns',actualWidth+'px minmax(0,1fr)','important');
        sidebar.style.setProperty('width',actualWidth+'px','important');
        sidebar.style.setProperty('min-width','0px','important');
        sidebar.style.setProperty('max-width',actualWidth+'px','important');
      }else{
        app.style.removeProperty('grid-template-columns');
        app.style.removeProperty('display');
        sidebar.style.removeProperty('width');
        sidebar.style.removeProperty('min-width');
        sidebar.style.removeProperty('max-width');
      }
      if(toggle){toggle.textContent=expanded?'Recolher':'Expandir';toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls','sidebar-conversations')}
      grip.setAttribute('aria-valuenow',String(width));
      rail.hidden=!desktop||!collapsed;
      fold.hidden=!desktop;
      if(save)persist();
    }
    addEventListener('resize',()=>apply(false));apply(false);
  };
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

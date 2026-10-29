// HYRON v0.6.8: painel de diagnóstico somente para ADM; sem valores de secrets.
let diagButton=null;
let diagDialog=null;
export function setupRouterDiagnostics(role){
 if(role!=='admin'){if(diagButton)diagButton.hidden=true;return;}
 if(diagButton){diagButton.hidden=false;return;}
 const sidebar=document.querySelector('#hyron-sidebar');if(!sidebar)return;
 diagButton=document.createElement('button');diagButton.type='button';diagButton.id='hyron-router-diagnostics-open';
 diagButton.textContent='🩺 Diagnóstico de IA';
 diagButton.title='Ver a configuração e falhas temporárias dos provedores';
 const voiceDrawer=sidebar.querySelector('#hyron-voice-drawer');
 if(voiceDrawer)sidebar.insertBefore(diagButton,voiceDrawer);else sidebar.append(diagButton);
 diagDialog=document.createElement('dialog');diagDialog.id='hyron-router-diagnostics';
 const top=document.createElement('div');top.className='hyron-router-diagnostics-top';
 const title=document.createElement('h2');title.textContent='Diagnóstico de IA · v0.6.8';
 const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.onclick=()=>diagDialog.close();
 top.append(title,close);
 const note=document.createElement('p');note.className='hint';note.textContent='Métricas temporárias desta instância do Worker. Nenhuma chave é exibida.';
 const summary=document.createElement('p');summary.id='hyron-router-diag-summary';summary.setAttribute('role','status');
 const list=document.createElement('div');list.id='hyron-router-diag-list';
 diagDialog.append(top,note,summary,list);document.body.append(diagDialog);
 diagButton.onclick=async()=>{
  summary.textContent='Consultando estado dos provedores...';list.replaceChildren();
  if(!diagDialog.open)diagDialog.showModal();
  try{
   const r=await fetch('/api/admin/router/diagnostics',{credentials:'same-origin',cache:'no-store'});
   const result=await r.json();if(!r.ok)throw Error(result.error||'HTTP '+r.status);
   const states={ready:'Configurado',disabled:'Desativado', 'missing-key':'Sem chave', 'missing-model':'Sem modelo', 'invalid-account':'Account ID inválido'};
   const ready=result.providers.filter(p=>p.state==='ready').length;
   summary.textContent=ready+' de '+result.providers.length+' conectores configurados · a disponibilidade real requer teste de requisição';
   for(const p of result.providers){
    const card=document.createElement('div');card.className='hyron-router-diag-item';
    const label=document.createElement('strong');label.textContent=p.name;
    const status=document.createElement('span');status.textContent=states[p.state]||p.state;
    status.className=p.state==='ready'?'hyron-router-state-ready':'hyron-router-state-off';
    const counts=document.createElement('small');
    counts.textContent='Sucessos: '+p.successes+' · Falhas: '+p.failures+' · Latência média: '+p.latencyMs+' ms'+(p.cooldownSeconds?' · Aguardar '+p.cooldownSeconds+' s':'');
    const setup=document.createElement('small');
    setup.textContent='Configurações: '+p.keyName+' + '+p.modelName+(p.enableName?' + '+p.enableName:'');
    card.append(label,status,counts,setup);list.append(card);
   }
  }catch(e){summary.textContent='Falha ao consultar diagnóstico: '+String(e?.message||e)}
 };
}

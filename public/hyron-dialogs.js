const hyronCssLink=document.createElement('link');hyronCssLink.rel='stylesheet';hyronCssLink.href='/hyron-ui-v5.css';document.head.append(hyronCssLink);
// HYRON_UI_V5: dialogos acessiveis sem window.alert/confirm/prompt.
let active = Promise.resolve();
function showDialog({title, message='', initial, danger=false}) {
  const operation = () => new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'hyron-native-replacement';
    dialog.setAttribute('aria-label',title);
    const heading = document.createElement('h2'); heading.textContent = title;
    const body = document.createElement('p'); body.textContent = message;
    const form = document.createElement('form'); form.method='dialog';
    let field = null;
    if (initial !== undefined) {
      field = document.createElement('input'); field.type='text'; field.value=String(initial); field.maxLength=80;
      field.setAttribute('aria-label','Novo titulo'); field.autocomplete='off';
      form.append(field);
    }
    const actions = document.createElement('div'); actions.className='hyron-dialog-actions';
    const cancel = document.createElement('button'); cancel.type='button'; cancel.textContent='Cancelar';
    const accept = document.createElement('button'); accept.type='submit';
    accept.textContent=danger?'Excluir':field?'Salvar':'Confirmar';
    if(danger) accept.className='danger';
    actions.append(cancel,accept); form.append(actions);
    dialog.append(heading,body,form);document.body.append(dialog);
    let done=false;
    const finish=value => {if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};
    cancel.onclick=()=>finish(field?null:false);
    form.onsubmit=e=>{e.preventDefault();finish(field?field.value:true);};
    dialog.oncancel=e=>{e.preventDefault();finish(field?null:false);};
    dialog.showModal(); if(field)field.select();else cancel.focus();
  });
  const result = active.then(operation,operation);
  active = result.then(()=>{},()=>{});
  return result;
}
export const hyronConfirm=(message)=>showDialog({title:'Confirmar acao',message,danger:/exclu|permanent|apagar/i.test(message)});
export const hyronPrompt=(message,value='')=>showDialog({title:message||'Editar',initial:value});
export function hyronNotice(message){
  let host=document.getElementById('hyron-toast-region');
  if(!host){host=document.createElement('div');host.id='hyron-toast-region';host.setAttribute('role','status');host.setAttribute('aria-live','polite');document.body.append(host);}
  const toast=document.createElement('div');toast.className='hyron-toast';toast.textContent=String(message);
  const close=document.createElement('button');close.textContent='×';close.type='button';close.setAttribute('aria-label','Fechar aviso');close.onclick=()=>toast.remove();
  toast.append(close);host.append(toast);
  // Nao expira automaticamente: mensagens importantes permanecem visiveis.
}
window.hyronConfirm=hyronConfirm;window.hyronPrompt=hyronPrompt;window.hyronNotice=hyronNotice;

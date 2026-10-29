/* HYRON V0.8.5 - Exportar conversa da Ala Coletiva para TXT. */
(() => {
  'use strict';
  if (window.__hyronGroupTxtExport085) return;
  window.__hyronGroupTxtExport085 = true;
  let groupId = null;
  let groupName = 'Grupo';
  let busy = false;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'hyron-export-group-txt-085';
  button.textContent = '\u2b07 Exportar TXT';
  button.title = 'Exportar todo o hist\u00f3rico deste grupo em TXT';
  button.hidden = true;
  button.style.cssText = 'padding:9px 13px;border:1px solid #47695c;border-radius:10px;background:#10251f;color:#e9fff5;cursor:pointer;font:inherit;white-space:nowrap;';
  function attach() {
    const panel = document.querySelector('.hyron-groups-panel');
    const row = panel && panel.querySelector('.hyron-groups-row');
    if (row && button.parentElement !== row) {
      const close = [...row.querySelectorAll('button')].find(b => /fechar/i.test(b.textContent || ''));
      row.insertBefore(button, close || null);
    }
    const shouldHide = !groupId || !panel || panel.hidden || !panel.classList.contains('has-group');
    if (button.hidden !== shouldHide) button.hidden = shouldHide;
  }
  document.addEventListener('hyron:group-selected', async (event) => {
    const id = event.detail?.groupId;
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) return;
    groupId = id;
    groupName = 'Grupo';
    // Use the canonical group name from the authenticated group detail endpoint.
    try {
      const response = await fetch('/api/groups/' + encodeURIComponent(id), {credentials:'same-origin',cache:'no-store'});
      if (response.ok) {
        const data = await response.json();
        if (groupId === id) groupName = String(data.group?.name || data.name || 'Grupo');
      }
    } catch (_) { /* Name is optional, not the content. */ }
    attach();
  });
  function fmtDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || 'Sem data') : date.toLocaleString('pt-BR');
  }
  function safeName(value) {
    return String(value || 'grupo').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,64) || 'grupo';
  }
  function download(text, name) {
    const blob = new Blob(['\ufeff', text], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  button.addEventListener('click', async () => {
    if (!groupId || busy) return;
    const id = groupId;
    busy = true;
    button.disabled = true;
    let cursor = null;
    const seenCursors = new Set();
    const messages = new Map();
    try {
      for (let page = 0; page < 1000; page++) {
        if (groupId !== id) throw new Error('O grupo selecionado mudou durante a exporta\u00e7\u00e3o.');
        button.textContent = '\u23f3 Exportando (' + messages.size + ')';
        const endpoint = '/api/groups/' + encodeURIComponent(id) + '/messages' + (cursor ? '?before=' + encodeURIComponent(cursor) : '');
        const response = await fetch(endpoint, {credentials:'same-origin',cache:'no-store'});
        if (!response.ok) throw new Error('Falha ao ler hist\u00f3rico (HTTP ' + response.status + ').');
        const data = await response.json();
        if (!Array.isArray(data.messages)) throw new Error('Resposta inesperada da API de mensagens.');
        for (const m of data.messages) {
          const key = String(m.id || (m.createdAt + '-' + m.senderId + '-' + m.content));
          messages.set(key,m);
        }
        const next = data.nextBefore;
        if (!next) { cursor = null; break; }
        if (seenCursors.has(String(next))) throw new Error('Paginação repetida. Exportação cancelada.');
        seenCursors.add(String(next));
        cursor = next;
        if (page === 999) throw new Error('Limite de 1000 páginas atingido; exportação incompleta.');
      }
      const ordered = [...messages.values()].sort((a,b) => {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return (Number.isFinite(diff) ? diff : 0) || String(a.id || '').localeCompare(String(b.id || ''));
      });
      const lines = ['HYRON - Ala Coletiva','Grupo: ' + groupName,'Exportado em: ' + new Date().toLocaleString('pt-BR'),'Total de mensagens: ' + ordered.length,'', '='.repeat(68),''];
      for (const m of ordered) {
        lines.push('[' + fmtDate(m.createdAt) + '] ' + String(m.senderName || 'Desconhecido'));
        lines.push(String(m.content || '[Sem texto]'));
        for (const f of Array.isArray(m.attachments) ? m.attachments : []) {
          lines.push('[Anexo: ' + String(f.name || 'arquivo') + ' | ' + String(f.mime || 'tipo desconhecido') + ' | /api/groups/media/' + encodeURIComponent(f.id || '') + ']');
        }
        lines.push('','-'.repeat(68),'');
      }
      const stamp = new Date().toISOString().slice(0,10);
      download(lines.join('\r\n'), 'HYRON_' + safeName(groupName) + '_' + stamp + '.txt');
    } catch (error) {
      window.alert('N\u00e3o foi poss\u00edvel exportar a conversa inteira: ' + (error?.message || error));
    } finally {
      busy = false; button.disabled = false; button.textContent = '\u2b07 Exportar TXT'; attach();
    }
  });
  const observer = new MutationObserver(attach);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  attach();
})();
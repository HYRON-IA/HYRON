// HYRON v0.6.8: falha de busca não confirma falsidade nem inexistência.
export function researchUnavailableAnswer(warning?:string):string {
 const safe=String(warning||'').replace(/[\r\n]+/g,' ').slice(0,260);
 return 'Não consegui verificar esta informação na Internet agora. Isso não significa que a pessoa, música, evento ou fato mencionado não exista.\n\n'+
  'Os serviços de pesquisa consultados não forneceram fontes relevantes acessíveis. Tente novamente mais tarde ou forneça um link confiável para análise.'+
  (safe?'\n\n*Diagnóstico da busca: '+safe.replace(/[<>]/g,'')+'*':'');
}

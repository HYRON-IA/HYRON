export const PRESETS=Object.freeze({
 hydra:{label:'Hydra',canvas:'#071310',surface:'#102820',raised:'#19372e',text:'#e9f5ef',muted:'#a0bdb1',border:'#385c4e',accent:'#78e6cd',icon:'#78e6cd'},
 dark:{label:'Escuro',canvas:'#101114',surface:'#1b1d23',raised:'#262932',text:'#f1f2f6',muted:'#b2b6c5',border:'#434754',accent:'#a8b8ff',icon:'#a8b8ff'},
 light:{label:'Claro',canvas:'#eff2f5',surface:'#ffffff',raised:'#e4e9ef',text:'#182330',muted:'#526274',border:'#b8c3cf',accent:'#196e5e',icon:'#196e5e'}
});
export const DEFAULT_PREFS=Object.freeze({version:1,theme:'hydra',accent:'#78e6cd',icon:'#78e6cd',background:'theme',color:'#102820',color2:'#184b3e',angle:135});
export const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function normalizePrefs(value){
 const v=value&&typeof value==='object'?value:{};
 const theme=Object.hasOwn(PRESETS,v.theme)?v.theme:'hydra',preset=PRESETS[theme];
 return {version:1,theme,accent:validColor(v.accent)?v.accent:preset.accent,icon:validColor(v.icon)?v.icon:preset.icon,background:['theme','solid','gradient','image'].includes(v.background)?v.background:'theme',color:validColor(v.color)?v.color:DEFAULT_PREFS.color,color2:validColor(v.color2)?v.color2:DEFAULT_PREFS.color2,angle:Number.isFinite(v.angle)?Math.min(360,Math.max(0,Math.round(v.angle))):135};
}
function rgb(color){return color.slice(1).match(/../g).map(n=>parseInt(n,16));}
function mix(a,b,t){return '#'+rgb(a).map((n,i)=>Math.round(n*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');}
function luminance(color){const c=rgb(color).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function readable(color,bg){const target=luminance(bg)>.4?'#000000':'#ffffff';let result=color;for(let i=0;i<=20&&contrast(result,bg)<4.5;i++)result=mix(color,target,i/20);return result;}
export function themeTokens(raw){const p=normalizePrefs(raw),t=PRESETS[p.theme];return {
 '--hy-canvas':t.canvas,'--hy-surface':t.surface,'--hy-raised':t.raised,'--hy-text':t.text,'--hy-muted':t.muted,'--hy-border':t.border,
 '--hy-accent':p.accent,'--hy-accent-text':readable(p.accent,t.surface),'--hy-accent-soft':mix(t.surface,p.accent,.16),
 '--hy-button-text':contrast(p.accent,'#ffffff')>=contrast(p.accent,'#101114')?'#ffffff':'#101114',
 '--hy-icon':p.icon,'--hy-icon-bg':contrast(p.icon,'#ffffff')>=contrast(p.icon,'#101114')?'#ffffff':'#101114',
 '--hy-danger':p.theme==='light'?'#a52a3a':'#ffb3bd','--hy-error-bg':p.theme==='light'?'#fff0f2':'#381e29',
 '--hy-chat':p.theme==='light'?'rgba(255,255,255,.96)':p.theme==='dark'?'rgba(27,29,35,.96)':'rgba(16,40,32,.96)'
};}
export function preferenceKey(userId){if(typeof userId!=='string'||!userId||userId.length>128)throw Error('Conta inválida');return 'hyron_appearance_v07_'+encodeURIComponent(userId);}

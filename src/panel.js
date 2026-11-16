import {Chess} from 'chess.js';
import {START_FEN,validFen} from './core.js';
import {LocalEngine} from './engine.js';
import {STRENGTHS,strengthById} from './strength.js';
import {rankSuggestions} from './suggestions.js';

const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,document.getElementById(id));return elements.get(id);};
const params=new URLSearchParams(location.search),embedded=params.has('embedded'),stream=params.has('stream');
document.documentElement.classList.toggle('embedded',embedded);
document.documentElement.classList.toggle('stream',stream);
const session=params.get('stream')||crypto.randomUUID();
const channel=new BroadcastChannel('openchess-'+session);
let fen=embedded||stream?null:START_FEN,source='manual',follow=embedded||stream,paused=false;
let sequence=0,bestMove=null,suggestedSan='—',rows=new Map(),autoTimer=null,lastAutoFen=null,pagePosition=null;
let renderTimer=null,lastLinesKey='',startedAt=0,elapsedMs=null,stateText='Starting engine…';
let suggestions=[];
let frozen=false;
let latestSnapshot=null;
let reviewPositions=[];
function recordPosition(next){
 if(reviewPositions.at(-1)===next)return;
 reviewPositions.push(next);
 if(reviewPositions.length>500)reviewPositions.shift();
 channel.postMessage({type:'review-position',fen:next});
}

for(const profile of STRENGTHS){const option=document.createElement('option');option.value=profile.id;option.textContent=`${profile.name} · ${profile.randomMoveChance?'≈':''}${profile.elo??'Maximum'}`;if(profile.randomMoveChance)option.title='Approximate beginner style; not a calibrated Elo rating.';$('profile').append(option);}
$('profile').value='unbound';
try{
 const saved=JSON.parse(localStorage.getItem('openchess-settings')||'{}');
 for(const id of ['time','count','profile','mode','personality'])if([...$(id).options].some(o=>o.value===saved[id]))$(id).value=saved[id];
 if(typeof saved.arrows==='boolean')$('arrows').checked=saved.arrows;
}catch{}
const currentProfile=()=>strengthById($('profile').value);
function save(){try{localStorage.setItem('openchess-settings',JSON.stringify({time:$('time').value,count:$('count').value,profile:$('profile').value,mode:$('mode').value,personality:$('personality').value,arrows:$('arrows').checked}));}catch{}}
function applyProfile(){document.documentElement.style.setProperty('--profile-color',currentProfile().color);}
applyProfile();
function tell(message){if(embedded)parent.postMessage({channel:'openchess-panel',...message},'*');}
function status(text){
 stateText=text;
 const state=/failed|invalid|error|unavailable|timed out/i.test(text)?'error':text==='Analysis complete'?'complete':/paused/i.test(text)?'paused':/starting|analyzing|connecting|loading/i.test(text)?'loading':'ready';
 document.body.dataset.analysis=state;
 const quiet=/^(Analysis complete|Engine ready|Analyzing…|Starting engine…|Connecting to Chess.com…|Paused|Move submitted)$/.test(text);
 $('notice').hidden=quiet;$('status').textContent=quiet?'':text;$('notice').dataset.state=state;
 $('analyze').classList.toggle('busy',state==='loading');
 document.querySelector('.analysis').setAttribute('aria-busy',String(state==='loading'));
}
function snapshot(){if(stream)return;channel.postMessage({type:'snapshot',fen,source,profile:$('profile').value,rows:[...rows.values()],bestMove,suggestedSan,elapsedMs,stateText,model:$('model').value});}
function renderAnalysis(){
 const sorted=[...rows.values()].sort((a,b)=>a.rank-b.rank),leading=rows.get(1);
 const key=JSON.stringify(sorted.map(r=>[r.rank,r.score,r.san]));
 if(key!==lastLinesKey){lastLinesKey=key;$('lines').replaceChildren(...sorted.map(row=>{
  const li=document.createElement('li'),score=document.createElement('strong'),moves=document.createElement('span');
  score.textContent=row.score;moves.textContent=row.san.slice(0,8).join(' ');moves.title=row.san.join(' ');li.append(score,moves);return li;
 }));}
 $('best').textContent=suggestedSan;$('score').textContent=leading?.score??'—';
 document.body.dataset.turn=fen?.split(' ')[1]||'';
 document.body.dataset.source=source;
 if(document.activeElement!==$('fen'))$('fen').value=fen||'';
 updateButtons();tell({type:'summary',move:suggestedSan==='—'?'':suggestedSan});
}
function flushRender(){clearTimeout(renderTimer);renderTimer=null;renderAnalysis();snapshot();}
function scheduleRender(){if(renderTimer===null)renderTimer=setTimeout(flushRender,50);}
function arrow(){tell({type:'arrow',fen,moves:$('arrows').checked&&!paused&&bestMove?suggestions:[],profile:$('profile').value});}
function clearAuto(){clearTimeout(autoTimer);autoTimer=null;}
function canPlay(){return embedded&&follow&&source==='page'&&!!bestMove&&fen===pagePosition?.fen&&!paused;}
function updateButtons(){$('play').disabled=!canPlay();}
function play(){if(!canPlay())return;clearAuto();tell({type:'move',fen,move:bestMove,id:sequence});status('Move requested…');}
function scheduleAuto(){
 clearAuto();if(!canPlay()||$('auto').value!==fen.split(' ')[1]||lastAutoFen===fen)return;
 const captured=fen,id=sequence;
 autoTimer=setTimeout(()=>{if(captured===fen&&id===sequence&&canPlay()&&$('auto').value===fen.split(' ')[1]){lastAutoFen=fen;play();}},Number($('delay').value));
}
function receiveResult(result){
 if(result.id!==sequence||result.fen!==fen||paused)return;
 if(!result.done){rows.set(result.rank,result);status('Analyzing…');scheduleRender();return;}
 elapsedMs=performance.now()-startedAt;
 if(result.bestmove&&result.bestmove!=='(none)'&&result.bestmove!=='0000'){
  suggestions=rankSuggestions(fen,result.bestmove,rows.values(),$('mode').value,$('profile').value,Number($('count').value),$('personality').value);
  const game=new Chess(fen);
  bestMove=suggestions[0]??null;
  if(bestMove) suggestedSan=game.move(bestMove).san;
 }
 status('Analysis complete');flushRender();arrow();scheduleAuto();
}
const createEngine=()=>new LocalEngine(receiveResult,status,$('mode').value==='neural'?'full':$('model').value);
// Detached windows mirror their source, rather than starting another WASM engine.
let engine=stream?null:createEngine();
function analyze(){
 if(stream)return;
 clearAuto();sequence++;bestMove=null;suggestedSan='—';rows.clear();elapsedMs=null;clearTimeout(renderTimer);renderTimer=null;
 arrow();updateButtons();
 if(!fen||paused){engine.stop();flushRender();return;}
 const game=new Chess(fen);
 if(game.isGameOver()){engine.stop();suggestedSan=game.isCheckmate()?'Checkmate':'Draw';status('Game over');flushRender();return;}
 startedAt=performance.now();status('Analyzing…');
 const usesRanking=$('mode').value==='human'||$('personality').value!=='balanced';
 engine.analyze({fen,id:sequence,time:Number($('time').value),lines:usesRanking?5:Number($('count').value),profile:$('profile').value});flushRender();
}
function position(value,newSource){
 const next=validFen(value);if(!next){status('Invalid FEN. Include all six fields and both kings.');return false;}
 if(newSource!=='manual')recordPosition(next);
 fen=next;source=newSource;analyze();return true;
}
channel.onmessage=event=>{
 const data=event.data;
 if(!stream&&data?.type==='review-ready'){channel.postMessage({type:'review-history',positions:reviewPositions});return;}
 if(!stream&&data?.type==='ready'){snapshot();return;}
 if(stream&&data?.type==='closed'){status('Source window closed');return;}
 if(!stream||data?.type!=='snapshot'||(data.fen&&!validFen(data.fen)))return;
 latestSnapshot=data;
 if(!frozen)applySnapshot(data);
};
function applySnapshot(data){
 fen=data.fen;source=data.source;bestMove=data.bestMove;suggestedSan=data.suggestedSan;elapsedMs=data.elapsedMs;
 $('profile').value=strengthById(data.profile).id;applyProfile();$('model').value=data.model;
 rows=new Map(data.rows.map(row=>[row.rank,row]));status(data.stateText);renderAnalysis();
}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='openchess-host')return;const data=event.data;
 if(data.type==='position'){
  const next=validFen(data.fen);if(!next)return;pagePosition={fen:next,source:data.source};
  if(follow&&(fen!==next||source!==data.source))position(next,data.source);
 }else if(data.type==='waiting'&&follow){
  if(fen){fen=null;pagePosition=null;clearAuto();sequence++;engine?.stop();bestMove=null;suggestedSan='—';rows.clear();elapsedMs=null;arrow();}
  status(data.message);flushRender();
 }else if(data.type==='move-result'){
  if(data.error){clearAuto();$('auto').value='off';status(data.error);}else status('Move submitted');snapshot();
 }
});
$('profile').onchange=()=>{applyProfile();clearAuto();save();analyze();};
$('analyze').onclick=()=>{paused=false;$('pause').textContent='Pause';analyze();};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';if(paused){sequence++;clearAuto();engine.stop();arrow();status('Paused');flushRender();}else analyze();};
$('play').onclick=play;
$('dismiss').hidden=!embedded;
$('dismiss').onclick=()=>tell({type:'dismiss'});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&embedded)tell({type:'dismiss'});});
$('arrows').onchange=()=>{save();arrow();};
$('auto').onchange=()=>{clearAuto();if($('auto').value!=='off'&&!canPlay())status('Automatic moves wait for an exact board position.');scheduleAuto();};
$('delay').onchange=scheduleAuto;
for(const id of ['time','count','personality'])$(id).onchange=()=>{save();analyze();};
$('model').onchange=()=>{clearAuto();sequence++;engine.destroy();engine=createEngine();analyze();};
$('mode').onchange=()=>{save();$('model').disabled=$('mode').value==='neural';$('model').onchange();};
$('model').disabled=$('mode').value==='neural';
$('detach').onclick=()=>window.open(new URL('panel.html?stream='+session,location.href),'openchess-'+session,'width=380,height=760');
$('game-review').onclick=()=>window.open(new URL('review.html?session='+session,location.href),'openchess-review-'+session);
$('load').onclick=()=>{const value=$('fen').value;if(!validFen(value)){status('Invalid FEN. Check the complete position.');return;}follow=false;$('auto').value='off';position(value,'manual');tell({type:'seed',fen:value});};
$('follow').onclick=()=>{if(!embedded){status('Open a Chess.com tab to follow its board.');return;}follow=true;if(pagePosition)position(pagePosition.fen,pagePosition.source);else status('Waiting for Chess.com board…');tell({type:'ready'});};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(fen||'');status('FEN copied');}catch{status('Select the FEN text and copy it manually.');}};
$('export').onclick=()=>{
 const data={fen,engine:$('model').value==='full'?'Stockfish 19':'Stockfish 19 lite',strength:currentProfile(),suggestedMove:bestMove,lines:[...rows.values()].map(({rank,depth,score,moves,san})=>({rank,depth,score,moves,san}))};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='openchess-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
let sizeFrame=null;
const resizeObserver=new ResizeObserver(()=>{if(embedded&&sizeFrame===null)sizeFrame=requestAnimationFrame(()=>{sizeFrame=null;tell({type:'resize',height:Math.ceil(document.body.getBoundingClientRect().height)});});});
resizeObserver.observe(document.body);
window.addEventListener('pagehide',()=>{resizeObserver.disconnect();cancelAnimationFrame(sizeFrame);clearAuto();clearTimeout(renderTimer);engine?.destroy();if(!stream)channel.postMessage({type:'closed'});channel.close();});
if(stream){
 $('stream-controls').hidden=false;
 $('freeze').onclick=()=>{
  frozen=!frozen;
  $('freeze').textContent=frozen?'Resume live':'Freeze';
  $('freeze').setAttribute('aria-pressed',String(frozen));
  if(!frozen&&latestSnapshot)applySnapshot(latestSnapshot);
 };
 $('stream-copy').onclick=$('copy').onclick;
 $('stream-layout').onchange=()=>{document.body.dataset.streamLayout=$('stream-layout').value;};
 function showCaptureControls(visible){
  $('stream-controls').hidden=!visible;
  $('stream-show-controls').hidden=visible;
  $('stream-hide-controls').checked=!visible;
 }
 $('stream-hide-controls').onchange=()=>showCaptureControls(!$('stream-hide-controls').checked);
 $('stream-show-controls').onclick=()=>showCaptureControls(true);
 for(const id of ['profile','mode','model','time','count','personality','auto','delay','arrows','load','follow','analyze','play','pause','detach'])$(id).disabled=true;
 channel.postMessage({type:'ready'});
}
tell({type:'ready'});
if(fen)analyze();else{status(stream?'Waiting for source board…':'Connecting to Chess.com…');renderAnalysis();}

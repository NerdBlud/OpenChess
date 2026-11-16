import {Chess} from 'chess.js';
import {START_FEN, validFen} from './core.js';
import {LocalEngine} from './engine.js';
import {gradeMove, chanceLoss, observedMove, readGame, summarizeReview, whiteChance} from './review-data.js';
import {pieceSvg} from './review-pieces.js';
import {decorateControl} from './review-icons.js';

const $ = id => document.getElementById(id);
const controlLabels={};
for(const [id,icon] of Object.entries({first:'first',prev:'prev',next:'next',last:'last',flip:'flip',autoplay:'autoplay',sound:'sound','review-all':'review','budget-trigger':'budget','show-line':'line',retry:'retry',load:'load'})){
 controlLabels[id]=decorateControl($(id),icon);
}
function showBudget(open){
 $('budget-menu').hidden=!open;
 $('budget-trigger').setAttribute('aria-expanded',String(open));
}
$('budget-trigger').onclick=()=>showBudget($('budget-menu').hidden);
$('budget-menu').onclick=event=>{
 const button=event.target.closest('[data-budget]');if(!button)return;
 $('budget').value=button.dataset.budget;$('budget').dispatchEvent(new Event('change'));
 showBudget(false);$('budget-trigger').focus();
};
document.addEventListener('click',event=>{if(!event.target.closest('.budget-control'))showBudget(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('budget-menu').hidden){showBudget(false);$('budget-trigger').focus();}});
const gradeIcons = {
 Great:['!','#377f9c'], Best:['★','#76a23b'], Excellent:['✦','#67922f'], Good:['✓','#477c62'],
 Inaccuracy:['?!','#9c650d'], Mistake:['?','#a7511d'],
 'Missed mate':['×','#b7444d'], Blunder:['??','#a72242']
};
function gradeBadge(grade){
 const icon=gradeIcons[grade];if(!icon)return null;
 const badge=document.createElement('span');
 badge.className='grade-badge';badge.textContent=icon[0];
 badge.title=grade;badge.setAttribute('aria-label',grade);
 badge.style.backgroundColor=icon[1];return badge;
}
const session = new URLSearchParams(location.search).get('session');
const channel = session ? new BroadcastChannel('openchess-'+session) : null;
let game = {start:START_FEN,moves:[]};
let selected = -1;
let flipped = false;
let imported = false;
let latest = null;
let gap = false;
let request = null;
let serial = 0;
let queue = [];
let reviewingAll = false;
let batchGrades=null;
let practice=null;
let autoplayTimer=null;
let lastBoardKey = '';
let shownMove = null;
let shownOrientation = false;
let audio;
let soundOn=false;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function moveSound(capture){
 if(!soundOn||audio?.state!=='running')return;
 const time=audio.currentTime;
 for(const [index,pitch] of (capture?[220,155]:[330]).entries()){
  const tone=audio.createOscillator(), envelope=audio.createGain();
  const start=time+index*.026;
  tone.type='triangle';tone.frequency.setValueAtTime(pitch,start);
  tone.frequency.exponentialRampToValueAtTime(pitch*.48,start+.07);
  envelope.gain.setValueAtTime(.0001,start);
  envelope.gain.exponentialRampToValueAtTime(.095,start+.006);
  envelope.gain.exponentialRampToValueAtTime(.0001,start+.085);
  tone.connect(envelope);envelope.connect(audio.destination);
  tone.start(start);tone.stop(start+.09);
 }
}
$('sound').onclick=async()=>{
 if(!soundOn){
  try{audio??=new AudioContext();await audio.resume();}catch{return;}
 }
 soundOn=!soundOn;
 controlLabels.sound.textContent=soundOn?'Sound on':'Sound off';
 $('sound').setAttribute('aria-pressed',String(soundOn));
};
const grades = new Map();

const engine = new LocalEngine(result => {
 if (!request || result.id!==request.id) return;
 if (!result.done) {
  if(result.rank===1)request.info=result;
  if(result.rank===2)request.alternative=result;
  return;
 }
 const search = request;
 if (search.stage==='best' && search.move.lan!==result.bestmove) {
  startSearch(search.index, 'played', {info:search.info, uci:result.bestmove,alternative:search.alternative});
  return;
 }
 const best = search.best ?? {info:search.info,uci:result.bestmove,alternative:search.alternative};
 const played = search.info;
 const grade = gradeMove(search.move, best.uci, best.info, played, best.alternative);
 (batchGrades??grades).set(search.index,{grade,best,played});
 request = null;
 if(!reviewingAll)render();
 advance();
}, message => {
 if (/failed|timed out/i.test(message)) {
  queue=[];request=null;batchGrades=null;reviewingAll=false;batchDisplay();render();$('status').textContent=message;
 }
}, 'full');

function startSearch(index,stage='best',best=null){
 const move=game.moves[index];
 request={id:++serial,index,move,stage,best,info:null};
 engine.analyze({id:serial,fen:move.before,lines:stage==='best'?2:1,time:Number($('budget').value),
  profile:'unbound',onlyMove:stage==='played'?move.lan:null});
}

function advance(){
 if(request)return;
 if(queue.length){
  startSearch(queue.shift());
  if(reviewingAll)batchDisplay();else render();
  return;
 }
 if(reviewingAll){
  for(const [index,result] of batchGrades)grades.set(index,result);
  batchGrades=null;
  selected=game.moves.length?0:-1;
 }
 reviewingAll=false;
 batchDisplay();
 render();
 $('status').textContent=gap?'Some positions were skipped. Import the PGN for the complete game.':
   game.moves.length?`${grades.size} of ${game.moves.length} moves reviewed`:'Waiting for moves. Import a PGN or play a move on the source board.';
}

function batchDisplay(){
 $('review-progress').hidden=!reviewingAll;
 $('review-results').hidden=reviewingAll;
 document.querySelector('.overview').hidden=reviewingAll;
 $('board-column').querySelector('nav').inert=reviewingAll;
 $('budget-trigger').disabled=reviewingAll;
 $('review-action').textContent=reviewingAll?'Cancel review':'Review all';
 if(reviewingAll){
  const completed=grades.size+batchGrades.size;
  $('progress').max=game.moves.length||1;$('progress').value=completed;
  $('progress-count').textContent=`${completed} / ${game.moves.length} moves`;
  $('status').textContent=`Analyzing with ${$('budget-label').textContent} search. Results appear when the review is ready.`;
 }
}

function renderBoard(move,grade,startingFen=game.start){
 const position=new Chess(move?.after??startingFen);
 const key=`${position.fen()}|${flipped}|${selected}`;
 if(key===lastBoardKey){
  $('board').querySelector('.grade-badge')?.remove();
  const badge=gradeBadge(grade);
  if(badge)$('board').querySelector(`[data-square="${move.to}"]`)?.append(badge);
  return;
 }
 const forward=move&&shownOrientation===flipped&&(shownMove?.after??startingFen)===move.before;
 const backwards=shownMove&&shownOrientation===flipped&&shownMove.before===position.fen();
 lastBoardKey=key;
 const squares=position.board().flat();
 const cells=squares.map((piece,index)=>{
  const square=String.fromCharCode(97+index%8)+(8-Math.floor(index/8));
  const cell=document.createElement('span');
  cell.className='square'+((Math.floor(index/8)+index%8)%2?' dark':'')+
   (piece?.color==='w'?' white-piece':'')+(move&&(square===move.from||square===move.to)?' played':'');
  cell.dataset.square=square;
  if(piece)cell.innerHTML=pieceSvg(piece.type);
  if(move?.to===square){const badge=gradeBadge(grade);if(badge)cell.append(badge);}
  cell.title=square+(piece?' '+(piece.color==='w'?'White ':'Black ')+piece.type:'');
  return cell;
 });
 $('board').replaceChildren(...(flipped?cells.reverse():cells));
 for(const [index,cell] of [...$('board').children].entries()){
  if(index%8===0||index>=56){
   const coordinate=document.createElement('span');
   coordinate.className='coordinate '+(index%8===0?'rank':'file');
   coordinate.textContent=index%8===0?cell.dataset.square[1]:cell.dataset.square[0];
   cell.append(coordinate);
   if(index===56){
    const file=document.createElement('span');file.className='coordinate file';file.textContent=cell.dataset.square[0];cell.append(file);
   }
  }
 }
 if(forward||backwards){
  const step=forward?move:shownMove,from=forward?step.from:step.to,to=forward?step.to:step.from;
  if(!reducedMotion.matches){
   const direction=flipped?-1:1;
   const x=(from.charCodeAt(0)-to.charCodeAt(0))*direction*$('board').clientWidth/8;
   const y=(Number(to[1])-Number(from[1]))*direction*$('board').clientHeight/8;
   const piece=$('board').querySelector(`[data-square="${to}"] .piece`);
   piece?.closest('.square').classList.add('moving');
   const animation=piece?.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:210,easing:'cubic-bezier(.2,.76,.32,1)'});
   if(animation)animation.onfinish=()=>piece.closest('.square')?.classList.remove('moving');
  }
  moveSound(!!step.captured);
 }
 shownMove=move??null;shownOrientation=flipped;
}

function jumpButton(text,index){
 const button=document.createElement('button');
 button.textContent=text;button.onclick=()=>select(index);
 return button;
}

function renderOverview(){
 const summary=summarizeReview(game.moves,grades);
 $('accuracy').textContent=['w','b'].map(color=>{
  const side=summary[color];
  const total=game.moves.filter(move=>move.color===color).length;
  return `${color==='w'?'White':'Black'}: ${side.count?(side.sum/side.count).toFixed(1)+'%':'—'} (${side.count}/${total} graded)`;
 }).join('  ·  ');
 $('graph').replaceChildren(...game.moves.map((move,index)=>{
  const chance=whiteChance(grades.get(index)?.played);
  const button=jumpButton('',index);
  button.className='graph-bar';
  if(chance!==null)button.style.setProperty('--chance',chance+'%');
  button.setAttribute('aria-current',String(index===selected));
  button.setAttribute('aria-label',`Ply ${index+1}, ${move.san}: ${chance===null?'unreviewed':chance.toFixed(0)+'% estimated White chance'}`);
  button.title=button.getAttribute('aria-label');
  return button;
 }));
 $('tally').replaceChildren(...[...summary.tally].map(([grade,indices])=>{
  const next=indices.find(index=>index>selected)??indices[0];
  return jumpButton(`${grade} · ${indices.length}`,next);
 }));
 $('turns').replaceChildren(...summary.turns.slice(0,3).map(({index,loss})=>
  jumpButton(`Turning point · ${game.moves[index].san} (−${loss.toFixed(0)} pts)`,index)));
}

function renderPractice(){
 const box=$('practice');
 box.hidden=!practice;
 box.replaceChildren();
 if(!practice)return;
 const message=document.createElement('p');
 message.textContent=practice.message;
 const done=document.createElement('button');
 done.textContent='Back to review';done.onclick=()=>{practice=null;render();};
 box.append(message,done);
 if(practice.line){
  const next=document.createElement('button');next.textContent='Next line move';
  next.disabled=!practice.line.length;
  next.onclick=()=>{practice.position.move(practice.line.shift());render();};
  box.append(next);
 }else{
  const select=document.createElement('select');
  select.setAttribute('aria-label','Legal practice moves');
  for(const move of practice.position.moves({verbose:true}))select.add(new Option(move.san,move.lan));
  const play=document.createElement('button');
  play.textContent='Try move';play.disabled=!select.options.length;
  play.onclick=()=>{
   const move=practice.position.move(select.value);
   practice.message=move.lan===practice.recommended?'Matches Stockfish’s recommendation.':`Played ${move.san}. Try continuing the variation or return to review.`;
   render();
  };
  box.append(select,play);
 }
}

function render(){
 const move=game.moves[selected];
 const result=grades.get(selected);
 if(practice)renderBoard(practice.position.history({verbose:true}).at(-1),null,practice.start);
 else renderBoard(move,result?.grade);
 renderPractice();
 renderOverview();
 const hints=$('hints-enabled').checked;
 $('show-line').disabled=!hints||!result?.best.info?.moves.length;
 $('retry').disabled=!move;
 const loss=result&&chanceLoss(move.color,result.best.info,result.played);
 $('coach').hidden=!$('coach-enabled').checked||!hints;
 $('coach').textContent=loss===null||loss===undefined?'':loss>=5
  ? `${move.san} cost about ${loss.toFixed(0)} points of estimated winning chance. Replay ${result.best.info.san[0]??'the engine line'} to see the alternative.`
  : `${move.san} kept the position close to Stockfish’s recommendation.`;
 $('details').textContent=result
  ? `${result.grade??'No grade'} · Played ${move.san} (${result.played?.score??'—'})`+(hints
    ? ` · Best ${result.best.info?.san[0]??result.best.uci??'—'} (${result.best.info?.score??'—'}) · Depth ${result.best.info?.depth??'—'}/${result.played?.depth??'—'}`:'')
  : move ? `Played ${move.san}` : 'Starting position';
 if(request)$('status').textContent=`Reviewing move ${request.index+1} of ${game.moves.length}…`;
 $('moves').replaceChildren(...game.moves.map((entry,index)=>{
  const li=document.createElement('li'),button=document.createElement('button');
  const grade=grades.get(index)?.grade;
  const badge=gradeBadge(grade);
  if(badge)button.append(badge);
  button.append(`${entry.before.split(' ')[5]}${entry.color==='w'?'.':'…'} ${entry.san}${grade?' · '+grade:''}`);
  button.setAttribute('aria-current',String(index===selected));
  button.onclick=()=>select(index);li.append(button);return li;
 }));
 for(const id of ['first','prev'])$(id).disabled=selected<0;
 for(const id of ['next','last'])$(id).disabled=selected>=game.moves.length-1;
 $('review-all').disabled=!game.moves.length;
}

function select(index){
 if(reviewingAll)return;
 practice=null;
 selected=Math.max(-1,Math.min(index,game.moves.length-1));
 if(selected>=0&&!grades.has(selected)&&request?.index!==selected&&!queue.includes(selected))queue.unshift(selected);
 render();advance();
}
$('show-line').onclick=()=>{
 const move=game.moves[selected],result=grades.get(selected);
 if(!move||!result?.best.info?.moves.length)return;
 const position=new Chess(move.before);
 const line=result.best.info.moves.slice(0,result.best.info.san.length);
 if(!line.length)return;
 position.move(line.shift());
 practice={position,start:move.before,line,message:`Engine line: ${result.best.info.san.join(' ')}`};render();
};
$('retry').onclick=()=>{
 const move=game.moves[selected];if(!move)return;
 practice={position:new Chess(move.before),start:move.before,recommended:grades.get(selected)?.best.uci,message:'Choose a legal move from the original position.'};
 render();
};
function track(fen){
 if(imported||!(fen=validFen(fen))||fen===latest)return;
 const move=observedMove(latest,fen);
 if(!latest)game.start=fen;
 else if(move&&!game.moves.some(entry=>entry.before===move.before&&entry.after===move.after)){
  const atEnd=selected===game.moves.length-1;
  game.moves.push(move);
  queue.push(game.moves.length-1);
  if(atEnd)selected=game.moves.length-1;
 }else if(!move&&fen!==game.start&&!game.moves.some(entry=>entry.after===fen)){
  gap=true;
  // Preserve earlier reviewed moves. Do not infer a move across a gap.
  if(!game.moves.length)game.start=fen;
 }
 latest=fen;
 if(reviewingAll)batchDisplay();else render();
 advance();
}
if(channel){
 channel.onmessage=({data})=>{
  if(data?.type==='review-history'&&Array.isArray(data.positions))data.positions.forEach(track);
  if(data?.type==='review-position')track(data.fen);
 };
 channel.postMessage({type:'review-ready'});
}
$('load').onclick=()=>{
 try {
  const next=readGame($('pgn').value);
  imported=true;stopAutoplay();engine.stop();request=null;queue=[];grades.clear();gap=false;game=next;reviewingAll=false;batchGrades=null;
  practice=null;selected=-1;batchDisplay();
  $('import-error').textContent='';advance();
 } catch(error){$('import-error').textContent=error.message;}
};
$('review-all').onclick=()=>{
 if(reviewingAll){engine.stop();queue=[];request=null;reviewingAll=false;batchGrades=null;advance();return;}
 stopAutoplay();practice=null;selected=-1;
 queue=game.moves.map((_,index)=>index).filter(index=>!grades.has(index)&&request?.index!==index);
 reviewingAll=true;
 batchGrades=new Map();
 render();batchDisplay();
 advance();
};
$('budget').onchange=()=>{
 $('budget-label').textContent=$('budget').selectedOptions[0].textContent;
 engine.stop();queue=[];request=null;grades.clear();reviewingAll=false;batchGrades=null;batchDisplay();select(-1);
};
$('first').onclick=()=>select(-1);
$('prev').onclick=()=>select(selected-1);
$('next').onclick=()=>select(selected+1);
$('last').onclick=()=>select(game.moves.length-1);
$('flip').onclick=()=>{flipped=!flipped;render();};
function stopAutoplay(){
 clearInterval(autoplayTimer);autoplayTimer=null;
 controlLabels.autoplay.textContent='Autoplay';$('autoplay').setAttribute('aria-pressed','false');
}
$('autoplay').onclick=()=>{
 if(autoplayTimer!==null){stopAutoplay();return;}
 if(!game.moves.length)return;
 if(selected>=game.moves.length-1)select(-1);
 controlLabels.autoplay.textContent='Stop autoplay';$('autoplay').setAttribute('aria-pressed','true');
 autoplayTimer=setInterval(()=>{
  if(selected>=game.moves.length-1)stopAutoplay();
  else select(selected+1);
 },Number($('autoplay-delay').value));
};
$('autoplay-delay').onchange=()=>{if(autoplayTimer!==null){stopAutoplay();$('autoplay').click();}};
$('coach-enabled').onchange=render;
$('hints-enabled').onchange=()=>{practice=null;render();};
window.addEventListener('keydown',event=>{
 if(event.target.closest('input,textarea,select,button'))return;
 if(event.key==='ArrowLeft')select(selected-1);
 if(event.key==='ArrowRight')select(selected+1);
});
window.addEventListener('pagehide',()=>{stopAutoplay();engine.destroy();channel?.close();audio?.close();});
render();

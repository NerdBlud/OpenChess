import {PositionTracker,placementFromPieces,squarePoint,validFen} from './core.js';
import {strengthById} from './strength.js';
(()=>{
 if(document.getElementById('openchess-host'))return;
 const lichess=location.hostname==='lichess.org';
 const mobile=window.matchMedia('(max-width:640px), (pointer:coarse)');
 const tracker=new PositionTracker();let board=null,current=null,pageFen=null,frameReady=false,arrowMoves=[],flipped=false,visible=!mobile.matches;
 let boardObserver=null,boardResize=null,scanTimer=null,lastWaiting=null;
 const scheduleScan=()=>{if(scanTimer===null)scanTimer=setTimeout(()=>{scanTimer=null;scan();},60);};
 const host=document.createElement('div');host.id='openchess-host';
 const shadow=host.attachShadow({mode:'open'});
 const style=document.createElement('style');style.textContent=`
 :host{position:fixed;right:16px;top:16px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;--panel-height:440px}
 iframe{display:block;width:352px;max-width:calc(100vw - 32px);height:min(var(--panel-height),calc(100dvh - 84px));border:1px solid #37373e;border-radius:12px;box-shadow:0 16px 48px #0005;color-scheme:dark;background:#171719;box-sizing:border-box}
 [hidden]{display:none!important}
 button{display:flex;align-items:center;justify-content:center;gap:8px;align-self:flex-end;min-height:44px;padding:8px 12px;box-sizing:border-box;background:#1c1c20;color:#efeff2;border:1px solid #45434b;border-radius:10px;cursor:pointer;font:500 13px 'Segoe UI',system-ui,sans-serif;touch-action:manipulation;box-shadow:0 4px 12px #0002}
 button:focus-visible{outline:2px solid #ee7581;outline-offset:3px}button img{width:20px;height:24px;object-fit:contain}
 @media(max-width:640px),(pointer:coarse){:host{top:auto;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom))}iframe{order:0;width:100%;max-width:100%;height:min(var(--panel-height),calc(72dvh - 64px));border-radius:14px}button{order:1}}
 @media(max-height:420px){:host{right:8px;top:8px;bottom:auto;left:auto}iframe{height:min(var(--panel-height),calc(100dvh - 72px))}}
 `;
 const frame=document.createElement('iframe');frame.src=chrome.runtime.getURL('panel.html')+'?embedded=1';frame.title='OpenChess analysis';frame.hidden=!visible;
 const toggle=document.createElement('button');
 const toggleLogo=document.createElement('img');toggleLogo.src=chrome.runtime.getURL('assets/evil-rook.png');toggleLogo.alt='';
 const toggleLabel=document.createElement('span');toggleLabel.textContent='OpenChess';toggle.append(toggleLogo,toggleLabel);
 toggle.setAttribute('aria-label','Toggle OpenChess');toggle.setAttribute('aria-expanded',String(visible));toggle.title='Show or hide OpenChess';
 function setVisible(value){visible=value;frame.hidden=!visible;toggle.setAttribute('aria-expanded',String(visible));if(!visible)toggle.focus({preventScroll:true});}
 toggle.onclick=()=>setVisible(!visible);
 mobile.addEventListener('change',event=>setVisible(!event.matches));
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&visible)setVisible(false);});
 shadow.append(style,toggle,frame);document.documentElement.append(host);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.style.cssText='position:fixed;pointer-events:none;z-index:2147483645;display:none;overflow:visible';document.documentElement.append(svg);
 svg.innerHTML='<defs><marker id="openchess-arrowhead" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#c43d4e"/></marker></defs><line stroke="#c43d4e" stroke-width="1.8" stroke-linecap="round" opacity=".88" marker-end="url(#openchess-arrowhead)"/>';
 function send(message){if(frameReady)frame.contentWindow.postMessage({...message,channel:'openchess-host'},'*');}
 function publish(fen,source,rawFen=null){if(!fen)return;if(current?.fen===fen&&current.source===source)return;current={fen,source,rawFen};lastWaiting=null;arrowMoves=[];draw();send({type:'position',...current});}
 function waiting(message){if(lastWaiting!==message){lastWaiting=message;send({type:'waiting',message});}}
 function draw(){if(!board||!arrowMoves.length){svg.style.display='none';return;}const rect=board.getBoundingClientRect();Object.assign(svg.style,{display:'block',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});for(const [index,move] of arrowMoves.entries()){
   const line=svg.querySelectorAll('line')[index];
   const a=squarePoint(move.slice(0,2),flipped),b=squarePoint(move.slice(2,4),flipped);
   for(const [key,value] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,value);
  }}
 function scan(){
  if(document.hidden)return;
  const selector=lichess?'.analyse__board cg-board,.study__board cg-board':'wc-chess-board,chess-board';
  const found=board?.isConnected&&board.getBoundingClientRect().width>100?board:[...document.querySelectorAll(selector)].find(el=>el.getBoundingClientRect().width>100);
  if(found!==board){
   boardObserver?.disconnect();boardResize?.disconnect();board=found;pageFen=null;current=null;tracker.trusted=false;
   if(board){boardObserver=new MutationObserver(scheduleScan);boardObserver.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});boardResize=new ResizeObserver(draw);boardResize.observe(board);}
   waiting('Connecting to board…');window.postMessage({channel:'openchess-request',type:'poll'},location.origin);
  }
  if(!board){waiting('Open an analysis board, or paste a FEN.');svg.style.display='none';return;}
  const nextFlipped=lichess?!!board.closest('.orientation-black'):board.classList.contains('flipped');if(nextFlipped!==flipped){flipped=nextFlipped;draw();}
  if(lichess){
   const fen=[...document.querySelectorAll('input.copyable')].map(input=>input.value).find(value=>value.trim().split(/\s+/).length===6);
   if(fen&&fen===current?.rawFen)return;
   const exact=fen&&validFen(fen);
   if(exact)publish(exact,'tracked',fen);
   else{current=null;arrowMoves=[];draw();waiting('Open Lichess position sharing to expose the FEN, or paste it in Tools.');}
   return;
  }
  const pieces=[...board.querySelectorAll('.piece')].map(el=>{const cls=el.getAttribute('class')||'',p=cls.match(/\b([wb])([pnbrqk])\b/),s=cls.match(/\bsquare-([1-8])([1-8])\b/);return p&&s?{color:p[1],type:p[2],square:String.fromCharCode(96+Number(s[1]))+s[2]}:null;}).filter(Boolean);
  const placement=placementFromPieces(pieces);if(!pieces.length)return;
  if(pageFen&&pageFen.split(' ')[0]===placement){if(current?.rawFen===pageFen&&current.source==='page')return;const canonical=validFen(pageFen);if(canonical){tracker.setFen(canonical);publish(canonical,'page',pageFen);}return;}
  const inferred=tracker.update(placement);if(inferred)publish(inferred,'tracked');else if(current?.fen.split(' ')[0]!==placement){current=null;arrowMoves=[];draw();waiting('Exact position unavailable. Start a new game or paste the full FEN.');}
 }
 window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source===frame.contentWindow&&data?.channel==='openchess-panel'){
   if(data.type==='dismiss')setVisible(false);
   if(data.type==='resize'&&Number.isFinite(data.height))host.style.setProperty('--panel-height',Math.max(180,Math.min(3000,data.height+2))+'px');
   if(data.type==='summary')toggleLabel.textContent='OpenChess'+(typeof data.move==='string'&&data.move.length<=24&&data.move?' · '+data.move:'');
   if(data.type==='ready'){frameReady=true;lastWaiting=null;if(current)send({type:'position',...current});scan();}
   if(data.type==='arrow'){
    arrowMoves=data.fen===current?.fen&&Array.isArray(data.moves)
     ?data.moves.filter(move=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)).slice(0,5):[];
    const color=strengthById(data.profile).color;
    svg.querySelector('marker path').setAttribute('fill',color);
    svg.querySelectorAll('line').forEach(line=>line.remove());
    arrowMoves.forEach((move,index)=>{
     const line=document.createElementNS(svg.namespaceURI,'line');
     line.setAttribute('stroke',color);
     line.setAttribute('stroke-width',index===0?'2':'1.2');
     line.setAttribute('stroke-linecap','round');
     line.setAttribute('opacity',index===0?'.95':String(.72-index*.08));
     line.setAttribute('marker-end','url(#openchess-arrowhead)');
     svg.append(line);
    });
    draw();
   }
    if(data.type==='move'){if(current?.source!=='page'||data.fen!==current.fen){send({type:'move-result',error:'Move controls require a current exact board position.'});return;}window.postMessage({channel:'openchess-request',type:'move',uci:data.move,fen:current.rawFen,id:data.id},location.origin);}
   if(data.type==='seed'&&validFen(data.fen)){tracker.setFen(data.fen);scan();}
   return;
  }
  if(event.source!==window||event.origin!==location.origin||data?.channel!=='openchess-page')return;
  if(data.type==='position'&&validFen(data.fen)){pageFen=data.fen;scan();}else if(data.type==='move-result')send(data);
 });
 // Piece changes are observed directly; slow discovery only handles board replacement.
 setInterval(()=>{if(lichess||!board?.isConnected||!current||board.getBoundingClientRect().width<100)scheduleScan();},lichess?250:1500);
 let drawing=false;const scheduleDraw=()=>{if(!drawing){drawing=true;requestAnimationFrame(()=>{drawing=false;draw();});}};
 window.addEventListener('scroll',scheduleDraw,true);window.addEventListener('resize',scheduleDraw);document.addEventListener('visibilitychange',scheduleScan);scan();
})();

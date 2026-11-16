// Runs in the page's MAIN world. Site APIs are optional; failure is explicit.
(()=>{
 if(window.__openChessBridge)return;window.__openChessBridge=true;
 function game(){const board=document.querySelector('wc-chess-board,chess-board');return board?.game||window.game;}
 function fen(){const g=game();for(const key of ['getFEN','getFen','fen']){try{const value=typeof g?.[key]==='function'?g[key]():g?.[key];if(typeof value==='string'&&value.split(' ').length===6)return value;}catch{}}return null;}
 let last='';setInterval(()=>{const value=fen();if(value&&value!==last){last=value;window.postMessage({channel:'openchess-page',type:'position',fen:value},location.origin);}},250);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='openchess-request')return;
  const request=event.data;if(request.type==='poll'){last='';return;}
  if(request.type!=='move'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(request.uci))return;
  let error=null;
  try{const g=game(),current=fen();if(!current||current!==request.fen)throw Error('Position changed or exact position unavailable.');if(typeof g?.getLegalMoves!=='function'||typeof g?.move!=='function')throw Error('This board does not expose move controls.');
   const legal=g.getLegalMoves();if(!Array.isArray(legal))throw Error('Legal move list unavailable.');const move=legal.find(m=>m.from===request.uci.slice(0,2)&&m.to===request.uci.slice(2,4));if(!move)throw Error('Move is no longer legal.');
   g.move({...move,...(request.uci[4]?{promotionType:request.uci[4]}:{}),animate:true,userGenerated:true});
  }catch(e){error=e.message;}
  window.postMessage({channel:'openchess-page',type:'move-result',error,id:request.id},location.origin);
 });
})();

import {parseInfo} from './core.js';
import {strengthCommands,selectProfileMove} from './strength.js';

export class LocalEngine {
 constructor(onInfo,onState,model='lite') {
  this.onInfo=onInfo;this.onState=onState;this.active=null;this.pending=null;this.ready=false;this.stopping=false;
  this.rawInfo=new Map();this.infoTimer=null;
  this.worker=new Worker(new URL(model==='full'?'engine/stockfish-19-single.js':'engine/stockfish-19-lite-single.js',location.href));
  this.worker.onmessage=e=>this.receive(String(e.data));
  this.worker.onerror=()=>onState('Engine failed to load. Reload to retry.');
  this.send('uci');
  this.timer=setTimeout(()=>{if(!this.ready)onState('Engine initialization timed out. Reload to retry.');},30000);
 }
 send(command){this.worker.postMessage(command);}
 discardInfo(){clearTimeout(this.infoTimer);this.infoTimer=null;this.rawInfo.clear();}
 flushInfo(){
  clearTimeout(this.infoTimer);this.infoTimer=null;
  if(this.active&&!this.stopping){
   for(const line of this.rawInfo.values()){
    const info=parseInfo(line,this.active.fen);
    if(info)this.onInfo({...info,id:this.active.id,fen:this.active.fen,done:false});
   }
  }
  this.rawInfo.clear();
 }
 receive(line){
  if(line==='uciok'){this.send('setoption name Hash value 16');this.send('isready');return;}
  if(line==='readyok'){this.ready=true;clearTimeout(this.timer);this.onState('Engine ready');this.startPending();return;}
  if(line.startsWith('info ')&&line.includes(' pv ')&&this.active&&!this.stopping){
   // Keep only the newest PV per line. Expensive SAN conversion is capped at 12.5 Hz.
   const rank=Number(line.match(/\bmultipv (\d+)/)?.[1]||1);
   if(rank>this.active.lines)return;
   this.rawInfo.set(rank,line);
   if(this.infoTimer===null)this.infoTimer=setTimeout(()=>this.flushInfo(),80);
   return;
  }
  if(line.startsWith('bestmove')){
   this.flushInfo();const finished=this.active;this.active=null;
   if(finished&&!this.stopping)this.onInfo({id:finished.id,fen:finished.fen,bestmove:selectProfileMove(finished.fen,line.split(' ')[1],finished.profile),done:true});
   this.stopping=false;this.startPending();
  }
 }
 analyze(request){
  this.pending=request;
  if(this.active){if(!this.stopping){this.stopping=true;this.discardInfo();this.send('stop');}}
  else this.startPending();
 }
 startPending(){
  if(!this.ready||this.active||!this.pending)return;
  this.discardInfo();this.active=this.pending;this.pending=null;
  const r=this.active;
  this.send(`setoption name MultiPV value ${r.lines}`);
  for(const command of strengthCommands(r.profile))this.send(command);
  this.send('position fen '+r.fen);
  this.send(`go movetime ${r.time}${r.onlyMove ? ' searchmoves '+r.onlyMove : ''}`);
 }
 stop(){this.pending=null;this.discardInfo();if(this.active&&!this.stopping){this.stopping=true;this.send('stop');}}
 destroy(){clearTimeout(this.timer);this.discardInfo();this.worker.terminate();}
}

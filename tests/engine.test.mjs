import test from 'node:test';import assert from 'node:assert/strict';
import {LocalEngine} from '../src/engine.js';
import {START_FEN} from '../src/core.js';
import {STRENGTHS,strengthCommands,strengthById,selectProfileMove} from '../src/strength.js';
import {Chess} from 'chess.js';

globalThis.location={href:'https://example.test/panel.html'};
globalThis.Worker=class{constructor(){this.commands=[];}postMessage(command){this.commands.push(command);}terminate(){this.terminated=true;}};
const request=(id=1,profile='expert')=>({id,profile,fen:START_FEN,lines:1,time:500});
function setup(){const results=[],engine=new LocalEngine(r=>results.push(r),()=>{});engine.receive('uciok');engine.receive('readyok');return{engine,results};}
test('all twelve presets have distinct colors and supported engine targets',()=>{
 assert.equal(STRENGTHS.length,12);assert.equal(new Set(STRENGTHS.map(s=>s.color)).size,12);
 assert.ok(STRENGTHS.every(s=>s.elo===null||s.randomMoveChance||s.elo>=1320&&s.elo<=3190));
 assert.ok(strengthCommands('expert').includes('setoption name UCI_Elo value 2100'));
 assert.ok(strengthCommands('unbound').includes('setoption name UCI_LimitStrength value false'));
 assert.equal(strengthById('unknown').id,'unbound');
});
test('beginner profiles never send unsupported Elo values to Stockfish',()=>{
 for(const id of ['starter','learner','rookie','challenger'])assert.ok(strengthCommands(id).includes('setoption name UCI_Elo value 1320'));
});
test('beginner move selection weakens recommendations while preserving legality',()=>{
 assert.notEqual(selectProfileMove(START_FEN,'e2e4','starter',()=>0.5),'e2e4');
 assert.equal(selectProfileMove(START_FEN,'e2e4','challenger',()=>0.5),'e2e4');
 assert.equal(selectProfileMove(START_FEN,'e2e4','expert',()=>0),'e2e4');
 const positions=[START_FEN,'7k/P7/8/8/8/8/8/7K w - - 0 1','4r2k/8/8/8/8/8/8/4K3 w - - 0 1','7k/8/8/3pP3/8/8/8/7K w - d6 0 1'];
 for(const fen of positions){const legal=new Chess(fen).moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));for(const profile of STRENGTHS.filter(s=>s.randomMoveChance))for(const random of [()=>0,()=>0.5,()=>0.999])assert.ok(legal.includes(selectProfileMove(fen,legal[0],profile.id,random)));}
});
test('beginner policy handles terminal positions',()=>{
 assert.equal(selectProfileMove('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1','(none)','starter'),'(none)');
});
test('engine applies Elo limit, resets it for maximum strength, and uses the requested budget',()=>{
 const{engine}=setup();try{
 engine.analyze(request());assert.ok(engine.worker.commands.includes('setoption name UCI_LimitStrength value true'));assert.ok(engine.worker.commands.includes('setoption name UCI_Elo value 2100'));assert.ok(engine.worker.commands.includes('go movetime 500'));
 engine.receive('bestmove e2e4');engine.analyze(request(2,'unbound'));
 assert.ok(engine.worker.commands.includes('setoption name UCI_LimitStrength value false'));
 }finally{engine.destroy();}
});
test('100 raw updates coalesce to one latest converted variation',()=>{
 const{engine,results}=setup();try{engine.analyze(request());for(let depth=1;depth<=100;depth++)engine.receive(`info depth ${depth} multipv 1 score cp 20 pv e2e4 e7e5`);
 assert.equal(results.length,0);engine.flushInfo();assert.equal(results.length,1);assert.equal(results[0].depth,100);
 }finally{engine.destroy();}
});
test('stopping a search discards pending updates and does not play its best move',()=>{
 const{engine,results}=setup();try{engine.analyze(request());engine.receive('info depth 10 multipv 1 score cp 20 pv e2e4');engine.analyze(request(2));engine.receive('bestmove e2e4');assert.equal(results.length,0);assert.equal(engine.active.id,2);
 engine.receive('info depth 11 multipv 1 score cp 22 pv d2d4');engine.receive('bestmove d2d4');assert.ok(results.every(r=>r.id===2));assert.equal(results.at(-1).bestmove,'d2d4');
 }finally{engine.destroy();}
});

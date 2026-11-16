import {Chess} from 'chess.js';
// Sub-1320 profiles are uncalibrated beginner styles, not native UCI Elo targets.
export const STRENGTHS=Object.freeze([
 {id:'starter',name:'Starter',elo:300,color:'#b3c8a2',randomMoveChance:0.85},
 {id:'learner',name:'Learner',elo:500,color:'#a2cba5',randomMoveChance:0.65},
 {id:'rookie',name:'Rookie',elo:700,color:'#88cbb0',randomMoveChance:0.45},
 {id:'challenger',name:'Challenger',elo:1000,color:'#74cbbf',randomMoveChance:0.20},
 {id:'apprentice',name:'Apprentice',elo:1320,color:'#65c6a6'},
 {id:'club',name:'Club',elo:1500,color:'#62c3d8'},
 {id:'tactician',name:'Tactician',elo:1800,color:'#81a5f8'},
 {id:'expert',name:'Expert',elo:2100,color:'#ac98e8'},
 {id:'master',name:'Master',elo:2400,color:'#dcb773'},
 {id:'grandmaster',name:'Grandmaster',elo:2700,color:'#e7a06e'},
 {id:'elite',name:'Elite',elo:3000,color:'#e586a9'},
 {id:'unbound',name:'Unbound',elo:null,color:'#ee7581'}
]);
export function strengthById(id){return STRENGTHS.find(p=>p.id===id)||STRENGTHS.at(-1);}
export function strengthCommands(id){const profile=strengthById(id);return [
 `setoption name UCI_LimitStrength value ${profile.elo!==null}`,
 ...(profile.elo!==null?[`setoption name UCI_Elo value ${Math.max(1320,profile.elo)}`]:[]),
 'setoption name Skill Level value 20'
];}
export function selectProfileMove(fen,engineMove,id,random=Math.random){
 const profile=strengthById(id);
 if(!profile.randomMoveChance)return engineMove;
 const moves=new Chess(fen).moves({verbose:true}).map(move=>move.from+move.to+(move.promotion||''));
 if(!moves.length)return '(none)';
 const baseline=moves.includes(engineMove)?engineMove:moves[0];
 const alternatives=moves.filter(move=>move!==baseline);
 if(!alternatives.length||random()>=profile.randomMoveChance)return baseline;
 return alternatives[Math.min(alternatives.length-1,Math.max(0,Math.floor(random()*alternatives.length)))];
}

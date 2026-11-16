import {Chess} from 'chess.js';
import {strengthById} from './strength.js';

export function rankSuggestions(fen, best, rows, mode, profile, count, personality='balanced') {
 const legal = new Map(new Chess(fen).moves({verbose:true}).map(move=>[move.lan, move]));
 const candidates = [...rows].sort((a,b)=>a.rank-b.rank)
  .map(row=>row.moves[0]).filter(move=>legal.has(move));
 const moves = [...new Set([best, ...candidates])].filter(move=>legal.has(move));
 if((mode==='human'||personality!=='balanced') && moves.length>1){
  const strength = strengthById(profile).elo ?? 3190;
  const bias = strength < 1320 ? 2.5 : strength < 2200 ? 1.4 : 0.65;
  const ranked = moves.map((uci,index)=>{
   const move=legal.get(uci);
   const practical = (move.san.includes('O-O')?2:0) + (move.captured?1:0)
    + (move.piece==='n'||move.piece==='b'?0.6:0)
    + ('de'.includes(move.to[0])&&'45'.includes(move.to[1])?0.8:0);
   const style = {
    attacker: (move.san.includes('+')?2:0)+(move.captured?1.5:0),
    positional: (move.piece==='n'||move.piece==='b'?1.4:0)+('de'.includes(move.to[0])?1:0),
    defensive: (move.san.startsWith('O-O')?3:0)+(move.captured?0:0.7),
    opportunist: (move.captured?2.4:0)+(move.promotion?2:0),
    gambiteer: (move.piece==='p'&&'cdef'.includes(move.from[0])?2.3:0)+(move.san.includes('+')?0.7:0)
   }[personality]??0;
   return {uci, score: bias*((mode==='human'?practical:0)+style)-index};
  });
  // Keep the sampled beginner move first so the weaker styles still make mistakes.
  if(strength<1320) return [moves[0],...ranked.slice(1).sort((a,b)=>b.score-a.score).map(row=>row.uci)].slice(0,count);
  return ranked.sort((a,b)=>b.score-a.score).slice(0,count).map(row=>row.uci);
 }
 return moves.slice(0,count);
}

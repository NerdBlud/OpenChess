import {Chess} from 'chess.js';

export function readGame(pgn) {
 const game = new Chess();
 game.loadPgn(pgn);
 const moves = game.history({verbose:true});
 if (!moves.length) throw new Error('Paste a PGN with at least one move.');
 return {start:moves[0].before,moves};
}

export function observedMove(before, after) {
 if (!before || before === after) return null;
 return new Chess(before).moves({verbose:true}).find(move=>move.after===after)??null;
}

// A bounded score-to-chance estimate, not a measured game outcome.
export function whiteChance(info) {
 if (!info) return null;
 if (info.kind==='mate') return info.value>0?100:0;
 return 100/(1+Math.exp(-0.00368208*info.value));
}

export function chanceLoss(color,best,played) {
 if (!best||!played) return null;
 return Math.max(0,(whiteChance(best)-whiteChance(played))*(color==='w'?1:-1));
}

export function gradeMove(move, recommended, best, played, alternative) {
 if (!best || !played) return null;
 const sign = move.color === 'w' ? 1 : -1;
 const loss = chanceLoss(move.color,best,played);
 if (move.lan===recommended) {
  if(alternative&&chanceLoss(move.color,best,alternative)>=18)return 'Great';
  return 'Best';
 }
 if (best.kind==='mate' && best.value*sign>0 && !(played.kind==='mate' && played.value*sign>0) && loss>=10) return 'Missed mate';
 if (loss<2) return 'Excellent';
 if (loss<5) return 'Good';
 if (loss<10) return 'Inaccuracy';
 if (loss<20) return 'Mistake';
 return 'Blunder';
}

export function summarizeReview(moves,grades) {
 const result={w:{sum:0,count:0},b:{sum:0,count:0},tally:new Map(),turns:[]};
 for(const [index,review] of grades){
  const move=moves[index];
  if(!move||!review.grade)continue;
  const loss=chanceLoss(move.color,review.best.info,review.played);
  if(loss===null)continue;
  const side=result[move.color];
  side.sum+=100*Math.exp(-loss/24);side.count++;
  if(!result.tally.has(review.grade))result.tally.set(review.grade,[]);
  result.tally.get(review.grade).push(index);
  if(loss>=5)result.turns.push({index,loss});
 }
 result.turns.sort((a,b)=>b.loss-a.loss||a.index-b.index);
 return result;
}

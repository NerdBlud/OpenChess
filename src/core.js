import {Chess} from 'chess.js';
export const START_FEN=new Chess().fen();
export function validFen(fen){try{return new Chess(fen).fen();}catch{return null;}}
export function parseInfo(line,fen){
 if(!line.startsWith('info ')||!line.includes(' pv '))return null;
 const depth=Number(line.match(/\bdepth (\d+)/)?.[1]||0),rank=Number(line.match(/\bmultipv (\d+)/)?.[1]||1);
 const score=line.match(/\bscore (cp|mate) (-?\d+)/);if(!score)return null;
 const moves=line.split(' pv ')[1].trim().split(/\s+/);const game=new Chess(fen),san=[];
 for(const uci of moves.slice(0,12)){try{const move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});if(!move)break;san.push(move.san);}catch{break;}}
 const value=Number(score[2])*(fen.split(' ')[1]==='w'?1:-1);
 return {depth,rank,kind:score[1],value,moves,san,score:score[1]==='mate'?`M${value}`:`${value>=0?'+':''}${(value/100).toFixed(2)}`};
}
export function squarePoint(square,flipped=false){const file=square.charCodeAt(0)-97,rank=Number(square[1])-1;return {x:(flipped?7-file:file)*12.5+6.25,y:(flipped?rank:7-rank)*12.5+6.25};}
export function explainMove(fen,uci){try{const game=new Chess(fen),move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});if(game.isCheckmate())return 'Delivers checkmate.';if(move.flags.includes('k')||move.flags.includes('q'))return 'Castles: brings the king to safety and activates the rook.';if(move.promotion)return 'Promotes a pawn.';if(move.captured)return `Captures ${ {p:'a pawn',n:'a knight',b:'a bishop',r:'a rook',q:'the queen'}[move.captured]||'a piece'}${game.isCheck()?' with check':''}.`;if(game.isCheck())return 'Checks the king.';return `${{p:'Pawn',n:'Knight',b:'Bishop',r:'Rook',q:'Queen',k:'King'}[move.piece]} to ${move.to}. Engine-preferred continuation.`;}catch{return '';}}
export function placementFromPieces(pieces){const board=Array.from({length:8},()=>Array(8).fill(null));for(const {square,color,type}of pieces){if(!/^[a-h][1-8]$/.test(square)||!/[pnbrqk]/.test(type))return null;const r=8-Number(square[1]),c=square.charCodeAt(0)-97;if(board[r][c])return null;board[r][c]=color==='w'?type.toUpperCase():type;}return board.map(row=>{let out='',empty=0;for(const piece of row){if(!piece){empty++;continue;}if(empty)out+=empty;empty=0;out+=piece;}return out+(empty||'');}).join('/');}
export class PositionTracker{
 constructor(){this.game=new Chess();this.trusted=false;}
 update(placement){if(!placement)return null;const start=START_FEN.split(' ')[0];if(placement===start){this.game=new Chess();this.trusted=true;return this.game.fen();}if(!this.trusted)return null;if(this.game.fen().split(' ')[0]===placement)return this.game.fen();for(const move of this.game.moves({verbose:true})){this.game.move(move);if(this.game.fen().split(' ')[0]===placement)return this.game.fen();this.game.undo();}this.trusted=false;return null;}
 setFen(fen){const canonical=validFen(fen);if(!canonical)return false;this.game=new Chess(canonical);this.trusted=true;return true;}
}

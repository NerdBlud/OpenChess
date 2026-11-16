import test from 'node:test';import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {START_FEN,validFen,parseInfo,squarePoint,explainMove,PositionTracker,placementFromPieces} from '../src/core.js';
test('FEN validation and turn-sensitive evaluation',()=>{assert.equal(validFen('broken'),null);const game=new Chess();game.move('e4');const info=parseInfo('info depth 12 multipv 1 score cp 32 pv e7e5 g1f3',game.fen());assert.equal(info.score,'-0.32');assert.deepEqual(info.san,['e5','Nf3']);});
test('DOM tracker preserves turn and rights through legal moves',()=>{const t=new PositionTracker(),g=new Chess();assert.equal(t.update(g.fen().split(' ')[0]),START_FEN);for(const move of ['e4','e5','Nf3','Nc6','Bb5']){g.move(move);assert.equal(t.update(g.fen().split(' ')[0]),g.fen());}});
test('tracker refuses arbitrary midgame state without seed',()=>{const t=new PositionTracker(),g=new Chess();g.move('e4');assert.equal(t.update(g.fen().split(' ')[0]),null);assert.ok(t.setFen(g.fen()));assert.equal(t.update(g.fen().split(' ')[0]),g.fen());});
test('square mapping respects orientation',()=>{assert.deepEqual(squarePoint('a8'),{x:6.25,y:6.25});assert.deepEqual(squarePoint('a8',true),{x:93.75,y:93.75});});
test('piece placement compresses empty ranks and rejects duplicates',()=>{const pieces=[{square:'e1',color:'w',type:'k'},{square:'e8',color:'b',type:'k'}];assert.equal(placementFromPieces(pieces),'4k3/8/8/8/8/8/8/4K3');assert.equal(placementFromPieces([...pieces,pieces[0]]),null);});
test('move explanations report facts',()=>{assert.match(explainMove(START_FEN,'g1f3'),/Knight to f3/);});

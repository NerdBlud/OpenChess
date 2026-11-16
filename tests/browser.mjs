import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';import {build} from 'esbuild';
import {STRENGTHS} from '../src/strength.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),extension=path.join(root,'dist/chrome');
const fixture=await build({absWorkingDir:root,stdin:{contents:`import {Chess} from 'chess.js';const chess=new Chess();const board=document.querySelector('chess-board');const icons={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'};function render(){board.replaceChildren();for(let r=0;r<8;r++)for(let f=0;f<8;f++){const cell=document.createElement('div');cell.className='cell '+((r+f)%2?'dark':'');cell.style.gridArea=(r+1)+'/'+(f+1);board.append(cell);}for(const p of chess.board().flat().filter(Boolean)){const el=document.createElement('div');const f=p.square.charCodeAt(0)-96,r=Number(p.square[1]);el.className='piece '+p.color+p.type+' square-'+f+r;el.textContent=icons[p.type];el.style.cssText='grid-area:'+(9-r)+'/'+f+';z-index:1;color:'+(p.color==='w'?'#fff9ea':'#251b23')+';text-shadow:0 1px 2px #35222c';board.append(el);}}board.game={getFEN:()=>chess.fen(),getLegalMoves:()=>chess.moves({verbose:true}),move:m=>{chess.move(m);render();}};window.fixtureMove=m=>{chess.move(m);render();};window.fixtureFen=()=>chess.fen();render();`,resolveDir:root},bundle:true,write:false,format:'iife'});
const html=`<!doctype html><html><head><title>OpenChess integration fixture</title><style>body{background:radial-gradient(ellipse at 80% 28%,#49232e,#241b22 42%,#171719 78%) fixed;color:#f5eee4;font:16px "Segoe UI",system-ui;margin:50px}h1{font-size:32px;letter-spacing:-1px}p,small{color:#cfabb5}chess-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);width:min(480px,100%);aspect-ratio:1;border:8px solid #54323d;border-radius:8px}.cell{background:#ded1bd}.cell.dark{background:#906872}.piece{font-size:49px;display:grid;place-items:center}small{display:block;margin-top:20px}@media(max-width:640px){body{margin:24px 16px}.piece{font-size:9vw}}</style></head><body><h1>OpenChess</h1><p>Local engine · integration test board</p><chess-board></chess-board><small>Simulated Chess.com adapter. No live game or account.</small><script>${fixture.outputFiles[0].text}</script></body></html>`;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'openchess-test-'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1100,height:720}});
try{
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://www.chess.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
 await page.goto('https://www.chess.com/openchess-test/');
 await page.waitForFunction(()=>!!document.querySelector('#openchess-host'),{timeout:15000});
 let panel;for(let i=0;i<100;i++){panel=page.frames().find(f=>f.url().startsWith('chrome-extension://')&&f.url().includes('panel.html'));if(panel)break;await page.waitForTimeout(100);}assert.ok(panel,'Extension iframe loads');
 await panel.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:30000});
 assert.notEqual(await panel.locator('#best').textContent(),'Waiting for analysis');assert.equal(await panel.locator('body').getAttribute('data-source'),'page');
 assert.ok(await panel.locator('#lines li').count()>=1,'Real WASM engine produces principal variations');
 assert.ok(await panel.locator('.brand-mark').evaluate(img=>img.complete&&img.naturalWidth>0),'Generated logo loads');
 assert.equal(await panel.locator('#board, #show-board').count(),0,'Duplicate board is removed');
 assert.equal(await panel.locator('#notice').isVisible(),false,'Routine success status is not displayed');
 assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
 await page.screenshot({path:path.join(root,'docs/media/desktop.png')});
 for(const profile of STRENGTHS){
  await panel.selectOption('#profile',profile.id);
  await panel.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:30000});
  const color=await page.locator('svg:has(#openchess-arrowhead) > line').first().getAttribute('stroke');
  assert.equal(color,profile.color,profile.name+' changes the actual board arrow');
  assert.notEqual(await panel.locator('#best').textContent(),'—');
 }
 const idleMutations=await panel.evaluate(()=>new Promise(resolve=>{let changes=0;const observer=new MutationObserver(records=>changes+=records.length);observer.observe(document.getElementById('lines'),{childList:true,subtree:true});setTimeout(()=>{observer.disconnect();resolve(changes);},1000);}));
 assert.equal(idleMutations,0,'Idle analysis is not rerendered');
 await panel.locator('#settings summary').click();
 await panel.selectOption('#count','5');
 for(const mode of ['human','neural','engine']){
  await panel.selectOption('#mode',mode);
  await panel.waitForFunction(()=>document.body.dataset.analysis==='complete');
  assert.equal(await page.locator('svg:has(#openchess-arrowhead) > line').count(),5);
 }
 assert.equal(await panel.locator('#settings').evaluate(el=>el.open),true,'Engine settings open on click');
 await panel.selectOption('#delay','500');await panel.selectOption('#auto','w');
 await page.waitForFunction(()=>window.fixtureFen().split(' ')[1]==='b',{timeout:15000});
 await panel.waitForFunction(()=>document.body.dataset.turn==='b');
 await panel.selectOption('#auto','off');
 await panel.click('#pause');assert.equal(await panel.locator('#pause').textContent(),'Resume');assert.ok(await panel.locator('#play').isDisabled());
 await panel.locator('#tools summary').click();
 await panel.fill('#fen','not a fen');await panel.click('#load');assert.match(await panel.locator('#status').textContent(),/Invalid FEN/);
 await panel.selectOption('#model','full');await panel.click('#analyze');
 await panel.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:45000});
 const newPage=context.waitForEvent('page');await panel.click('#detach');const detached=await newPage;
 await detached.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:30000});
 assert.equal(await detached.locator('#fen').inputValue(),await page.evaluate(()=>window.fixtureFen()));
 assert.ok(await detached.locator('#auto').isDisabled());
 assert.equal(detached.workers().length,0,'Detached analysis mirrors results without a second WASM worker');
 await detached.selectOption('#stream-layout','move');
 assert.equal(await detached.locator('#score').isVisible(),false);
 await detached.click('#freeze');
 const frozenFen=await detached.locator('#fen').inputValue();
 await page.evaluate(()=>window.fixtureMove('e5'));
 await panel.waitForFunction(()=>document.body.dataset.turn==='w');
 assert.equal(await detached.locator('#fen').inputValue(),frozenFen);
 await detached.click('#freeze');
 await detached.waitForFunction(old=>document.querySelector('#fen').value!==old,frozenFen);
 await detached.check('#stream-hide-controls');
 await detached.click('#stream-show-controls');
 await panel.selectOption('#personality','attacker');
 await panel.waitForFunction(()=>document.body.dataset.analysis==='complete');
 const reviewOpened=context.waitForEvent('page');
 await panel.click('#game-review');
 const review=await reviewOpened;
 await review.locator('#moves button').first().waitFor();
 assert.equal(await review.locator('#board .square').count(),64);
 for(const width of [1100,390]){
  await review.setViewportSize({width,height:720});
  const geometry=await review.locator('#board').evaluate(board=>{
   const bounds=board.getBoundingClientRect();
   const cells=[...board.children].map(cell=>cell.getBoundingClientRect());
   const rank=board.querySelector('.coordinate.rank');
   return {
    equalSquares:cells.every(cell=>Math.abs(cell.width-cell.height)<1&&Math.abs(cell.height-cells[0].height)<1),
    bottomVisible:Math.abs(cells.at(-1).bottom-bounds.bottom)<2,
    cornerLabel:getComputedStyle(rank).position==='absolute',
    labels:board.querySelectorAll('.coordinate').length,
    grayRed:getComputedStyle(board.children[1]).backgroundImage.includes('144, 63, 80')
   };
  });
  assert.deepEqual(geometry,{equalSquares:true,bottomVisible:true,cornerLabel:true,labels:16,grayRed:true});
 }
 await review.setViewportSize({width:1100,height:720});
 await review.getByText('Import PGN',{exact:true}).click();
 await review.fill('#pgn','1. f3 e5 2. g4 Qh4#');
 await review.click('#load');
 await review.click('#budget-trigger');
 await review.locator('[data-budget="300"]').click();
 await review.locator('#review-all').filter({hasText:'Review all'}).waitFor();
 await review.click('#review-all');
 assert.ok(await review.locator('#review-progress').isVisible());
 assert.equal(await review.locator('#review-results').isVisible(),false);
 await review.waitForFunction(()=>document.querySelector('#status').textContent.includes('4 of 4 moves reviewed'),{},{timeout:30000});
 assert.match(await review.locator('#moves [aria-current=true]').textContent(),/1\. f3/);
 await review.click('#last');
 assert.match(await review.locator('#details').textContent(),/Qh4#.*Depth [0-9]/);
 assert.match(await review.locator('#board [data-square="h4"] .grade-badge').getAttribute('aria-label'),/^(Best|Great)$/);
 assert.equal(await review.locator('#graph button').count(),4);
 assert.match(await review.locator('#accuracy').textContent(),/White: .*2\/2 graded.*Black: .*2\/2 graded/);
 await review.click('#retry');
 await review.selectOption('#practice select','d8h4');
 await review.getByRole('button',{name:'Try move'}).click();
 assert.match(await review.locator('#practice p').textContent(),/Matches Stockfish/);
 await review.getByRole('button',{name:'Back to review'}).click();
 await review.click('#show-line');
 assert.match(await review.locator('#practice p').textContent(),/Engine line: Qh4#/);
 await review.getByRole('button',{name:'Back to review'}).click();
 assert.equal(await review.locator('#moves .grade-badge').count(),4);
 await review.click('#sound');
 assert.equal(await review.locator('#sound').getAttribute('aria-pressed'),'true');
 await review.click('#prev');
 assert.ok(await review.locator('#board [data-square="g4"] svg').isVisible());
 await review.emulateMedia({reducedMotion:'reduce'});
 await review.click('#next');
 assert.equal(await review.locator('#board .moving').count(),0);
 await review.screenshot({path:path.join(root,'docs/media/game-review.png'),fullPage:true,animations:'disabled'});
 await review.close();
 await detached.selectOption('#stream-layout','compact');
 await detached.screenshot({path:path.join(root,'docs/media/streamer.png'),fullPage:true});
 const designPage=await context.newPage();await designPage.setViewportSize({width:352,height:540});await designPage.goto(panel.url().split('?')[0]);
 await designPage.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:30000});
 await designPage.setViewportSize({width:320,height:800});assert.equal(await designPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Compact panel has no horizontal overflow');
 await designPage.emulateMedia({reducedMotion:'reduce'});await designPage.evaluate(()=>document.querySelector('#analyze').classList.add('busy'));
 assert.equal(await designPage.locator('.spinner').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion disables loading animation');await designPage.close();
 await page.bringToFront();await page.setViewportSize({width:1100,height:720});

 const mobilePage=await context.newPage();await mobilePage.setViewportSize({width:390,height:844});
 await mobilePage.route('https://www.chess.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
 await mobilePage.goto('https://www.chess.com/openchess-mobile-test/');
 const launcher=mobilePage.locator('#openchess-host').getByRole('button',{name:'Toggle OpenChess'});
 await launcher.waitFor();assert.equal(await launcher.getAttribute('aria-expanded'),'false','Small-screen panel starts collapsed');
 await launcher.click();const mobilePanel=mobilePage.frames().find(f=>f.url().includes('chrome-extension://')&&f.url().includes('panel.html'));
 assert.ok(mobilePanel);await mobilePanel.waitForFunction(()=>document.body.dataset.analysis==='complete',{timeout:30000});
 const frameElement=await mobilePanel.frameElement();let bounds=await frameElement.boundingBox();
 assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844,'Bottom sheet stays inside portrait viewport');
 assert.equal(await mobilePanel.locator('#notice').isVisible(),false);
 const targets=await mobilePanel.locator('#analyze,#play,#pause,#profile,#dismiss,summary').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
 assert.ok(targets.every(h=>h>=44),'Primary touch targets are at least 44px');
 await mobilePage.screenshot({path:path.join(root,'docs/media/mobile.png')});
 await mobilePanel.click('#dismiss');assert.equal(await launcher.getAttribute('aria-expanded'),'false','Close button collapses the sheet');
 await launcher.click();await mobilePanel.press('#profile','Escape');assert.equal(await launcher.getAttribute('aria-expanded'),'false','Escape closes the sheet');
 await mobilePage.setViewportSize({width:320,height:568});await launcher.click();
 assert.equal(await mobilePanel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'320px portrait has no horizontal overflow');
 bounds=await frameElement.boundingBox();assert.ok(bounds.x+bounds.width<=320&&bounds.y+bounds.height<=568);
 await mobilePage.setViewportSize({width:740,height:360});await mobilePage.waitForTimeout(100);
 if(await launcher.getAttribute('aria-expanded')==='false')await launcher.click();
 bounds=await frameElement.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=360,'Short landscape sheet stays inside viewport');
 await mobilePage.close();
 console.log('PASS: board/status clutter removed; portrait/landscape sheets, 44px touch targets, close and Escape.');

 console.log('PASS: full Stockfish model and linked detached analysis window.');
 assert.deepEqual(errors,[]);console.log('PASS: actual Chromium extension loaded; real WASM analysis; exact-board connection; automatic move; position update; pause; invalid FEN.');
}finally{await context.close();}

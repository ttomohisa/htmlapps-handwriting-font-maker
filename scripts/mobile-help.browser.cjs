'use strict';
// Run against the official generated files in the unprivileged PR build job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const buildSelector = '.build-section details';


async function prepareApp(page,width,label){
 assert.equal(await page.locator('.mobile-bottom-bar').isVisible(),width<=520,label+': workflow bar retained');
 if(width<=520)assert.ok(await page.locator('.mobile-bottom-bar').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),label+': functional bar fits viewport');
}
async function checkWritingDock(page,label){
 const r=await page.evaluate(()=>{
   const rect=selector=>document.querySelector(selector).getBoundingClientRect();
   const nav=rect('#writePanel .nav-row'), bar=rect('.mobile-bottom-bar');
   const next=rect('#nextCharButton'), previous=rect('#previousCharButton');
   const canvas=rect('#drawCanvas'), header=rect('.app-header');
   return {navTop:nav.top,navBottom:nav.bottom,barTop:bar.top,
     nextTop:next.top,nextBottom:next.bottom,nextWidth:next.width,previousWidth:previous.width,
     canvasBottom:canvas.bottom,canvasHeight:canvas.height,headerBottom:header.bottom,viewport:innerHeight};
 });
 assert.ok(r.navTop>=0&&r.navBottom<=r.barTop+2,label+': actions sit above bottom tabs '+JSON.stringify(r));
 assert.ok(r.nextTop>=r.navTop&&r.nextBottom<=r.navBottom+1&&r.nextWidth>=100&&r.previousWidth>=100,label+': previous/next fully visible '+JSON.stringify(r));
 return r;
}
async function checkEditToolbar(page,label){
 const geometry=await page.evaluate(()=>{
   const rect=selector=>document.querySelector(selector).getBoundingClientRect();
   const toolbar=rect('#writePanel .draw-toolbar'), canvas=rect('#drawCanvas');
   const frame=rect('#writePanel .canvas-frame'), drawing=rect('#writePanel .drawing-card');
   const navigation=rect('#writePanel .nav-row'),header=rect('.app-header');
   return {
     toolbarTop:toolbar.top,toolbarBottom:toolbar.bottom,
     canvasTop:canvas.top,canvasBottom:canvas.bottom,
     canvasWidth:canvas.width,canvasHeight:canvas.height,drawingWidth:drawing.width,
     navTop:navigation.top,headerBottom:header.bottom,
     buttons:['#undoButton','#clearGlyphButton','#redoButton'].map(selector=>{
       const b=rect(selector);
       const middle=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
       return {left:b.left,right:b.right,width:b.width,height:b.height,visible:middle?.closest(selector)!=null};
     })
   };
 });
 assert.ok(geometry.toolbarBottom<=geometry.canvasTop+2,label+': Undo/Clear/Redo precede canvas '+JSON.stringify(geometry));
 assert.ok(geometry.canvasWidth>=geometry.drawingWidth*.94,label+': canvas retains its full width');
 assert.ok(Math.abs(geometry.canvasWidth-geometry.canvasHeight)<3,label+': canvas remains square');
 assert.ok(geometry.buttons.every(button=>button.width>70&&button.height>=40),label+': edit buttons remain comfortable touch targets');
 assert.ok(geometry.buttons[0].right<geometry.buttons[1].left+2&&geometry.buttons[1].right<geometry.buttons[2].left+2,label+': no toolbar overlap');
 if(geometry.navTop-geometry.headerBottom>=geometry.toolbarBottom-geometry.toolbarTop+14){
   assert.ok(geometry.toolbarTop>=geometry.headerBottom-2&&geometry.toolbarBottom<=geometry.navTop+2,label+': toolbar clears header and fixed navigation');
   assert.ok(geometry.buttons.every(button=>button.visible),label+': edit actions are not covered by overlays');
 }
 return geometry;
}
async function smoke(page,results,file){
 await page.locator('#setHiragana').uncheck();await page.locator('#customTextInput').fill('あの8B');await page.locator('#fontNameInput').fill('Synthetic Help Font');await page.locator('#startWritingButton').click();
 await page.waitForTimeout(120); // Allow the entry scroll to position the canvas.
 const geometry=await checkWritingDock(page,'Mobile writing');
 await checkEditToolbar(page,'Mobile writing');
 if(geometry.canvasHeight<=geometry.navTop-geometry.headerBottom-18)
   assert.ok(geometry.canvasBottom<=geometry.navTop+12,'Canvas stays clear of writing actions on entry');
 await page.evaluate(()=>{
   window.__mobileHiddenShortcutMutations=[];
   const buttons=[document.querySelector('#nextIncompleteButton'),document.querySelector('#nextWarningButton')];
   for(const button of buttons){
     const observer=new MutationObserver(()=>{if(button.hidden)window.__mobileHiddenShortcutMutations.push(button.id);});
     observer.observe(button,{attributes:true,attributeFilter:['hidden']});
   }
   window.__mobileDrawingDocumentY=document.querySelector('.drawing-title-row').getBoundingClientRect().top+window.scrollY;
 });
 assert.equal(await page.locator('#mobileBackupDetails').getAttribute('open'),null,'Mobile backup starts collapsed');
 assert.equal(await page.locator('#mobilePreviewDetails').getAttribute('open'),null,'Mobile font check starts collapsed');
 const position=await page.evaluate(()=>{
   const rect=id=>document.querySelector(id).getBoundingClientRect();
   return [rect('#drawCanvas').top,rect('#mobilePreviewDetails > summary').top,rect('#mobileBackupDetails > summary').top];
 });
 assert.ok(position[0]<position[1]&&position[1]<position[2], 'Drawing precedes preview and backup on mobile');
 await page.locator('#mobileBackupDetails > summary').click();
 assert.equal(await page.locator('#saveProjectFileButtonWrite').isVisible(),true,'Backup action reachable');
 await page.locator('#mobileBackupDetails > summary').click();
 await page.locator('#mobilePreviewDetails > summary').click();
 assert.equal(await page.locator('#preview12').isVisible(),true,'Generated font sizes reachable');
 await page.locator('#mobilePreviewDetails > summary').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Writing layout has no horizontal overflow');
 if(file==='dist/index.html')await page.screenshot({path:path.join(results,'mobile-writing-ja-360.png')});
 for(let i=0;i<4;i++){
   const canvas=page.locator('#drawCanvas');await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox();
   await page.mouse.move(r.x+r.width*.3,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*.35,{steps:8});await page.mouse.move(r.x+r.width*.6,r.y+r.height*.7,{steps:8});await page.mouse.up();
   assert.equal(await page.locator('#nextIncompleteButton').isVisible(),true,'Unfinished shortcut retains its mobile slot');
   assert.equal(await page.locator('#nextWarningButton').isVisible(),true,'Review shortcut retains its mobile slot');
   await checkWritingDock(page,'Mobile drawing stroke '+i);
   if(i===0){
     // Button actions must remain operational without hiding or downsizing the canvas.
     await page.locator('#undoButton').click();
     assert.equal(await page.locator('#redoButton').isEnabled(),true,'Redo is available after Undo');
     await page.locator('#redoButton').click();
     assert.equal(await page.locator('#clearGlyphButton').isEnabled(),true,'Clear remains available after Redo');
     await checkEditToolbar(page,'After mobile Undo/Redo');
   }
   if(i<3)await page.locator('#nextCharButton').click();
 }
 await page.waitForFunction(()=>!document.querySelector('#downloadButton').disabled,null,{timeout:60000});
 const stability=await page.evaluate(()=>({
   hidden:window.__mobileHiddenShortcutMutations,
   position:document.querySelector('.drawing-title-row').getBoundingClientRect().top+window.scrollY,
   original:window.__mobileDrawingDocumentY
 }));
 assert.deepEqual(stability.hidden,[],'Writing never toggles mobile shortcut buttons to hidden');
 assert.ok(Math.abs(stability.position-stability.original)<2,'Writing does not shift the drawing section');await page.locator('#mobileTabExport').click();await page.locator('#outputFilename').fill('mobile-help-font');
 const pending=page.waitForEvent('download');await page.locator('#downloadButton').click();const download=await pending;assert.equal(download.suggestedFilename(),'mobile-help-font.ttf');
 const target=path.join(results,file.includes('self-extract')?'synthetic-loader.ttf':'synthetic-readable.ttf');await download.saveAs(target);const bytes=fs.readFileSync(target);assert.equal(bytes.readUInt32BE(0),0x00010000);assert.ok(bytes.length>500);
 assert.equal(await page.evaluate(async data=>{const face=new FontFace('DownloadedSynthetic',new Uint8Array(data).buffer);await face.load();document.fonts.add(face);return face.status;},[...bytes]),'loaded');
 console.log('PASS synthetic pointer strokes for four glyphs to edited-name TTF and native FontFace reload '+file);
}

async function main() {
  const results = path.resolve(__dirname, '..', 'test-results', 'mobile-help');
  fs.mkdirSync(results, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const file of ['dist/index.html', 'dist/index.self-extract.html', 'handwriting-font-maker.html']) {
      for (const language of ['ja', 'en']) {
        for (const [width, height] of [[1360, 900], [521, 568], [520, 568], [360, 640], [320, 568], [393, 252]]) {
          const context = await browser.newContext({ viewport: { width, height }, locale: language, reducedMotion: 'reduce' });
          const page = await context.newPage();
          const errors = [], requests = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
          page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
          const label = `${file} ${language} ${width}x${height}`;
          try {
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
            await page.locator('#helpButton').waitFor();
            if (await page.locator('html').getAttribute('lang') !== language) await page.locator('#languageButton').click();
            await page.locator('#languageButton').click();await page.locator('#languageButton').click();
            assert.equal(await page.locator('html').getAttribute('lang'),language,label+': repeated language toggles');
            assert.equal(await page.locator('#heroTitle').textContent(),language==='ja'?'書いた文字をそのままフォントへ':'Turn your handwriting into a font',label+': clear heading');
            assert.equal(await page.locator('.page-intro p').textContent(),language==='ja'
              ? '画面に文字を手書きして、フォントを作れます。できたフォントはTTFファイルとして保存できます。'
              : 'Draw letters or characters on the screen to create a font. Save it as a TTF file.',label+': plain-language introduction');
            assert.equal(await page.locator('#customTextInput').getAttribute('placeholder'),language==='ja'?'例：ありがとう、またね！':'Example: Happy birthday!',label+': character example');
            assert.equal(await page.locator('#reviewText').getAttribute('placeholder'),language==='ja'?'今日はいい天気です。':'Hello! Have a nice day.',label+': preview example');
            for(const id of ['buildVersion','builtAt','dependencyCount']){assert.equal(await page.locator('#'+id).count(),1,label+': unique metadata after toggles');assert.ok(!['','—','-'].includes((await page.locator('#'+id).textContent()).trim()),label+': populated metadata after toggles');}
            assert.equal(await page.locator('[data-i18n="localBadge"]').textContent(), language === 'en' ? 'Fully local processing' : '完全ローカル処理', label);
            assert.equal(await page.locator('.local-badge').isVisible(),width>720,label+': badge visibility follows desktop/mobile');
            if(width>720)assert.ok(await page.locator('.local-badge').evaluate(el => {
              const box = el.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(el.querySelector('[data-i18n="localBadge"]'));
              return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1
                && [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
            }), label + ': badge text fits');
            assert.equal(await page.locator('main #buildVersion').count(), 0, label);
            assert.equal(await page.locator('footer').isVisible(), width > 520, label);
            await prepareApp(page, width, label);

            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': page width');

            await page.locator('#helpButton').click();
            const body = page.locator('#helpDialog .dialog-body');
            assert.ok(await body.evaluate(el => el.lastElementChild.contains(document.querySelector('#buildVersion'))), label + ': build is final body child');
            assert.equal(await page.locator(buildSelector).count(), 1, label);
            assert.equal(await page.locator(buildSelector).isVisible(), true, label);
            for (const id of ['buildVersion', 'builtAt', 'dependencyCount']) assert.equal(await page.locator('#' + id).count(), 1, label);

            if (await page.locator(buildSelector).getAttribute('open') === null) {
              const summary = page.locator(buildSelector).locator('summary');
              await summary.focus();
              await page.keyboard.press('Enter');
              assert.equal(await page.locator(buildSelector).getAttribute('open'), '', label);
              assert.notEqual(await page.locator('#buildVersion').innerText(), '—', label);
              assert.match(await page.locator('#builtAt').innerText(), /\d{4}/, label + ': populated build timestamp');
            }
            await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
            const finalItem = page.locator('#dependencyCount');
            const finalBox = await finalItem.boundingBox(), bodyBox = await body.boundingBox();
            console.log('GEOMETRY ' + label + ' ' + JSON.stringify({ finalBox, bodyBox, viewportHeight: height }));
            assert.ok(finalBox && bodyBox && finalBox.y >= 0 && finalBox.y + finalBox.height <= height && finalBox.y >= bodyBox.y - 1 && finalBox.y + finalBox.height <= bodyBox.y + bodyBox.height + 1, label + ': final Help item reachable');
            assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + ': Help width');
            const headerBox = await page.locator('#helpDialog .dialog-header').boundingBox();
            assert.ok(headerBox && headerBox.x >= 0 && headerBox.x + headerBox.width <= width && headerBox.y >= 0 && headerBox.y + headerBox.height <= height, label + ': header visible');
            const closeBox=await page.locator('#closeHelpButton').boundingBox();
            assert.ok(closeBox && closeBox.x>=0 && closeBox.x+closeBox.width<=width && closeBox.y>=headerBox.y && closeBox.y+closeBox.height<=headerBox.y+headerBox.height+1,label+': Close fits header');
            if (file === 'dist/index.html' && [1360, 320].includes(width)) {
              await page.screenshot({ path: path.join(results, `help-${language}-${width}.png`) });
            }
            const dialogBox = await page.locator('#helpDialog').boundingBox();
            assert.ok(finalBox.y >= dialogBox.y - 1 && finalBox.y + finalBox.height <= dialogBox.y + dialogBox.height + 1, label + ': final item inside dialog');
            assert.ok(dialogBox.y > 1, label + ': top coordinate is genuine backdrop');
            const beforeScroll = await page.evaluate(() => scrollY);
            await page.mouse.move(2, 1);
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => scrollY), beforeScroll, label + ': background locked');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Escape');
            await page.locator('#helpButton').click();
            await page.locator('#closeHelpButton').click();
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': reopen and Close');
            await page.locator('#helpButton').click();
            await page.mouse.click(2, 1);
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': backdrop');
            if(file!=='handwriting-font-maker.html' && language==='ja' && width===360) await smoke(page,results,file);
            else if(file==='dist/index.html' && language==='ja' && [320,393].includes(width)){
              await page.locator('#startWritingButton').click();
              await checkWritingDock(page,label+': short viewport');
              await checkEditToolbar(page,label+': short viewport');
            }
            assert.deepEqual(errors, [], label + ': console errors');
            assert.deepEqual(requests, [], label + ': external runtime requests');
            console.log('PASS ' + label);
          } catch (error) {
            await page.screenshot({ path: path.join(results, `failure-${file.replace(/[^a-z0-9]/gi, '-')}-${language}-${width}x${height}.png`) }).catch(() => {});
            throw error;
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

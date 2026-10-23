const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../src/index.template.html'),'utf8');
const originalBuild="<section class=\"build-section\">\n      <details>\n        <summary data-i18n=\"buildInfo\">ビルド情報</summary>\n        <div class=\"build-grid\">\n          <div class=\"build-item\"><span data-i18n=\"appVersion\">アプリ版数</span><strong id=\"buildVersion\">—</strong></div>\n          <div class=\"build-item\"><span data-i18n=\"builtAt\">生成日時</span><strong id=\"builtAt\">—</strong></div>\n          <div class=\"build-item\"><span data-i18n=\"dependencies\">内包依存</span><strong id=\"dependencyCount\">0</strong></div>\n        </div>\n      </details>\n    </section>";
test('existing metadata block is unique and the final Help scroll-body child',()=>{
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];assert.doesNotMatch(main,/id="buildVersion"/);
 const help=html.match(/<dialog id="helpDialog"[^>]*>([\s\S]*?)<\/dialog>/)[1];
 const start=help.search(/<div class="dialog-body"[^>]*>/);let depth=0,end=-1;
 for(const m of help.slice(start).matchAll(/<div\b[^>]*>|<\/div>/g)){depth+=m[0].startsWith('</')?-1:1;if(depth===0){end=start+m.index;break;}}
 assert.ok(end>start);const body=help.slice(start,end);assert.ok(body.includes(originalBuild));
 assert.match(body.slice(body.indexOf(originalBuild)+originalBuild.length),/^\s*(?:<!--[^]*?-->\s*)?$/);
 for(const id of ["buildVersion", "builtAt", "dependencyCount"])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('only the informational page footer is hidden at the existing mobile breakpoint',()=>{
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];const start=css.search(/@media\s*\(max-width:\s*520px\)\s*\{/);assert.ok(start>=0);
 const open=css.indexOf('{',start);let depth=1,end=open+1;for(;end<css.length&&depth;end++){if(css[end]==='{')depth++;if(css[end]==='}')depth--;}
 assert.match(css.slice(open+1,end-1),/(?:^|})\s*footer\s*\{\s*display:\s*none\s*;?\s*\}/);
});
test('keyboard disclosure clicks stay in Help; genuine backdrop still closes',()=>{
 const handler=html.match(/\$\('#helpDialog'\)\.addEventListener\('click',\s*event\s*=>\s*\{(.*?)\}\);/)[1];const dialog={closed:0,getBoundingClientRect(){return{left:20,right:300,top:20,bottom:400}},close(){this.closed++}};
 const run=new Function('helpDialog','event',handler);
 run(dialog,{target:{},currentTarget:dialog,clientX:0,clientY:0});assert.equal(dialog.closed,0);
 run(dialog,{target:dialog,currentTarget:dialog,clientX:0,clientY:0});assert.equal(dialog.closed,1);
});

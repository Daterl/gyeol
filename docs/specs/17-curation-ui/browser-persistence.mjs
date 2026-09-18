// Run with the same existing PLAYWRIGHT_MODULE and UI_EVIDENCE_DIR as browser.mjs.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const outputDir = process.env.UI_EVIDENCE_DIR;
mkdirSync(outputDir, { recursive: true });
import {readFileSync} from 'node:fs';
import {buildFeed} from '../../../lib/pipeline.js';
const fixture=JSON.parse(readFileSync(new URL('../../../fixtures/interaction.sample.json', import.meta.url)));
let snapshotForA = 'reference-a';
let expired = false;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const feeds=[];const generations=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;const b=route.request().postDataJSON();const json=value=>route.fulfill({json:value});
 if(path==='/api/profile/session')return json({csrfToken:'offline',expires_at:Date.now()+86400000});
 if(path==='/api/profile' && expired)return json({status:'expired',refresh_required:true});
 if(path==='/api/profile')return json({status:'public',snapshotId:b.profile_url.includes('profile_a')?snapshotForA:'reference-b',expires_at:Date.now()+600000,refresh_required:false});
 if(path==='/api/analyze')return json({...fixture.context.photos[b.input_index%fixture.context.photos.length],photo_id:b.photo_id,input_index:b.input_index,file_ref:b.file_ref});
 if(path==='/api/feed'){
 feeds.push(b);const feed=await buildFeed({schema_version:'1.0',session_id:b.session_id,photos:b.photos,identity:{current:{kind:'none'},target:{kind:'none'}}});
 return json({...feed,curation:{schema_version:'1.0',profile_snapshot_id:b.profile_snapshot_id,profile:{source_url:b.profile_url,ownership_verified:false},prompt:{text:b.prompt||null},slots:feed.feed.slots.map(s=>({photo_id:s.photo_id,position:s.position,included:true,exclusion_candidate:{recommended:false,reason:null,evidence:[]}}))}});
 }
 if(path==='/api/generate'){generations.push(b);return json({output:{title:'Independent profile binding',slots:b.feed.slots.map(s=>({photo_id:s.photo_id,position:s.position,caption_state:'omitted',text:null,omit_reason:'Offline omission',evidence:[{kind:'uploaded_photo',ref:s.photo_id,note:'Offline'}]}))}});}
 throw Error(path);
 });
 await page.goto(process.env.UI_BASE_URL || 'http://127.0.0.1:3230',{waitUntil:'networkidle'});
 const url=page.getByLabel('공개 Instagram 프로필 URL');await url.fill('https://www.instagram.com/profile_a/');await page.getByRole('button',{name:'저장된 연결 확인'}).click();await page.getByText('공개 프로필 연결 완료',{exact:true}).waitFor();
 const file=readFileSync(new URL('../../../public/images/gyeol-character/default.webp', import.meta.url));await page.locator('input[type=file]').first().setInputFiles([1,2,3].map(i=>({name:`photo${i}.webp`,mimeType:'image/webp',buffer:file})));
 await page.getByText('3장 선택',{exact:true}).waitFor();await page.getByLabel('원하는 느낌 (선택)').fill('saved user prompt');await page.getByLabel(/사진 분석·문장 생성에 유료/).check();await page.getByRole('button',{name:'큐레이션 만들기',exact:true}).click();await page.getByLabel('기록의 제목').waitFor();

 const whole=page.getByRole('button',{name:'문장 다시 제안받기',exact:true});
 await page.getByRole('textbox',{name:/번 사진에 내가 쓸 문장/}).fill('preserved edit');
 await page.getByLabel('기록의 제목').fill('persisted edited title');
 await page.getByRole('button',{name:'뒤로',exact:true}).click();
 await page.getByRole('slider',{name:/가로 중심/}).focus(); await page.keyboard.press('End');
 await page.getByRole('slider',{name:/세로 중심/}).focus(); await page.keyboard.press('Home');
 await page.getByRole('button',{name:'사진 제외',exact:true}).click();
 await page.getByLabel('공유에 공개 프로필 정보 포함 (기본 꺼짐)').check();
 await page.getByRole('button',{name:'큐레이션 확정',exact:true}).click();
 await page.getByLabel('기록의 제목').fill('later unconfirmed title');
 await page.waitForFunction(()=>{const value=JSON.parse(localStorage.getItem('gyeol.editor.draft.v1')||'null');return value?.draft?.title==='later unconfirmed title'&&value?.curationState?.confirmed?.output.title==='persisted edited title';});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gyeol.editor.draft.v1')));
 assert.equal(saved.curationState.excluded.length,1); assert.deepEqual(Object.values(saved.curationState.crops),[{x:100,y:0}]);
 assert.equal(saved.prompt,'saved user prompt'); assert.equal(saved.curationState.profileSharing,true);
 assert.equal(saved.curationState.confirmed.output.slots.length,2);
 const imageState=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gyeol-editor');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').getAll();r.onsuccess=()=>resolve(r.result.map(v=>({revision:v.revision,images:v.images.map(i=>({id:i.photoId,size:i.blob.size,type:i.blob.type}))})));r.onerror=()=>reject(r.error);});}finally{db.close();}});
 const binaries=await imageState(); assert.equal(binaries.length,1); assert.equal(binaries[0].images.length,3); assert.ok(binaries[0].images.every(i=>i.type==='image/webp'&&i.size>0));
 await url.fill('https://www.instagram.com/profile_b/'); assert.equal(await whole.isDisabled(),true);
 await page.getByRole('button',{name:'저장된 연결 확인'}).click(); await page.getByText('공개 프로필 연결 완료',{exact:true}).waitFor();
 assert.equal(await whole.isDisabled(),true); await page.getByText(/연결한 프로필 또는 수집본이 달라졌어요/).waitFor();
 assert.equal(feeds.length,1); assert.equal(generations.length,1);
 await url.fill('https://www.instagram.com/profile_a/'); snapshotForA='reference-a-refreshed';
 await page.getByRole('button',{name:'저장된 연결 확인'}).click(); await page.getByText('공개 프로필 연결 완료',{exact:true}).waitFor(); assert.equal(await whole.isDisabled(),true);
 snapshotForA='reference-a'; await page.getByRole('button',{name:'저장된 연결 확인'}).click(); await page.getByText('공개 프로필 연결 완료',{exact:true}).waitFor(); assert.equal(await whole.isDisabled(),false);
 await page.addInitScript(() => {
   if (sessionStorage.getItem('test-fail-draft-read') !== 'yes') return;
   sessionStorage.removeItem('test-fail-draft-read');
   IDBObjectStore.prototype.get = function () { throw Error('simulated transient IndexedDB read'); };
 });
 await page.evaluate(() => sessionStorage.setItem('test-fail-draft-read', 'yes'));
 await page.reload({waitUntil:'networkidle'});
 await page.getByText('저장된 초안을 불러오지 못했어요.', {exact:true}).waitFor();
 assert.deepEqual(await imageState(), binaries);
 assert.deepEqual((await page.evaluate(()=>JSON.parse(localStorage.getItem('gyeol.editor.draft.v1')))).curationState,saved.curationState);
 assert.equal(generations.length,1);
 await page.reload({waitUntil:'networkidle'}); await page.getByLabel('기록의 제목').waitFor();
 assert.equal(await whole.isDisabled(),true); assert.equal(await url.inputValue(),'https://www.instagram.com/profile_a/');
 assert.equal(await page.getByLabel('원하는 느낌 (선택)').inputValue(),'saved user prompt'); assert.equal(await page.getByLabel('기록의 제목').inputValue(),'later unconfirmed title');
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('gyeol.editor.draft.v1')));
 for(const key of ['photoIds','order','draft','original','originalOutput','prompt','curationState'])assert.deepEqual(restored[key],saved[key],key);
 assert.deepEqual(await imageState(),binaries); assert.equal(generations.length,1);
 expired=true; await page.getByRole('button',{name:'저장된 연결 확인'}).click(); await page.getByText(/연결이 만료됐어요/).waitFor(); assert.equal(await whole.isDisabled(),true);
 expired=false; await page.getByRole('button',{name:'저장된 연결 확인'}).click(); await page.getByText('공개 프로필 연결 완료',{exact:true}).waitFor(); assert.equal(await whole.isDisabled(),false);
 await whole.click(); await whole.waitFor(); assert.equal(generations.length,2); assert.deepEqual(generations[1],generations[0]);
 await page.getByRole('button',{name:/2번 사진 제외됨/}).click(); assert.equal(await page.getByRole('textbox',{name:/번 사진에 내가 쓸 문장/}).inputValue(),'preserved edit');
 await page.screenshot({path:resolve(outputDir, 'restored.png'),fullPage:true});
 await page.getByRole('button',{name:'사진·편집 초기화',exact:true}).click();
 await page.waitForFunction(()=>localStorage.getItem('gyeol.editor.draft.v1')===null); assert.deepEqual(await imageState(),[]);
 await page.reload({waitUntil:'networkidle'}); await page.getByText('0장 선택',{exact:true}).waitFor(); assert.equal(await page.getByLabel('기록의 제목').count(),0); assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',differentAccountBlocked:true,freshSnapshotBlocked:true,sameReferenceResumes:true,reloadPreserves:['photos','normalizedWebP','prompt','title','caption','order','exclude','crop','profileSharing','confirmation'],restoredAndExpiredConnectionsBlocked:true,transientReadPreservesData:true,resetClearsMetadataAndIndexedDB:true,feedCalls:feeds.length,generationCalls:generations.length,consoleErrors:errors},null,2));
}finally{await browser.close();}

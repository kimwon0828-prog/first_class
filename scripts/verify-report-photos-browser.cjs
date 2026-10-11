// Loaded by actual route/CSS harness. Every request is fulfilled locally or aborted.
module.exports=async({page,render,out,root,assert,fs,pass})=>{
 const sharp=require(root+'/node_modules/sharp');
 const activity=await sharp(Buffer.from('<svg width="960" height="640"><rect width="960" height="640" fill="#e9cf9e"/><rect x="120" y="60" width="720" height="520" fill="white"/><text x="160" y="140" font-size="36">ACTIVITY PHOTO — ISOLATED</text><circle cx="320" cy="330" r="120" fill="#78b18c"/><rect x="510" y="220" width="220" height="220" fill="#efc765"/></svg>')).png().toBuffer();
 const tall=await sharp(Buffer.from('<svg width="900" height="2400"><rect width="900" height="2400" fill="#fffdf4"/><text x="70" y="100" font-size="42">LEVEL TEST — ISOLATED SAMPLE</text>'+Array.from({length:20},(_,i)=>`<rect x="60" y="${160+i*100}" width="780" height="80" fill="${i%2?'#ecf3ed':'#f5f4f1'}"/><text x="90" y="${213+i*100}" font-size="26">${i+1}. Result details / readable at original ratio</text>`).join('')+'</svg>')).png().toBuffer();
 fs.writeFileSync(out+'/activity.png',activity);fs.writeFileSync(out+'/result-sheet.png',tall);
 const snapshot=JSON.parse(fs.readFileSync(process.env.PHOTO_SNAPSHOT_PATH,'utf8'));
 const photos=[{...snapshot.attachments[0],caption:'활동 장면을 설명하는 긴 한글 설명입니다. '.repeat(3).slice(0,100).trim(),width:960,height:640},{...snapshot.attachments[1],caption:'세로 레벨테스트 결과지 — 원본 비율',width:900,height:2400}];
 await page.evaluate(()=>{const base=document.createElement('base');base.href='http://isolated.invalid/';document.head.append(base);window.photoResponse=null;window.fetch=async(_url,opts)=>{window.uploadRequests=(window.uploadRequests||0)+1;await new Promise(r=>setTimeout(r,350));if(window.uploadFail)return {ok:false,json:async()=>({error:'TEST 업로드 실패 · 입력 유지'})};return {ok:true,json:async()=>window.photoResponse}}});
 await page.route('**/api/report-attachments/**',route=>route.fulfill({status:200,contentType:'image/png',body:route.request().url().includes(photos[1].id)?tall:activity}));
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:1000});await render('long');
  await page.evaluate(async photos=>{window.fixture.application.trialResult.attachments=photos;await window.refreshCurrent()},photos);
  await page.getByRole('button',{name:'미리보기',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'리포트 미리보기',exact:true});
  assert.deepEqual(await preview.locator('figcaption').allTextContents(),photos.map(p=>p.caption));
  assert.deepEqual(await preview.locator('section[aria-label="수업 사진·자료"] img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src').split('?')[0])),photos.map(p=>'/api/report-attachments/'+p.id));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'내용 수정',exact:true}).click();const dialog=page.getByRole('dialog',{name:'리포트 내용 수정'});
  assert.equal(await dialog.getByRole('textbox',{name:/번 사진 설명/}).count(),2);
  const order=await dialog.locator('textarea,section[aria-label="사진 첨부"],details').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')||n.tagName));assert(order.indexOf('사진 첨부')>order.indexOf('학부모에게 전달할 총평'));
  await dialog.getByRole('button',{name:'2번 사진 앞으로'}).click();assert.equal(await dialog.getByRole('textbox',{name:'1번 사진 설명 (선택)'}).inputValue(),photos[1].caption);
  await dialog.getByRole('button',{name:'1번 사진 삭제'}).click();assert.equal(await dialog.getByRole('textbox',{name:/번 사진 설명/}).count(),1);await dialog.getByRole('button',{name:/삭제 취소/}).click();assert.equal(await dialog.getByRole('textbox',{name:/번 사진 설명/}).count(),2);
  await dialog.getByRole('textbox',{name:'1번 사진 설명 (선택)'}).fill('한글 설명 수정');
  await dialog.getByRole('button',{name:'기록 저장',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'TEST 저장 실패'}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:'1번 사진 설명 (선택)'}).inputValue(),'한글 설명 수정');
  await dialog.getByRole('region',{name:'사진 첨부',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+`/photos-studio-${width}.png`});
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'취소',exact:true}).click();await page.getByRole('button',{name:'내용 수정',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'1번 사진 설명 (선택)'}).inputValue(),photos[0].caption,'cancel keeps saved photos');
  await page.evaluate(photo=>{window.photoResponse=photo;window.uploadFail=true}, {...photos[0],id:'85000000-0000-4000-8000-000000005555'});
  await dialog.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:activity});await dialog.getByText('TEST 업로드 실패 · 입력 유지',{exact:false}).waitFor();assert(await dialog.getByRole('button',{name:'기록 저장',exact:true}).isDisabled());
  await page.evaluate(()=>window.uploadFail=false);await dialog.getByRole('button',{name:'다시 시도',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('input[aria-label$="사진 설명 (선택)"]').length===3);
  assert(!await dialog.getByRole('button',{name:'기록 저장',exact:true}).isDisabled());
  await dialog.getByRole('button',{name:'기록 저장',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'TEST 저장 실패'}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(window.submissions.filter(s=>s.name==='upsertTrialResultAction').at(-1).values.attachments));assert.equal(saved.length,3);
  // Persist at the isolated action boundary, then re-enter the actual editor.
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'취소',exact:true}).click();await page.evaluate(async saved=>{window.fixture.application.trialResult.attachments=saved;window.fixtureKey+='saved';await window.refreshCurrent()},saved);await page.getByRole('button',{name:'내용 수정',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:/번 사진 설명/}).count(),3);
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
  await page.getByRole('button',{name:'내용 수정',exact:true}).click();
  await dialog.locator('input[type=file]').setInputFiles({name:'unsupported.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-invalid')});
  await dialog.getByText('JPEG·PNG·WebP 사진만 첨부할 수 있어요. HEIC·GIF·PDF는 지원하지 않아요.',{exact:false}).waitFor();
  assert(await dialog.getByRole('button',{name:'기록 저장',exact:true}).isDisabled());await dialog.getByRole('button',{name:'제외',exact:true}).click();
  await dialog.locator('input[type=file]').setInputFiles(Array.from({length:7},(_,i)=>({name:'too-many-'+i+'.png',mimeType:'image/png',buffer:activity})));
  await dialog.getByText('사진은 최대 6장까지 첨부할 수 있어요.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass(`Studio ${width}: photo order/caption/remove/undo/cancel, failure preservation, upload retry, save payload/reentry`);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(async snapshot=>window.renderMathParent(snapshot),{...snapshot,attachments:photos});await page.getByRole('region',{name:'수업 사진·자료',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/사진 (삭제|앞으로|뒤로)/}).count(),0);
 const ratios=await page.locator('section[aria-label="수업 사진·자료"] img').evaluateAll(imgs=>imgs.map(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,nw:i.getAttribute('width'),nh:i.getAttribute('height')})));for(const r of ratios)assert(Math.abs(r.width/r.height-Number(r.nw)/Number(r.nh))<.01);
 await page.screenshot({path:out+'/photos-parent-390.png',fullPage:true});await page.getByRole('button',{name:'2번 사진 확대',exact:true}).click();const viewer=page.getByRole('dialog',{name:'사진 확대'});await viewer.getByRole('button',{name:'확대',exact:true}).click();await viewer.getByRole('button',{name:'확대',exact:true}).click();
 const viewport=viewer.locator('[aria-label="확대한 사진 이동 영역"]');assert(await viewport.evaluate(n=>n.scrollHeight>n.clientHeight&&n.scrollWidth>n.clientWidth));await viewport.evaluate(n=>{n.scrollTop=850;n.scrollLeft=120});await page.screenshot({path:out+'/photos-parent-zoom-390.png'});await viewer.getByRole('button',{name:'닫기',exact:true}).click();
 await page.evaluate(async snapshot=>{const {attachments,...old}=snapshot;await window.renderMathParent(old)},snapshot);assert.equal(await page.getByRole('region',{name:'수업 사진·자료',exact:true}).count(),0);pass('Parent 390: ordered captioned photos, uncut tall sheet, zoom + two-axis scroll, no edit controls, no empty attachment region');
 fs.writeFileSync(out+'/photos-results.json',JSON.stringify({passed:true,isolated:true,viewports:[1440,1024,390],actualAccountE2E:false},null,2));
};

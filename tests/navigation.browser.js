async (page) => {
  const results = [], errors = [];
  const createdContexts = [];
  try {
  await page.bringToFront();
  const check = (ok, name) => { if (!ok) throw new Error(name); results.push(name); };
  const near = (a,b) => Math.hypot(a.x-b.x,a.y-b.y)<2;
  const point = async p => { const b=await p.locator('#sun-handle').boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2}; };
  const settle = p => p.waitForTimeout(90);
  const reset = async p => { await p.getByRole('button',{name:'表示を戻す',exact:true}).click();await settle(p); };
  const origin = await page.evaluate(()=>location.origin);
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1024,height:768});await settle(page);
  await reset(page);await page.locator('#sun-handle').focus();await page.keyboard.press('Home');await settle(page);
  check(await page.locator('.readings,.bar-row,#red-value,#green-value,#blue-value').count()===0,'RGBの割合表示を削除');
  check(await page.locator('.view-tabs,.dashboard,footer,.eyebrow').count()===0,'光の切り替え・下部パネル・フッター・英語上段を削除');
  check(await page.locator('header #toggle-view,header .camera-controls').count()===2,'操作をヘッダーに移動');
  check(await page.locator('#observer-view').isHidden(),'見え方は初期非表示');
  check(await page.locator('#scene').evaluate(e=>getComputedStyle(e).touchAction)==='none','キャンバスのネイティブジェスチャー抑制');
  const base=await point(page),scene=await page.locator('#scene').boundingBox();
  const anchor={x:scene.x+scene.width*.28,y:scene.y+scene.height*.3};
  await page.evaluate(()=>{window.navigationTestWheel=0;document.addEventListener('wheel',event=>{window.navigationTestWheel+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?document.querySelector('#scene').clientHeight:1);},{capture:true});});
  await page.mouse.move(anchor.x,anchor.y);await page.mouse.wheel(0,-120);await settle(page);
  const factor=Math.exp(-await page.evaluate(()=>window.navigationTestWheel)*.002),afterZoom=await point(page);
  check(near(afterZoom,{x:anchor.x+(base.x-anchor.x)*factor,y:anchor.y+(base.y-anchor.y)*factor}),'カーソルを基準としたホイールズーム');
  const p={x:scene.x+scene.width*.15,y:scene.y+scene.height*.65};
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+45,p.y-25,{steps:6});await page.mouse.up();await settle(page);
  const afterPan=await point(page);
  check(near(afterPan,{x:afterZoom.x+45,y:afterZoom.y-25}),'余白のドラッグでパン');
  check((await page.locator('#sun-handle').getAttribute('aria-label')).includes('高度90度'),'パン・ズームで太陽の位置を維持');
  // Drag to the horizon using the transformed world coordinates.
  const w=scene.width,h=scene.height,r=w*.24,ground=h*.76;
  const orbit=Math.min(Math.hypot(r,Math.min(w*.44,w/2-36)),r+ground-70);
  const span=Math.sqrt(orbit*orbit-r*r);
  const noonWorld={x:w/2,y:ground+r-orbit};
  const target={x:afterPan.x+span*factor,y:afterPan.y+(ground-noonWorld.y)*factor};
  // A leftward target keeps the Sun inside the viewport after this zoom/pan.
  target.x=afterPan.x-span*factor;
  await page.mouse.move(afterPan.x,afterPan.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:12});await page.mouse.up();await settle(page);
  const sunLabel=await page.locator('#sun-handle').getAttribute('aria-label');
  check(sunLabel.includes('高度0度'),'拡大・パン後も太陽を地平線までドラッグ');
  await reset(page);
  check(await page.locator('#sun-handle').getAttribute('aria-label')===sunLabel,'表示を戻しても太陽の位置を維持');
  check(await page.locator('#zoom-level').textContent()==='100%','表示を戻すと100%');
  await page.locator('#sun-handle').focus();await page.keyboard.press('Home');await settle(page);
  check(near(await point(page),base),'表示を戻すとパンも初期化');
  for(let i=0;i<12&&!await page.locator('#zoom-in').isDisabled();i++)await page.locator('#zoom-in').click();
  check(await page.locator('#zoom-level').textContent()==='400%'&&await page.locator('#zoom-in').isDisabled(),'拡大の上限とボタンの無効化');
  for(let i=0;i<20&&!await page.locator('#zoom-out').isDisabled();i++)await page.locator('#zoom-out').click();
  check(await page.locator('#zoom-level').textContent()==='50%'&&await page.locator('#zoom-out').isDisabled(),'縮小の下限とボタンの無効化');
  await reset(page);
  await page.locator('#toggle-view').click();
  const overlayBefore=await page.locator('#observer-view').boundingBox();
  const skyBefore=await page.locator('#sky').evaluate(c=>c.toDataURL());
  await page.locator('#sun-handle').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  check(skyBefore!==await page.locator('#sky').evaluate(c=>c.toDataURL()),'太陽を動かすと見え方が連動する');
  await page.keyboard.press('Home');
  await page.locator('#zoom-in').click();await settle(page);
  const overlayAfter=await page.locator('#observer-view').boundingBox();
  check(near(overlayBefore,overlayAfter)&&overlayBefore.width===overlayAfter.width,'オーバーレイはズームに巻き込まれない');
  await page.locator('#close-view').click();await reset(page);

  for(const [width,height,name] of [[1024,768,'ipad-landscape'],[768,1024,'ipad-portrait'],[320,740,'narrow']]){
    const context=await page.context().browser().newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    createdContexts.push(context);
    const touch=await context.newPage();touch.on('pageerror',e=>errors.push(e.message));
    await touch.goto(origin);await touch.bringToFront();await settle(touch);
    const session=await context.newCDPSession(touch);
    const send=(type,points)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:p.id??i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
    const box=await touch.locator('#scene').boundingBox(),initial=await point(touch);
    check(box.height>height*.6&&box.y+box.height<=height+1,`${name}: キャンバスを縦に広げて画面内に収める`);
    const half=Math.min(65,box.width*.17),m={x:box.x+box.width*.5,y:box.y+box.height*.6};
    const starts=[{x:m.x-half,y:m.y,id:1},{x:m.x+half,y:m.y,id:2}];
    const shift={x:20,y:12},ends=starts.map(p=>({x:m.x+shift.x+(p.x-m.x)*1.6,y:m.y+shift.y,id:p.id}));
    await send('touchStart',starts);
    for(let i=1;i<=8;i++)await send('touchMove',starts.map((p,j)=>({x:p.x+(ends[j].x-p.x)*i/8,y:p.y+(ends[j].y-p.y)*i/8,id:p.id})));
    await settle(touch);
    const pinched=await point(touch);
    check(near(pinched,{x:m.x+shift.x+(initial.x-m.x)*1.6,y:m.y+shift.y+(initial.y-m.y)*1.6}),`${name}: 2本指で中点ズームと平行移動`);
    check((await touch.locator('#sun-handle').getAttribute('aria-label')).includes('高度90度'),`${name}: ピンチで太陽の高度を維持`);
    // CDP touchEnd with a nonempty list names the touch to release.
    await send('touchEnd',[ends[1]]);
    await send('touchMove',[{x:ends[0].x+18,y:ends[0].y+13,id:1}]);await settle(touch);
    const singlePan=await point(touch);
    check(near(singlePan,{x:pinched.x+18,y:pinched.y+13}),`${name}: 片指を離してもパンに滑らかに移行`);
    await send('touchEnd',[]);
    const worldRadius=box.width*(box.width<600?.17:.24);
    const surface=box.width<600?Math.max(box.height*.7,box.height-worldRadius*1.2):box.height*.76;
    const sunOrbit=Math.min(Math.hypot(worldRadius,Math.min(box.width*.44,box.width/2-36)),worldRadius+surface-70);
    const angle=Math.acos(worldRadius/sunOrbit)*.45;
    const sunTarget={x:singlePan.x+sunOrbit*Math.sin(angle)*1.6,y:singlePan.y+sunOrbit*(1-Math.cos(angle))*1.6,id:1};
    await send('touchStart',[{...singlePan,id:1}]);await send('touchMove',[sunTarget]);await send('touchEnd',[]);await settle(touch);
    check(near(await point(touch),sunTarget),`${name}: 拡大・パン後の太陽タッチドラッグが正しい位置に届く`);
    check(await touch.locator('#zoom-level').textContent()==='160%',`${name}: 太陽の移動で倍率は変わらない`);
    await send('touchStart',[sunTarget]);await send('touchMove',[{...singlePan,id:1}]);await send('touchEnd',[]);await settle(touch);
    await reset(touch);
    // A second finger must safely change a Sun drag into a pinch.
    const source=await point(touch),second={x:source.x+half,y:source.y+40,id:2};
    await send('touchStart',[{...source,id:1}]);await send('touchStart',[{...source,id:1},second]);
    await send('touchMove',[{x:source.x-15,y:source.y-8,id:1},{x:second.x+15,y:second.y+8,id:2}]);
    await settle(touch);
    check((await touch.locator('#sun-handle').getAttribute('aria-label')).includes('高度90度'),`${name}: 太陽をつかんだ後のピンチも高度を変えない`);
    check(Number.parseInt(await touch.locator('#zoom-level').textContent())>100,`${name}: 太陽ドラッグからピンチへ切り替え`);
    await send('touchCancel',[]);await reset(touch);
    // Cancellation must clear captures and allow a fresh one-finger pan.
    const blank={x:box.x+box.width*.15,y:box.y+box.height*.6,id:1};
    await send('touchStart',[blank]);await send('touchCancel',[]);
    const beforePan=await point(touch);
    await send('touchStart',[blank]);await send('touchMove',[{...blank,x:blank.x+25,y:blank.y+15}]);await send('touchEnd',[]);await settle(touch);
    check(near(await point(touch),{x:beforePan.x+25,y:beforePan.y+15}),`${name}: キャンセル後も1本指でパンできる`);
    check(!await touch.locator('.simulation').evaluate(e=>e.classList.contains('is-panning')),`${name}: 指を離した後は操作状態を解除`);
    const cameraPan=await point(touch);
    await send('touchStart',[blank]);await touch.evaluate(()=>window.dispatchEvent(new Event('blur')));await send('touchEnd',[]);
    await send('touchStart',[blank]);await send('touchMove',[{...blank,x:blank.x-15}]);await send('touchEnd',[]);await settle(touch);
    check(near(await point(touch),{x:cameraPan.x-15,y:cameraPan.y}),`${name}: フォーカスを失った後もパンできる`);
    check(await touch.evaluate(()=>visualViewport.scale)===1,`${name}: ページ全体の倍率は変わらない`);
    check(!await touch.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`${name}: 横スクロールなし`);
    check(await touch.locator('.camera-controls button,#toggle-view,#close-view').evaluateAll(elements=>elements.every(e=>{const r=e.getBoundingClientRect();return e.hidden||e.closest('[hidden]')||(r.width>=44&&r.height>=44)})),`${name}: ボタンは44px以上`);
    await reset(touch);await touch.locator('#toggle-view').tap();
    await touch.screenshot({path:`output/playwright/navigation-${name}.png`,fullPage:true});
    if(name!=='narrow'){
      await touch.locator('#zoom-in').tap();await settle(touch);
      await touch.setViewportSize({width:height,height:width});await settle(touch);
      check(await touch.locator('#zoom-level').textContent()==='125%',`${name}: 縦横切り替え後も倍率を維持`);
    }
    await context.close();
  }
  await page.bringToFront();
  check(errors.length===0,'JavaScript実行時エラーなし');
  return {count:results.length,results,errors};
  } finally {
    for (const context of createdContexts) await context.close();
    await page.bringToFront();
  }
}

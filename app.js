import { COLORS, SHELL_HEIGHT, circleInterval, sunGeometry, directLight, skyLight, scatterAngle, scatterProbability } from './physics.mjs';
import { MIN_ZOOM, MAX_ZOOM, worldToScreen, screenToWorld, zoomAt, installNavigation } from './navigation.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const skyCanvas = $('sky'), skyCtx = skyCanvas.getContext('2d');
const background = document.createElement('canvas'), bg = background.getContext('2d');
const state = { position: 0, mode: 'sky', viewVisible: false, particles: [], sparks: [], emission: 0 };
const camera = { x: 0, y: 0, zoom: 1 };
let navigation, cameraDirty = false;
let geometry, sun, lastTime = 0, animation, skySamples = [];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function resize() {
  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (!w || !h) return;
  navigation?.cancel();
  if (geometry) { camera.x *= w / geometry.w; camera.y *= h / geometry.h; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  background.width = canvas.width; background.height = canvas.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Leave more space between the surface and the Sun while keeping the full
  // concentric orbit, including both horizon positions, inside the viewport.
  const r = w * (w < 600 ? 0.17 : 0.24);
  const ground = w < 600 ? Math.max(h * 0.70, h - r * 1.2) : h * 0.76;
  const span = Math.min(w * 0.44, w / 2 - 36);
  const orbit = Math.min(Math.hypot(r, span), r + ground - 70);
  geometry = { w, h, r, cx: w / 2, cy: ground + r, ground, orbit, dpr };
  state.particles.length = 0; state.sparks.length = 0;
  updateSun();
  draw();
}

function updateSun() {
  if (!geometry) return;
  const g = geometry;
  sun = sunGeometry(state.position, g.orbit / g.r);
  sun.px = g.cx + sun.x * g.r; sun.py = g.cy + sun.y * g.r;
  syncSunHandle();
  $('sun-handle').setAttribute('aria-label', `太陽、高度${Math.round(sun.altitude * 180 / Math.PI)}度。左右の矢印キーでも移動できます`);
  $('time-label').textContent = sun.altitude < 0.2 ? '夕方・日の出ごろ' : sun.altitude < 0.6 ? '太陽が低いとき' : '日中';
  const direct = directLight(sun);
  $('path-label').innerHTML = `大気を通る距離 <b>${(direct.length / SHELL_HEIGHT).toFixed(1)} 倍</b>`;
  // The near-Sun sky is sampled just above the disk; the disk is excluded.
  skySamples = Array.from({ length: 32 }, (_, i) => {
    const e = 0.025 + i / 31 * Math.PI / 2;
    return skyLight(sun, e, Math.sign(sun.x) || 1);
  });
  drawBackground(); drawSky();
}

function setPosition(value) {
  state.position = clamp(Math.round(value), -100, 100);
  // Old particles belong to the previous source position.
  state.particles.length = 0; state.sparks.length = 0;
  updateSun();
}

function drawBackground() {
  const g = geometry;
  bg.clearRect(0, 0, g.w, g.h); bg.fillStyle = '#000'; bg.fillRect(0, 0, g.w, g.h);
  bg.save(); bg.translate(camera.x, camera.y); bg.scale(camera.zoom, camera.zoom);
  bg.save(); bg.translate(g.cx, g.cy);
  const atmosphere = bg.createRadialGradient(0, 0, g.r * .995, 0, 0, g.r * (1 + SHELL_HEIGHT + .025));
  atmosphere.addColorStop(0, '#6ba5e666'); atmosphere.addColorStop(.38, '#477cbe32'); atmosphere.addColorStop(.78, '#3d74b916'); atmosphere.addColorStop(1, '#163a7100');
  bg.fillStyle = atmosphere; bg.beginPath(); bg.arc(0, 0, g.r * (1 + SHELL_HEIGHT + .025), 0, 2 * Math.PI); bg.fill();
  bg.strokeStyle = '#5486b844'; bg.lineWidth = 1; bg.beginPath(); bg.arc(0, 0, g.r * (1 + SHELL_HEIGHT), 0, 2 * Math.PI); bg.stroke();
  // A quiet dashed guide makes the concentric constraint visible.
  bg.strokeStyle = '#65738936'; bg.setLineDash([2, 7]); bg.beginPath();
  bg.arc(0, 0, g.orbit, -Math.PI / 2 - sun.limit, -Math.PI / 2 + sun.limit); bg.stroke(); bg.setLineDash([]);
  bg.save(); bg.beginPath(); bg.arc(0, 0, g.r, 0, 2 * Math.PI); bg.clip();
  const ocean = bg.createRadialGradient(-g.r * .28, -g.r * .9, 0, 0, -g.r * .25, g.r * 1.3);
  ocean.addColorStop(0, '#1c6382'); ocean.addColorStop(.45, '#103c5c'); ocean.addColorStop(1, '#040d1a');
  bg.fillStyle = ocean; bg.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
  // Procedural silhouettes keep the whole app self-contained and offline.
  land([[-.79,-.78],[-.66,-.88],[-.53,-.83],[-.49,-.72],[-.32,-.67],[-.35,-.58],[-.23,-.49],[-.29,-.41],[-.36,-.30],[-.48,-.38],[-.5,-.51],[-.65,-.57],[-.72,-.69]], '#397969');
  land([[.18,-.99],[.35,-.94],[.4,-.86],[.59,-.8],[.65,-.66],[.52,-.58],[.43,-.62],[.36,-.50],[.24,-.56],[.15,-.72],[.07,-.78]], '#3b7b6a');
  land([[.58,-.43],[.72,-.37],[.80,-.24],[.7,-.16],[.57,-.23],[.51,-.32]], '#31685b');
  bg.strokeStyle = '#c8e6e80c'; bg.lineWidth = g.r * .024; bg.lineCap = 'round';
  [[-.8,-.71,.05,-.8],[.0,-.49,.63,-.62],[-.5,-.29,.1,-.38]].forEach(([x,y,x2,y2])=>{bg.beginPath();bg.moveTo(x*g.r,y*g.r);bg.bezierCurveTo((x+.2)*g.r,(y-.10)*g.r,(x2-.1)*g.r,(y2+.03)*g.r,x2*g.r,y2*g.r);bg.stroke();});
  const shade = bg.createLinearGradient(0, -g.r, 0, g.r * .15); shade.addColorStop(0, '#00000000'); shade.addColorStop(1, '#000000c0'); bg.fillStyle = shade; bg.fillRect(-g.r,-g.r,g.r*2,g.r*2);
  bg.restore(); bg.strokeStyle='#8fbfd980'; bg.lineWidth=1.2; bg.beginPath();bg.arc(0,0,g.r,0,2*Math.PI);bg.stroke();
  bg.restore();
  // Highlight the actual segment of the observer's direct line inside air.
  const path = directLight(sun).length * g.r;
  bg.strokeStyle = '#f6d49a60'; bg.lineWidth = 7; bg.lineCap='butt'; bg.beginPath();
  bg.moveTo(g.cx, g.ground); bg.lineTo(g.cx + sun.dx * path, g.ground + sun.dy * path); bg.stroke();
  bg.strokeStyle='#f4deb36b';bg.lineWidth=1;bg.setLineDash([4,5]);bg.beginPath();bg.moveTo(g.cx,g.ground);bg.lineTo(sun.px,sun.py);bg.stroke();bg.setLineDash([]);
  bg.font='11px -apple-system, sans-serif';bg.fillStyle='#81a2c3';
  const labelX = g.cx - g.r * .65, labelY = g.cy - g.r * .82;
  bg.fillText('大気', labelX - 22, labelY - g.r * SHELL_HEIGHT - 8);
  bg.fillStyle='#87a3b3';bg.fillText('地球', g.cx + g.r * .37, g.ground + Math.min(75,g.r*.45));
  bg.restore();
  function land(points, color) {bg.fillStyle=color;bg.beginPath();points.forEach(([x,y],i)=>i?bg.lineTo(x*g.r,y*g.r):bg.moveTo(x*g.r,y*g.r));bg.closePath();bg.fill();}
}

function displayRGB(rgb, strength = 1) {
  const max = Math.max(...rgb, 0.01);
  return rgb.map(v => Math.round(255 * Math.pow(Math.max(0,v) / max, .68) * strength));
}

function drawSky() {
  if (!state.viewVisible) return;
  // Match the actual inset aspect ratio so the sky and solar disk aren't cropped.
  skyCanvas.width = Math.max(1, Math.round(skyCanvas.clientWidth * 2));
  skyCanvas.height = Math.max(1, Math.round(skyCanvas.clientHeight * 2));
  const w = skyCanvas.width, h = skyCanvas.height;
  if (state.mode === 'direct') {
    skyCtx.fillStyle = '#020509'; skyCtx.fillRect(0, 0, w, h);
    const color = displayRGB(directLight(sun).rgb);
    skyCtx.fillStyle = `rgb(${color.join(',')})`;
    skyCtx.shadowColor = skyCtx.fillStyle; skyCtx.shadowBlur = 16;
    skyCtx.beginPath(); skyCtx.arc(w / 2, h / 2, h * .25, 0, Math.PI * 2); skyCtx.fill(); skyCtx.shadowBlur = 0;
    skyCanvas.setAttribute('aria-label', `散乱せず直接届く太陽光の模式図。太陽の高度は${Math.round(sun.altitude*180/Math.PI)}度`);
    return;
  }
  // View covers the horizon through 90° overhead, facing the Sun's side.
  for (let y = 0; y < h; y++) {
    const e = (1 - y / h) * Math.PI / 2;
    const index = clamp(Math.round(e / (Math.PI/2) * 31), 0, 31);
    const color = displayRGB(skySamples[index], .65 + .22 * y / h);
    skyCtx.fillStyle = `rgb(${color.join(',')})`; skyCtx.fillRect(0, y, w, 1);
  }
  const sx=w*.66, sy=12+(1-sun.altitude/(Math.PI/2))*(h-40);
  const direct=displayRGB(directLight(sun).rgb);
  skyCtx.fillStyle=`rgb(${direct.join(',')})`;skyCtx.shadowColor=skyCtx.fillStyle;skyCtx.shadowBlur=10;skyCtx.beginPath();skyCtx.arc(sx,sy,7,0,Math.PI*2);skyCtx.fill();skyCtx.shadowBlur=0;
  skyCtx.fillStyle='#0a1820';skyCtx.beginPath();skyCtx.moveTo(0,h-12);skyCtx.quadraticCurveTo(w*.55,h-25,w,h-12);skyCtx.lineTo(w,h);skyCtx.lineTo(0,h);skyCtx.fill();
  skyCanvas.setAttribute('aria-label', `太陽側の空の模式図。太陽の高度は${Math.round(sun.altitude*180/Math.PI)}度`);
}

function emit() {
  const angle = Math.random() * Math.PI * 2;
  const color = Math.floor(Math.random() * 3);
  state.particles.push({ x:sun.x,y:sun.y,dx:Math.cos(angle),dy:Math.sin(angle),color,age:0,scattered:false });
}

function simulate(dt) {
  const g=geometry, speed=0.8;
  const topLeft = screenToWorld(camera, { x: 0, y: 0 });
  const bottomRight = screenToWorld(camera, { x: g.w, y: g.h });
  const bounds = { left: Math.min(0, topLeft.x)-20, top: Math.min(0, topLeft.y)-20,
    right: Math.max(g.w, bottomRight.x)+20, bottom: Math.max(g.h, bottomRight.y)+20 };
  state.emission+=dt*(g.w<600?720:1200);
  while(state.emission>=1){if(state.particles.length<3500)emit();state.emission--;}
  for(let i=state.particles.length-1;i>=0;i--){
    const p=state.particles[i];p.age+=dt;p.ox=p.x;p.oy=p.y;
    let distance=speed*dt;
    const earth=circleInterval(p.x,p.y,p.dx,p.dy,1);
    const reachesGround=earth && earth[0]>=-1e-7 && earth[0]<=distance;
    if(reachesGround)distance=Math.max(0,earth[0]);
    let scatteredThisStep=false;
    const outer=circleInterval(p.x,p.y,p.dx,p.dy,1+SHELL_HEIGHT);
    if(outer){
      const enter=Math.max(0,outer[0]), leave=Math.min(distance,outer[1]);
      const airDistance=Math.max(0,leave-enter);
      if(airDistance && Math.random()<scatterProbability(p.color,airDistance)){
        const at=enter+Math.random()*airDistance;
        p.x+=p.dx*at;p.y+=p.dy*at;
        const angle=Math.atan2(p.dy,p.dx)+scatterAngle();p.dx=Math.cos(angle);p.dy=Math.sin(angle);p.scattered=true;
        scatteredThisStep=true;
        if(state.sparks.length<120)state.sparks.push({x:p.x,y:p.y,color:p.color,life:.3});
        // The remaining time is deferred to avoid jumping through the ground.
      }else{p.x+=p.dx*distance;p.y+=p.dy*distance;}
    }else{p.x+=p.dx*distance;p.y+=p.dy*distance;}
    const px=g.cx+p.x*g.r,py=g.cy+p.y*g.r;
    if((reachesGround&&!scatteredThisStep)||p.age>10||px<bounds.left||px>bounds.right||py<bounds.top||py>bounds.bottom){state.particles[i]=state.particles.at(-1);state.particles.pop();}
  }
  for(let i=state.sparks.length-1;i>=0;i--){state.sparks[i].life-=dt;if(state.sparks[i].life<=0){state.sparks[i]=state.sparks.at(-1);state.sparks.pop();}}
}

function draw() {
  if(!geometry)return;
  const g=geometry;
  ctx.clearRect(0,0,g.w,g.h);ctx.drawImage(background,0,0,g.w,g.h);
  ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.zoom, camera.zoom);
  // Batch paths by color to keep iPad draw-call costs bounded.
  for(let color=0;color<3;color++){
    ctx.strokeStyle=COLORS[color];ctx.fillStyle=COLORS[color];ctx.globalAlpha=.72;ctx.lineWidth=g.w<600?1.5:1.8;
    ctx.beginPath();
    for(const p of state.particles){if(p.color!==color)continue;const x=g.cx+p.x*g.r,y=g.cy+p.y*g.r;ctx.moveTo(x-p.dx*5,y-p.dy*5);ctx.lineTo(x,y);}
    ctx.stroke();ctx.beginPath();ctx.globalAlpha=.95;
    for(const p of state.particles){if(p.color!==color)continue;const x=g.cx+p.x*g.r,y=g.cy+p.y*g.r;ctx.moveTo(x+1.3,y);ctx.arc(x,y,1.3,0,Math.PI*2);}
    ctx.fill();
  }
  for(const s of state.sparks){ctx.strokeStyle=COLORS[s.color];ctx.globalAlpha=s.life*.9;ctx.lineWidth=1;ctx.beginPath();ctx.arc(g.cx+s.x*g.r,g.cy+s.y*g.r,(1-s.life/.3)*10+2,0,Math.PI*2);ctx.stroke();}
  ctx.globalAlpha=1;
  // Sun stays bright at the source; its observed color is shown in the inset.
  const halo=ctx.createRadialGradient(sun.px,sun.py,8,sun.px,sun.py,39);halo.addColorStop(0,'#ffda7377');halo.addColorStop(.55,'#ffb53420');halo.addColorStop(1,'#ff9a0000');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(sun.px,sun.py,39,0,Math.PI*2);ctx.fill();
  const solar=ctx.createRadialGradient(sun.px-5,sun.py-5,1,sun.px,sun.py,17);solar.addColorStop(0,'#fffce7');solar.addColorStop(.7,'#ffe5a3');solar.addColorStop(1,'#ffbd53');ctx.fillStyle=solar;ctx.beginPath();ctx.arc(sun.px,sun.py,17,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ead4aa';ctx.font='11px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillText('太陽',sun.px,sun.py-30);
  drawObserver();ctx.textAlign='left';ctx.restore();
}

function drawObserver(){
  const g=geometry,x=g.cx,y=g.ground;
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#eaf2ff';ctx.fillStyle='#eaf2ff';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=2.8;
  ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.beginPath();ctx.arc(0,-31,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(0,-13);ctx.moveTo(-8,-19);ctx.lineTo(0,-23);ctx.lineTo(8,-19);ctx.moveTo(0,-13);ctx.lineTo(-6,-2);ctx.moveTo(0,-13);ctx.lineTo(6,-2);ctx.stroke();ctx.shadowBlur=0;
  ctx.font='11px -apple-system, sans-serif';ctx.textAlign='center';ctx.fillStyle='#d8e6f7';ctx.fillText('観測者',0,19);ctx.restore();
}

function frame(time){
  const dt=lastTime?Math.min((time-lastTime)/1000,.04):0;lastTime=time;
  if(!document.hidden){
    if(cameraDirty){syncSunHandle();drawBackground();cameraDirty=false;}
    simulate(dt);draw();
  }
  animation=requestAnimationFrame(frame);
}

function setMode(mode){state.mode=mode;['sky','direct'].forEach(name=>{$(`${name}-mode`).classList.toggle('selected',name===mode);$(`${name}-mode`).setAttribute('aria-pressed',name===mode);});updateSun();}
$('sky-mode').addEventListener('click',()=>setMode('sky'));$('direct-mode').addEventListener('click',()=>setMode('direct'));
function setObserverView(visible, restoreFocus = false) {
  state.viewVisible = visible;
  $('observer-view').hidden = !visible;
  $('toggle-view').setAttribute('aria-expanded', String(visible));
  $('toggle-view').textContent = visible ? '見え方を非表示' : '見え方を表示';
  if (visible) drawSky();
  if (restoreFocus) $('toggle-view').focus();
}
$('toggle-view').addEventListener('click',()=>setObserverView(!state.viewVisible));
$('close-view').addEventListener('click',()=>setObserverView(false, true));
const handle=$('sun-handle');
function syncSunHandle() {
  const point = worldToScreen(camera, { x: sun.px, y: sun.py });
  handle.style.left = `${point.x}px`; handle.style.top = `${point.y}px`;
  const size = Math.max(64, 34 * camera.zoom + 18);
  handle.style.width = `${size}px`; handle.style.height = `${size}px`;
  $('observer-view').classList.toggle('on-left', point.x >= geometry.w / 2);
}
function cameraChanged() {
  cameraDirty = true;
  $('zoom-level').textContent = `${Math.round(camera.zoom * 100)}%`;
  $('zoom-out').disabled = camera.zoom <= MIN_ZOOM;
  $('zoom-in').disabled = camera.zoom >= MAX_ZOOM;
}
navigation = installNavigation({ surface: canvas.parentElement, canvas, handle, camera, onChange: cameraChanged,
  onSunMove(point) {
    const angle = Math.atan2(point.x - geometry.cx, geometry.cy - point.y);
    setPosition(angle / sun.limit * 100);
  }
});
function zoomBy(factor) {
  navigation.cancel();
  zoomAt(camera, camera.zoom * factor, { x: geometry.w / 2, y: geometry.h / 2 });
  cameraChanged();
}
$('zoom-out').addEventListener('click',()=>zoomBy(1/1.25));
$('zoom-in').addEventListener('click',()=>zoomBy(1.25));
$('reset-camera').addEventListener('click',()=>{navigation.cancel();Object.assign(camera,{x:0,y:0,zoom:1});cameraChanged();});
handle.addEventListener('keydown',event=>{const shifts={ArrowLeft:-2,ArrowRight:2,ArrowUp:-2,ArrowDown:2};if(event.key in shifts){event.preventDefault();setPosition(state.position+shifts[event.key]);}else if(event.key==='Home'){event.preventDefault();setPosition(0);}});
function setHelp(open){$('help-panel').hidden=!open;$('help').setAttribute('aria-expanded',open);if(open)$('close-help').focus();else $('help').focus();}
$('help').addEventListener('click',()=>setHelp($('help-panel').hidden));$('close-help').addEventListener('click',()=>setHelp(false));document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!$('help-panel').hidden)setHelp(false);else if(state.viewVisible)setObserverView(false, true);});
document.addEventListener('visibilitychange',()=>{lastTime=0;});
new ResizeObserver(resize).observe(canvas);
resize();animation=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>cancelAnimationFrame(animation));
window.addEventListener('pageshow',event=>{if(event.persisted){lastTime=0;animation=requestAnimationFrame(frame);}});

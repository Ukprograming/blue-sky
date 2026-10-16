import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ZOOM, MAX_ZOOM, screenToWorld, worldToScreen, zoomAt } from '../navigation.mjs';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
test('パン・ズーム後の画面座標から元の座標に戻せる',()=>{
  for(const zoom of [.5,1,2,4]){
    const camera={x:-173,y:89,zoom},point={x:712,y:308};
    const restored=screenToWorld(camera,worldToScreen(camera,point));
    close(restored.x,point.x);close(restored.y,point.y);
  }
});
test('拡大・縮小は指定した画面位置にある点を固定する',()=>{
  const camera={x:81,y:-37,zoom:1.25},anchor={x:294,y:163};
  const world=screenToWorld(camera,anchor);
  for(const zoom of [2,4,.5,1]){
    zoomAt(camera,zoom,anchor);
    const screen=worldToScreen(camera,world);
    close(screen.x,anchor.x);close(screen.y,anchor.y);
  }
});
test('上限・下限でもズームの基準点がずれない',()=>{
  const camera={x:20,y:-10,zoom:1},anchor={x:80,y:90};
  const world=screenToWorld(camera,anchor);
  zoomAt(camera,100,anchor);assert.equal(camera.zoom,MAX_ZOOM);
  zoomAt(camera,.001,anchor);assert.equal(camera.zoom,MIN_ZOOM);
  const restored=worldToScreen(camera,world);close(restored.x,anchor.x);close(restored.y,anchor.y);
});

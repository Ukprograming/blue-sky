import test from 'node:test';
import assert from 'node:assert/strict';
import { SHELL_HEIGHT, OPTICAL_DEPTH, atmosphereLength, sunGeometry, directLight, skyLight, relativeRGB, scatterProbability, particleScatterProbability } from '../physics.mjs';

const orbit = Math.hypot(.24, .44) / .24;
test('頭上は大気の厚さ1枚、地平線では経路が長くなる',()=>{
  const noon=directLight(sunGeometry(0,orbit));
  const sunset=directLight(sunGeometry(100,orbit));
  assert.ok(Math.abs(noon.length-SHELL_HEIGHT)<1e-10);
  assert.ok(sunset.length>noon.length);
  assert.ok(Math.abs(sunset.length-Math.sqrt((1+SHELL_HEIGHT)**2-1))<1e-8);
});
test('太陽は地球と同心円、左右で高度と直接光が一致',()=>{
  for(const pos of [0,20,60,98,100]){
    const a=sunGeometry(pos,orbit),b=sunGeometry(-pos,orbit);
    assert.ok(Math.abs(Math.hypot(a.x,a.y)-orbit)<1e-10);
    assert.ok(Math.abs(a.altitude-b.altitude)<1e-10);
    assert.deepEqual(directLight(a).rgb,directLight(b).rgb);
  }
});
test('青ほど散乱しやすく、移動距離とともに散乱確率が増える',()=>{
  assert.ok(OPTICAL_DEPTH[2]>OPTICAL_DEPTH[1]&&OPTICAL_DEPTH[1]>OPTICAL_DEPTH[0]);
  for(const c of [0,1,2]){assert.equal(scatterProbability(c,0),0);assert.ok(scatterProbability(c,.08)>scatterProbability(c,.02));}
  assert.ok(scatterProbability(2,.05)>scatterProbability(0,.05));
});
test('粒の散乱は赤と青の差を強調し、確率の範囲を維持',()=>{
  const distance=.01;
  const physicalRatio=scatterProbability(2,distance)/scatterProbability(0,distance);
  const visualRatio=particleScatterProbability(2,distance)/particleScatterProbability(0,distance);
  assert.ok(visualRatio>physicalRatio*3);
  assert.ok(particleScatterProbability(0,distance)<scatterProbability(0,distance));
  assert.ok(particleScatterProbability(2,distance)>scatterProbability(2,distance));
  for(const color of [0,1,2])for(const d of [0,.01,.1,1,10]){
    const p=particleScatterProbability(color,d);assert.ok(Number.isFinite(p)&&p>=0&&p<=1);
  }
});
test('日中の散乱光は青く、夕方の太陽側の空と直接光は赤くなる',()=>{
  const noon=sunGeometry(0,orbit),sunset=sunGeometry(98,orbit);
  const daySky=skyLight(noon,Math.PI/2),eveningSky=skyLight(sunset,sunset.altitude+.09);
  assert.ok(daySky[2]>daySky[1]&&daySky[1]>daySky[0]);
  assert.ok(eveningSky[0]>eveningSky[1]&&eveningSky[1]>eveningSky[2]);
  const d=directLight(sunset).rgb;assert.ok(d[0]>d[1]&&d[1]>d[2]);
});
test('地球に遮られる経路では大気の積分を表面までに制限',()=>{
  const length=atmosphereLength(0,-2,0,1);
  assert.ok(Math.abs(length-SHELL_HEIGHT)<1e-10);
  assert.equal(atmosphereLength(2,0,1,0),0);
  assert.ok(Math.abs(atmosphereLength(0,-1.04,0,-1)-(SHELL_HEIGHT-.04))<1e-10);
});
test('RGB割合は合計100%、負数・NaNを出さない',()=>{
  for(const p of [-100,-98,-50,0,50,98,100]){
    const s=sunGeometry(p,orbit);
    for(const rgb of [directLight(s).rgb,skyLight(s,Math.min(Math.PI/2,s.altitude+.09),Math.sign(p)||1)]){
      const result=relativeRGB(rgb);assert.equal(result.reduce((a,b)=>a+b),100);assert.ok(result.every(v=>Number.isFinite(v)&&v>=0&&v<=100));
    }
  }
});

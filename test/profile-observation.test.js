import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planFromPhotos} from '../lib/target_profile.js';
import {buildCurrentProfile} from '../lib/current_profile.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8').then(JSON.parse);
const photos=await read('fixtures/photo_analysis.sample.json');
const snapshot=await read('fixtures/ig_snapshot.json');

test('heuristic defaults are not promoted to observed composition, scale or opener habits',()=>{
  for(const source of [photos,photos.map((p,i)=>({...p,analysis_source:i===0?'vision_model':'heuristic'}))]) {
    for(const profile of [planFromPhotos(source),buildCurrentProfile({photos:source})]) {
      assert.equal(profile.visual.composition_mix,undefined);
      assert.equal(profile.visual.scale_mix,undefined);
      assert.ok(profile.visual.palette);
    }
  }
  const carousels=snapshot.posts.filter(p=>p.child_count>=2);
  const openers=carousels.map((p,i)=>({...photos[i%photos.length],file_ref:p.opener_image,scale:'fullshot',analysis_source:'heuristic'}));
  assert.equal(buildCurrentProfile({snapshot,openers}).sequence.opener_tendency,undefined);
  const observed=photos.map(p=>({...p,analysis_source:'vision_model'}));
  for(const profile of [planFromPhotos(observed),buildCurrentProfile({photos:observed})]) assert.ok(profile.visual.scale_mix && profile.visual.composition_mix);
});

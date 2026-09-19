import {readFile} from 'node:fs/promises';
import {buildFeed} from '../../../../lib/pipeline.js';
const fixture=JSON.parse(await readFile(new URL('../../../../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const photos=fixture.context.photos.map((p,i)=>({...structuredClone(p),photo_id:`new_${i}`,input_index:i}));
const currentPosts=captions=>({kind:'posts',captions,photos:captions.map((_,i)=>({
  ...structuredClone(fixture.context.photos[i%fixture.context.photos.length]),photo_id:`old_${i}`,input_index:i}))});
for (const [label,text,caps] of [
  ['짧게+무비움','짧게 기록해 줘',['기록','또 기록','계속 기록']],
  ['짧게+절반비움','짧게 기록해 줘',['','기록']],
  ['자세히+무비움','자세하게 기록해 줘',['기록','또 기록','계속 기록']],
  ['해요체+무비움','해요체로 짧게 써 줘',['기록해요','또 기록해요','계속 기록해요']],
  ['줄바꿈없이','줄바꿈 없이 짧게 써 줘',['기록','또 기록','계속 기록']],
]) {
  const built=await buildFeed({schema_version:'1.0',session_id:'p',photos:structuredClone(photos),
    identity:{target:{kind:'text',text},current:currentPosts(caps)}});
  console.log(label,'| disclosure=',built.feed.applied_profile.disclosure,
    '| current.ratio=',built.context.current.language?.empty_caption_ratio?.value,
    '| target.ratio=',built.context.target.language?.empty_caption_ratio?.value);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateOutput,handleGenerate,NO_FACTS_NOTE} from '../lib/output-generation.js';
import {validateErrorResponse} from '../lib/interaction.js';
import {buildFeed} from '../lib/pipeline.js';
import {extractFromReference} from '../lib/target_profile.js';
import {buildCurrentProfile} from '../lib/current_profile.js';
import {composeFeed} from '../lib/compose.js';
process.env.GYEOL_MODEL_PROVIDER_ENABLED='1';
const fixture=JSON.parse(await readFile(new URL('../fixtures/interaction.sample.json',import.meta.url),'utf8'));
const referenceFixture=JSON.parse(await readFile(new URL('../fixtures/ref_snapshot.sample.json',import.meta.url),'utf8'));
const input=(mode='all',source=fixture)=>({schema_version:'1.0',mode,feed:structuredClone(source.feed),context:structuredClone(source.context),...(mode==='slot'?{photo_id:'ph_01'}:{})});
const output=()=>({output:structuredClone(fixture.all_omitted)});
// seed 는 완성 캡션이 아니라 사용자가 채우는 단서 형식이며, 사진 근거 note 는 관측 사실 원문이다 (#101).
const hint=fact=>`쓸 거리: ${fact}\n이 중 기억에 남은 건?`;
const seedOutput=(feed=fixture.feed)=>({output:{title:'세 장의 기록',slots:feed.slots.map(slot=>({
  photo_id:slot.photo_id,position:slot.position,caption_state:'seed',text:hint(slot.caption_inputs.describable_facts[0]),omit_reason:null,
  evidence:[{kind:'uploaded_photo',ref:slot.photo_id,note:slot.caption_inputs.describable_facts[0]}]
}))}});
const orderInput=(target,current={kind:'none'},photos=fixture.context.photos)=>({
  schema_version:'1.0',session_id:'generate-test',photos:photos.map((photo,index)=>({...structuredClone(photo),photo_id:`new_${index}`,input_index:index})),
  identity:{target,current}
});
const currentPosts=captions=>({kind:'posts',captions,photos:captions.map((_,index)=>({
  ...structuredClone(fixture.context.photos[index%fixture.context.photos.length]),photo_id:`old_${index}`,input_index:index
}))});
const generatedInput=result=>({schema_version:'1.0',mode:'all',feed:result.feed,context:result.context});
const wire=value=>Response.json({model:'test-text-model',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}]});
const transport=(value,seen=[])=>async(url,options)=>{
  seen.push({url,options});
  return url.includes('/models/')?Response.json({id:'test-text-model',capabilities:{image_input:{supported:false},structured_outputs:{supported:true}}}):wire(value);
};
const options=value=>({apiKey:'fake-key',fetchImpl:transport(value)});
// mode=all 응답에는 서버가 센 omission 이 붙는다. 슬롯 보존만 보는 검사는 그 부분을 떼고 본다 (#80).
const slotsOnly=value=>value?.omission?{output:value.output}:value;
const request=value=>new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});

test('all generation preserves each contract path and loads actual shared/output prompts',async()=>{
  const expectedPrompt=(await Promise.all(['shared/style_guard.md','output/title.md','output/caption.md','output/omit_reason.md']
    .map(file=>readFile(new URL('../prompts/'+file,import.meta.url),'utf8')))).join('\n\n');
  for(const source of [fixture,fixture.photo_only,fixture.corrected]) {
    const seen=[];const expected=output();
    assert.deepEqual(slotsOnly(await generateOutput(input('all',source),{apiKey:'fake-key',fetchImpl:transport(expected,seen)})),expected);
    assert.equal(seen.length,2);
    const body=JSON.parse(seen[1].options.body);
    assert.equal(body.system,expectedPrompt);
    assert.equal(body.output_config.format.type,'json_schema');
    const sent=JSON.parse(body.messages[0].content[0].text);
    assert.equal(sent.slots.length,3);
    assert.deepEqual(Object.keys(sent.applied_profile).sort(),['disclosure','language']);
    assert.equal(sent.applied_profile.disclosure,source.feed.applied_profile.disclosure);
    assert.ok(!JSON.stringify(sent.applied_profile).includes('evidence'));
    assert.equal(body.messages[0].content[0].type,'text');
  }
});

test('target-only current profiles stay traceable in the feed but produce byte-identical model requests',async()=>{
  const target={kind:'text',text:'차분하고 짧게 기록해 줘'};
  const currents=[{kind:'none'},currentPosts(['가요']),currentPosts(['가'.repeat(950)])];
  const bodies=[];const currentIds=[];
  for(const current of currents) {
    const built=await buildFeed(orderInput(target,current));
    currentIds.push(built.feed.applied_profile.current_profile_id);
    assert.equal(built.feed.applied_profile.disclosure,'target_only');
    const seen=[];
    await generateOutput(generatedInput(built),{apiKey:'fake-key',fetchImpl:transport(seedOutput(built.feed),seen)});
    assert.equal(built.feed.applied_profile.current_profile_id,currentIds.at(-1));
    bodies.push(seen[1].options.body);
    const sent=JSON.parse(JSON.parse(seen[1].options.body).messages[0].content[0].text);
    assert.equal(Object.hasOwn(sent.applied_profile,'current_profile_id'),false);
  }
  assert.equal(currentIds[0],null);
  assert.ok(currentIds[1]);assert.ok(currentIds[2]);assert.notEqual(currentIds[1],currentIds[2]);
  assert.equal(bodies[0],bodies[1]);assert.equal(bodies[1],bodies[2]);
});

test('model request whitelists photo facts and applied language values in all and slot modes',async()=>{
  const built=await buildFeed(orderInput({kind:'text',text:'짧고 담백하게'},currentPosts(['기록',''])));
  const rationale=structuredClone(built.feed.slots[0].rationale);
  for(const mode of ['all','slot']) {
    const seen=[];
    const provider=mode==='all'?seedOutput(built.feed):{slot:seedOutput(built.feed).output.slots[0]};
    const requested={schema_version:'1.0',mode,feed:structuredClone(built.feed),context:structuredClone(built.context),
      ...(mode==='slot'?{photo_id:built.feed.slots[0].photo_id}:{})};
    await generateOutput(requested,{apiKey:'fake-key',fetchImpl:transport(provider,seen)});
    const sent=JSON.parse(JSON.parse(seen[1].options.body).messages[0].content[0].text);
    assert.deepEqual(Object.keys(sent.applied_profile).sort(),['disclosure','language']);
    assert.ok(!JSON.stringify(sent.applied_profile).match(/target_profile_id|current_profile_id|deltas|visual|sequence|confidence|evidence/));
    for(const slot of sent.slots) {
      assert.deepEqual(Object.keys(slot).sort(),['caption_inputs','photo_id','position']);
      assert.deepEqual(Object.keys(slot.caption_inputs),['describable_facts']);
      const original=requested.feed.slots.find(item=>item.photo_id===slot.photo_id);
      assert.deepEqual(slot.caption_inputs.describable_facts,original.caption_inputs.describable_facts.map((text,fact_index)=>({fact_index,text})));
    }
    assert.ok(!JSON.stringify(sent).match(/rationale|narrative_role|adjacent_overlap|is_visual_peak|omit_suggestion/));
    assert.deepEqual(requested.feed.slots[0].rationale,rationale);
  }
});

test('internal ordering details fail closed in every public model field for all and slot modes',async()=>{
  const allCases=[];
  const title=seedOutput();title.output.title='밝기와 채도로 연결한 세 장';allCases.push(['title',title]);
  const text=seedOutput();text.output.slots[0].text='밝기 0.712인 단색 카드';allCases.push(['text',text]);
  const reason=output();reason.output.slots[0].omit_reason='앞자리 사진과 측정 색 거리로 이 자리에 뒀다';allCases.push(['omit_reason',reason]);
  const note=seedOutput();note.output.slots[0].evidence[0].note='is_visual_peak=true라 선택했다';allCases.push(['evidence.note',note]);
  // 필드명을 안 부르고 값만 옮겨 적는 경로. 위 네 건은 전부 내부 이름이 같이 나와서 잡힌다.
  const bare=seedOutput();bare.output.slots[0].evidence[0].note='앞 사진과의 겹침이 0.786 이라 이 자리를 골랐다';allCases.push(['bare decimal',bare]);
  for(const [field,response] of allCases) {
    await assert.rejects(generateOutput(input('all'),options(response)),{code:'MODEL_CONTRACT'},`all ${field}`);
  }

  const slotCases=[];
  const slotText=structuredClone(fixture.output.slots[0]);slotText.text='caption_inputs를 사용했다';slotCases.push(['text',slotText]);
  const slotReason=structuredClone(fixture.all_omitted.slots[0]);slotReason.omit_reason='점수가 가장 높아 1번에 뒀다';slotCases.push(['omit_reason',slotReason]);
  const slotNote=structuredClone(fixture.output.slots[0]);slotNote.evidence[0].note='adjacent_overlap=0.8';slotCases.push(['evidence.note',slotNote]);
  for(const [field,response] of slotCases) {
    await assert.rejects(generateOutput(input('slot'),options({slot:response})),{code:'MODEL_CONTRACT'},`slot ${field}`);
  }
});

test('every model-input field name is rejected when echoed into public evidence',async()=>{
  const names=['mode','slots','position','photo_id','caption_inputs','describable_facts','applied_profile','disclosure','language',
    'caption_len','emoji_rate','ending_style','linebreak_habit','caption_coverage','banned_words','p50','p90','unit'];
  for(const name of names) {
    const response=structuredClone(fixture.output.slots[0]);
    response.evidence[0].note=`${name}=internal`;
    await assert.rejects(generateOutput(input('slot'),options({slot:response})),{code:'MODEL_CONTRACT'},name);
  }
});

test('model-visible disclosure values are rejected in both output modes',async()=>{
  const all=seedOutput();all.output.title='target_only로 만든 세 장';
  await assert.rejects(generateOutput(input('all'),options(all)),{code:'MODEL_CONTRACT'});
  const slot=structuredClone(fixture.output.slots[0]);slot.evidence[0].note='corrected를 적용했다';
  await assert.rejects(generateOutput(input('slot'),options({slot})),{code:'MODEL_CONTRACT'});
});

test('the original brightness and saturation ordering title is rejected even when heuristic facts contain both terms',async()=>{
  const req=input();
  const facts=['평균 밝기 0.712','평균 채도 0.671'];
  req.feed.slots[0].caption_inputs.describable_facts=facts;
  req.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=facts;
  const provider=seedOutput(req.feed);provider.output.title='밝기와 채도로 연결한 세 장';
  await assert.rejects(generateOutput(req,options(provider)),{code:'MODEL_CONTRACT'});
});

test('an internal-looking literal remains usable when it is visibly grounded in the same photo',async()=>{
  const req=input('slot');
  const fact='화면에 caption_state라는 글자가 보인다';
  req.feed.slots[0].caption_inputs.describable_facts=[fact];
  req.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=[fact];
  const response=structuredClone(fixture.output.slots[0]);response.text=hint('caption_state라는 글자');response.evidence[0].note=fact;
  assert.deepEqual(await generateOutput(req,options({slot:response})),{slot:response});
});

test('a unique near-complete photo note is restored to its canonical fact',async()=>{
  const req=input('slot');
  const fact='그 사람은 하늘색 단추 달린 카디건과 흰 상의, 회색 통이 넓은 바지를 입고 있다';
  req.feed.slots[0].caption_inputs.describable_facts=[fact];
  req.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=[fact];
  const response=structuredClone(fixture.output.slots[0]);
  response.text=hint('하늘색 단추 달린 카디건');
  response.evidence[0].note=fact.slice('그 사람은 '.length);
  const actual=await generateOutput(req,options({slot:response}));
  assert.equal(actual.slot.evidence[0].note,fact);
});

test('a seed must quote one fact from its own photo',async()=>{
  const cases=[
    response=>{response.text=hint('컬러 카드');},
    response=>{response.evidence.push({...response.evidence[0]});},
    response=>{response.evidence[0].ref='ph_02';}
  ];
  for(const mutate of cases) {
    const response=structuredClone(fixture.output.slots[0]); mutate(response);
    await assert.rejects(generateOutput(input('slot'),options({slot:response})),{code:'MODEL_CONTRACT'});
  }
});

test('an ambiguous partial photo note still fails closed',async()=>{
  const req=input('slot');
  const note='파란 줄무늬 셔츠와 검은 바지를 입고 있다';
  const facts=[`왼쪽 사람은 ${note}`,`오른쪽 사람은 ${note}`];
  req.feed.slots[0].caption_inputs.describable_facts=facts;
  req.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=facts;
  const response=structuredClone(fixture.output.slots[0]);
  response.text=hint('파란 줄무늬 셔츠'); response.evidence[0].note=note;
  await assert.rejects(generateOutput(req,options({slot:response})),{code:'MODEL_CONTRACT'});
});

test('a longer photographed word cannot ground an internal identifier substring',async()=>{
  const req=input('slot');
  const fact='balanced composition';
  req.feed.slots[0].caption_inputs.describable_facts=[fact];
  req.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=[fact];
  const response=structuredClone(fixture.output.slots[0]);response.text='position=1을 사용했다';
  await assert.rejects(generateOutput(req,options({slot:response})),{code:'MODEL_CONTRACT'});
});

test('single slot sends only its photo and rejects other photo, position, user state or foreign evidence',async()=>{
  const valid={slot:structuredClone(fixture.output.slots[0])};const seen=[];
  assert.deepEqual(await generateOutput(input('slot'),{apiKey:'fake-key',fetchImpl:transport(valid,seen)}),valid);
  const sent=JSON.parse(JSON.parse(seen[1].options.body).messages[0].content[0].text);
  assert.deepEqual(sent.slots.map(s=>s.photo_id),['ph_01']);
  for(const patch of [{photo_id:'ph_02'},{position:2},{caption_state:'user'},{evidence:[{kind:'uploaded_photo',ref:'ph_02',note:'other photo'}]}]) {
    await assert.rejects(generateOutput(input('slot'),options({slot:{...valid.slot,...patch}})),{code:'MODEL_CONTRACT'});
  }
});

test('explicit sparse coverage survives buildFeed without rewriting grounded seeds',async()=>{
  const original='차분하고 미니멀한 흑백 감성. 말수가 적고 여백이 많은 기록.';
  const currentNoOmit=currentPosts(['기록','또 기록','계속 기록']);
  const built=await buildFeed(orderInput({kind:'text',text:original},currentNoOmit));
  assert.equal(built.context.target.language.caption_coverage.value,'sparse');
  assert.equal(built.feed.applied_profile.language.caption_coverage.value,'sparse');
  assert.equal(built.context.target.language.empty_caption_ratio,undefined);
  assert.equal(built.context.current.language.empty_caption_ratio.value,0);
  const provider=seedOutput(built.feed);
  const first=await generateOutput(generatedInput(built),options(provider));
  const second=await generateOutput(generatedInput(built),options(provider));
  assert.deepEqual(first,second);
  assert.equal(first.output.slots.filter(slot=>slot.caption_state==='omitted').length,0);

  const detailed=await buildFeed(orderInput({kind:'text',text:'몇 장만 자세히 써 줘'},currentNoOmit));
  assert.equal(detailed.context.target.language.caption_coverage.value,'sparse');
  assert.equal(detailed.context.target.language.caption_len.value.p50,90);
  assert.equal((await generateOutput(generatedInput(detailed),options(seedOutput(detailed.feed))))
    .output.slots.filter(slot=>slot.caption_state==='omitted').length,0);
});

test('reference omission ratios do not impose a generation quota',async()=>{
  const snapshot=structuredClone(referenceFixture);
  snapshot.snapshot_id='ig_snapshot_coverage_ratio';
  snapshot.posts.slice(0,15).forEach(post=>{post.caption='';});
  snapshot.posts.slice(15).forEach(post=>{post.caption='짧은 기록입니다.';});
  const order=orderInput({kind:'reference',url:'https://www.instagram.com/29cm/'});
  const target=await extractFromReference('https://www.instagram.com/29cm/',{registry:{'29cm':snapshot}});
  const current=buildCurrentProfile();
  const feed=composeFeed({photoAnalyses:order.photos,targetProfile:target,currentProfile:current,currentPhotoAnalyses:[],sessionId:order.session_id});
  const built={feed,context:{photos:order.photos,current,target,current_photos:[]}};
  assert.equal(built.context.target.source,'ig_reference');
  assert.equal(built.context.target.language.caption_coverage,undefined);
  assert.equal(built.context.target.language.empty_caption_ratio.value,0.5);
  const actual=await generateOutput(generatedInput(built),options(seedOutput(built.feed)));
  assert.equal(actual.output.slots.filter(slot=>slot.caption_state==='omitted').length,0);
});

test('negated or non-caption coverage wording stays unset through generation',async()=>{
  const cases=[
    '말수가 적지는 않게 써 줘','전부 써 주지는 마','한 장도 비우지 않는 건 싫어요',
    '싫은 건 모든 사진에 문장을 쓰는 거예요','사진마다 써 줘, 하지만 사진마다 쓰지 마',
    '사진마다 색감을 다르게 해 줘','몇 장만 색감이 진하게 해 줘','말수는 적게, 하지만 사진마다 색감은 풍부하게',
    '한 장도 비우지 말라는 건 원하지 않아요','원하지 않는 건 모든 사진에 문장을 쓰는 거예요',
    '제가 싫은 건 사진마다 문장을 쓰는 거예요','내가 싫은 건 전부 쓰는 거야',
    '하지 말아야 할 건 모든 사진에 문장을 쓰는 거예요','원하지 않는 건 말수가 적은 기록이에요',
    '말수가 적당했으면','말수가 적절했으면','말수가 적혀 있는 사진','말수가 적어도 세 문장은 필요해요',
    '사진만 두 장 크게 보여 줘','전부 채워진 구도로 해 줘','전부 써 있는 간판 사진을 앞에 둬',
    '몇 장에만 써 줘, 몇 장에만 쓰지 마','전부 써 줘, 전부 쓰지 마','전부 채워 줘, 전부 채우지는 마',
    '몇 장에만 문장을 써 줘, 하지만 몇 장에만 문장을 쓰지는 마',
    '몇 장에만 문장을 써 줘, 아니요 그건 원하지 않아요','몇 장에만 문장을 써 줘. 아니요, 그건 원하지 않아요.',
    '사진 속 글자를 전부 써 줘','사진 속 문장을 전부 써 주세요','사진 속 캡션을 전부 써 주세요',
    '배경을 꽃으로 전부 채워 줘','사진마다 한 줄씩 테두리를 넣어 줘',
    '몇 장에만 써 줘, 하지만 캡션 없이','모든 사진에 써 줘, 아니 전부 사진만'
  ];
  for(const text of cases) {
    const built=await buildFeed(orderInput({kind:'text',text},currentPosts(['','기록'])));
    assert.equal(built.context.target.language?.caption_coverage,undefined,text);
    const provider=seedOutput(built.feed);
    const actual=await generateOutput(generatedInput(built),options(provider));
    assert.deepEqual(actual.output,provider.output,text);
  }
});

test('an unrelated contrast clause preserves the earlier explicit coverage request',async()=>{
  const sparse=await buildFeed(orderInput({kind:'text',text:'몇 장에만 문장을 써 줘, 하지만 사진 순서는 그대로'}));
  assert.equal(sparse.context.target.language.caption_coverage.value,'sparse');
  assert.equal((await generateOutput(generatedInput(sparse),options(seedOutput(sparse.feed))))
    .output.slots.filter(slot=>slot.caption_state==='omitted').length,0);

  const all=await buildFeed(orderInput({kind:'text',text:'모든 사진에 문장을 써 줘, 하지만 색감은 차분하게'}));
  assert.equal(all.context.target.language.caption_coverage.value,'all');
  const provider=seedOutput(all.feed);
  assert.deepEqual(slotsOnly(await generateOutput(generatedInput(all),options(provider))),provider);

  const sentenceScoped=await buildFeed(orderInput({kind:'text',text:'과한 색감은 싫어요. 말수가 적고 여백이 많은 기록.'}));
  assert.equal(sentenceScoped.context.target.language.caption_coverage.value,'sparse');
  assert.equal((await generateOutput(generatedInput(sentenceScoped),options(seedOutput(sentenceScoped.feed))))
    .output.slots.filter(slot=>slot.caption_state==='omitted').length,0);

  for(const text of [
    '몇 장에만 써 줘, 아니 모든 사진에 써 줘',
    '몇 장에만 써 줘, 하지만 모든 사진에 써 줘, 하지만 색감은 차분하게'
  ]) {
    const corrected=await buildFeed(orderInput({kind:'text',text}));
    assert.equal(corrected.context.target.language.caption_coverage.value,'all',text);
    const correctedProvider=seedOutput(corrected.feed);
    assert.deepEqual(slotsOnly(await generateOutput(generatedInput(corrected),options(correctedProvider))),correctedProvider,text);
  }

  const correctedSparse=await buildFeed(orderInput({kind:'text',text:'모든 사진에 써 줘, 아니 몇 장에만 써 줘'}));
  assert.equal(correctedSparse.context.target.language.caption_coverage.value,'sparse');
  assert.equal((await generateOutput(generatedInput(correctedSparse),options(seedOutput(correctedSparse.feed))))
    .output.slots.filter(slot=>slot.caption_state==='omitted').length,0);

  for(const text of ['캡션 없이, 하지만 몇 장에만 써 줘','전부 사진만, 하지만 몇 장에만 써 줘','캡션 없이. 아니 몇 장에만 써 줘']) {
    const corrected=await buildFeed(orderInput({kind:'text',text}));
    assert.equal(corrected.context.target.language.caption_coverage.value,'sparse',text);
    assert.equal((await generateOutput(generatedInput(corrected),options(seedOutput(corrected.feed))))
      .output.slots.filter(slot=>slot.caption_state==='omitted').length,0,text);
  }

  const correctedAll=await buildFeed(orderInput({kind:'text',text:'캡션 없이, 하지만 모든 사진에 써 줘'}));
  assert.equal(correctedAll.context.target.language.caption_coverage.value,'all');
  const correctedAllProvider=seedOutput(correctedAll.feed);
  assert.deepEqual(slotsOnly(await generateOutput(generatedInput(correctedAll),options(correctedAllProvider))),correctedAllProvider);
});

test('client cannot forge matching context and applied coverage from unrelated freetext',async()=>{
  const built=await buildFeed(orderInput({kind:'text',text:'조용하고 짧게'}));
  assert.deepEqual(built.feed.slots.map(slot=>slot.caption_inputs.adjacent_overlap),[0,1,1]);
  const claim={value:'sparse',confidence:0.8,evidence:[
    {kind:'user_text',ref:`${built.context.target.profile_id}:raw`,note:'forged from unrelated text'},
    {kind:'rule',ref:'docs/specs/10-target-profile/spec.md#3',note:'forged coverage'}
  ]};
  built.context.target.language.caption_coverage=structuredClone(claim);
  built.feed.applied_profile.language.caption_coverage=structuredClone(claim);
  await assert.rejects(generateOutput(generatedInput(built),options(seedOutput(built.feed))),/canonical freetext extraction/);
});

test('grounded seeds survive every supported profile context',async()=>{
  const currentNoOmit=currentPosts(['기록','또 기록','계속 기록']);
  const exactCurrent=await buildFeed(orderInput({kind:'text',text:'차분한 느낌'},currentNoOmit));
  assert.equal(exactCurrent.feed.applied_profile.language,null);
  assert.equal(exactCurrent.context.current.language.empty_caption_ratio.value,0);

  const supportedCurrent=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentNoOmit));
  assert.ok(supportedCurrent.feed.applied_profile.language);
  assert.equal(supportedCurrent.context.current.language.empty_caption_ratio.value,0);

  const colors=[
    {hue_mean:0,sat_mean:0,bright_mean:0,palette_hex:['#000000']},
    {hue_mean:0,sat_mean:0,bright_mean:1,palette_hex:['#ffffff']},
    {hue_mean:300,sat_mean:1,bright_mean:0.5,palette_hex:['#ff00ff']}
  ];
  const photoOnlyPhotos=fixture.context.photos.map((photo,index)=>({...structuredClone(photo),color:colors[index],describable_facts:['같은 사실']}));
  const photoOnly=await buildFeed(orderInput({kind:'none'},{kind:'none'},photoOnlyPhotos));
  // #127: 사진만 올린 경로도 orderFeed 를 타므로 adjacent_overlap 은 사실 겹침이 아니라 측정 색 겹침이다
  // (지향 경로와 같은 정의). 위 세 색은 서로 멀기 때문에 1 이 아니다.
  assert.deepEqual(photoOnly.feed.slots.map(slot=>slot.caption_inputs.adjacent_overlap),[0,0.45,0.45]);
  assert.equal(photoOnly.feed.applied_profile.language,null);

  const explicitAll=await buildFeed(orderInput({kind:'text',text:'모든 사진에 문장을 써 줘'},currentPosts(['','기록'])));
  assert.equal(explicitAll.context.target.language.caption_coverage.value,'all');

  const allAndShort=await buildFeed(orderInput({kind:'text',text:'모든 사진에 짧게 써 줘'},currentPosts(['','기록'])));
  assert.equal(allAndShort.context.target.language.caption_coverage.value,'all');
  assert.equal(allAndShort.context.target.language.caption_len.value.p50,15);

  const unsupported=await buildFeed(orderInput({kind:'text',text:'캡션 없이 전부 사진만 보여 줘'},currentPosts(['','기록'])));
  assert.equal(unsupported.context.target.language,null);

  const detailed=await buildFeed(orderInput({kind:'text',text:'자세하게 기록해 줘'}));
  assert.equal(detailed.context.target.language.caption_len.value.p50,90);

  const smallRatio=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록','기록','기록','기록'])));
  assert.equal(smallRatio.context.current.language.empty_caption_ratio.value,0.2);

  const ignoredCurrent=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록'])));
  assert.equal(ignoredCurrent.context.current.language.empty_caption_ratio.value,0.5);
  assert.equal(ignoredCurrent.feed.applied_profile.disclosure,'target_only');

  // Account observations are preserved as context, without a quota.
  const fullSnapshot=structuredClone(referenceFixture);
  fullSnapshot.snapshot_id='ig_snapshot_zero_ratio';
  fullSnapshot.posts.forEach(post=>{post.caption='짧은 기록입니다.';});
  const zeroTarget=await extractFromReference('https://www.instagram.com/29cm/',{registry:{'29cm':fullSnapshot}});
  const zeroOrder=orderInput({kind:'reference',url:'https://www.instagram.com/29cm/'});
  const zeroCurrent=buildCurrentProfile();
  const zeroRatio={feed:composeFeed({photoAnalyses:zeroOrder.photos,targetProfile:zeroTarget,currentProfile:zeroCurrent,currentPhotoAnalyses:[],sessionId:zeroOrder.session_id}),
    context:{photos:zeroOrder.photos,current:zeroCurrent,target:zeroTarget,current_photos:[]}};
  assert.equal(zeroRatio.context.target.language.empty_caption_ratio.value,0);

  for(const [label,built] of [
    ['photo only',photoOnly],['explicit all captions',explicitAll],['all and short captions',allAndShort],
    ['observed zero-omission account',zeroRatio],['exact current',exactCurrent],['supported current',supportedCurrent],
    ['unsupported zero-caption intent',unsupported],['detailed captions',detailed],
    ['small ratio',smallRatio],['ignored current',ignoredCurrent]
  ]) {
    const provider=seedOutput(built.feed);
    assert.deepEqual(slotsOnly(await generateOutput(generatedInput(built),options(provider))),provider,label);
  }
});

test('client overlap cannot manufacture an omission',async()=>{
  const colors=[
    {hue_mean:0,sat_mean:0,bright_mean:1,palette_hex:['#ffffff']},
    {hue_mean:0,sat_mean:0,bright_mean:0.066,palette_hex:['#111111']},
    {hue_mean:180,sat_mean:1,bright_mean:0,palette_hex:['#000000']}
  ];
  const photos=fixture.context.photos.map((photo,index)=>({...structuredClone(photo),color:colors[index]}));
  const built=await buildFeed(orderInput({kind:'text',text:'짧게 기록해 줘'},currentPosts(['','기록']),photos));
  assert.deepEqual([...built.feed.slots].sort((a,b)=>a.position-b.position).map(slot=>slot.caption_inputs.adjacent_overlap),[0,0.533,0.667]);
  built.feed.slots.find(slot=>slot.position===2).caption_inputs.adjacent_overlap=1;
  const provider=seedOutput(built.feed);
  assert.deepEqual(slotsOnly(await generateOutput(generatedInput(built),options(provider))),provider);
});

test('existing omissions and single-slot generation are preserved',async()=>{
  const all=input();
  all.feed.slots[1].caption_inputs.adjacent_overlap=0.96;
  const already=output();
  assert.deepEqual(slotsOnly(await generateOutput(all,options(already))),already);

  const single=input('slot');
  single.feed.slots[0].caption_inputs.adjacent_overlap=0.96;
  const response={slot:structuredClone(fixture.output.slots[0])};
  assert.deepEqual(await generateOutput(single,options(response)),response);
});

test('invalid input, missing key and HTTP method fail without provider calls',async()=>{
  let calls=0;const noCalls={apiKey:'',fetchImpl:()=>{calls++;throw new Error('no network');}};
  for(const [req,status,code] of [
    [request({}),400,'INVALID_REQUEST'],[request(input()),503,'GENERATION_UNAVAILABLE'],
    [new Request('http://localhost/api/generate'),405,'METHOD_NOT_ALLOWED'],
    [new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(250001)}),413,'REQUEST_TOO_LARGE'],
    [new Request('http://localhost/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'}),400,'INVALID_REQUEST']
  ]) {
    const response=await handleGenerate(req,noCalls);assert.equal(response.status,status);
    const body=await response.json();validateErrorResponse(body);assert.equal(body.error.code,code);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(calls,0);
});

test('HTTP full/slot success uses the shared runtime contract without caching',async()=>{
  let posts=0;const fetchImpl=async(url,init)=>{
    if(url.includes('/models/'))return Response.json({id:'test-model'});
    posts++;const mode=JSON.parse(JSON.parse(init.body).messages[0].content[0].text).mode;
    return wire(mode==='all'?output():{slot:fixture.output.slots[0]});
  };
  for(const mode of ['all','slot','all']) {
    const response=await handleGenerate(request(input(mode)),{apiKey:'fake-key',fetchImpl});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(slotsOnly(await response.json()),mode==='all'?output():{slot:fixture.output.slots[0]});
  }
  assert.equal(posts,3);
});

test('timeout, malformed provider JSON and model contract violations use honest HTTP errors',async()=>{
  for(const [fetchImpl,code,status] of [
    [()=>new Promise(()=>{}),'MODEL_TIMEOUT',504],
    [async()=>new Response('bad'),'MODEL_JSON',502],
    [transport({output:{title:'two\nlines',slots:fixture.all_omitted.slots}}),'MODEL_CONTRACT',502],
    [transport({output:{title:'one',slots:[]}}),'MODEL_CONTRACT',502],
    [async()=>Response.json({error:'private-provider-secret'},{status:401}),'MODEL_HTTP',502]
  ]) {
    const response=await handleGenerate(request(input()),{apiKey:'fake-key',fetchImpl,timeoutMs:20});
    assert.equal(response.status,status);const body=await response.json();validateErrorResponse(body);
    assert.equal(body.error.code,code);assert.ok(!JSON.stringify(body).includes('private-provider-secret'));
  }
});

test('mode=all discloses the counted omissions, including zero, and never on a single slot',async()=>{
  // 비움 0개 — 모델이 전부 채운 회차. "못 했다"가 아니라 "판단했다"로 읽혀야 한다.
  const none=await generateOutput(input(),options(seedOutput()));
  assert.equal(none.output.slots.filter(slot=>slot.caption_state==='omitted').length,0);
  assert.deepEqual(none.omission,{
    omitted:0,total:3,note_key:'omission.none',
    note:'이번에는 3자리 모두에 쓸 거리를 제안했어요.',
    evidence:[{kind:'rule',ref:'gyeol.omit.disclosure',note:'생성 결과의 omitted 슬롯을 세어 0/3로 적었다'}]
  });
  for(const word of ['미완성','채워','아직','못']) assert.ok(!none.omission.note.includes(word),word);

  // 비움 3개 — 같은 코드·같은 입력, 모델 응답만 다른 회차.
  const some=await generateOutput(input(),options(output()));
  assert.deepEqual(some.omission,{
    omitted:3,total:3,note_key:'omission.some',
    note:'3자리 중 3자리는 사진만 두는 편이 낫다고 봤어요.',
    evidence:[{kind:'rule',ref:'gyeol.omit.disclosure',note:'생성 결과의 omitted 슬롯을 세어 3/3로 적었다'}]
  });
  assert.notDeepEqual(none.omission,some.omission);

  // mode=slot 은 피드 전체의 비움 개수를 관측할 수 없으므로 붙이지 않는다.
  assert.equal(Object.hasOwn(await generateOutput(input('slot'),options({slot:structuredClone(fixture.output.slots[0])})),'omission'),false);
});

test('caption_coverage=all keeps its own behaviour and still gets an accurate zero disclosure',async()=>{
  // #87 의 coverage 의도(입력)와 #80 의 비움 고지(출력)는 서로 다른 것이다.
  const all=await buildFeed(orderInput({kind:'text',text:'모든 사진에 문장을 써 줘'},currentPosts(['','기록'])));
  assert.equal(all.context.target.language.caption_coverage.value,'all');
  const disclosed=await generateOutput(generatedInput(all),options(seedOutput(all.feed)));
  assert.equal(disclosed.output.slots.filter(slot=>slot.caption_state==='omitted').length,0);
  assert.equal(disclosed.omission.note_key,'omission.none');
  assert.equal(disclosed.omission.omitted,0);
  assert.equal(disclosed.omission.total,all.feed.slots.length);

  // sparse is context for the model, not a server omission quota.
  const sparse=await buildFeed(orderInput({kind:'text',text:'몇 장에만 문장을 써 줘'}));
  assert.equal(sparse.context.target.language.caption_coverage.value,'sparse');
  const sparseDisclosed=await generateOutput(generatedInput(sparse),options(seedOutput(sparse.feed)));
  // The model returned only seeds, so the measured omission count is zero.
  assert.equal(sparseDisclosed.output.slots.filter(slot=>slot.caption_state==='omitted').length,0);
  assert.equal(sparseDisclosed.omission.omitted,0);
  assert.equal(sparseDisclosed.omission.note_key,'omission.none');
  assert.match(sparseDisclosed.omission.note,/3자리 모두/);
});

test('a generation response cannot claim an omission count it did not measure',async()=>{
  const {validateGenerateResponse}=await import('../lib/interaction.js');
  const req=input();
  const honest=await generateOutput(req,options(seedOutput()));
  validateGenerateResponse(honest,req);
  for(const patch of [{omitted:1},{total:15},{note_key:'omission.some'},{note:''},{evidence:[]},
    {evidence:[{kind:'rule',ref:'gyeol.omit.overlap',note:'wrong rule'}]}]) {
    assert.throws(()=>validateGenerateResponse({...honest,omission:{...honest.omission,...patch}},req),
      /omission/,JSON.stringify(patch));
  }
  assert.throws(()=>validateGenerateResponse({...honest,omission:{...honest.omission,extra:1}},req),/omission.extra/);
});

// #101 리뷰 회귀: 규칙이 프롬프트에만 있으면 아래 세 응답이 전부 성공으로 통과했다.
// 이제는 결과 경계에서 MODEL_CONTRACT 로 거부되어야 한다.
test('the result boundary rejects banned style words, ungrounded notes and caption-shaped text',async()=>{
  const banned=seedOutput();
  banned.output.slots[0].text='쓸 거리: 단색 카드 · synthetic 1 표기\n이 중 기억에 남은 건?'.replace('단색 카드','단색 카드, 또한 표기');
  await assert.rejects(generateOutput(input(),options(banned)),{code:'MODEL_CONTRACT'},'금지어 또한');

  const superlative=seedOutput();
  superlative.output.title='가을 브랜드 25곳, 최고의 추천';
  await assert.rejects(generateOutput(input(),options(superlative)),{code:'MODEL_CONTRACT'},'단정·최상급 제목');

  const note=seedOutput();
  note.output.slots[0].evidence[0].note='가을 감정과 방문 의도';
  await assert.rejects(generateOutput(input(),options(note)),{code:'MODEL_CONTRACT'},'사진 사실에 없는 근거 note');

  const summarized=seedOutput();
  summarized.output.slots[0].evidence[0].note='단색';
  await assert.rejects(generateOutput(input(),options(summarized)),{code:'MODEL_CONTRACT'},'요약된 근거 note');
});

test('seed text must stay a short hint the user finishes, never a finished caption',async()=>{
  const described=seedOutput();
  described.output.slots[0].text='단색 카드가 화면 가운데에 놓여 있다';
  await assert.rejects(generateOutput(input(),options(described)),{code:'MODEL_CONTRACT'},'설명문');

  const crowded=seedOutput();
  crowded.output.slots[0].text='쓸 거리: 단색 카드 · synthetic 1 표기 · 단색\n이 중 기억에 남은 건?';
  await assert.rejects(generateOutput(input(),options(crowded)),{code:'MODEL_CONTRACT'},'소재 3개');

  const blank=seedOutput();
  blank.output.slots[0].text='쓸 거리:  · 단색 카드\n이 중 기억에 남은 건?';
  await assert.rejects(generateOutput(input(),options(blank)),{code:'MODEL_CONTRACT'},'빈 소재');
});

test('an empty fact list uses one fixed note instead of an invented limitation sentence',async()=>{
  const blank=()=>{
    const value=input();
    value.feed.slots[0].caption_inputs.describable_facts=[];
    value.context.photos.find(photo=>photo.photo_id==='ph_01').describable_facts=[];
    return value;
  };
  const omitted=()=>{
    const value=output();
    value.output.slots[0].evidence=[{kind:'uploaded_photo',ref:'ph_01',note:NO_FACTS_NOTE}];
    return value;
  };
  assert.equal((await generateOutput(blank(),options(omitted()))).output.slots[0].evidence[0].note,NO_FACTS_NOTE);

  const invented=omitted();
  invented.output.slots[0].evidence[0].note='사진 속 묘사 가능한 사실이 부족합니다';
  await assert.rejects(generateOutput(blank(),options(invented)),{code:'MODEL_CONTRACT'});

  const stillSeed=seedOutput();
  stillSeed.output.slots[0].evidence[0].note=NO_FACTS_NOTE;
  await assert.rejects(generateOutput(input(),options(stillSeed)),{code:'MODEL_CONTRACT'},'사실이 있는데 한계 문구');
});

test('#147 free text without coverage preserves every grounded seed',async()=>{
  for(const text of ['짧게 조용하게','자세하게 기록처럼 촘촘히','차분한 느낌으로']) {
    const built=await buildFeed(orderInput({kind:'text',text}));
    assert.equal(built.context.target.language?.caption_coverage,undefined,text);
    const provider=seedOutput(built.feed);
    assert.deepEqual(slotsOnly(await generateOutput(generatedInput(built),options(provider))),provider,text);
  }
});

// #123: provider selects a fact; public evidence remains an exact server-owned quote.
const indexedSlot = (req, index=0) => ({
  ...seedOutput(req.feed).output.slots[0], fact_index:index, evidence:[]
});

test('#123 indexed all/slot responses compose evidence and preserve grounded hints',async()=>{
  for(const mode of ['all','slot']) {
    const req=input(mode);
    const response=mode==='all'?seedOutput(req.feed):{slot:indexedSlot(req)};
    const slots=mode==='all'?response.output.slots:[response.slot];
    for(const slot of slots) {
      slot.fact_index=0;slot.evidence=[];
    }
    const actual=await generateOutput(req,options(response));
    for(const slot of mode==='all'?actual.output.slots:[actual.slot]) {
      const fact=req.feed.slots.find(x=>x.photo_id===slot.photo_id).caption_inputs.describable_facts[0];
      assert.equal(slot.evidence.find(e=>e.ref===slot.photo_id).note,fact);
      if(slot.caption_state==='seed') assert.equal(slot.text,hint(fact));
      assert.equal(Object.hasOwn(slot,'fact_index'),false);
    }
  }
});

test('#123 explicit indices cannot bypass range checks through an already valid note',async()=>{
  const req=input('slot');
  for(const index of [-1,1.5,'0',null,req.feed.slots[0].caption_inputs.describable_facts.length]) {
    const slot={...seedOutput(req.feed).output.slots[0],fact_index:index};
    await assert.rejects(generateOutput(req,options({slot})),{code:'MODEL_CONTRACT'});
  }
});

test('#123 indexed hints preserve grounded phrases and still reject malformed or forbidden text',async()=>{
  const req=input('slot');
  const fact=req.feed.slots[0].caption_inputs.describable_facts[0];
  const short=fact.slice(0,3);
  const slot={...indexedSlot(req),text:hint(short)};
  assert.equal((await generateOutput(req,options({slot}))).slot.text,hint(short));
  for(const text of ['완성된 캡션',hint('또한 기록'),hint('밝기 0.712'),hint('a · b · c'),hint(' · a')]) {
    await assert.rejects(generateOutput(req,options({slot:{...indexedSlot(req),text}})),{code:'MODEL_CONTRACT'});
  }
});

test('#123 indexed responses reject foreign, duplicate, unobserved, and malformed evidence',async()=>{
  const req=input('slot');
  const own={kind:'uploaded_photo',ref:'ph_01',note:req.feed.slots[0].caption_inputs.describable_facts[0]};
  for(const evidence of [[{...own,ref:'ph_02'}],[own,own],[{kind:'rule',ref:'',note:''}],
    [{...own,note:'관측하지 않은 문장'}],[{kind:'rule',ref:'gyeol.omit.overlap',note:42}],
    [{kind:'rule',ref:'gyeol.omit.overlap',note:'caption_inputs'}]]) {
    await assert.rejects(generateOutput(req,options({slot:{...indexedSlot(req),evidence}})),{code:'MODEL_CONTRACT'});
  }
  const actual=await generateOutput(req,options({slot:{...indexedSlot(req),evidence:[{kind:'rule',ref:'gyeol.omit.overlap',note:' '}]}}));
  assert.deepEqual(actual.slot.evidence,[own]);
});

test('#123 empty facts permit only omission with the fixed server note',async()=>{
  const req=input('slot');
  req.feed.slots[0].caption_inputs.describable_facts=[];
  req.context.photos.find(p=>p.photo_id==='ph_01').describable_facts=[];
  const slot={...fixture.all_omitted.slots[0],fact_index:0,evidence:[]};
  const actual=await generateOutput(req,options({slot}));
  assert.equal(actual.slot.evidence[0].note,NO_FACTS_NOTE);
  for(const patch of [{fact_index:1},{caption_state:'seed',text:hint('무언가'),omit_reason:null},
    {evidence:[{kind:'uploaded_photo',ref:'ph_01',note:'새로 지어낸 한계'}]}]) {
    await assert.rejects(generateOutput(req,options({slot:{...slot,...patch}})),{code:'MODEL_CONTRACT'});
  }
});

test('#123 malformed photo evidence is rejected before canonical replacement',async()=>{
  const req=input('slot');
  for(const note of [null,42,{},'', ' ']) {
    const slot={...indexedSlot(req),evidence:[{kind:'uploaded_photo',ref:'ph_01',note}]};
    await assert.rejects(generateOutput(req,options({slot})),{code:'MODEL_CONTRACT'});
  }
});

test('#123 provider schema requires a fact index but public all/slot responses never expose it',async()=>{
  for(const mode of ['all','slot']) {
    const req=input(mode);
    const provider=mode==='all'?seedOutput(req.feed):{slot:indexedSlot(req)};
    for(const slot of mode==='all'?provider.output.slots:[provider.slot]) {
      const facts=req.feed.slots.find(s=>s.photo_id===slot.photo_id).caption_inputs.describable_facts;
      slot.fact_index=facts.length-1;slot.evidence=[];slot.text=hint(facts.at(-1));
    }
    const seen=[];
    const response=await handleGenerate(request(req),{apiKey:'fake-key',fetchImpl:transport(provider,seen)});
    assert.equal(response.status,200);
    const actual=await response.json();
    const schema=JSON.parse(seen[1].options.body).output_config.format.schema;
    const modelSlot=mode==='all'?schema.properties.output.properties.slots.items:schema.properties.slot;
    assert.ok(modelSlot.required.includes('fact_index'));
    assert.equal(modelSlot.properties.fact_index.type,'integer');
    assert.deepEqual(modelSlot.properties.evidence.items.properties.kind.enum,['rule'],
      'provider schema must reserve canonical photo notes for the server');
    for(const slot of mode==='all'?actual.output.slots:[actual.slot]) {
      const facts=req.feed.slots.find(s=>s.photo_id===slot.photo_id).caption_inputs.describable_facts;
      assert.equal(slot.evidence[0].note,facts.at(-1));
      assert.equal(Object.hasOwn(slot,'fact_index'),false);
    }
  }
});

test('#123 mocked 3/15-photo HTTP generation preserves identities and canonical evidence',async()=>{
  for(const count of [3,15]) {
    const photos=Array.from({length:count},(_,index)=>structuredClone(fixture.context.photos[index%3]));
    const built=await buildFeed(orderInput({kind:'text',text:'모든 사진에 짧게 써 줘'},{kind:'none'},photos));
    const req=generatedInput(built);
    const provider=seedOutput(built.feed);
    for(const slot of provider.output.slots) {
      slot.fact_index=0;slot.evidence=[];
    }
    const response=await handleGenerate(request(req),options(provider));
    assert.equal(response.status,200);
    const actual=await response.json();
    assert.equal(actual.output.slots.length,count);
    assert.deepEqual(actual.output.slots.map(s=>s.photo_id),built.feed.slots.map(s=>s.photo_id));
    for(const [index,slot] of actual.output.slots.entries()) {
      assert.equal(slot.position,built.feed.slots[index].position);
      assert.deepEqual(slot.evidence[0],{kind:'uploaded_photo',ref:slot.photo_id,
        note:built.feed.slots[index].caption_inputs.describable_facts[0]});
    }
  }
});


test('#123 selecting evidence never replaces a hint with a long observation',async()=>{
  const req=input('slot');
  const facts=['그 사람은 하늘색 단추 달린 카디건과 흰 상의, 회색 통이 넓은 바지를 입고 있다','흰 화분에 초록 잎이 보인다'];
  req.feed.slots[0].caption_inputs.describable_facts=facts;
  req.context.photos.find(p=>p.photo_id==='ph_01').describable_facts=facts;
  const slot={...indexedSlot(req),text:hint('하늘색 단추 달린 카디건')};
  const actual=await generateOutput(req,options({slot}));
  assert.equal(actual.slot.text,slot.text);
  assert.equal(actual.slot.evidence[0].note,facts[0]);
  for(const patch of [{text:hint('하늘빛 카디건')},{fact_index:1}]) {
    await assert.rejects(generateOutput(req,options({slot:{...slot,...patch}})),{code:'MODEL_CONTRACT'});
  }
});

// ADR-0008 / #147: omission is an observed result, never a minimum quota.
test('#147 all grounded seeds survive at 3 and 15 photos, including sparse intent',async()=>{
  for(const count of [3,15]) for(const target of [{kind:'none'},{kind:'text',text:'몇 장에만 문장을 써 줘'}]) {
    const photos=Array.from({length:count},(_,i)=>structuredClone(fixture.context.photos[i%3]));
    const built=await buildFeed(orderInput(target,{kind:'none'},photos));
    const provider=seedOutput(built.feed);
    const actual=await generateOutput(generatedInput(built),options(provider));
    assert.deepEqual(actual.output,provider.output);
    assert.equal(actual.omission.omitted,0);
    assert.equal(actual.omission.total,count);
    assert.deepEqual(actual.output.slots.map(s=>s.photo_id),built.feed.slots.map(s=>s.photo_id));
    assert.deepEqual(actual.output.slots.map(s=>s.position),built.feed.slots.map(s=>s.position));
  }
});

test('#147 model cannot supply its own count or disclosure prose',async()=>{
  const canonical=(await generateOutput(input(),options(seedOutput()))).omission;
  for(const omission of [canonical,null,{omitted:0,total:3,note_key:'omission.none',
    note:'3자리 모두 비웠어요.',evidence:[{kind:'rule',ref:'gyeol.omit.disclosure',note:'invented count'}]}]) {
    await assert.rejects(generateOutput(input(),options({...seedOutput(),omission})),{code:'MODEL_CONTRACT'});
  }
});


test('#147 genuine model omissions retain evidence and exact 3/15-photo counts',async()=>{
  for(const count of [3,15]) {
    const photos=Array.from({length:count},(_,i)=>structuredClone(fixture.context.photos[i%3]));
    const built=await buildFeed(orderInput({kind:'text',text:'모든 사진에 문장을 써 줘'},{kind:'none'},photos));
    const req=generatedInput(built);
    const provider=seedOutput(built.feed);
    const omitted=provider.output.slots[1];
    Object.assign(omitted,{caption_state:'omitted',text:null,omit_reason:'같은 소재가 반복되어 사진만 두는 편을 제안해요.'});
    omitted.evidence.push({kind:'rule',ref:'gyeol.omit.overlap',note:'관측한 같은 소재의 반복을 근거로 제안했다'});
    const actual=await generateOutput(req,options(provider));
    assert.deepEqual(actual.output,provider.output);
    assert.equal(actual.omission.omitted,1);
    assert.equal(actual.omission.total,count);
    assert.equal(actual.omission.note,`${count}자리 중 1자리는 사진만 두는 편이 낫다고 봤어요.`);
    assert.equal(actual.omission.evidence[0].note,`생성 결과의 omitted 슬롯을 세어 1/${count}로 적었다`);
    assert.equal(actual.output.slots.length,count);
    const indexed=structuredClone(provider);
    indexed.output.slots[1].fact_index=0;
    indexed.output.slots[1].evidence=indexed.output.slots[1].evidence.filter(e=>e.kind!=='uploaded_photo');
    assert.deepEqual((await generateOutput(req,options(indexed))).output,provider.output);
  }
});

test('#147 disclosure notes and evidence reject forgery while missing legacy metadata remains valid',async()=>{
  const {validateGenerateResponse}=await import('../lib/interaction.js');
  const req=input();
  const honest=await generateOutput(req,options(seedOutput()));
  assert.doesNotThrow(()=>validateGenerateResponse({output:honest.output},req));
  for(const patch of [
    {note:'3자리 모두 비웠어요.'},
    {evidence:[{kind:'rule',ref:'gyeol.omit.disclosure',note:'생성 결과의 omitted 슬롯을 세어 3/3로 적었다'}]},
    {evidence:[{kind:'rule',ref:'gyeol.omit.disclosure'}]},
    {evidence:[...honest.omission.evidence,{kind:'rule',ref:'gyeol.omit.disclosure',note:'invented'}]},
    {evidence:[{...honest.omission.evidence[0],extra:true}]}
  ]) assert.throws(()=>validateGenerateResponse({...honest,omission:{...honest.omission,...patch}},req),/omission/);
  const stale=structuredClone(honest);
  stale.output.slots[0]={...output().output.slots[0]};
  assert.throws(()=>validateGenerateResponse(stale,req),/omission.omitted/);
  delete stale.omission;
  assert.doesNotThrow(()=>validateGenerateResponse(stale,req));
});

// Formatting repair must not relax the selected-fact boundary.
test('#123 repairs an escaped hint line break but still rejects invented seeds',async()=>{
  const req=input('slot');
  const slot=indexedSlot(req);
  slot.text=slot.text.replace('\n','\\n');
  const actual=await generateOutput(req,options({slot}));
  assert.equal(actual.slot.text,indexedSlot(req).text);
  slot.text='쓸 거리: 관측하지 않은 우주선\\n이 중 기억에 남은 건?';
  await assert.rejects(generateOutput(req,options({slot})),{code:'MODEL_CONTRACT'});
});

test('#123 retries a rejected hint selection once and validates the fresh result',async()=>{
  const req=input('slot');
  let calls=0;
  const fetchImpl=async(url,options)=>{
    if(url.includes('/models/')) return transport({})(url,options);
    calls++;
    const slot=indexedSlot(req);
    if(calls===1) slot.text=hint('관측하지 않은 우주선');
    else assert.match(JSON.parse(options.body).system,/이전 응답은/);
    return wire({slot});
  };
  const actual=await generateOutput(req,{apiKey:'fake-key',fetchImpl});
  assert.equal(calls,2);
  assert.equal(actual.slot.text,indexedSlot(req).text);
  let rejectedCalls=0;
  const invalid={slot:{...indexedSlot(req),text:hint('관측하지 않은 우주선')}};
  await assert.rejects(generateOutput(req,{apiKey:'fake-key',fetchImpl:async(...args)=>{
    if(args[0].endsWith('/messages')) rejectedCalls++;
    return transport(invalid)(...args);
  }}),{code:'MODEL_CONTRACT'});
  assert.equal(rejectedCalls,2);
});

test('#123 invented indexed photo notes fail immediately without a repair call',async()=>{
  const req=input('slot');
  const slot={...indexedSlot(req),evidence:[{kind:'uploaded_photo',ref:'ph_01',note:'관측하지 않은 우주선'}]};
  const seen=[];
  await assert.rejects(generateOutput(req,{apiKey:'fake-key',fetchImpl:transport({slot},seen)}),{code:'MODEL_CONTRACT'});
  assert.equal(seen.filter(call=>call.url.endsWith('/messages')).length,1);
});

test('#123 exhausted shared deadline prevents a second selection request',async(t)=>{
  let now=0;
  t.mock.method(performance,'now',()=>now);
  const req=input('slot');
  const invalid={slot:{...indexedSlot(req),text:hint('관측하지 않은 우주선')}};
  let calls=0;
  const fetchImpl=async(...args)=>{
    if(args[0].endsWith('/messages')) { calls++; now=101; }
    return transport(invalid)(...args);
  };
  await assert.rejects(generateOutput(req,{apiKey:'fake-key',fetchImpl,timeoutMs:100}),{code:'MODEL_TIMEOUT'});
  assert.equal(calls,1);
});

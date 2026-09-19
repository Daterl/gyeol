// Usage: node scripts/holdout-similar-omission.js /path/to/pivot/apify-check/fixtures/images
// #97 A — 독립 holdout 검증. 0.40 을 고른 표본과 0.40 을 확인하는 표본을 분리한다.
//
// 왜 필요한가: report 3·4절은 같은 291장에서 descriptor 선택·최솟값 확인·임계값 선정·육안 대조를 전부 했다.
// 그 숫자는 "이 표본에서 관측했다" 이지 "처음 보는 사진에서도 그렇다" 가 아니다.
//
// 무엇을 하는가: 게시물을 이름 해시로 두 겹(fold)으로 가르고, 각 겹마다
//   1) dev 쪽에서만 report 4절의 선정 절차를 그대로 다시 돌려 임계값을 구하고 (min(cross) × 0.725, 소수 2자리)
//   2) 그 임계값을 **한 번도 보지 않은** holdout 쪽 쌍에만 적용해 다른 게시물 오탐을 센다.
// dev 는 홀드아웃의 사진을 한 장도 보지 않는다. 외부 모델 호출 0회, 원본 사진은 읽기만 한다.
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {measureJpeg} from '../lib/photo_analysis.js';
import {SIMILAR_DISTANCE} from '../lib/omit-suggestion.js';
import {signatureDistance} from '../lib/photo_signature.js';

const imageRoot=process.argv[2];
if(!imageRoot) throw new Error('실사진 images 디렉터리를 인수로 지정하세요.');

// report 4절이 실제로 쓴 절차: 관측된 다른 게시물 최솟값에서 27% 여유를 두고 소수 2자리로 내린다.
// (0.5515 × 0.725 = 0.3998 → 0.40). 임의 여유이지 신뢰 구간이 아니다 — 여기서는 그 절차를
// dev 쪽에서만 그대로 재실행해 "표본이 바뀌면 이 절차가 무엇을 내놓는가" 를 본다.
const MARGIN=0.725;
const deriveThreshold=minCross=>Number((Math.floor(minCross*MARGIN*100)/100).toFixed(2));

const files=(await readdir(imageRoot)).filter(f=>f.endsWith('.jpg')).sort();
const seen=new Set(),signed=[];
for(const file of files) {
  const bytes=await readFile(resolve(imageRoot,file));
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(seen.has(sha)) continue;
  seen.add(sha);
  const measured=measureJpeg(bytes);
  if(!measured?.structure_signature) continue;
  signed.push({file,post:file.replace(/^[^_]+_/,'').replace(/_\d+\.jpg$/,''),signature:measured.structure_signature});
}

// 게시물 이름 해시로 가른다. 결과를 보고 고른 분할이 아니어야 holdout 이 holdout 이다.
const posts=[...new Set(signed.map(p=>p.post))].sort();
const fold=new Map(posts.map(post=>[post,createHash('sha256').update(post).digest()[0]%2]));

const pairsOf=list=>{
  const same=[],cross=[];
  for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
    const distance=signatureDistance(list[i].signature,list[j].signature);
    if(distance===null) continue;
    (list[i].post===list[j].post?same:cross).push({distance,a:list[i],b:list[j]});
  }
  same.sort((x,y)=>x.distance-y.distance); cross.sort((x,y)=>x.distance-y.distance);
  return {same,cross};
};
const below=(list,t)=>list.filter(p=>p.distance<t);
const show=p=>({distance:p.distance,a:p.a.file,b:p.b.file});

const folds=[0,1].map(holdoutFold=>{
  const dev=signed.filter(p=>fold.get(p.post)!==holdoutFold);
  const holdout=signed.filter(p=>fold.get(p.post)===holdoutFold);
  const devPairs=pairsOf(dev),holdoutPairs=pairsOf(holdout);
  const derived=deriveThreshold(devPairs.cross[0].distance);
  return {
    holdout_fold:holdoutFold,
    dev:{posts:new Set(dev.map(p=>p.post)).size,photos:dev.length,
      cross_post_pairs:devPairs.cross.length,min_cross_post:devPairs.cross[0].distance,derived_threshold:derived},
    holdout:{posts:new Set(holdout.map(p=>p.post)).size,photos:holdout.length,
      same_post_pairs:holdoutPairs.same.length,cross_post_pairs:holdoutPairs.cross.length,
      min_cross_post:holdoutPairs.cross[0]?.distance??null,
      // 이것이 이 스크립트의 답이다: dev 가 고른 기준을 처음 보는 사진에 적용했을 때 다른 게시물이 몇 쌍 걸리는가.
      cross_post_below_derived:below(holdoutPairs.cross,derived).length,
      cross_post_below_shipped:below(holdoutPairs.cross,SIMILAR_DISTANCE).length,
      same_post_below_derived:below(holdoutPairs.same,derived).length,
      same_post_below_shipped:below(holdoutPairs.same,SIMILAR_DISTANCE).length,
      // 육안 대조 대상. 파일명을 그대로 낸다 — 사람이 열어서 판정할 수 있어야 증거다.
      positives_below_shipped:below(holdoutPairs.same,SIMILAR_DISTANCE).map(show),
      false_positives_below_shipped:below(holdoutPairs.cross,SIMILAR_DISTANCE).map(show),
      nearest_cross_post:holdoutPairs.cross.slice(0,3).map(show)}
  };
});

console.log(JSON.stringify({verified_at:new Date().toISOString(),shipped_threshold:SIMILAR_DISTANCE,margin:MARGIN,
  corpus:{files:files.length,unique_with_signature:signed.length,posts:posts.length},
  split:{method:'sha256(post_id)[0] % 2',fold_sizes:[0,1].map(f=>posts.filter(p=>fold.get(p)===f).length)},
  folds,
  limitations:[
    'holdout 게시물은 같은 두 계정에서 왔다. 게시물 간 일반화이지 사용자 간 일반화가 아니다',
    '"같은 게시물"은 사람이 붙인 유사 라벨이 아니다. 양성/오탐은 파일명을 열어 사람이 판정해야 한다',
    'descriptor(8x8 밝기 · z-score) 자체는 전체 표본을 보고 골랐다. 이 검증은 임계값의 일반화만 본다',
    '외부 모델 호출 0회. HTTP/배포 검증이 아니다']},null,2));

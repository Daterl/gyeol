// Runtime checks live in lib/contracts.js and lib/interaction.js (#24).
export type Evidence = {
  kind: 'ig_post' | 'uploaded_photo' | 'user_text' | 'aggregate' | 'rule';
  note: string;
  ref: string;
};
export type Claim<T> = { confidence: number; evidence: Evidence[]; value: T };
export type Color = {
  bright_mean: number;
  hue_mean: number;
  palette_hex: string[];
  sat_mean: number;
};
export type Visual = {
  composition_mix?: Claim<{ full_frame: number; negative_space: number }>;
  palette?: Claim<Color>;
  scale_mix?: Claim<{ closeup: number; fullshot: number; midshot: number }>;
  subjects?: Claim<string[]>;
  tone_words?: Claim<string[]>;
};
export type Language = {
  banned_words: string[];
  caption_coverage?: Claim<'all' | 'sparse'>;
  caption_len?: Claim<{ p50: number; p90: number; unit: '자' }>;
  emoji_rate?: Claim<number>;
  empty_caption_ratio?: Claim<number>;
  ending_style?: Claim<'해요' | '다' | '명사형' | '혼합'>;
  linebreak_habit?: Claim<'없음' | '짧게 자주' | '문단'>;
};
export type Sequence = {
  carousel_count: number;
  opener_tendency?: Claim<'풀샷' | '클로즈업' | '인물' | '불명'>;
};
export type Profile = {
  account_scope: 'main' | 'sub' | 'n/a';
  axis: 'current' | 'target';
  completeness: { language: number; sequence: number; visual: number };
  created_at: string;
  language: Language | null;
  present: boolean;
  profile_id: string | null;
  raw_freetext: string | null;
  sample_size: number;
  schema_version: '1.0';
  sequence: Partial<Sequence>;
  source:
    | 'none'
    | 'ig_reference'
    | 'freetext'
    | 'instagram_api'
    | 'cached'
    | 'photo_upload';
  visual: Visual;
};
export type PhotoPlan = {
  completeness: { language: 0; sequence: 0; visual: number };
  created_at: string;
  disclaimer: string;
  kind: 'photo_plan';
  language: null;
  plan_id: string;
  sample_size: number;
  schema_version: '1.0';
  sequence: { carousel_count: 0 };
  source: 'photo_only';
  target_profile: null;
  visual: Visual;
};
export type PhotoAnalysis = {
  analysis_receipt?: string;
  analysis_source: 'vision_model' | 'heuristic';
  analyzed_at: string;
  color: Color;
  composition: 'full_frame' | 'negative_space';
  describable_facts: string[];
  file_ref: string;
  has_face: boolean;
  input_index: number;
  model: string;
  photo_id: string;
  quality_flags: string[];
  scale: 'closeup' | 'midshot' | 'fullshot';
  schema_version: '1.0';
  subjects: string[];
  text_in_image: string | null;
};
export type AppliedProfile = {
  corrected: boolean;
  current_profile_id: string | null;
  deltas: {
    current: number;
    evidence: Evidence[];
    field: 'language.caption_len.p50';
    note_key: 'caption_len_gap';
    resolved: number;
    rule: 'log_midpoint';
    target: number;
  }[];
  disclosure: 'target_only' | 'corrected';
  language: Language | null;
  photo_plan_id?: string;
  sequence: Sequence;
  target_profile_id: string | null;
  visual: Visual;
};
export type OmitSuggestion =
  | { recommended: false; reason: null; evidence: [] }
  | { recommended: true; reason: string; evidence: Evidence[] };
export type OmitSummary = {
  recommended_count: number;
  message: string;
};
export type OrderedFeed = {
  applied_profile: AppliedProfile;
  feed_id: string;
  // Optional for legacy feeds without the additive suggestion extension.
  omit_summary?: OmitSummary;
  generated_at: string;
  invariants: {
    input_count: number;
    output_count: number;
    unique_photo_ids: true;
  };
  schema_version: '1.0' | '1.1';
  session_id: string;
  slots: {
    caption_inputs: {
      adjacent_overlap: number;
      describable_facts: string[];
      is_visual_peak: boolean;
    };
    narrative_role: 'opener' | 'sustain' | 'turn' | 'closer';
    omit_suggestion?: OmitSuggestion;
    photo_id: string;
    position: number;
    rationale: Claim<string>;
  }[];
};
export type CaptionSlot = {
  evidence: Evidence[];
  photo_id: string;
  position: number;
} & (
  | { caption_state: 'filled' | 'user'; omit_reason: null; text: string }
  | { caption_state: 'omitted'; omit_reason: string; text: null }
);
export type F3Export = { slots: CaptionSlot[]; title: string };
export type FeedResponse = {
  context: {
    current: Profile;
    current_photos: PhotoAnalysis[];
    photos: PhotoAnalysis[];
    target: Profile | PhotoPlan;
  };
  feed: OrderedFeed;
};
type Reference = { kind: 'reference'; url: string };
export type Identity = {
  current:
    | { kind: 'none' }
    | Reference
    | { captions?: string[]; kind: 'posts'; photos: PhotoAnalysis[] };
  target: { kind: 'none' } | Reference | { kind: 'text'; text: string };
};
export type OrderRequest = {
  identity: Identity;
  photos: PhotoAnalysis[];
  schema_version: '1.0';
  session_id: string;
};
export type GenerateRequest = FeedResponse & { schema_version: '1.0' } & (
    | { mode: 'all' }
    | { mode: 'slot'; photo_id: string }
  );
export type Omission = {
  evidence: Evidence[];
  note: string;
  note_key: 'omission.none' | 'omission.some';
  omitted: number;
  total: number;
};
export type GenerateResponse =
  | { omission?: Omission; output: F3Export }
  | { slot: CaptionSlot };
export type UploadRequest = {
  collection: 'selected' | 'current';
  file_ref: string;
  image_base64: string;
  input_index: number;
  media_type: 'image/jpeg' | 'image/png' | 'image/webp';
  photo_id: string;
  schema_version: '1.0';
  session_id: string;
};

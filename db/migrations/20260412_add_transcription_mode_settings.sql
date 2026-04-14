alter table user_ai_config
  add column if not exists transcription_mode text not null default 'standard_batch',
  add column if not exists live_transcription_language text not null default 'en-US';

alter table user_ai_config
  add constraint if not exists user_ai_config_transcription_mode_check
  check (transcription_mode in ('standard_batch', 'live_azure'));

-- Safe policy rollback / maintenance mode. READ-ONLY UI must be deployed with this.
-- Keep all data, Parent INSERT hardening, finality triggers and legacy RPC revocations.
-- Do NOT regrant the old mutable RPCs: doing so would reopen finalized responses.
begin;
drop function if exists public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text);
notify pgrst,'reload schema';
commit;

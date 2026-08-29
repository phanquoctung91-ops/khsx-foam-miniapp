create index if not exists khsx_account_audit_actor_user_id_idx
  on public.khsx_account_audit(actor_user_id)
  where actor_user_id is not null;

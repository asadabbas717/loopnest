begin;

-- A friend is an accepted conversation peer. This exposes no user directory,
-- presence timestamps, or information about who has blocked the caller.
create function public.friend_connections(list_kind text, after_username text default null)
returns table(user_id uuid,username text,display_name text,conversation_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid();
begin
  if not private.account_enabled(actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  if list_kind not in ('active','blocked') or list_kind is null then raise exception 'Invalid friends filter'; end if;
  if after_username is not null and after_username!~'^[a-z][a-z0-9_]{2,23}$' then raise exception 'Invalid friends cursor'; end if;
  return query select p.id,p.username,p.display_name,c.id
    from public.conversations c join public.profiles p
      on p.id=case when c.initiator=actor then c.recipient else c.initiator end
    where actor in(c.initiator,c.recipient)
      and (after_username is null or p.username>after_username)
      and ((list_kind='active' and c.status='accepted' and not private.is_blocked(actor,p.id))
        or (list_kind='blocked' and exists(select 1 from public.blocks b where b.blocker=actor and b.blocked=p.id)))
    order by p.username limit 50;
end;
$$;

create function public.set_user_block(peer uuid,blocked boolean,expected_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or expected_actor is distinct from actor then raise exception 'Session changed' using errcode='42501'; end if;
  perform 1 from public.profiles where id=actor for update;
  if not private.account_enabled(actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  if peer is null or peer=actor or blocked is null then raise exception 'Connection unavailable'; end if;
  if blocked then
    if not exists(select 1 from public.conversations where actor in(initiator,recipient) and peer in(initiator,recipient)) then
      raise exception 'Connection unavailable'; end if;
    insert into public.blocks(blocker,blocked) values(actor,peer) on conflict do nothing;
  else
    -- Removing your block never removes a block owned by the other participant.
    delete from public.blocks where blocker=actor and public.blocks.blocked=peer;
  end if;
end;
$$;
revoke all on function public.friend_connections(text,text),public.set_user_block(uuid,boolean,uuid) from public,anon;
grant execute on function public.friend_connections(text,text),public.set_user_block(uuid,boolean,uuid) to authenticated;
commit;

-- Phase 3a: add escrow enum value (must commit before use in PG)
set search_path to public, extensions, auth;

alter type public.escrow_status add value if not exists 'released_to_traveler';

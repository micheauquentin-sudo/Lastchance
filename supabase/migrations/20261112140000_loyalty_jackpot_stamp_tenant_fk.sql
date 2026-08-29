-- La provenance Passeport d'une entree Jackpot doit appartenir au meme tenant.
-- La contrainte initiale protegeait l'existence du tampon, pas son organisation.
-- Le SET NULL cible conserve le registre de tirage lors de la purge RGPD.

alter table public.loyalty_stamps
  add constraint loyalty_stamps_id_organization_key unique (id, organization_id);

alter table public.jackpot_participants
  drop constraint jackpot_participants_loyalty_stamp_id_fkey;

alter table public.jackpot_participants
  add constraint jackpot_participants_loyalty_stamp_organization_fkey
    foreign key (loyalty_stamp_id, organization_id)
    references public.loyalty_stamps (id, organization_id)
    on delete set null (loyalty_stamp_id);

-- Name: cleanup_owner_contacts(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.cleanup_owner_contacts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM public."Contact"
    WHERE "ownerType" = TG_ARGV[0]
      AND "ownerId" = OLD.id;
    RETURN OLD;
END;
$$;

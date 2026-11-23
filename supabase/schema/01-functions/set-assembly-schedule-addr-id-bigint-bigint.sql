-- Name: set_assembly_schedule_addr_id(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_assembly_schedule_addr_id(p_schedule_id bigint, p_addr_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "AssemblySchedule"
    SET "addrId" = p_addr_id,
        "updatedAt" = now()
    WHERE id = p_schedule_id;

    RETURN FOUND;
END;
$$;

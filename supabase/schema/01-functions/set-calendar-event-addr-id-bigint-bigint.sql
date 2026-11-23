-- Name: set_calendar_event_addr_id(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.set_calendar_event_addr_id(p_event_id bigint, p_addr_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "CalendarEvent"
    SET "addrId" = p_addr_id,
        "updatedAt" = now()
    WHERE id = p_event_id;

    RETURN FOUND;
END;
$$;

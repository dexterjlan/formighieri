-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -

--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_role text;
    v_email text;
    v_domain text;
    v_is_third_party boolean;
BEGIN
    v_email := COALESCE(NEW.email, '');
    v_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
    v_domain := lower(split_part(btrim(v_email), '@', 2));
    v_is_third_party := v_role IS DISTINCT FROM 'Admin'
        AND v_domain <> ''
        AND v_domain NOT IN ('formighierimoveis.com.br', 'formighierimadeiras.com.br');

    INSERT INTO public."appUsers" ("authId", email, name, role, "isActive", "passwordHash", "isThirdParty")
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        v_role,
        true,
        NULL,
        v_is_third_party
    )
    ON CONFLICT ("authId") DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public."appUsers".name),
        role = COALESCE(NULLIF(EXCLUDED.role, ''), public."appUsers".role);

    RETURN NEW;
EXCEPTION
    WHEN others THEN
        RAISE EXCEPTION 'Falha ao criar perfil em appUsers: %', SQLERRM;
END;
$$;

--
-- PostgreSQL database dump
--

\restrict ZgxE1i14htj14mwVyURupAK6Tqn55MH387PqeGAguLeEbdAfzvVtiTTe8aHgoFf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: RevisionRecordStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RevisionRecordStatus" AS ENUM (
    'open',
    'closed'
);


--
-- Name: RevisionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RevisionType" AS ENUM (
    'commercial_technical',
    'commercial_commercial',
    'third_party',
    'technical_reviewer'
);


--
-- Name: activity_log_order_project_substatus_kind_label(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_log_order_project_substatus_kind_label(p_kind text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE p_kind
        WHEN 'AwaitingRequest' THEN 'Aguardando Requisição'
        WHEN 'InternalAssemblyAwaiting' THEN 'Aguardando'
        WHEN 'InternalAssemblyPainting' THEN 'Pintura'
        WHEN 'InternalAssemblyMetalwork' THEN 'Serralheria'
        WHEN 'InternalAssemblyUpholstery' THEN 'Estofado'
        WHEN 'InternalAssemblyGlass' THEN 'Vidros'
        WHEN 'InternalAssemblyAwaitingHardware' THEN 'Aguardando Ferragens'
        ELSE COALESCE(NULLIF(trim(p_kind), ''), 'Substatus')
    END;
$$;


--
-- Name: activity_log_value_json(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_log_value_json(p_raw jsonb, p_display text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT jsonb_build_object(
        'raw', p_raw,
        'display', COALESCE(NULLIF(trim(p_display), ''), p_raw #>> '{}')
    );
$$;


--
-- Name: allocate_aggregator_order_project_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_aggregator_order_project_code() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT nextval('public."OrderProjectAggregatorCode_seq"')::text;
$$;


--
-- Name: append_activity_log(text, bigint, text, text, jsonb, jsonb, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_activity_log(p_entity_type text, p_entity_id bigint, p_action text, p_field_name text DEFAULT NULL::text, p_previous_value jsonb DEFAULT NULL::jsonb, p_new_value jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id bigint;
BEGIN
    SELECT u.id INTO v_user_id
    FROM public."appUsers" u
    WHERE u."authId" = auth.uid()
    LIMIT 1;

    RETURN public.insert_activity_log_row(
        p_entity_type,
        p_entity_id,
        p_action,
        p_field_name,
        p_previous_value,
        p_new_value,
        v_user_id,
        p_metadata,
        p_order_project_id,
        p_order_id
    );
END;
$$;


--
-- Name: append_assistance_request_status_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_assistance_request_status_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    last_changed_at timestamptz;
    duration_seconds bigint;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."AssistanceRequestStatusHistory" (
            "assistanceRequestId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById"
        ) VALUES (
            NEW.id,
            NULL,
            NEW.status,
            COALESCE(NEW."createdAt", now()),
            NEW."createdById"
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    SELECT h."changedAt"
    INTO last_changed_at
    FROM public."AssistanceRequestStatusHistory" h
    WHERE h."assistanceRequestId" = NEW.id
    ORDER BY h."changedAt" DESC, h.id DESC
    LIMIT 1;

    duration_seconds := NULL;
    IF last_changed_at IS NOT NULL THEN
        duration_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (now() - last_changed_at)))::bigint
        );
    END IF;

    INSERT INTO public."AssistanceRequestStatusHistory" (
        "assistanceRequestId",
        "previousStatus",
        "newStatus",
        "changedById",
        "previousStatusDurationSeconds"
    ) VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        NEW."updatedById",
        duration_seconds
    );

    RETURN NEW;
END;
$$;


--
-- Name: canReadCommercialCommissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."canReadCommercialCommissions"() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u."isActive" IS DISTINCT FROM false
          AND (
              u.role = 'Admin'
              OR u.role = 'Consultor'
              OR u."isCommercialManager" = true
          )
    );
$$;


--
-- Name: can_manage_commercial_finance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_commercial_finance() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u."isActive" = true
          AND (
              u.role = 'Admin'
              OR (u.role = 'Consultor' AND u."isCommercialManager" = true)
          )
    );
$$;


--
-- Name: FUNCTION can_manage_commercial_finance(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_manage_commercial_finance() IS 'Admin ou gestor comercial (Consultor + isCommercialManager) para Comercial Financeiro.';


--
-- Name: can_manage_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_project_production_queue() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND COALESCE(u."isActive", true) = true
          AND (
              u.role = 'Admin'
              OR ((u.role IN ('Admin', 'Projetista')) AND COALESCE(u."isProjectsManager", false))
              OR ((u.role IN ('Admin', 'Consultor')) AND COALESCE(u."isCommercialManager", false))
              OR (u.role = 'Marceneiro' AND COALESCE(u."isFactoryManager", false))
          )
    );
$$;


--
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


--
-- Name: compact_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compact_project_production_queue() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sequence, id) AS new_seq
        FROM public."ProjectProductionQueue"
    )
    UPDATE public."ProjectProductionQueue" q
    SET sequence = ordered.new_seq,
        "updatedAt" = now()
    FROM ordered
    WHERE q.id = ordered.id
      AND q.sequence IS DISTINCT FROM ordered.new_seq;
END;
$$;


--
-- Name: currentAppUserId(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."currentAppUserId"() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT id FROM public."appUsers" WHERE "authId" = auth.uid() LIMIT 1;
$$;


--
-- Name: format_activity_log_date_br(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.format_activity_log_date_br(p_date date) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE
        WHEN p_date IS NULL THEN '—'
        ELSE to_char(p_date, 'DD/MM/YYYY')
    END;
$$;


--
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


--
-- Name: insert_activity_log_row(text, bigint, text, text, jsonb, jsonb, bigint, jsonb, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_activity_log_row(p_entity_type text, p_entity_id bigint, p_action text, p_field_name text, p_previous_value jsonb, p_new_value jsonb, p_changed_by_id bigint, p_metadata jsonb DEFAULT NULL::jsonb, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_ctx record;
    v_id bigint;
BEGIN
    SELECT * INTO v_ctx
    FROM public.resolve_activity_log_order_context(
        p_entity_type,
        p_entity_id,
        p_order_project_id,
        p_order_id
    );

    INSERT INTO public."ActivityLog" (
        "entityType",
        "entityId",
        action,
        "fieldName",
        "previousValue",
        "newValue",
        "orderProjectId",
        "orderId",
        "changedById",
        metadata
    )
    VALUES (
        p_entity_type,
        p_entity_id,
        p_action,
        p_field_name,
        p_previous_value,
        p_new_value,
        v_ctx."orderProjectId",
        v_ctx."orderId",
        public.resolve_activity_log_changed_by_id(p_changed_by_id),
        p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;


--
-- Name: insert_order_project_designer_history(bigint, text, bigint, text, bigint, bigint, timestamp with time zone, bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_order_project_designer_history(p_order_project_id bigint, p_source_type text, p_source_id bigint, p_source_label text, p_previous_designer_id bigint, p_new_designer_id bigint, p_changed_at timestamp with time zone, p_changed_by_id bigint, p_previous_started_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    duration_seconds bigint;
BEGIN
    IF p_previous_designer_id IS NOT NULL AND p_previous_started_at IS NOT NULL THEN
        duration_seconds := GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (p_changed_at - p_previous_started_at)))::bigint
        );
    END IF;

    INSERT INTO public."OrderProjectDesignerHistory" (
        "orderProjectId",
        "sourceType",
        "sourceId",
        "sourceLabel",
        "previousDesignerId",
        "newDesignerId",
        "changedAt",
        "changedById",
        "previousDesignerDurationSeconds"
    ) VALUES (
        p_order_project_id,
        p_source_type,
        p_source_id,
        p_source_label,
        p_previous_designer_id,
        p_new_designer_id,
        p_changed_at,
        p_changed_by_id,
        duration_seconds
    );
END;
$$;


--
-- Name: is_app_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_app_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u.role = 'Admin'
          AND u."isActive" = true
    );
$$;


--
-- Name: is_authenticated_active_app_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_authenticated_active_app_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
      AND COALESCE("isActive", true) = true
  );
$$;


--
-- Name: latest_designer_history_started_at(bigint, text, bigint, bigint, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.latest_designer_history_started_at(p_order_project_id bigint, p_source_type text, p_source_id bigint, p_previous_designer_id bigint, p_fallback_at timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    started_at timestamptz;
BEGIN
    SELECT h."changedAt"
    INTO started_at
    FROM public."OrderProjectDesignerHistory" h
    WHERE h."orderProjectId" = p_order_project_id
      AND h."sourceType" = p_source_type
      AND h."sourceId" IS NOT DISTINCT FROM p_source_id
      AND h."newDesignerId" IS NOT DISTINCT FROM p_previous_designer_id
    ORDER BY h."changedAt" DESC
    LIMIT 1;

    RETURN COALESCE(started_at, p_fallback_at);
END;
$$;


--
-- Name: log_order_project_designer_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_order_project_designer_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF TG_OP = 'INSERT' THEN
        IF NEW."designerId" IS NULL THEN
            RETURN NEW;
        END IF;

        PERFORM public.insert_order_project_designer_history(
            NEW.id,
            'project',
            NEW.id,
            NULL,
            NULL,
            NEW."designerId",
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."designerId" IS NOT DISTINCT FROM OLD."designerId" THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        PERFORM public.insert_order_project_designer_history(
            NEW.id,
            'project',
            NEW.id,
            NULL,
            OLD."designerId",
            NEW."designerId",
            changed_at,
            changed_by,
            CASE
                WHEN OLD."designerId" IS NULL THEN NULL
                ELSE public.latest_designer_history_started_at(
                    NEW.id, 'project', NEW.id, OLD."designerId", OLD."createdAt"
                )
            END
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: log_order_project_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_order_project_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
    previous_started_at timestamptz;
    duration_seconds bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF TG_OP = 'INSERT' THEN
        IF NEW."statusId" IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO public."OrderProjectStatusHistory" (
            "orderProjectId",
            "previousStatusId",
            "newStatusId",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            NULL,
            NEW."statusId",
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."statusId" IS NOT DISTINCT FROM OLD."statusId" THEN
            RETURN NEW;
        END IF;

        IF NEW."statusId" IS NULL THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        IF OLD."statusId" IS NOT NULL THEN
            SELECT COALESCE(
                (
                    SELECT h."changedAt"
                    FROM public."OrderProjectStatusHistory" h
                    WHERE h."orderProjectId" = NEW.id
                      AND h."newStatusId" IS NOT DISTINCT FROM OLD."statusId"
                    ORDER BY h."changedAt" DESC
                    LIMIT 1
                ),
                OLD."createdAt"
            )
            INTO previous_started_at;

            duration_seconds := GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (changed_at - previous_started_at)))::bigint
            );
        ELSE
            duration_seconds := NULL;
        END IF;

        INSERT INTO public."OrderProjectStatusHistory" (
            "orderProjectId",
            "previousStatusId",
            "newStatusId",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            OLD."statusId",
            NEW."statusId",
            changed_at,
            changed_by,
            duration_seconds
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: log_related_designer_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_related_designer_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    source_type text := TG_ARGV[0];
    source_label text;
    changed_at timestamptz;
    changed_by bigint;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    IF source_type = 'thirdParty' THEN
        SELECT st.name
        INTO source_label
        FROM public."ThirdPartySubtype" st
        WHERE st.id = NEW."thirdPartySubtypeId";
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW."designerId" IS NULL THEN
            RETURN NEW;
        END IF;

        PERFORM public.insert_order_project_designer_history(
            NEW."orderProjectId",
            source_type,
            NEW.id,
            source_label,
            NULL,
            NEW."designerId",
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."designerId" IS NOT DISTINCT FROM OLD."designerId" THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        PERFORM public.insert_order_project_designer_history(
            NEW."orderProjectId",
            source_type,
            NEW.id,
            source_label,
            OLD."designerId",
            NEW."designerId",
            changed_at,
            changed_by,
            CASE
                WHEN OLD."designerId" IS NULL THEN NULL
                ELSE public.latest_designer_history_started_at(
                    NEW."orderProjectId",
                    source_type,
                    NEW.id,
                    OLD."designerId",
                    OLD."createdAt"
                )
            END
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: log_third_party_project_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_third_party_project_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    changed_at timestamptz;
    changed_by bigint;
    previous_started_at timestamptz;
    duration_seconds bigint;
    history_observation text;
BEGIN
    changed_at := COALESCE(NEW."updatedAt", now());

    history_observation := NULL;
    IF NEW.status = 'Canceled' THEN
        history_observation := NULLIF(trim(NEW."cancelObservation"), '');
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."ThirdPartyProjectStatusHistory" (
            "thirdPartyProjectId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds",
            observation
        ) VALUES (
            NEW.id,
            NULL,
            NEW.status,
            COALESCE(NEW."createdAt", changed_at),
            NEW."createdById",
            NULL,
            history_observation
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
            RETURN NEW;
        END IF;

        changed_by := COALESCE(NEW."updatedById", OLD."updatedById", NEW."createdById");

        IF OLD.status IS NOT NULL THEN
            SELECT COALESCE(
                (
                    SELECT h."changedAt"
                    FROM public."ThirdPartyProjectStatusHistory" h
                    WHERE h."thirdPartyProjectId" = NEW.id
                      AND h."newStatus" IS NOT DISTINCT FROM OLD.status
                    ORDER BY h."changedAt" DESC
                    LIMIT 1
                ),
                OLD."createdAt"
            )
            INTO previous_started_at;

            duration_seconds := GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (changed_at - previous_started_at)))::bigint
            );
        ELSE
            duration_seconds := NULL;
        END IF;

        INSERT INTO public."ThirdPartyProjectStatusHistory" (
            "thirdPartyProjectId",
            "previousStatus",
            "newStatus",
            "changedAt",
            "changedById",
            "previousStatusDurationSeconds",
            observation
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            changed_at,
            changed_by,
            duration_seconds,
            history_observation
        );

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: move_project_production_queue_to_position(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_project_production_queue_to_position(p_order_project_id bigint, p_sequence integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_current public."ProjectProductionQueue"%ROWTYPE;
    v_user_id bigint;
    v_max integer;
    v_target integer;
BEGIN
    IF NOT public.can_manage_project_production_queue() THEN
        RAISE EXCEPTION 'Sem permissão para reordenar a fila de programações.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ProjectProductionQueue'));

    SELECT *
    INTO v_current
    FROM public."ProjectProductionQueue"
    WHERE "orderProjectId" = p_order_project_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    SELECT COUNT(*)::integer
    INTO v_max
    FROM public."ProjectProductionQueue";

    IF v_max < 1 THEN
        RETURN false;
    END IF;

    v_target := GREATEST(1, LEAST(COALESCE(p_sequence, v_current.sequence), v_max));
    IF v_target = v_current.sequence THEN
        RETURN false;
    END IF;

    SELECT id
    INTO v_user_id
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
    LIMIT 1;

    IF v_target < v_current.sequence THEN
        UPDATE public."ProjectProductionQueue"
        SET sequence = sequence + 1,
            "updatedAt" = now(),
            "updatedById" = v_user_id
        WHERE sequence >= v_target
          AND sequence < v_current.sequence;
    ELSE
        UPDATE public."ProjectProductionQueue"
        SET sequence = sequence - 1,
            "updatedAt" = now(),
            "updatedById" = v_user_id
        WHERE sequence > v_current.sequence
          AND sequence <= v_target;
    END IF;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_target,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_current.id;

    PERFORM public.compact_project_production_queue();
    RETURN true;
END;
$$;


--
-- Name: order_project_belongs_in_production_queue(bigint, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.order_project_belongs_in_production_queue(p_status_id bigint, p_is_complementary boolean DEFAULT false, p_is_replaced boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
    v_sort integer;
    v_name text;
    v_min integer;
    v_max integer;
BEGIN
    IF COALESCE(p_is_complementary, false) OR COALESCE(p_is_replaced, false) THEN
        RETURN false;
    END IF;

    IF p_status_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT s."sortOrder", s.name
    INTO v_sort, v_name
    FROM public."OrderProjectStatus" s
    WHERE s.id = p_status_id;

    IF v_sort IS NULL THEN
        RETURN false;
    END IF;

    IF v_name = 'Em Produção' THEN
        RETURN false;
    END IF;

    SELECT start_status."sortOrder", end_status."sortOrder"
    INTO v_min, v_max
    FROM public."OrderProjectStatus" start_status
    CROSS JOIN public."OrderProjectStatus" end_status
    WHERE start_status.name = 'Medição Realizada'
      AND end_status.name = 'Implantação'
    LIMIT 1;

    IF v_min IS NULL OR v_max IS NULL THEN
        RETURN false;
    END IF;

    RETURN v_sort >= LEAST(v_min, v_max)
       AND v_sort <= GREATEST(v_min, v_max);
END;
$$;


--
-- Name: reorder_project_production_queue(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_project_production_queue(p_order_project_id bigint, p_direction text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_direction text;
    v_current public."ProjectProductionQueue"%ROWTYPE;
    v_neighbor public."ProjectProductionQueue"%ROWTYPE;
    v_user_id bigint;
    v_temp integer;
BEGIN
    IF NOT public.can_manage_project_production_queue() THEN
        RAISE EXCEPTION 'Sem permissão para reordenar a fila de programações.';
    END IF;

    v_direction := lower(trim(COALESCE(p_direction, '')));
    IF v_direction NOT IN ('up', 'down') THEN
        RAISE EXCEPTION 'Direção inválida. Use up ou down.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ProjectProductionQueue'));

    SELECT *
    INTO v_current
    FROM public."ProjectProductionQueue"
    WHERE "orderProjectId" = p_order_project_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_direction = 'up' THEN
        SELECT *
        INTO v_neighbor
        FROM public."ProjectProductionQueue"
        WHERE sequence < v_current.sequence
        ORDER BY sequence DESC, id DESC
        LIMIT 1
        FOR UPDATE;
    ELSE
        SELECT *
        INTO v_neighbor
        FROM public."ProjectProductionQueue"
        WHERE sequence > v_current.sequence
        ORDER BY sequence ASC, id ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    SELECT id
    INTO v_user_id
    FROM public."appUsers"
    WHERE "authId" = auth.uid()
    LIMIT 1;

    v_temp := v_current.sequence;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_neighbor.sequence,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_current.id;

    UPDATE public."ProjectProductionQueue"
    SET sequence = v_temp,
        "updatedAt" = now(),
        "updatedById" = v_user_id
    WHERE id = v_neighbor.id;

    RETURN true;
END;
$$;


--
-- Name: resolve_activity_log_changed_by_id(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_activity_log_changed_by_id(p_row_updated_by_id bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_id bigint;
BEGIN
    IF p_row_updated_by_id IS NOT NULL THEN
        RETURN p_row_updated_by_id;
    END IF;

    SELECT u.id INTO v_id
    FROM public."appUsers" u
    WHERE u."authId" = auth.uid()
    LIMIT 1;

    RETURN v_id;
END;
$$;


--
-- Name: resolve_activity_log_order_context(text, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_activity_log_order_context(p_entity_type text, p_entity_id bigint, p_order_project_id bigint DEFAULT NULL::bigint, p_order_id bigint DEFAULT NULL::bigint) RETURNS TABLE("orderProjectId" bigint, "orderId" bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_order_project_id bigint;
    v_order_id bigint;
BEGIN
    v_order_project_id := p_order_project_id;
    v_order_id := p_order_id;

    IF p_entity_type = 'OrderProject' THEN
        v_order_project_id := COALESCE(v_order_project_id, p_entity_id);
        SELECT op."orderId" INTO v_order_id
        FROM public."OrderProject" op
        WHERE op.id = v_order_project_id;
    ELSIF p_entity_type = 'Detailing' THEN
        SELECT d."orderProjectId" INTO v_order_project_id
        FROM public."Detailing" d
        WHERE d.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'Revision' THEN
        SELECT r."orderProjectId" INTO v_order_project_id
        FROM public."Revision" r
        WHERE r.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'Implementation' THEN
        SELECT i."orderProjectId" INTO v_order_project_id
        FROM public."Implementation" i
        WHERE i.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'PreliminaryDesignConference' THEN
        SELECT c."orderId" INTO v_order_id
        FROM public."PreliminaryDesignConference" c
        WHERE c.id = p_entity_id;
    ELSIF p_entity_type = 'Measurement' THEN
        SELECT m."orderId" INTO v_order_id
        FROM public."Measurement" m
        WHERE m.id = p_entity_id;
    ELSIF p_entity_type = 'OrderRequest' THEN
        SELECT r."orderProjectId" INTO v_order_project_id
        FROM public."OrderRequest" r
        WHERE r.id = p_entity_id;

        IF v_order_project_id IS NOT NULL THEN
            SELECT op."orderId" INTO v_order_id
            FROM public."OrderProject" op
            WHERE op.id = v_order_project_id;
        END IF;
    ELSIF p_entity_type = 'SalesOrder' THEN
        v_order_id := p_entity_id;
    ELSIF p_entity_type = 'OrderDeliveryPhase' THEN
        SELECT p."orderId" INTO v_order_id
        FROM public."OrderDeliveryPhase" p
        WHERE p.id = p_entity_id;
    END IF;

    "orderProjectId" := v_order_project_id;
    "orderId" := v_order_id;
    RETURN NEXT;
END;
$$;


--
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


--
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


--
-- Name: set_order_project_status_with_observation(bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_project_status_with_observation(p_order_project_id bigint, p_status_id bigint, p_observation text, p_updated_by_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF p_order_project_id IS NULL OR p_status_id IS NULL THEN
        RAISE EXCEPTION 'Projeto e status são obrigatórios.';
    END IF;

    UPDATE public."OrderProject"
    SET
        "statusId" = p_status_id,
        "updatedById" = p_updated_by_id,
        "updatedAt" = now()
    WHERE id = p_order_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Projeto não encontrado.';
    END IF;

    UPDATE public."OrderProjectStatusHistory"
    SET observation = nullif(btrim(coalesce(p_observation, '')), '')
    WHERE id = (
        SELECT h.id
        FROM public."OrderProjectStatusHistory" AS h
        WHERE h."orderProjectId" = p_order_project_id
        ORDER BY h."changedAt" DESC, h.id DESC
        LIMIT 1
    );

    RETURN true;
END;
$$;


--
-- Name: set_sales_order_addr_id(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_addr_id(p_order_id bigint, p_addr_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "addrId" = p_addr_id,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: set_sales_order_architect_id(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_architect_id(p_order_id bigint, p_architect_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "architectId" = p_architect_id,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: set_sales_order_client_delivery_date(bigint, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_client_delivery_date(p_order_id bigint, p_client_delivery_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "clientDeliveryDate" = p_client_delivery_date,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: set_sales_order_commission_fields(bigint, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_commission_fields(p_order_id bigint, p_payment_method text, p_installment_count integer, p_commission_confirmed boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public."appUsers" u
        WHERE u."authId" = auth.uid()
          AND u.role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado';
    END IF;

    IF p_payment_method IS NOT NULL
       AND p_payment_method NOT IN ('cash', 'installment') THEN
        RAISE EXCEPTION 'Forma de pagamento inválida';
    END IF;

    UPDATE public."salesOrders"
    SET
        "paymentMethod" = p_payment_method,
        "installmentCount" = GREATEST(COALESCE(p_installment_count, 1), 1),
        "commissionConfirmed" = COALESCE(p_commission_confirmed, false),
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: set_sales_order_commission_fields(bigint, text, integer, boolean, boolean, numeric, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_commission_fields(p_order_id bigint, p_payment_method text, p_installment_count integer, p_commission_confirmed boolean, p_commission_counts_for_tier boolean DEFAULT NULL::boolean, p_commission_rate_override numeric DEFAULT NULL::numeric, p_clear_commission_rate_override boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE public."salesOrders"
    SET
        "paymentMethod" = p_payment_method,
        "installmentCount" = GREATEST(1, COALESCE(p_installment_count, 1)),
        "commissionConfirmed" = COALESCE(p_commission_confirmed, false),
        "commissionCountsForTier" = COALESCE(p_commission_counts_for_tier, "commissionCountsForTier", true),
        "commissionRateOverride" = CASE
            WHEN p_clear_commission_rate_override THEN NULL
            WHEN p_commission_rate_override IS NOT NULL THEN p_commission_rate_override
            ELSE "commissionRateOverride"
        END,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: set_sales_order_sale_date(bigint, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sales_order_sale_date(p_order_id bigint, p_sale_date date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE "salesOrders"
    SET "saleDate" = p_sale_date,
        "updatedAt" = now()
    WHERE id = p_order_id;

    RETURN FOUND;
END;
$$;


--
-- Name: sync_aggregator_child_order_project_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_aggregator_child_order_project_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."isAggregator" = true THEN
        UPDATE public."OrderProject"
        SET
            "statusId" = NEW."statusId",
            "designerId" = NEW."designerId",
            "cabinetMakerId" = NEW."cabinetMakerId",
            "internalAssemblyStartDate" = NEW."internalAssemblyStartDate",
            "internalAssemblyEndDate" = NEW."internalAssemblyEndDate",
            "productionMonth" = NEW."productionMonth",
            "updatedAt" = COALESCE(NEW."updatedAt", now()),
            "updatedById" = NEW."updatedById"
        WHERE "aggregatorOrderProjectId" = NEW.id
          AND (
              "statusId" IS DISTINCT FROM NEW."statusId"
              OR "designerId" IS DISTINCT FROM NEW."designerId"
              OR "cabinetMakerId" IS DISTINCT FROM NEW."cabinetMakerId"
              OR "internalAssemblyStartDate" IS DISTINCT FROM NEW."internalAssemblyStartDate"
              OR "internalAssemblyEndDate" IS DISTINCT FROM NEW."internalAssemblyEndDate"
              OR "productionMonth" IS DISTINCT FROM NEW."productionMonth"
          );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sync_complementar_order_project_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_complementar_order_project_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'UPDATE'
        AND NEW."statusId" IS DISTINCT FROM OLD."statusId" THEN
        UPDATE "OrderProject"
        SET
            "statusId" = NEW."statusId",
            "updatedAt" = COALESCE(NEW."updatedAt", now()),
            "updatedById" = NEW."updatedById"
        WHERE "parentProjectId" = NEW.id
          AND "isComplementary" = true;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sync_order_project_designer_open_records(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_order_project_designer_open_records() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NEW."designerId" IS NULL
        OR NEW."designerId" IS NOT DISTINCT FROM OLD."designerId" THEN
        RETURN NEW;
    END IF;

    UPDATE public."OrderRequest" req
    SET
        "designerId" = NEW."designerId",
        "updatedAt" = COALESCE(NEW."updatedAt", now()),
        "updatedById" = COALESCE(NEW."updatedById", req."updatedById")
    WHERE req."designerId" IS DISTINCT FROM NEW."designerId"
      AND req.status <> 'Encerrado'
      AND req."orderProjectId" = NEW.id;

    RETURN NEW;
END;
$$;


--
-- Name: sync_project_production_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_project_production_queue() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_belongs boolean;
    v_next integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('ProjectProductionQueue'));

    v_belongs := public.order_project_belongs_in_production_queue(
        NEW."statusId",
        NEW."isComplementary",
        NEW."isReplaced"
    );

    IF v_belongs THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public."ProjectProductionQueue" q
            WHERE q."orderProjectId" = NEW.id
        ) THEN
            SELECT COALESCE(MAX(sequence), 0) + 1
            INTO v_next
            FROM public."ProjectProductionQueue";

            INSERT INTO public."ProjectProductionQueue" ("orderProjectId", sequence, "updatedById")
            VALUES (NEW.id, v_next, NEW."updatedById");
        END IF;
    ELSE
        DELETE FROM public."ProjectProductionQueue"
        WHERE "orderProjectId" = NEW.id;
        IF FOUND THEN
            PERFORM public.compact_project_production_queue();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_detailing_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_detailing_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_old_designer_name text;
    v_new_designer_name text;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(
        CASE WHEN TG_OP = 'INSERT' THEN NEW."createdById" ELSE NEW."updatedById" END
    );

    IF TG_OP = 'INSERT' THEN
        PERFORM public.insert_activity_log_row(
            'Detailing',
            NEW.id,
            'detailing.created',
            'status',
            NULL,
            public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'Detalhamento' AND OLD.status = 'Aguardando Detalhamento' THEN
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.started',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                jsonb_build_object('startedAt', NEW."startedAt"),
                NEW."orderProjectId",
                NULL
            );
        ELSIF NEW.status = 'Pronto' THEN
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.completed',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                jsonb_build_object('completedAt', NEW."completedAt"),
                NEW."orderProjectId",
                NULL
            );
        ELSE
            PERFORM public.insert_activity_log_row(
                'Detailing',
                NEW.id,
                'detailing.status_changed',
                'status',
                public.activity_log_value_json(to_jsonb(OLD.status), OLD.status),
                public.activity_log_value_json(to_jsonb(NEW.status), NEW.status),
                v_changed_by,
                NULL,
                NEW."orderProjectId",
                NULL
            );
        END IF;
    END IF;

    IF NEW."designerId" IS DISTINCT FROM OLD."designerId" AND NEW."designerId" IS NOT NULL THEN
        SELECT name INTO v_old_designer_name FROM public."appUsers" WHERE id = OLD."designerId";
        SELECT name INTO v_new_designer_name FROM public."appUsers" WHERE id = NEW."designerId";

        PERFORM public.insert_activity_log_row(
            'Detailing',
            NEW.id,
            'detailing.designer_assigned',
            'designerId',
            public.activity_log_value_json(to_jsonb(OLD."designerId"), COALESCE(v_old_designer_name, '—')),
            public.activity_log_value_json(to_jsonb(NEW."designerId"), COALESCE(v_new_designer_name, NEW."designerId"::text)),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_implementation_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_implementation_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_action text;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(
        CASE WHEN TG_OP = 'INSERT' THEN NEW."createdById" ELSE NEW."updatedById" END
    );

    IF TG_OP = 'INSERT' THEN
        PERFORM public.insert_activity_log_row(
            'Implementation',
            NEW.id,
            'implementation.created',
            'status',
            NULL,
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, 'Aberto')),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        v_action := 'implementation.status_changed';
        IF NEW.status = 'Enviado para Produção' THEN
            v_action := 'implementation.sent_to_production';
        ELSIF NEW.status = 'Encerrado' THEN
            v_action := 'implementation.closed';
        END IF;

        PERFORM public.insert_activity_log_row(
            'Implementation',
            NEW.id,
            v_action,
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_measurement_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_measurement_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."createdById");

    PERFORM public.insert_activity_log_row(
        'Measurement',
        NEW.id,
        'measurement.created',
        NULL,
        NULL,
        public.activity_log_value_json(to_jsonb(NEW.id), 'Medição registrada'),
        v_changed_by,
        NULL,
        NULL,
        NEW."orderId"
    );

    RETURN NEW;
END;
$$;


--
-- Name: trg_order_delivery_phase_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_order_delivery_phase_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_meta jsonb;
BEGIN
    v_changed_by := public.resolve_activity_log_changed_by_id(NULL);
    v_meta := jsonb_build_object(
        'phaseName', COALESCE(NEW.name, OLD.name),
        'phaseId', NEW.id,
        'sortOrder', COALESCE(NEW."sortOrder", OLD."sortOrder"),
        'orderCode', COALESCE(NEW."orderCode", OLD."orderCode")
    );

    IF TG_OP = 'INSERT' THEN
        IF NEW."deliveryDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderDeliveryPhase',
                NEW.id,
                'order_delivery_phase.delivery_date_changed',
                'deliveryDate',
                public.activity_log_value_json(to_jsonb(NULL::date), '—'),
                public.activity_log_value_json(
                    to_jsonb(NEW."deliveryDate"),
                    public.format_activity_log_date_br(NEW."deliveryDate")
                ),
                v_changed_by,
                v_meta,
                NULL,
                NEW."orderId"
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
        AND NEW."deliveryDate" IS DISTINCT FROM OLD."deliveryDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderDeliveryPhase',
            NEW.id,
            'order_delivery_phase.delivery_date_changed',
            'deliveryDate',
            public.activity_log_value_json(
                to_jsonb(OLD."deliveryDate"),
                public.format_activity_log_date_br(OLD."deliveryDate")
            ),
            public.activity_log_value_json(
                to_jsonb(NEW."deliveryDate"),
                public.format_activity_log_date_br(NEW."deliveryDate")
            ),
            v_changed_by,
            v_meta,
            NULL,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_order_project_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_order_project_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_old_status_name text;
    v_new_status_name text;
    v_old_maker_name text;
    v_new_maker_name text;
    v_old_designer_name text;
    v_new_designer_name text;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    IF NEW."statusId" IS DISTINCT FROM OLD."statusId" THEN
        SELECT name INTO v_old_status_name FROM public."OrderProjectStatus" WHERE id = OLD."statusId";
        SELECT name INTO v_new_status_name FROM public."OrderProjectStatus" WHERE id = NEW."statusId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.status_changed',
            'statusId',
            public.activity_log_value_json(to_jsonb(OLD."statusId"), COALESCE(v_old_status_name, OLD."statusId"::text)),
            public.activity_log_value_json(to_jsonb(NEW."statusId"), COALESCE(v_new_status_name, NEW."statusId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."internalAssemblyStartDate" IS DISTINCT FROM OLD."internalAssemblyStartDate" THEN
        IF OLD."internalAssemblyStartDate" IS NULL AND NEW."internalAssemblyStartDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_started',
                'internalAssemblyStartDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyStartDate"), '—'),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyStartDate"), NEW."internalAssemblyStartDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        ELSIF OLD."internalAssemblyStartDate" IS NOT NULL
            AND NEW."internalAssemblyStartDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_start_date_changed',
                'internalAssemblyStartDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyStartDate"), OLD."internalAssemblyStartDate"::text),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyStartDate"), NEW."internalAssemblyStartDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        END IF;
    END IF;

    IF NEW."internalAssemblyEndDate" IS DISTINCT FROM OLD."internalAssemblyEndDate" THEN
        IF OLD."internalAssemblyEndDate" IS NULL AND NEW."internalAssemblyEndDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_finished',
                'internalAssemblyEndDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyEndDate"), '—'),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyEndDate"), NEW."internalAssemblyEndDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        ELSIF OLD."internalAssemblyEndDate" IS NOT NULL
            AND NEW."internalAssemblyEndDate" IS NOT NULL THEN
            PERFORM public.insert_activity_log_row(
                'OrderProject',
                NEW.id,
                'order_project.internal_assembly_end_date_changed',
                'internalAssemblyEndDate',
                public.activity_log_value_json(to_jsonb(OLD."internalAssemblyEndDate"), OLD."internalAssemblyEndDate"::text),
                public.activity_log_value_json(to_jsonb(NEW."internalAssemblyEndDate"), NEW."internalAssemblyEndDate"::text),
                v_changed_by,
                NULL,
                NEW.id,
                NEW."orderId"
            );
        END IF;
    END IF;

    IF NEW."cabinetMakerId" IS DISTINCT FROM OLD."cabinetMakerId" AND NEW."cabinetMakerId" IS NOT NULL THEN
        SELECT name INTO v_old_maker_name FROM public."CabinetMaker" WHERE id = OLD."cabinetMakerId";
        SELECT name INTO v_new_maker_name FROM public."CabinetMaker" WHERE id = NEW."cabinetMakerId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.cabinet_maker_assigned',
            'cabinetMakerId',
            public.activity_log_value_json(to_jsonb(OLD."cabinetMakerId"), COALESCE(v_old_maker_name, OLD."cabinetMakerId"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."cabinetMakerId"), COALESCE(v_new_maker_name, NEW."cabinetMakerId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."designerId" IS DISTINCT FROM OLD."designerId" AND NEW."designerId" IS NOT NULL THEN
        SELECT name INTO v_old_designer_name FROM public."appUsers" WHERE id = OLD."designerId";
        SELECT name INTO v_new_designer_name FROM public."appUsers" WHERE id = NEW."designerId";

        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.designer_assigned',
            'designerId',
            public.activity_log_value_json(to_jsonb(OLD."designerId"), COALESCE(v_old_designer_name, '—')),
            public.activity_log_value_json(to_jsonb(NEW."designerId"), COALESCE(v_new_designer_name, NEW."designerId"::text)),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."deliveryDate" IS DISTINCT FROM OLD."deliveryDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.delivery_date_changed',
            'deliveryDate',
            public.activity_log_value_json(to_jsonb(OLD."deliveryDate"), COALESCE(OLD."deliveryDate"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."deliveryDate"), COALESCE(NEW."deliveryDate"::text, '—')),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."productionMonth" IS DISTINCT FROM OLD."productionMonth" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.production_month_changed',
            'productionMonth',
            public.activity_log_value_json(to_jsonb(OLD."productionMonth"), COALESCE(OLD."productionMonth"::text, '—')),
            public.activity_log_value_json(to_jsonb(NEW."productionMonth"), COALESCE(NEW."productionMonth"::text, '—')),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    IF NEW."technicalProjectForecastStartDate" IS DISTINCT FROM OLD."technicalProjectForecastStartDate"
        OR NEW."technicalProjectForecastEndDate" IS DISTINCT FROM OLD."technicalProjectForecastEndDate" THEN
        PERFORM public.insert_activity_log_row(
            'OrderProject',
            NEW.id,
            'order_project.technical_forecast_changed',
            'technicalProjectForecast',
            public.activity_log_value_json(
                jsonb_build_object(
                    'start', OLD."technicalProjectForecastStartDate",
                    'end', OLD."technicalProjectForecastEndDate"
                ),
                trim(both ' · ' from concat_ws(
                    ' · ',
                    CASE WHEN OLD."technicalProjectForecastStartDate" IS NOT NULL
                        THEN 'Início: ' || OLD."technicalProjectForecastStartDate"::text ELSE NULL END,
                    CASE WHEN OLD."technicalProjectForecastEndDate" IS NOT NULL
                        THEN 'Fim: ' || OLD."technicalProjectForecastEndDate"::text ELSE NULL END
                ))
            ),
            public.activity_log_value_json(
                jsonb_build_object(
                    'start', NEW."technicalProjectForecastStartDate",
                    'end', NEW."technicalProjectForecastEndDate"
                ),
                trim(both ' · ' from concat_ws(
                    ' · ',
                    CASE WHEN NEW."technicalProjectForecastStartDate" IS NOT NULL
                        THEN 'Início: ' || NEW."technicalProjectForecastStartDate"::text ELSE NULL END,
                    CASE WHEN NEW."technicalProjectForecastEndDate" IS NOT NULL
                        THEN 'Fim: ' || NEW."technicalProjectForecastEndDate"::text ELSE NULL END
                ))
            ),
            v_changed_by,
            NULL,
            NEW.id,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_order_project_substatus_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_order_project_substatus_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_label text;
    v_meta jsonb;
    v_started_display text;
    v_ended_display text;
    v_note text;
BEGIN
    v_label := public.activity_log_order_project_substatus_kind_label(NEW.kind);
    v_note := NULLIF(trim(COALESCE(NEW.note, '')), '');
    v_meta := jsonb_build_object(
        'substatusKind', NEW.kind,
        'substatusLabel', v_label
    );
    IF v_note IS NOT NULL THEN
        v_meta := v_meta || jsonb_build_object('note', v_note);
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_changed_by := public.resolve_activity_log_changed_by_id(NEW."startedById");
        v_started_display := to_char(
            NEW."startedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'OrderProjectSubstatus',
            NEW.id,
            'order_project_substatus.started',
            'startedAt',
            public.activity_log_value_json(NULL::jsonb, '—'),
            public.activity_log_value_json(to_jsonb(NEW.kind), v_label || ' · ' || v_started_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
        AND OLD."endedAt" IS NULL
        AND NEW."endedAt" IS NOT NULL THEN
        v_changed_by := public.resolve_activity_log_changed_by_id(NEW."endedById");
        v_started_display := to_char(
            NEW."startedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );
        v_ended_display := to_char(
            NEW."endedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'OrderProjectSubstatus',
            NEW.id,
            'order_project_substatus.ended',
            'endedAt',
            public.activity_log_value_json(to_jsonb(OLD."endedAt"), 'Em aberto desde ' || v_started_display),
            public.activity_log_value_json(to_jsonb(NEW."endedAt"), 'Encerrado em ' || v_ended_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_order_request_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_order_request_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.insert_activity_log_row(
            'OrderRequest',
            NEW.id,
            'order_request.status_changed',
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            NULL,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_part_request_status_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_part_request_status_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    prev_changed_at timestamptz;
    duration_sec integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public."PartRequestStatusHistory" (
            "partRequestId", "previousStatus", "newStatus", "changedById"
        ) VALUES (
            NEW.id, NULL, NEW.status, NEW."createdById"
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        SELECT h."changedAt" INTO prev_changed_at
        FROM public."PartRequestStatusHistory" h
        WHERE h."partRequestId" = NEW.id
        ORDER BY h."changedAt" DESC, h.id DESC
        LIMIT 1;

        IF prev_changed_at IS NOT NULL THEN
            duration_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - prev_changed_at))::integer);
        END IF;

        INSERT INTO public."PartRequestStatusHistory" (
            "partRequestId",
            "previousStatus",
            "newStatus",
            "changedById",
            "previousStatusDurationSeconds"
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW."updatedById",
            duration_sec
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_preliminary_design_conference_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_preliminary_design_conference_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public.insert_activity_log_row(
            'PreliminaryDesignConference',
            NEW.id,
            'preliminary_design_conference.status_changed',
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            NULL,
            NULL,
            NEW."orderId"
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_revision_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_revision_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
    v_meta jsonb;
    v_action text;
    v_started_display text;
    v_completed_display text;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(COALESCE(NEW."updatedById", NEW."createdById"));
    v_meta := jsonb_build_object('revisionType', NEW."revisionType");

    IF OLD."revisionStartedAt" IS NULL AND NEW."revisionStartedAt" IS NOT NULL THEN
        v_action := 'revision.started';
        IF NEW."revisionType" = 'commercial_technical' THEN
            v_action := 'revision.designer_started';
        ELSIF NEW."revisionType" = 'technical_reviewer' THEN
            v_action := 'revision.reviewer_started';
        ELSIF NEW."revisionType" = 'commercial_commercial' THEN
            v_action := 'revision.consultor_revision_started';
        ELSIF NEW."revisionType" = 'third_party' THEN
            v_action := 'revision.third_party_started';
        END IF;

        v_started_display := to_char(
            NEW."revisionStartedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            v_action,
            'revisionStartedAt',
            public.activity_log_value_json(to_jsonb(OLD."revisionStartedAt"), '—'),
            public.activity_log_value_json(to_jsonb(NEW."revisionStartedAt"), v_started_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    IF OLD."revisionCompletedAt" IS NULL AND NEW."revisionCompletedAt" IS NOT NULL THEN
        v_action := 'revision.completed';
        IF NEW."revisionType" = 'commercial_technical' THEN
            v_action := 'revision.designer_completed';
        ELSIF NEW."revisionType" = 'technical_reviewer' THEN
            v_action := 'revision.reviewer_completed';
        ELSIF NEW."revisionType" = 'commercial_commercial' THEN
            v_action := 'revision.consultor_revision_completed';
        ELSIF NEW."revisionType" = 'third_party' THEN
            v_action := 'revision.third_party_completed';
        END IF;

        v_completed_display := to_char(
            NEW."revisionCompletedAt" AT TIME ZONE 'America/Sao_Paulo',
            'DD/MM/YYYY HH24:MI'
        );

        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            v_action,
            'revisionCompletedAt',
            public.activity_log_value_json(to_jsonb(OLD."revisionCompletedAt"), '—'),
            public.activity_log_value_json(to_jsonb(NEW."revisionCompletedAt"), v_completed_display),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
        AND NOT (
            OLD."revisionStartedAt" IS NULL
            AND NEW."revisionStartedAt" IS NOT NULL
        )
        AND NOT (
            OLD."revisionCompletedAt" IS NULL
            AND NEW."revisionCompletedAt" IS NOT NULL
        ) THEN
        PERFORM public.insert_activity_log_row(
            'Revision',
            NEW.id,
            'revision.status_changed',
            'status',
            public.activity_log_value_json(to_jsonb(OLD.status), COALESCE(OLD.status, '—')),
            public.activity_log_value_json(to_jsonb(NEW.status), COALESCE(NEW.status, '—')),
            v_changed_by,
            v_meta,
            NEW."orderProjectId",
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: trg_sales_order_client_delivery_activity_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_sales_order_client_delivery_activity_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_changed_by bigint;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF NEW."clientDeliveryDate" IS NOT DISTINCT FROM OLD."clientDeliveryDate" THEN
        RETURN NEW;
    END IF;

    v_changed_by := public.resolve_activity_log_changed_by_id(NEW."updatedById");

    PERFORM public.insert_activity_log_row(
        'SalesOrder',
        NEW.id,
        'sales_order.client_delivery_date_changed',
        'clientDeliveryDate',
        public.activity_log_value_json(
            to_jsonb(OLD."clientDeliveryDate"),
            public.format_activity_log_date_br(OLD."clientDeliveryDate")
        ),
        public.activity_log_value_json(
            to_jsonb(NEW."clientDeliveryDate"),
            public.format_activity_log_date_br(NEW."clientDeliveryDate")
        ),
        v_changed_by,
        jsonb_build_object('orderCode', NEW."orderCode"),
        NULL,
        NEW.id
    );

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ActivityLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityLog" (
    id bigint NOT NULL,
    "entityType" text NOT NULL,
    "entityId" bigint NOT NULL,
    action text NOT NULL,
    "fieldName" text,
    "previousValue" jsonb,
    "newValue" jsonb,
    "orderProjectId" bigint,
    "orderId" bigint,
    "changedById" bigint,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb
);


--
-- Name: TABLE "ActivityLog"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."ActivityLog" IS 'Audit trail for business data changes (wave 1+).';


--
-- Name: ActivityLog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ActivityLog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ActivityLog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ActivityLog_id_seq" OWNED BY public."ActivityLog".id;


--
-- Name: AppError; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AppError" (
    id bigint NOT NULL,
    source text NOT NULL,
    message text NOT NULL,
    context text,
    payload jsonb,
    "userId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE "AppError"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AppError" IS 'Erros registrados pela aplicação para diagnóstico.';


--
-- Name: COLUMN "AppError".source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AppError".source IS 'Origem do erro (ex.: email, api, sync).';


--
-- Name: COLUMN "AppError".context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AppError".context IS 'Contexto legível (ex.: assunto do e-mail, tela, ação).';


--
-- Name: COLUMN "AppError".payload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AppError".payload IS 'Metadados JSON sem segredos.';


--
-- Name: COLUMN "AppError"."userId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AppError"."userId" IS 'FK lógica para appUsers.id (bigint).';


--
-- Name: AppError_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AppError" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AppError_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Architect; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Architect" (
    id bigint NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint
);


--
-- Name: Architect_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Architect" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Architect_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AssemblySchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssemblySchedule" (
    id bigint NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "orderId" bigint,
    observation text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "clientId" bigint,
    "addrId" bigint,
    CONSTRAINT "MontagemProgramacao_check" CHECK (("endDate" >= "startDate"))
);


--
-- Name: AssemblyScheduleCabinetMaker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssemblyScheduleCabinetMaker" (
    id bigint NOT NULL,
    "assemblyScheduleId" bigint NOT NULL,
    "cabinetMakerId" bigint NOT NULL
);


--
-- Name: AssemblyScheduleCabinetMaker_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AssemblyScheduleCabinetMaker" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AssemblyScheduleCabinetMaker_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AssemblyScheduleInstaller; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssemblyScheduleInstaller" (
    id bigint NOT NULL,
    "assemblyScheduleId" bigint NOT NULL,
    "installerId" bigint NOT NULL
);


--
-- Name: AssemblyScheduleInstaller_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AssemblyScheduleInstaller" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AssemblyScheduleInstaller_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AssemblySchedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AssemblySchedule" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AssemblySchedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AssistanceRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssistanceRequest" (
    id bigint NOT NULL,
    "clientId" bigint NOT NULL,
    "orderId" bigint,
    "addrId" bigint,
    "isWarranty" boolean NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "totalValue" numeric(14,2),
    "quoteFilePath" text,
    "quoteFileName" text,
    "scheduledAt" timestamp with time zone,
    "montadorId" bigint,
    "cabinetMakerId" bigint,
    "finishedAt" timestamp with time zone,
    "cancelReason" text,
    CONSTRAINT "AssistanceRequest_assignee_check" CHECK (((("montadorId" IS NULL) AND ("cabinetMakerId" IS NULL)) OR (("montadorId" IS NOT NULL) AND ("cabinetMakerId" IS NULL)) OR (("montadorId" IS NULL) AND ("cabinetMakerId" IS NOT NULL)))),
    CONSTRAINT "AssistanceRequest_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'Quote'::text, 'Approval'::text, 'Separation'::text, 'AwaitingScheduling'::text, 'Scheduled'::text, 'Execution'::text, 'Finished'::text, 'Cancelled'::text])))
);


--
-- Name: TABLE "AssistanceRequest"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AssistanceRequest" IS 'Pedido de assistência. status: Open, Quote, Approval, Separation, Scheduled, Execution, Finished.';


--
-- Name: COLUMN "AssistanceRequest"."scheduledAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AssistanceRequest"."scheduledAt" IS 'Data agendada para execução da assistência.';


--
-- Name: COLUMN "AssistanceRequest"."montadorId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AssistanceRequest"."montadorId" IS 'Montador (Installer) responsável, quando aplicável.';


--
-- Name: COLUMN "AssistanceRequest"."cabinetMakerId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AssistanceRequest"."cabinetMakerId" IS 'Marceneiro responsável, quando aplicável.';


--
-- Name: COLUMN "AssistanceRequest"."finishedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AssistanceRequest"."finishedAt" IS 'Data/hora em que a assistência foi marcada como Finalizado.';


--
-- Name: COLUMN "AssistanceRequest"."cancelReason"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AssistanceRequest"."cancelReason" IS 'Motivo informado ao cancelar a assistência (status Cancelled).';


--
-- Name: AssistanceRequestStatusHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssistanceRequestStatusHistory" (
    id bigint NOT NULL,
    "assistanceRequestId" bigint NOT NULL,
    "previousStatus" text,
    "newStatus" text NOT NULL,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "changedById" bigint,
    "previousStatusDurationSeconds" bigint,
    observation text,
    CONSTRAINT "AssistanceRequestStatusHistory_newStatus_check" CHECK (("newStatus" = ANY (ARRAY['Open'::text, 'Quote'::text, 'Approval'::text, 'Separation'::text, 'AwaitingScheduling'::text, 'Scheduled'::text, 'Execution'::text, 'Finished'::text]))),
    CONSTRAINT "AssistanceRequestStatusHistory_previousStatus_check" CHECK ((("previousStatus" IS NULL) OR ("previousStatus" = ANY (ARRAY['Open'::text, 'Quote'::text, 'Approval'::text, 'Separation'::text, 'AwaitingScheduling'::text, 'Scheduled'::text, 'Execution'::text, 'Finished'::text]))))
);


--
-- Name: TABLE "AssistanceRequestStatusHistory"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AssistanceRequestStatusHistory" IS 'Histórico de transições de status da AssistanceRequest.';


--
-- Name: AssistanceRequestStatusHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AssistanceRequestStatusHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AssistanceRequestStatusHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AssistanceRequest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."AssistanceRequest" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AssistanceRequest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: CabinetMaker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CabinetMaker" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "calendarColor" text
);


--
-- Name: COLUMN "CabinetMaker"."calendarColor"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CabinetMaker"."calendarColor" IS 'Hex #RRGGBB from Google Calendar palette';


--
-- Name: CabinetMaker_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."CabinetMaker" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."CabinetMaker_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: CalendarEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CalendarEvent" (
    id bigint NOT NULL,
    "eventDate" date NOT NULL,
    "eventTime" time without time zone NOT NULL,
    "responsibleId" bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    "orderId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "eventTypeId" bigint NOT NULL,
    "googleCalendarEventId" text,
    "googleCalendarSyncedAt" timestamp with time zone,
    "clientId" bigint,
    "addrId" bigint
);


--
-- Name: COLUMN "CalendarEvent"."googleCalendarEventId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CalendarEvent"."googleCalendarEventId" IS 'ID do evento no Google Calendar (conta formighieri.notificacoes@gmail.com)';


--
-- Name: COLUMN "CalendarEvent"."googleCalendarSyncedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CalendarEvent"."googleCalendarSyncedAt" IS 'Última sincronização com o Google Calendar';


--
-- Name: CalendarEventType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CalendarEventType" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "clientRequired" boolean DEFAULT false NOT NULL,
    "orderRequired" boolean DEFAULT false NOT NULL,
    "selectableFromCalendar" boolean DEFAULT true NOT NULL
);


--
-- Name: CalendarEventType_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."CalendarEventType" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."CalendarEventType_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: CalendarEvent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."CalendarEvent" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."CalendarEvent_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Client" (
    id bigint NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "pipedriveOrgId" bigint
);


--
-- Name: Client_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Client" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Client_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contact" (
    id bigint NOT NULL,
    "ownerType" text NOT NULL,
    "ownerId" bigint NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "landlinePhone" text,
    CONSTRAINT "Contact_ownerType_check" CHECK (("ownerType" = ANY (ARRAY['client'::text, 'architect'::text])))
);


--
-- Name: COLUMN "Contact".phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Contact".phone IS 'Celular no formato (00)00000-0000.';


--
-- Name: COLUMN "Contact"."landlinePhone"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Contact"."landlinePhone" IS 'Telefone fixo no formato (00)0000-0000.';


--
-- Name: Contact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Contact" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Contact_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Deal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Deal" (
    id bigint NOT NULL,
    title text NOT NULL,
    "clientId" bigint,
    "ownerUserId" bigint,
    "stageId" bigint NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    temperature text,
    value numeric(12,2),
    "expectedCloseDate" date,
    "lostReason" text,
    "orderId" bigint,
    "wonAt" timestamp with time zone,
    "lostAt" timestamp with time zone,
    "pipedriveDealId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "architectId" bigint,
    "wpsQuoteCode" text,
    CONSTRAINT "Deal_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))),
    CONSTRAINT "Deal_temperature_check" CHECK (((temperature IS NULL) OR (temperature = ANY (ARRAY['hot'::text, 'warm'::text, 'cold'::text]))))
);


--
-- Name: DealActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DealActivity" (
    id bigint NOT NULL,
    "dealId" bigint NOT NULL,
    type text DEFAULT 'task'::text NOT NULL,
    subject text NOT NULL,
    "dueDate" date NOT NULL,
    "dueTime" time without time zone,
    "isDone" boolean DEFAULT false NOT NULL,
    "doneAt" timestamp with time zone,
    "ownerUserId" bigint,
    notes text,
    "calendarEventId" bigint,
    "pipedriveActivityId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    CONSTRAINT "DealActivity_type_check" CHECK ((type = ANY (ARRAY['call'::text, 'meeting'::text, 'task'::text, 'deadline'::text])))
);


--
-- Name: DealActivity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."DealActivity" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."DealActivity_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: DealLostReason; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DealLostReason" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint
);


--
-- Name: DealLostReason_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."DealLostReason" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."DealLostReason_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: DealNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DealNote" (
    id bigint NOT NULL,
    "dealId" bigint NOT NULL,
    body text NOT NULL,
    "pipedriveNoteId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint
);


--
-- Name: DealNote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."DealNote" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."DealNote_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: DealStage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DealStage" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    outcome text DEFAULT 'open'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "pipedriveStageId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    CONSTRAINT "DealStage_outcome_check" CHECK ((outcome = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: DealStage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."DealStage" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."DealStage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Deal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Deal" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Deal_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Detailing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Detailing" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    status text DEFAULT 'Aguardando Detalhamento'::text NOT NULL,
    "projectFilePath" text,
    "serverFolderPath" text,
    "designerId" bigint,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "detailingType" text DEFAULT 'Assembly'::text NOT NULL,
    CONSTRAINT "Detailing_detailingType_check" CHECK (("detailingType" = ANY (ARRAY['Assembly'::text, 'Painting'::text]))),
    CONSTRAINT "Detailing_status_check" CHECK ((status = ANY (ARRAY['Aguardando Detalhamento'::text, 'Detalhamento'::text, 'Pronto'::text])))
);


--
-- Name: COLUMN "Detailing"."detailingType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Detailing"."detailingType" IS 'Assembly = Montagem (padrão legado); Painting = Pintura (quando implantação possui lista de tintas).';


--
-- Name: Detailing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Detailing" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Detailing_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: DriveFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DriveFile" (
    id bigint NOT NULL,
    "driveFileId" text,
    "driveFolderId" text,
    "fileName" text NOT NULL,
    "mimeType" text,
    "fileSizeBytes" bigint,
    url text,
    "folderKind" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" bigint NOT NULL,
    "orderId" bigint,
    "orderProjectId" bigint,
    "folderPath" text,
    "createdById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "storagePath" text,
    "ingestStatus" text DEFAULT 'pending'::text NOT NULL,
    "ingestError" text,
    "viewerStoragePath" text,
    CONSTRAINT "DriveFile_entityType_check" CHECK (("entityType" = ANY (ARRAY['Detailing'::text, 'RevisionActivity'::text, 'OrderRequest'::text, 'OrderRequestActivity'::text, 'SalesOrder'::text, 'ThirdPartyProject'::text, 'OrderProject'::text, 'ImplementationPurchaseItem'::text, 'AssistanceRequest'::text, 'ExternalAssemblyInspectionActivity'::text, 'ExpeditionRouteStopItem'::text]))),
    CONSTRAINT "DriveFile_folderKind_check" CHECK (("folderKind" = ANY (ARRAY['detailing'::text, 'revision'::text, 'request'::text, 'descriptive'::text, 'thirdParty'::text, 'model3d'::text, 'implementationList'::text, 'assistanceQuote'::text, 'externalAssemblyInspection'::text, 'externalAssemblyInspectionResponse'::text, 'expeditionPickup'::text]))),
    CONSTRAINT "DriveFile_ingestStatus_check" CHECK (("ingestStatus" = ANY (ARRAY['pending'::text, 'ready'::text, 'error'::text])))
);


--
-- Name: TABLE "DriveFile"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."DriveFile" IS 'Metadados de arquivos no Google Drive da conta de notificações. Vínculo polimórfico: entityType + entityId.';


--
-- Name: COLUMN "DriveFile"."folderKind"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DriveFile"."folderKind" IS 'Pasta lógica no Drive: detailing, revision, request, descriptive, thirdParty, model3d, implementationList, assistanceQuote.';


--
-- Name: COLUMN "DriveFile"."entityType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DriveFile"."entityType" IS 'Origem: Detailing, RevisionActivity, OrderRequest, OrderRequestActivity, SalesOrder, ThirdPartyProject, OrderProject, ImplementationPurchaseItem, AssistanceRequest.';


--
-- Name: COLUMN "DriveFile"."storagePath"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DriveFile"."storagePath" IS 'Caminho no bucket drive-files (fonte do download no FGP).';


--
-- Name: COLUMN "DriveFile"."ingestStatus"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DriveFile"."ingestStatus" IS 'pending/ready/error da cópia Storage → Google Drive.';


--
-- Name: COLUMN "DriveFile"."viewerStoragePath"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."DriveFile"."viewerStoragePath" IS 'Path no bucket order-project-model3d para visualização no app (GLB/GLTF).';


--
-- Name: DriveFile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."DriveFile" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."DriveFile_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EnvironmentType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EnvironmentType" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL
);


--
-- Name: EnvironmentType_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."EnvironmentType" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."EnvironmentType_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExpeditionRoute; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExpeditionRoute" (
    id bigint NOT NULL,
    "routeDate" timestamp with time zone NOT NULL,
    "vehicleLabel" text DEFAULT ''::text NOT NULL,
    "driverName" text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    "mapsUrl" text,
    "routeSummaryJson" jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "confirmedAt" timestamp with time zone,
    "confirmedById" bigint,
    "responsibleUserId" bigint,
    CONSTRAINT "ExpeditionRoute_status_check" CHECK ((status = ANY (ARRAY['Draft'::text, 'Confirmed'::text, 'Printed'::text, 'BoardingStarted'::text, 'Boarded'::text, 'UnloadingStarted'::text, 'UnloadingFinished'::text, 'Completed'::text])))
);


--
-- Name: ExpeditionRouteStop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExpeditionRouteStop" (
    id bigint NOT NULL,
    "routeId" bigint NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "addrId" bigint,
    "addrSnapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ExpeditionRouteStopItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExpeditionRouteStopItem" (
    id bigint NOT NULL,
    "stopId" bigint NOT NULL,
    "entityType" text NOT NULL,
    "entityId" bigint NOT NULL,
    "volumeCount" integer DEFAULT 0 NOT NULL,
    "entityLabel" text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "routeId" bigint,
    "metadataJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "pickupUnloadedAt" timestamp with time zone,
    "pickupUnloadedById" bigint,
    CONSTRAINT "ExpeditionRouteStopItem_entityType_check" CHECK (("entityType" = ANY (ARRAY['Assistance'::text, 'ExternalAssemblyInspection'::text, 'PartRequest'::text, 'Purchase'::text, 'OrderProject'::text, 'Pickup'::text]))),
    CONSTRAINT "ExpeditionRouteStopItem_volumeCount_check" CHECK (((("entityType" = 'Pickup'::text) AND ("volumeCount" = 0)) OR (("entityType" <> 'Pickup'::text) AND ("volumeCount" >= 1))))
);


--
-- Name: ExpeditionRouteStopItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRouteStopItem" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ExpeditionRouteStopItem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExpeditionRouteStop_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRouteStop" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ExpeditionRouteStop_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExpeditionRoute_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRoute" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ExpeditionRoute_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExpeditionVolume; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExpeditionVolume" (
    id bigint NOT NULL,
    "routeId" bigint NOT NULL,
    "stopItemId" bigint NOT NULL,
    "volumeIndex" integer NOT NULL,
    "volumeCode" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "boardedAt" timestamp with time zone,
    "boardedById" bigint,
    "unloadedAt" timestamp with time zone,
    "unloadedById" bigint,
    CONSTRAINT "ExpeditionVolume_volumeIndex_check" CHECK (("volumeIndex" > 0))
);


--
-- Name: ExpeditionVolume_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionVolume" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ExpeditionVolume_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExternalAssemblyInspection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExternalAssemblyInspection" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    observation text,
    status text DEFAULT 'Open'::text NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ExternalAssemblyInspection_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'InProgress'::text, 'Finished'::text])))
);


--
-- Name: TABLE "ExternalAssemblyInspection"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."ExternalAssemblyInspection" IS 'Vistoria de montagem externa (pedido).';


--
-- Name: ExternalAssemblyInspectionActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExternalAssemblyInspectionActivity" (
    id bigint NOT NULL,
    "inspectionProjectId" bigint NOT NULL,
    description text NOT NULL,
    "isDone" boolean DEFAULT false NOT NULL,
    "responseComment" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "doneAt" timestamp with time zone,
    "doneById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE "ExternalAssemblyInspectionActivity"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."ExternalAssemblyInspectionActivity" IS 'Atividade da vistoria de montagem externa (checkbox realizado + comentário).';


--
-- Name: ExternalAssemblyInspectionActivity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ExternalAssemblyInspectionActivity_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ExternalAssemblyInspectionActivity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ExternalAssemblyInspectionActivity_id_seq" OWNED BY public."ExternalAssemblyInspectionActivity".id;


--
-- Name: ExternalAssemblyInspectionProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExternalAssemblyInspectionProject" (
    id bigint NOT NULL,
    "inspectionId" bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ExternalAssemblyInspectionProject_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'InProgress'::text, 'Finished'::text])))
);


--
-- Name: TABLE "ExternalAssemblyInspectionProject"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."ExternalAssemblyInspectionProject" IS 'Projeto incluído em uma vistoria de montagem externa.';


--
-- Name: ExternalAssemblyInspectionProject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ExternalAssemblyInspectionProject_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ExternalAssemblyInspectionProject_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ExternalAssemblyInspectionProject_id_seq" OWNED BY public."ExternalAssemblyInspectionProject".id;


--
-- Name: ExternalAssemblyInspection_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ExternalAssemblyInspection_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ExternalAssemblyInspection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ExternalAssemblyInspection_id_seq" OWNED BY public."ExternalAssemblyInspection".id;


--
-- Name: FactoryEmployee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FactoryEmployee" (
    id bigint NOT NULL,
    name text NOT NULL,
    "factoryRoleId" bigint NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "legacyCabinetMakerId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: FactoryEmployee_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."FactoryEmployee" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."FactoryEmployee_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FactoryRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FactoryRole" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: FactoryRole_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."FactoryRole" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."FactoryRole_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Implementation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Implementation" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    status text DEFAULT 'Aberto'::text NOT NULL,
    "wpsOpCode" text,
    "projectFilePath" text,
    "isProjectChecked" boolean DEFAULT false NOT NULL,
    "purchasesSentAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "designerId" bigint,
    CONSTRAINT "Implantacao_status_check" CHECK ((status = ANY (ARRAY['Aberto'::text, 'Enviado para Produção'::text, 'Encerrado'::text])))
);


--
-- Name: ImplementationPurchaseItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImplementationPurchaseItem" (
    id bigint NOT NULL,
    "implementationId" bigint NOT NULL,
    "purchaseType" text NOT NULL,
    "thirdPartySubtypeId" bigint,
    "folderPath" text,
    "isChecked" boolean DEFAULT false NOT NULL,
    "sentToCommercial" boolean DEFAULT false NOT NULL,
    "sentToCommercialAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "isNotApplicable" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ImplantacaoPurchaseItem_purchaseType_check" CHECK (("purchaseType" = ANY (ARRAY['Material'::text, 'Ferragem'::text, 'Tinta'::text, 'Terceiro'::text]))),
    CONSTRAINT "ImplantacaoPurchaseItem_terceiro_subtype_check" CHECK ((("purchaseType" = 'Terceiro'::text) OR ("thirdPartySubtypeId" IS NULL)))
);


--
-- Name: COLUMN "ImplementationPurchaseItem"."isNotApplicable"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."ImplementationPurchaseItem"."isNotApplicable" IS 'When true, the purchase list does not apply; no PDF upload required.';


--
-- Name: ImplementationPurchaseItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ImplementationPurchaseItem" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ImplementationPurchaseItem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Implementation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Implementation" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Implementation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Installer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Installer" (
    id bigint NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "loginEmail" text,
    "calendarColor" text
);


--
-- Name: COLUMN "Installer"."loginEmail"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Installer"."loginEmail" IS 'Supabase Auth login email for this installer (reference; create matching appUsers row manually).';


--
-- Name: COLUMN "Installer"."calendarColor"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Installer"."calendarColor" IS 'Hex #RRGGBB from Google Calendar palette';


--
-- Name: Installer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Installer" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Installer_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Measurement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Measurement" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    observation text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint
);


--
-- Name: MeasurementProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MeasurementProject" (
    id bigint NOT NULL,
    "measurementId" bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "measurementDate" date NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "isFloorPlanRaised" boolean DEFAULT false NOT NULL,
    "floorPlanRaisedDate" date
);


--
-- Name: MeasurementProject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."MeasurementProject" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."MeasurementProject_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Measurement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Measurement" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Measurement_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderDeliveryPhase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderDeliveryPhase" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    "orderCode" text NOT NULL,
    name text NOT NULL,
    "deliveryDate" date NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: OrderDeliveryPhase_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderDeliveryPhase" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderDeliveryPhase_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProject" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    name text NOT NULL,
    "environmentTypeId" bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now(),
    "updatedById" bigint,
    "projectCode" text,
    "deliveryDate" date,
    "designerId" bigint,
    "statusId" bigint,
    "cabinetMakerId" bigint,
    "internalAssemblyStartDate" date,
    "internalAssemblyEndDate" date,
    "saleValue" numeric(12,2),
    "isNamed" boolean DEFAULT false NOT NULL,
    "approvalNetworkPath" text,
    "awaitingConstructionNote" text,
    "isComplementary" boolean DEFAULT false NOT NULL,
    "parentProjectId" bigint,
    "isReplaced" boolean DEFAULT false NOT NULL,
    "replacedByProjectId" bigint,
    "isReplacement" boolean DEFAULT false NOT NULL,
    "replacesProjectId" bigint,
    "technicalProjectForecastEndDate" date,
    "technicalProjectCompletedDate" date,
    "deliveryPhaseId" bigint,
    "productionMonth" date,
    "technicalProjectForecastStartDate" date,
    "conferenceNetworkPath" text,
    "isAggregator" boolean DEFAULT false NOT NULL,
    "aggregatorOrderProjectId" bigint,
    "reviewerId" integer,
    "technicalReviewerReviewStartedAt" timestamp with time zone,
    CONSTRAINT "OrderProject_aggregator_not_child_and_parent" CHECK ((NOT (("isAggregator" = true) AND ("aggregatorOrderProjectId" IS NOT NULL)))),
    CONSTRAINT "OrderProject_aggregator_not_complementar" CHECK ((NOT (("isAggregator" = true) AND ("isComplementary" = true)))),
    CONSTRAINT "OrderProject_grouped_child_not_complementar" CHECK ((NOT (("aggregatorOrderProjectId" IS NOT NULL) AND ("isComplementary" = true))))
);


--
-- Name: COLUMN "OrderProject"."saleValue"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."saleValue" IS 'Valor de venda do projeto em reais (BRL).';


--
-- Name: COLUMN "OrderProject"."isNamed"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."isNamed" IS 'Projeto confirmado como nomeado pelo projetista responsável.';


--
-- Name: COLUMN "OrderProject"."approvalNetworkPath"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."approvalNetworkPath" IS 'Network path set when the designer submits the project for commercial approval.';


--
-- Name: COLUMN "OrderProject"."technicalProjectForecastEndDate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."technicalProjectForecastEndDate" IS 'Previsão de conclusão do projeto técnico pelo projetista (momento previsto de solicitar aprovação).';


--
-- Name: COLUMN "OrderProject"."technicalProjectCompletedDate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."technicalProjectCompletedDate" IS 'Data em que o projeto técnico foi concluído (primeira solicitação de aprovação comercial).';


--
-- Name: COLUMN "OrderProject"."productionMonth"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."productionMonth" IS 'Mês planejado de produção do projeto (armazenado como dia 1 do mês).';


--
-- Name: COLUMN "OrderProject"."technicalProjectForecastStartDate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."technicalProjectForecastStartDate" IS 'Planned start date for technical project work when assigning a designer.';


--
-- Name: COLUMN "OrderProject"."conferenceNetworkPath"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."conferenceNetworkPath" IS 'Network path set when the commercial manager approves the preliminary design conference.';


--
-- Name: COLUMN "OrderProject"."reviewerId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."reviewerId" IS 'Projetista revisor responsável pela revisão técnica do revisor.';


--
-- Name: COLUMN "OrderProject"."technicalReviewerReviewStartedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProject"."technicalReviewerReviewStartedAt" IS 'Quando o revisor iniciou a revisão técnica neste projeto.';


--
-- Name: OrderProjectAggregatorCode_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."OrderProjectAggregatorCode_seq"
    START WITH 9000000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: OrderProjectCharacteristic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectCharacteristic" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "characteristicId" bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint
);


--
-- Name: OrderProjectCharacteristic_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectCharacteristic" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectCharacteristic_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProjectDesignerHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectDesignerHistory" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "previousDesignerId" bigint,
    "newDesignerId" bigint,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "changedById" bigint,
    "previousDesignerDurationSeconds" bigint,
    "sourceType" text DEFAULT 'project'::text NOT NULL,
    "sourceId" bigint,
    "sourceLabel" text,
    CONSTRAINT "OrderProjectDesignerHistory_sourceType_check" CHECK (("sourceType" = ANY (ARRAY['project'::text, 'thirdParty'::text, 'detailing'::text, 'implementation'::text])))
);


--
-- Name: OrderProjectDesignerHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectDesignerHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectDesignerHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProjectStatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectStatus" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "supportsForecast" boolean DEFAULT false NOT NULL,
    "forecastAssigneeKind" text,
    CONSTRAINT "OrderProjectStatus_forecastAssigneeKind_check" CHECK ((("forecastAssigneeKind" IS NULL) OR ("forecastAssigneeKind" = ANY (ARRAY['designer'::text, 'cabinet_maker'::text, 'conference_reviewer'::text, 'ppcp'::text]))))
);


--
-- Name: COLUMN "OrderProjectStatus"."supportsForecast"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProjectStatus"."supportsForecast" IS 'When true, the project scheduling screen allows optional forecast for this status.';


--
-- Name: COLUMN "OrderProjectStatus"."forecastAssigneeKind"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProjectStatus"."forecastAssigneeKind" IS 'Optional assignee picker on scheduling: designer, cabinet_maker, conference_reviewer (Conferente) or ppcp (appUsers).';


--
-- Name: OrderProjectStatusHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectStatusHistory" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "previousStatusId" bigint,
    "newStatusId" bigint NOT NULL,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "changedById" bigint,
    "previousStatusDurationSeconds" bigint,
    observation text
);


--
-- Name: OrderProjectGateMilestones; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."OrderProjectGateMilestones" AS
 WITH status_names AS (
         SELECT "OrderProjectStatus".id,
            "OrderProjectStatus".name
           FROM public."OrderProjectStatus"
        ), history AS (
         SELECT h."orderProjectId",
            h."changedAt",
            h."changedById",
            prev.name AS previous_status_name,
            new.name AS new_status_name
           FROM ((public."OrderProjectStatusHistory" h
             LEFT JOIN status_names prev ON ((prev.id = h."previousStatusId")))
             JOIN status_names new ON ((new.id = h."newStatusId")))
        ), commercial_requested AS (
         SELECT DISTINCT ON (h."orderProjectId") h."orderProjectId",
            h."changedAt" AS "commercialApprovalRequestedAt",
            h."changedById" AS "commercialApprovalRequestedById"
           FROM history h
          WHERE ((h.previous_status_name = 'Projeto Técnico'::text) AND (h.new_status_name = ANY (ARRAY['Em Revisão Comercial Cons.'::text, 'Em Revisão Comercial Proj.'::text, 'Em Revisão Comercial'::text, 'Em Revisão Técnica'::text])))
          ORDER BY h."orderProjectId", h."changedAt"
        ), commercial_approved AS (
         SELECT DISTINCT ON (h."orderProjectId") h."orderProjectId",
            h."changedAt" AS "commercialApprovedAt",
            h."changedById" AS "commercialApprovedById"
           FROM history h
          WHERE ((h.previous_status_name = 'Aguardando Aprovação'::text) AND (h.new_status_name = ANY (ARRAY['Em Revisão Técnica Revisor'::text, 'Em Revisão Técnica Lider'::text])))
          ORDER BY h."orderProjectId", h."changedAt" DESC
        ), reviewer_approved AS (
         SELECT DISTINCT ON (h."orderProjectId") h."orderProjectId",
            h."changedAt" AS "technicalReviewerApprovedAt",
            h."changedById" AS "technicalReviewerApprovedById"
           FROM history h
          WHERE ((h.previous_status_name = ANY (ARRAY['Em Revisão Técnica Revisor'::text, 'Em Revisão Técnica Lider'::text])) AND (h.new_status_name = 'Nomear'::text))
          ORDER BY h."orderProjectId", h."changedAt" DESC
        )
 SELECT op.id AS "orderProjectId",
    op."orderId",
    op."designerId",
    ops.name AS "currentStatusName",
    ops."sortOrder" AS "currentStatusSortOrder",
    (ops.name = ANY (ARRAY['Em Revisão Comercial Cons.'::text, 'Em Revisão Comercial Proj.'::text, 'Em Revisão Comercial'::text, 'Em Revisão Técnica'::text, 'Aguardando Aprovação'::text])) AS "isInCommercialFunnel",
    (ops.name = 'Aguardando Aprovação'::text) AS "isAwaitingConsultantApproval",
    (ops.name = ANY (ARRAY['Em Revisão Técnica Revisor'::text, 'Em Revisão Técnica Lider'::text, 'Em Revisão Técnica Proj.'::text])) AS "isInTechnicalReviewerReview",
    cr."commercialApprovalRequestedAt",
    cr."commercialApprovalRequestedById",
    ca."commercialApprovedAt",
    ca."commercialApprovedById",
    ra."technicalReviewerApprovedAt",
    ra."technicalReviewerApprovedById"
   FROM ((((public."OrderProject" op
     LEFT JOIN public."OrderProjectStatus" ops ON ((ops.id = op."statusId")))
     LEFT JOIN commercial_requested cr ON ((cr."orderProjectId" = op.id)))
     LEFT JOIN commercial_approved ca ON ((ca."orderProjectId" = op.id)))
     LEFT JOIN reviewer_approved ra ON ((ra."orderProjectId" = op.id)));


--
-- Name: VIEW "OrderProjectGateMilestones"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public."OrderProjectGateMilestones" IS 'Marcos derivados de OrderProjectStatusHistory. Transições canônicas: Aguardando Aprovação→Revisor; Revisor→Nomear.';


--
-- Name: OrderProjectStatusForecast; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectStatusForecast" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "statusId" bigint NOT NULL,
    "forecastStartDate" date,
    "forecastEndDate" date,
    "userId" bigint,
    "cabinetMakerId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    CONSTRAINT "OrderProjectStatusForecast_assignee_xor_check" CHECK ((("userId" IS NULL) OR ("cabinetMakerId" IS NULL))),
    CONSTRAINT "OrderProjectStatusForecast_dates_check" CHECK ((("forecastStartDate" IS NULL) OR ("forecastEndDate" IS NULL) OR ("forecastStartDate" <= "forecastEndDate"))),
    CONSTRAINT "OrderProjectStatusForecast_has_content_check" CHECK ((("forecastStartDate" IS NOT NULL) OR ("forecastEndDate" IS NOT NULL) OR ("userId" IS NOT NULL) OR ("cabinetMakerId" IS NOT NULL)))
);


--
-- Name: TABLE "OrderProjectStatusForecast"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."OrderProjectStatusForecast" IS 'Optional user-maintained forecast per project and status. Assignee fields are planning hints; OrderProject is updated only when the user clicks Associar.';


--
-- Name: COLUMN "OrderProjectStatusForecast"."userId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProjectStatusForecast"."userId" IS 'Planned designer (appUsers) for this status forecast.';


--
-- Name: COLUMN "OrderProjectStatusForecast"."cabinetMakerId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."OrderProjectStatusForecast"."cabinetMakerId" IS 'Planned cabinet maker for this status forecast.';


--
-- Name: OrderProjectStatusForecast_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatusForecast" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectStatusForecast_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProjectStatusHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatusHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectStatusHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProjectStatus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatus" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectStatus_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProjectSubstatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderProjectSubstatus" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    kind text NOT NULL,
    "startedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "endedAt" timestamp with time zone,
    "startedById" bigint,
    "endedById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    CONSTRAINT "OrderProjectSubstatus_kind_check" CHECK ((kind = ANY (ARRAY['AwaitingRequest'::text, 'InternalAssemblyAwaiting'::text, 'InternalAssemblyPainting'::text, 'InternalAssemblyMetalwork'::text, 'InternalAssemblyUpholstery'::text, 'InternalAssemblyGlass'::text, 'InternalAssemblyAwaitingHardware'::text]))),
    CONSTRAINT "OrderProjectSubstatus_period_check" CHECK ((("endedAt" IS NULL) OR ("endedAt" >= "startedAt")))
);


--
-- Name: TABLE "OrderProjectSubstatus"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."OrderProjectSubstatus" IS 'Períodos de substatus do projeto. Não substitui o status principal. kind AwaitingRequest = Aguardando Requisição.';


--
-- Name: OrderProjectSubstatus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectSubstatus" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProjectSubstatus_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderProject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderProject" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderProject_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderRequest" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedById" bigint,
    "designerId" bigint NOT NULL,
    status text DEFAULT 'Aberto'::text NOT NULL,
    "designerRequest" text NOT NULL,
    "commercialResponse" text,
    "responseAt" timestamp with time zone,
    "requestProfile" text,
    "designerResponse" text,
    "orderProjectId" bigint,
    "fromConference" character(1) DEFAULT 'N'::bpchar NOT NULL,
    "requestType" text DEFAULT 'project'::text NOT NULL,
    CONSTRAINT "OrderRequest_fromConference_check" CHECK (("fromConference" = ANY (ARRAY['N'::bpchar, 'Y'::bpchar]))),
    CONSTRAINT "OrderRequest_requestType_check" CHECK (("requestType" = ANY (ARRAY['project'::text, 'detailing'::text])))
);


--
-- Name: OrderRequestActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderRequestActivity" (
    id bigint NOT NULL,
    "orderRequestId" bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    observation text,
    "completedAt" timestamp with time zone,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: OrderRequestActivity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequestActivity" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderRequestActivity_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: OrderRequestAttachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrderRequestAttachment" (
    id bigint NOT NULL,
    "orderRequestId" bigint NOT NULL,
    "storagePath" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text DEFAULT 'image/jpeg'::text NOT NULL,
    "fileSizeBytes" bigint,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "orderRequestActivityId" bigint
);


--
-- Name: OrderRequestAttachment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequestAttachment" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."OrderRequestAttachment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PartRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartRequest" (
    id bigint NOT NULL,
    "pieceName" text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    "thicknessMm" numeric(10,2),
    material text,
    "drawingJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    "clientId" bigint,
    "orderId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "cabinetMakerId" bigint,
    "deliveryDueDate" date,
    "montadorId" bigint,
    "factoryEmployeeId" bigint,
    "orderProjectId" bigint,
    CONSTRAINT "PartRequest_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'Manufacturing'::text, 'Quality'::text, 'Shipping'::text, 'Delivered'::text])))
);


--
-- Name: TABLE "PartRequest"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."PartRequest" IS 'Solicitação de fabricação de peça avulsa (ex.: defeito); desenho draw.io em drawingJson. Uma peça por registro.';


--
-- Name: PartRequestStatusHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartRequestStatusHistory" (
    id bigint NOT NULL,
    "partRequestId" bigint NOT NULL,
    "previousStatus" text,
    "newStatus" text NOT NULL,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "changedById" bigint,
    "previousStatusDurationSeconds" integer,
    observation text
);


--
-- Name: PartRequestStatusHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PartRequestStatusHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PartRequestStatusHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PartRequest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PartRequest" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PartRequest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignConference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignConference" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    "designerId" bigint NOT NULL,
    "sketchUpPath" text,
    status text DEFAULT 'Em andamento'::text NOT NULL,
    "confirmedAt" timestamp with time zone,
    "confirmedById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "conferenceObservation" text,
    "approvedAt" timestamp with time zone,
    "approvedById" bigint,
    "networkPath" text,
    "managerObservation" text,
    CONSTRAINT "AnteprojetoConference_status_check" CHECK ((status = ANY (ARRAY['Rascunho'::text, 'Em andamento'::text, 'Parcialmente confirmada'::text, 'Confirmada'::text, 'Aprovada'::text])))
);


--
-- Name: PreliminaryDesignConferenceHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignConferenceHistory" (
    id bigint NOT NULL,
    "conferenceId" bigint NOT NULL,
    action text DEFAULT 'voltar_consultor'::text NOT NULL,
    observation text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    CONSTRAINT "AnteprojetoConferenceHistory_action_check" CHECK ((action = 'voltar_consultor'::text))
);


--
-- Name: PreliminaryDesignConferenceHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConferenceHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignConferenceHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignConferenceProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignConferenceProject" (
    id bigint NOT NULL,
    "conferenceId" bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: PreliminaryDesignConferenceProject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConferenceProject" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignConferenceProject_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignConference_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConference" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignConference_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignModule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignModule" (
    id bigint NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    "consultantChecked" boolean DEFAULT false NOT NULL,
    "consultantResponse" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "conferenceProjectId" bigint NOT NULL
);


--
-- Name: PreliminaryDesignModuleObservation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignModuleObservation" (
    id bigint NOT NULL,
    "moduleId" bigint NOT NULL,
    "observationId" bigint NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "consultantChecked" boolean DEFAULT false NOT NULL,
    "consultantResponse" text,
    "consultantDisposition" text,
    CONSTRAINT "PreliminaryDesignModuleObservation_consultantDisposition_check" CHECK ((("consultantDisposition" IS NULL) OR ("consultantDisposition" = ANY (ARRAY['req_proj'::text, 'req_cons'::text, 'ok'::text]))))
);


--
-- Name: PreliminaryDesignModuleObservation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignModuleObservation" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignModuleObservation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignModule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignModule" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignModule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PreliminaryDesignObservation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PreliminaryDesignObservation" (
    id bigint NOT NULL,
    text text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint
);


--
-- Name: PreliminaryDesignObservation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignObservation" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PreliminaryDesignObservation_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ProjectCharacteristic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProjectCharacteristic" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ProjectCharacteristic_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ProjectCharacteristic" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ProjectCharacteristic_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ProjectProductionQueue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProjectProductionQueue" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    sequence integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint
);


--
-- Name: TABLE "ProjectProductionQueue"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."ProjectProductionQueue" IS 'Prioridade de entrega do time de projetos para a produção. sequence menor = maior prioridade.';


--
-- Name: ProjectProductionQueue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ProjectProductionQueue" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."ProjectProductionQueue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Purchase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Purchase" (
    id bigint NOT NULL,
    "implementationId" bigint,
    "orderProjectId" bigint,
    "purchaseType" text NOT NULL,
    status text DEFAULT 'Aberto'::text NOT NULL,
    note text,
    "quoteFilePath" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "expectedDeliveryAt" timestamp with time zone,
    "implementationPurchaseItemId" bigint,
    "purchaseReasonId" bigint,
    "thirdPartySubtypeId" bigint,
    "requestOrigin" text DEFAULT 'manual'::text,
    "requestObservation" text,
    "attachmentPath" text,
    "attachmentFileName" text,
    "externalAssemblyInspectionId" bigint,
    "assistanceRequestId" bigint,
    CONSTRAINT "Purchase_purchaseType_check" CHECK (("purchaseType" = ANY (ARRAY['Material'::text, 'Ferragem'::text, 'Tinta'::text, 'Terceiro'::text, 'Implantação'::text])))
);


--
-- Name: COLUMN "Purchase"."externalAssemblyInspectionId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Purchase"."externalAssemblyInspectionId" IS 'Purchase request created from external assembly inspection flow.';


--
-- Name: COLUMN "Purchase"."assistanceRequestId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Purchase"."assistanceRequestId" IS 'Purchase request created from assistance flow.';


--
-- Name: PurchaseReason; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PurchaseReason" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "isSystem" boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN "PurchaseReason"."isSystem"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."PurchaseReason"."isSystem" IS 'System-only purchase reason; hidden from manual purchase requests.';


--
-- Name: PurchaseReason_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PurchaseReason" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PurchaseReason_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: PurchaseStatus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PurchaseStatus" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isClosed" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: PurchaseStatus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."PurchaseStatus" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."PurchaseStatus_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Purchase_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Purchase" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Purchase_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Revision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Revision" (
    id bigint NOT NULL,
    "orderProjectId" bigint,
    "thirdPartyProjectId" bigint,
    "revisionType" public."RevisionType" NOT NULL,
    status public."RevisionRecordStatus" DEFAULT 'open'::public."RevisionRecordStatus" NOT NULL,
    "revisionStartedAt" timestamp with time zone,
    "revisionCompletedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    CONSTRAINT "Revision_subject_xor_check" CHECK (((("orderProjectId" IS NOT NULL) AND ("thirdPartyProjectId" IS NULL)) OR (("orderProjectId" IS NULL) AND ("thirdPartyProjectId" IS NOT NULL)))),
    CONSTRAINT "Revision_type_subject_check" CHECK (((("revisionType" = 'third_party'::public."RevisionType") AND ("thirdPartyProjectId" IS NOT NULL)) OR (("revisionType" <> 'third_party'::public."RevisionType") AND ("orderProjectId" IS NOT NULL))))
);


--
-- Name: TABLE "Revision"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."Revision" IS 'Ciclo de revisão unificado (comercial, líder, terceiros). status: open | closed.';


--
-- Name: RevisionActivity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RevisionActivity" (
    id bigint NOT NULL,
    "revisionId" bigint NOT NULL,
    description text NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    observation text,
    "completedAt" timestamp with time zone,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: RevisionActivityAttachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RevisionActivityAttachment" (
    id bigint NOT NULL,
    "revisionActivityId" bigint NOT NULL,
    "storagePath" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text DEFAULT 'image/jpeg'::text NOT NULL,
    "fileSizeBytes" bigint,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint
);


--
-- Name: RevisionActivityAttachment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."RevisionActivityAttachment" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."RevisionActivityAttachment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: RevisionActivity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."RevisionActivity" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."RevisionActivity_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Revision_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."Revision" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Revision_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionConsultantAdjustment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionConsultantAdjustment" (
    id bigint NOT NULL,
    "saleYearMonth" text NOT NULL,
    "consultantUserId" bigint NOT NULL,
    "adjustmentPercent" numeric(8,4) NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdByUserId" bigint,
    CONSTRAINT "SalesCommissionConsultantAdjustment_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesCommissionConsultantAdjustment"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionConsultantAdjustment" IS 'Ajuste manual da alíquota de faixa por consultor no mês de venda (soma dos registros; aplica-se às vendas sem alíquota específica).';


--
-- Name: SalesCommissionConsultantAdjustment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionConsultantAdjustment" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionConsultantAdjustment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionEntry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionEntry" (
    id bigint NOT NULL,
    "monthCloseId" bigint,
    "salesOrderId" bigint,
    "consultantUserId" bigint NOT NULL,
    "saleDate" date NOT NULL,
    "saleYearMonth" text NOT NULL,
    "referenceYearMonth" text NOT NULL,
    "orderCode" text DEFAULT ''::text NOT NULL,
    "clientName" text DEFAULT ''::text NOT NULL,
    "consultantName" text DEFAULT ''::text NOT NULL,
    "saleValue" numeric(14,2) DEFAULT 0 NOT NULL,
    "commissionAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "ratePercent" numeric(8,4) DEFAULT 0 NOT NULL,
    "installmentNumber" integer DEFAULT 1 NOT NULL,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "clientInstallmentAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "entryType" text DEFAULT 'consultant'::text NOT NULL,
    CONSTRAINT "SalesCommissionEntry_entryType_check" CHECK (("entryType" = ANY (ARRAY['consultant'::text, 'manager_own'::text, 'manager_team'::text, 'manager_delivery_bonus'::text]))),
    CONSTRAINT "SalesCommissionEntry_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "SalesCommissionEntry_installmentNumber_check" CHECK (("installmentNumber" >= 1)),
    CONSTRAINT "SalesCommissionEntry_referenceYearMonth_format" CHECK (("referenceYearMonth" ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT "SalesCommissionEntry_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesCommissionEntry"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionEntry" IS 'Parcelas de comissão por pedido após fechamento (uma linha por parcela no mês de referência).';


--
-- Name: COLUMN "SalesCommissionEntry"."salesOrderId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionEntry"."salesOrderId" IS 'Opcional: vínculo com pedido do FGP quando existir; import histórico usa só orderCode.';


--
-- Name: COLUMN "SalesCommissionEntry"."referenceYearMonth"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionEntry"."referenceYearMonth" IS 'Mês de referência da parcela de comissão (Mês Ref na planilha).';


--
-- Name: COLUMN "SalesCommissionEntry"."commissionAmount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionEntry"."commissionAmount" IS 'Valor da comissão a pagar ao consultor na parcela.';


--
-- Name: COLUMN "SalesCommissionEntry"."clientInstallmentAmount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionEntry"."clientInstallmentAmount" IS 'Valor da parcela de pagamento do cliente.';


--
-- Name: COLUMN "SalesCommissionEntry"."entryType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionEntry"."entryType" IS 'consultant | manager_own | manager_team | manager_delivery_bonus';


--
-- Name: SalesCommissionEntry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionEntry" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionEntry_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionManagerTier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionManagerTier" (
    id bigint NOT NULL,
    "salesMonthlyTargetId" bigint NOT NULL,
    "minAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "maxAmount" numeric(14,2),
    "ratePercent" numeric(8,4) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesCommissionManagerTier_min_lte_max" CHECK ((("maxAmount" IS NULL) OR ("maxAmount" >= "minAmount")))
);


--
-- Name: TABLE "SalesCommissionManagerTier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionManagerTier" IS 'Faixas de alíquota para vendas próprias do gestor comercial no mês.';


--
-- Name: SalesCommissionManagerTier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionManagerTier" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionManagerTier_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionMonthClose; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionMonthClose" (
    id bigint NOT NULL,
    "saleYearMonth" text NOT NULL,
    "closedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "closedByUserId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesCommissionMonthClose_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesCommissionMonthClose"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionMonthClose" IS 'Fechamento de comissão por mês de venda (gestor confirma vendas e fecha).';


--
-- Name: SalesCommissionMonthClose_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionMonthClose" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionMonthClose_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionSale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionSale" (
    id bigint NOT NULL,
    "salesOrderId" bigint,
    "orderCode" text DEFAULT ''::text NOT NULL,
    "saleDate" date NOT NULL,
    "saleYearMonth" text NOT NULL,
    "consultantUserId" bigint NOT NULL,
    "clientName" text DEFAULT ''::text NOT NULL,
    "saleValue" numeric(14,2) DEFAULT 0 NOT NULL,
    "paymentMethod" text DEFAULT 'cash'::text NOT NULL,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "countsForTier" boolean DEFAULT true NOT NULL,
    "rateOverride" numeric(8,4),
    "importedRatePercent" numeric(8,4),
    "isImported" boolean DEFAULT false NOT NULL,
    source text DEFAULT 'fgp_order'::text NOT NULL,
    "importedAt" timestamp with time zone,
    "importedByUserId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "countsForManagerCommission" boolean DEFAULT true NOT NULL,
    CONSTRAINT "SalesCommissionSale_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "SalesCommissionSale_paymentMethod_check" CHECK (("paymentMethod" = ANY (ARRAY['cash'::text, 'installment'::text]))),
    CONSTRAINT "SalesCommissionSale_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT "SalesCommissionSale_source_check" CHECK ((source = ANY (ARRAY['fgp_order'::text, 'historical_import'::text])))
);


--
-- Name: TABLE "SalesCommissionSale"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionSale" IS 'Venda importada para comissão. Meta realizado e fechamento usam registros com isImported=true.';


--
-- Name: COLUMN "SalesCommissionSale"."salesOrderId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionSale"."salesOrderId" IS 'Vínculo opcional com pedido FGP; NULL em import histórico sem pedido.';


--
-- Name: COLUMN "SalesCommissionSale"."rateOverride"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionSale"."rateOverride" IS 'Alíquota específica da venda. NULL = usa faixa/ajuste do consultor.';


--
-- Name: COLUMN "SalesCommissionSale"."importedRatePercent"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionSale"."importedRatePercent" IS 'Alíquota fixa de import histórico (legado da planilha).';


--
-- Name: COLUMN "SalesCommissionSale"."isImported"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionSale"."isImported" IS 'Quando true, entra no realizado da meta e no fechamento do mês.';


--
-- Name: COLUMN "SalesCommissionSale"."countsForManagerCommission"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesCommissionSale"."countsForManagerCommission" IS 'When true, sale counts for manager team % and delivery bonus; always counts toward monthly target sum.';


--
-- Name: SalesCommissionSaleInstallment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionSaleInstallment" (
    id bigint NOT NULL,
    "salesCommissionSaleId" bigint NOT NULL,
    "installmentNumber" integer NOT NULL,
    "paymentYearMonth" text NOT NULL,
    "clientInstallmentAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesCommissionSaleInstallment_installmentNumber_check" CHECK (("installmentNumber" >= 1)),
    CONSTRAINT "SalesCommissionSaleInstallment_paymentYearMonth_format" CHECK (("paymentYearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesCommissionSaleInstallment"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionSaleInstallment" IS 'Parcelas de pagamento do cliente na venda importada para comissão.';


--
-- Name: SalesCommissionSaleInstallment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionSaleInstallment" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionSaleInstallment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionSale_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionSale" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionSale_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesCommissionTier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesCommissionTier" (
    id bigint NOT NULL,
    "salesMonthlyTargetId" bigint NOT NULL,
    "minAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "maxAmount" numeric(14,2),
    "ratePercent" numeric(8,4) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesCommissionTier_min_lte_max" CHECK ((("maxAmount" IS NULL) OR ("maxAmount" >= "minAmount")))
);


--
-- Name: TABLE "SalesCommissionTier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesCommissionTier" IS 'Faixas de alíquota de comissão por volume de vendas no mês.';


--
-- Name: SalesCommissionTier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionTier" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionTier_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesMonthlyTarget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesMonthlyTarget" (
    id bigint NOT NULL,
    "yearMonth" text NOT NULL,
    "targetAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "managerTeamSalePercent" numeric(8,4),
    "managerTargetBonusPercent" numeric(8,4),
    CONSTRAINT "SalesMonthlyTarget_yearMonth_format" CHECK (("yearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesMonthlyTarget"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesMonthlyTarget" IS 'Meta de venda mensal do time comercial.';


--
-- Name: COLUMN "SalesMonthlyTarget"."managerTeamSalePercent"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesMonthlyTarget"."managerTeamSalePercent" IS 'Percentual sobre o valor total de cada venda de outros consultores (mês seguinte à venda).';


--
-- Name: COLUMN "SalesMonthlyTarget"."managerTargetBonusPercent"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."SalesMonthlyTarget"."managerTargetBonusPercent" IS 'Percentual bônus quando a meta do mês é atingida (mês seguinte à entrega do pedido).';


--
-- Name: SalesMonthlyTarget_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesMonthlyTarget" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesMonthlyTarget_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SalesOrderClientInstallment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesOrderClientInstallment" (
    id bigint NOT NULL,
    "salesOrderId" bigint NOT NULL,
    "installmentNumber" integer NOT NULL,
    "paymentYearMonth" text NOT NULL,
    "clientInstallmentAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesOrderClientInstallment_installmentNumber_check" CHECK (("installmentNumber" >= 1)),
    CONSTRAINT "SalesOrderClientInstallment_paymentYearMonth_format" CHECK (("paymentYearMonth" ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: TABLE "SalesOrderClientInstallment"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."SalesOrderClientInstallment" IS 'Parcelas de pagamento do cliente em vendas parceladas (valor e mês de cada parcela).';


--
-- Name: SalesOrderClientInstallment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."SalesOrderClientInstallment" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesOrderClientInstallment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: SystemSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SystemSettings" (
    "settingsKey" text DEFAULT 'default'::text NOT NULL,
    "approvalCcEmails" text DEFAULT ''::text NOT NULL,
    "requestCcEmails" text DEFAULT ''::text NOT NULL,
    "approvalOverdueDays" integer DEFAULT 5 NOT NULL,
    "requestOverdueDays" integer DEFAULT 5 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "expeditionFactoryStreet" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryNumber" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryComplement" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryNeighborhood" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryCity" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryState" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryPostalCode" text DEFAULT ''::text NOT NULL,
    CONSTRAINT "SystemSettings_approvalOverdueDays_check" CHECK (("approvalOverdueDays" > 0)),
    CONSTRAINT "SystemSettings_requestOverdueDays_check" CHECK (("requestOverdueDays" > 0))
);


--
-- Name: ThirdPartyProject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ThirdPartyProject" (
    id bigint NOT NULL,
    "orderId" bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "projectCharacteristicId" bigint,
    "thirdPartySubtypeId" bigint NOT NULL,
    "filePath" text,
    "designerId" bigint,
    status text DEFAULT 'Open'::text NOT NULL,
    "sentAt" timestamp with time zone,
    "approvedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "projectObservation" text,
    "cancelObservation" text,
    CONSTRAINT "ThirdPartyProject_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'Sent'::text, 'InReview'::text, 'Approved'::text, 'Canceled'::text])))
);


--
-- Name: COLUMN "ThirdPartyProject"."projectObservation"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."ThirdPartyProject"."projectObservation" IS 'Texto livre sobre o projeto de terceiros; visível na tela Enviados para Compras.';


--
-- Name: COLUMN "ThirdPartyProject"."cancelObservation"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."ThirdPartyProject"."cancelObservation" IS 'Motivo do cancelamento; preenchido ao definir status Canceled (Gestão).';


--
-- Name: ThirdPartyProjectStatusHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ThirdPartyProjectStatusHistory" (
    id bigint NOT NULL,
    "thirdPartyProjectId" bigint NOT NULL,
    "previousStatus" text,
    "newStatus" text NOT NULL,
    "changedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "changedById" bigint,
    "previousStatusDurationSeconds" bigint,
    observation text
);


--
-- Name: COLUMN "ThirdPartyProjectStatusHistory".observation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."ThirdPartyProjectStatusHistory".observation IS 'Observação do cancelamento ou outra nota registrada na mudança de status.';


--
-- Name: ThirdPartyProjectStatusHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartyProjectStatusHistory" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ThirdPartyProjectStatusHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ThirdPartyProject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartyProject" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ThirdPartyProject_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ThirdPartySubtype; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ThirdPartySubtype" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "projectCharacteristicId" bigint
);


--
-- Name: ThirdPartySubtype_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartySubtype" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."ThirdPartySubtype_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: WoodworkQualityChecklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WoodworkQualityChecklist" (
    id bigint NOT NULL,
    "orderProjectId" bigint NOT NULL,
    "versionNumber" integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    "thirdPartyTestedNotes" text,
    "machiningRefusalNotes" text,
    "projectNotes" text,
    "completedAt" timestamp with time zone,
    "completedById" bigint,
    "createdById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "WoodworkQualityChecklist_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])))
);


--
-- Name: WoodworkQualityChecklistItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WoodworkQualityChecklistItem" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: WoodworkQualityChecklistItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklistItem" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."WoodworkQualityChecklistItem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: WoodworkQualityChecklistLine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WoodworkQualityChecklistLine" (
    id bigint NOT NULL,
    "checklistId" bigint NOT NULL,
    "catalogItemId" bigint,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    label text NOT NULL,
    answer text,
    CONSTRAINT "WoodworkQualityChecklistLine_answer_check" CHECK (((answer IS NULL) OR (answer = ANY (ARRAY['ok'::text, 'no'::text, 'na'::text]))))
);


--
-- Name: WoodworkQualityChecklistLine_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklistLine" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."WoodworkQualityChecklistLine_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: WoodworkQualityChecklist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklist" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."WoodworkQualityChecklist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: WpsItemRegistrationRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WpsItemRegistrationRequest" (
    id bigint NOT NULL,
    "wpsItemTypeId" bigint NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    "wpsCode" text,
    "sentAt" timestamp with time zone,
    "sentById" bigint,
    "registeredAt" timestamp with time zone,
    "registeredById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    "budgetInProgressAt" timestamp with time zone,
    "budgetInProgressById" bigint,
    CONSTRAINT "WpsItemRegistrationRequest_registered_wps_code_check" CHECK (((status <> 'Registered'::text) OR (NULLIF(TRIM(BOTH FROM "wpsCode"), ''::text) IS NOT NULL))),
    CONSTRAINT "WpsItemRegistrationRequest_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'Sent'::text, 'InBudget'::text, 'Registered'::text])))
);


--
-- Name: TABLE "WpsItemRegistrationRequest"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."WpsItemRegistrationRequest" IS 'Solicitação de cadastro de item no WPS. status: Open, Sent, Registered.';


--
-- Name: COLUMN "WpsItemRegistrationRequest"."budgetInProgressAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."WpsItemRegistrationRequest"."budgetInProgressAt" IS 'Quando Compras marcou Em processo de orçamento.';


--
-- Name: WpsItemRegistrationRequest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."WpsItemRegistrationRequest" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."WpsItemRegistrationRequest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: WpsItemType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WpsItemType" (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint
);


--
-- Name: TABLE "WpsItemType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."WpsItemType" IS 'Tipos de item para cadastro no WPS (Gestão → Cadastros).';


--
-- Name: WpsItemType_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."WpsItemType" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."WpsItemType_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: addr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addr (
    id bigint NOT NULL,
    "ownerType" text NOT NULL,
    "ownerId" bigint NOT NULL,
    "labelId" bigint NOT NULL,
    nickname text,
    "postalCode" text NOT NULL,
    street text NOT NULL,
    number text,
    complement text,
    neighborhood text,
    city text NOT NULL,
    state text NOT NULL,
    country text DEFAULT 'BR'::text NOT NULL,
    notes text,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint,
    CONSTRAINT addr_ownertype_check CHECK (("ownerType" = ANY (ARRAY['client'::text, 'supplier'::text]))),
    CONSTRAINT addr_postalcode_check CHECK (("postalCode" ~ '^[0-9]{8}$'::text)),
    CONSTRAINT addr_state_check CHECK ((char_length(state) = 2))
);


--
-- Name: addr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.addr ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.addr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: addrlabel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addrlabel (
    id bigint NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdById" bigint,
    "updatedById" bigint
);


--
-- Name: addrlabel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.addrlabel ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.addrlabel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: appUsers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."appUsers" (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    role text,
    "authId" uuid,
    "isActive" boolean DEFAULT true NOT NULL,
    "isConferenceReviewer" boolean DEFAULT false NOT NULL,
    "isCommercialManager" boolean DEFAULT false NOT NULL,
    "isProjectsManager" boolean DEFAULT false NOT NULL,
    "isPpcp" boolean DEFAULT false NOT NULL,
    "isFactoryManager" boolean DEFAULT false NOT NULL,
    "isDetailing" boolean DEFAULT false NOT NULL,
    "isReviewer" boolean DEFAULT false NOT NULL,
    "isThirdParty" boolean DEFAULT false NOT NULL,
    "calendarColor" text,
    "isFactoryAdministrative" boolean DEFAULT false NOT NULL,
    "isInstaller" boolean DEFAULT false NOT NULL,
    "receiveEmailCopy" boolean DEFAULT false NOT NULL,
    "matrixUserId" text,
    "isBudgetEstimator" boolean DEFAULT false NOT NULL,
    "isPicker" boolean DEFAULT false NOT NULL,
    "isCoordination" boolean DEFAULT false NOT NULL,
    "isBuyer" boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN "appUsers"."isReviewer"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isReviewer" IS 'Projetista revisor: vê e age em todos os projetos nos status do revisor, sem vínculo por projeto.';


--
-- Name: COLUMN "appUsers"."isThirdParty"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isThirdParty" IS 'Usuário terceiro (não funcionário). Acesso restrito à tela de Pendências.';


--
-- Name: COLUMN "appUsers"."calendarColor"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."calendarColor" IS 'Cor do calendário no FGP e no Google Agenda (hex da paleta Google Calendar).';


--
-- Name: COLUMN "appUsers"."isFactoryAdministrative"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isFactoryAdministrative" IS 'Fabrica administrativo: pendências da fábrica e edição da programação de montagem.';


--
-- Name: COLUMN "appUsers"."isInstaller"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isInstaller" IS 'When true with role Fábrica: FGP navigation limited to 3D viewer.';


--
-- Name: COLUMN "appUsers"."receiveEmailCopy"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."receiveEmailCopy" IS 'When true, user receives CC on emails triggered by their own actions in the app.';


--
-- Name: COLUMN "appUsers"."matrixUserId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."matrixUserId" IS 'Matrix user ID (MXID) for Element notifications and DMs.';


--
-- Name: COLUMN "appUsers"."isBudgetEstimator"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isBudgetEstimator" IS 'When true with role Projetista: budget estimator (orçamentista) attribute.';


--
-- Name: COLUMN "appUsers"."isPicker"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isPicker" IS 'Separador: pode ser responsável por embarque/desembarque na expedição.';


--
-- Name: COLUMN "appUsers"."isCoordination"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isCoordination" IS 'Fábrica: coordenação operacional (mesmo escopo de permissões do gestor de projetos).';


--
-- Name: COLUMN "appUsers"."isBuyer"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."appUsers"."isBuyer" IS 'Fábrica: equipe de compras (ex-perfil Compras).';


--
-- Name: appUsers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."appUsers" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."appUsers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: designers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designers (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: designers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.designers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.designers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: importConsultorWPS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."importConsultorWPS" (
    id bigint NOT NULL,
    "consultantWps" text NOT NULL,
    "consultantFgp" text NOT NULL
);


--
-- Name: importConsultorWPS_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."importConsultorWPS" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."importConsultorWPS_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: importMarceneiroWPS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."importMarceneiroWPS" (
    id bigint NOT NULL,
    "cabinetMakerWps" text NOT NULL,
    "cabinetMakerFgp" text NOT NULL
);


--
-- Name: importMarceneiroWPS_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."importMarceneiroWPS" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."importMarceneiroWPS_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: importStatusWPS; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."importStatusWPS" (
    id bigint NOT NULL,
    "statusWps" text NOT NULL,
    "statusFgp" text NOT NULL
);


--
-- Name: importStatusWPS_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."importStatusWPS" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."importStatusWPS_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orderConversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequest" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."orderConversations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salesOrders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."salesOrders" (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedById" bigint,
    "orderCode" text NOT NULL,
    "clientDeliveryDate" date,
    "consultantUserId" bigint,
    "clientId" bigint,
    "actualDeliveryDate" date,
    "saleDate" date,
    "addrId" bigint,
    "architectId" bigint,
    "paymentMethod" text,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "commissionConfirmed" boolean DEFAULT false NOT NULL,
    "commissionRatePercent" numeric(8,4),
    "commissionCountsForTier" boolean DEFAULT true NOT NULL,
    "commissionRateOverride" numeric(8,4),
    "wpsQuoteCode" text,
    CONSTRAINT "salesOrders_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "salesOrders_paymentMethod_check" CHECK ((("paymentMethod" IS NULL) OR ("paymentMethod" = ANY (ARRAY['cash'::text, 'installment'::text]))))
);


--
-- Name: COLUMN "salesOrders"."actualDeliveryDate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."actualDeliveryDate" IS 'Actual order delivery/completion date.';


--
-- Name: COLUMN "salesOrders"."saleDate"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."saleDate" IS 'Data de venda do pedido';


--
-- Name: COLUMN "salesOrders"."paymentMethod"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."paymentMethod" IS 'cash = à vista; installment = parcelado.';


--
-- Name: COLUMN "salesOrders"."installmentCount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."installmentCount" IS 'Quantidade de parcelas da comissão (1 para à vista).';


--
-- Name: COLUMN "salesOrders"."commissionConfirmed"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."commissionConfirmed" IS 'Quando true, a venda entra no cálculo de comissão.';


--
-- Name: COLUMN "salesOrders"."commissionRatePercent"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."commissionRatePercent" IS 'Alíquota de comissão do pedido em percentual (ex.: 4.75 = 4,75%%). Preenchida na importação da planilha; quando definida, prevalece sobre as faixas do mês da venda.';


--
-- Name: COLUMN "salesOrders"."commissionCountsForTier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."commissionCountsForTier" IS 'Quando false, a venda não entra na soma do consultor para cálculo da faixa do mês.';


--
-- Name: COLUMN "salesOrders"."commissionRateOverride"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."commissionRateOverride" IS 'Alíquota específica da venda em percentual (ex.: 4.75). NULL = usa faixa/ajuste do consultor; 0 = sem comissão nesta venda.';


--
-- Name: COLUMN "salesOrders"."wpsQuoteCode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."salesOrders"."wpsQuoteCode" IS 'WPS budget/quote code for the sales order.';


--
-- Name: salesOrders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."salesOrders" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."salesOrders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ActivityLog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog" ALTER COLUMN id SET DEFAULT nextval('public."ActivityLog_id_seq"'::regclass);


--
-- Name: ExternalAssemblyInspection id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspection" ALTER COLUMN id SET DEFAULT nextval('public."ExternalAssemblyInspection_id_seq"'::regclass);


--
-- Name: ExternalAssemblyInspectionActivity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity" ALTER COLUMN id SET DEFAULT nextval('public."ExternalAssemblyInspectionActivity_id_seq"'::regclass);


--
-- Name: ExternalAssemblyInspectionProject id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject" ALTER COLUMN id SET DEFAULT nextval('public."ExternalAssemblyInspectionProject_id_seq"'::regclass);


--
-- Name: ActivityLog ActivityLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_orderProjectId_key" UNIQUE ("orderProjectId");


--
-- Name: AppError AppError_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AppError"
    ADD CONSTRAINT "AppError_pkey" PRIMARY KEY (id);


--
-- Name: Architect Architect_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Architect"
    ADD CONSTRAINT "Architect_pkey" PRIMARY KEY (id);


--
-- Name: AssemblyScheduleCabinetMaker AssemblyScheduleCabinetMaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "AssemblyScheduleCabinetMaker_pkey" PRIMARY KEY (id);


--
-- Name: AssemblyScheduleInstaller AssemblyScheduleInstaller_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "AssemblyScheduleInstaller_pkey" PRIMARY KEY (id);


--
-- Name: AssemblySchedule AssemblySchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "AssemblySchedule_pkey" PRIMARY KEY (id);


--
-- Name: AssistanceRequestStatusHistory AssistanceRequestStatusHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequestStatusHistory"
    ADD CONSTRAINT "AssistanceRequestStatusHistory_pkey" PRIMARY KEY (id);


--
-- Name: AssistanceRequest AssistanceRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_pkey" PRIMARY KEY (id);


--
-- Name: CabinetMaker CabinetMaker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CabinetMaker"
    ADD CONSTRAINT "CabinetMaker_pkey" PRIMARY KEY (id);


--
-- Name: CalendarEventType CalendarEventType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEventType"
    ADD CONSTRAINT "CalendarEventType_pkey" PRIMARY KEY (id);


--
-- Name: CalendarEvent CalendarEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY (id);


--
-- Name: Client Client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Client"
    ADD CONSTRAINT "Client_pkey" PRIMARY KEY (id);


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: DealActivity DealActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_pkey" PRIMARY KEY (id);


--
-- Name: DealLostReason DealLostReason_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealLostReason"
    ADD CONSTRAINT "DealLostReason_pkey" PRIMARY KEY (id);


--
-- Name: DealNote DealNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealNote"
    ADD CONSTRAINT "DealNote_pkey" PRIMARY KEY (id);


--
-- Name: DealStage DealStage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealStage"
    ADD CONSTRAINT "DealStage_pkey" PRIMARY KEY (id);


--
-- Name: Deal Deal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_pkey" PRIMARY KEY (id);


--
-- Name: Detailing Detailing_orderProjectId_detailingType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_orderProjectId_detailingType_key" UNIQUE ("orderProjectId", "detailingType");


--
-- Name: Detailing Detailing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_pkey" PRIMARY KEY (id);


--
-- Name: DriveFile DriveFile_driveFileId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DriveFile"
    ADD CONSTRAINT "DriveFile_driveFileId_key" UNIQUE ("driveFileId");


--
-- Name: DriveFile DriveFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DriveFile"
    ADD CONSTRAINT "DriveFile_pkey" PRIMARY KEY (id);


--
-- Name: EnvironmentType EnvironmentType_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EnvironmentType"
    ADD CONSTRAINT "EnvironmentType_name_key" UNIQUE (name);


--
-- Name: EnvironmentType EnvironmentType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EnvironmentType"
    ADD CONSTRAINT "EnvironmentType_pkey" PRIMARY KEY (id);


--
-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_pkey" PRIMARY KEY (id);


--
-- Name: ExpeditionRouteStop ExpeditionRouteStop_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStop"
    ADD CONSTRAINT "ExpeditionRouteStop_pkey" PRIMARY KEY (id);


--
-- Name: ExpeditionRoute ExpeditionRoute_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_pkey" PRIMARY KEY (id);


--
-- Name: ExpeditionVolume ExpeditionVolume_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_pkey" PRIMARY KEY (id);


--
-- Name: ExpeditionVolume ExpeditionVolume_stop_item_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_stop_item_index_unique" UNIQUE ("stopItemId", "volumeIndex");


--
-- Name: ExpeditionVolume ExpeditionVolume_volumeCode_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_volumeCode_unique" UNIQUE ("volumeCode");


--
-- Name: ExternalAssemblyInspectionActivity ExternalAssemblyInspectionActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity"
    ADD CONSTRAINT "ExternalAssemblyInspectionActivity_pkey" PRIMARY KEY (id);


--
-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_inspection_project_uidx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_inspection_project_uidx" UNIQUE ("inspectionId", "orderProjectId");


--
-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_pkey" PRIMARY KEY (id);


--
-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_pkey" PRIMARY KEY (id);


--
-- Name: FactoryEmployee FactoryEmployee_legacyCabinetMakerId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_legacyCabinetMakerId_key" UNIQUE ("legacyCabinetMakerId");


--
-- Name: FactoryEmployee FactoryEmployee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_pkey" PRIMARY KEY (id);


--
-- Name: FactoryRole FactoryRole_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryRole"
    ADD CONSTRAINT "FactoryRole_name_key" UNIQUE (name);


--
-- Name: FactoryRole FactoryRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryRole"
    ADD CONSTRAINT "FactoryRole_pkey" PRIMARY KEY (id);


--
-- Name: ImplementationPurchaseItem ImplementationPurchaseItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplementationPurchaseItem_pkey" PRIMARY KEY (id);


--
-- Name: Implementation Implementation_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_orderProjectId_key" UNIQUE ("orderProjectId");


--
-- Name: Implementation Implementation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_pkey" PRIMARY KEY (id);


--
-- Name: Installer Installer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Installer"
    ADD CONSTRAINT "Installer_pkey" PRIMARY KEY (id);


--
-- Name: MeasurementProject MeasurementProject_measurementId_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MeasurementProject_measurementId_orderProjectId_key" UNIQUE ("measurementId", "orderProjectId");


--
-- Name: MeasurementProject MeasurementProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MeasurementProject_pkey" PRIMARY KEY (id);


--
-- Name: Measurement Measurement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Measurement_pkey" PRIMARY KEY (id);


--
-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_programacaoId_marceneiroId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_programacaoId_marceneiroId_key" UNIQUE ("assemblyScheduleId", "cabinetMakerId");


--
-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_programacaoId_montadorId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_programacaoId_montadorId_key" UNIQUE ("assemblyScheduleId", "installerId");


--
-- Name: OrderDeliveryPhase OrderDeliveryPhase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderDeliveryPhase"
    ADD CONSTRAINT "OrderDeliveryPhase_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_orderProjectId_characteristicId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_orderProjectId_characteristicId_key" UNIQUE ("orderProjectId", "characteristicId");


--
-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectStatus OrderProjectStatus_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatus"
    ADD CONSTRAINT "OrderProjectStatus_name_key" UNIQUE (name);


--
-- Name: OrderProjectStatus OrderProjectStatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatus"
    ADD CONSTRAINT "OrderProjectStatus_pkey" PRIMARY KEY (id);


--
-- Name: OrderProjectSubstatus OrderProjectSubstatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_pkey" PRIMARY KEY (id);


--
-- Name: OrderProject OrderProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_pkey" PRIMARY KEY (id);


--
-- Name: OrderRequestActivity OrderRequestActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestActivity"
    ADD CONSTRAINT "OrderRequestActivity_pkey" PRIMARY KEY (id);


--
-- Name: OrderRequestAttachment OrderRequestAttachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_pkey" PRIMARY KEY (id);


--
-- Name: PartRequestStatusHistory PartRequestStatusHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequestStatusHistory"
    ADD CONSTRAINT "PartRequestStatusHistory_pkey" PRIMARY KEY (id);


--
-- Name: PartRequest PartRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignConferenceHistory PreliminaryDesignConferenceHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceHistory"
    ADD CONSTRAINT "PreliminaryDesignConferenceHistory_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignConferenceProject PreliminaryDesignConferenceProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "PreliminaryDesignConferenceProject_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignConference PreliminaryDesignConference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "PreliminaryDesignConference_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignModuleObservation PreliminaryDesignModuleObservation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignModuleObservation"
    ADD CONSTRAINT "PreliminaryDesignModuleObservation_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignModule PreliminaryDesignModule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignModule"
    ADD CONSTRAINT "PreliminaryDesignModule_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignObservation PreliminaryDesignObservation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "PreliminaryDesignObservation_pkey" PRIMARY KEY (id);


--
-- Name: PreliminaryDesignObservation PreliminaryDesignObservation_text_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "PreliminaryDesignObservation_text_key" UNIQUE (text);


--
-- Name: ProjectCharacteristic ProjectCharacteristic_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectCharacteristic"
    ADD CONSTRAINT "ProjectCharacteristic_pkey" PRIMARY KEY (id);


--
-- Name: ProjectProductionQueue ProjectProductionQueue_orderProjectId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_orderProjectId_key" UNIQUE ("orderProjectId");


--
-- Name: ProjectProductionQueue ProjectProductionQueue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseReason PurchaseReason_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PurchaseReason"
    ADD CONSTRAINT "PurchaseReason_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseStatus PurchaseStatus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PurchaseStatus"
    ADD CONSTRAINT "PurchaseStatus_pkey" PRIMARY KEY (id);


--
-- Name: Purchase Purchase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_pkey" PRIMARY KEY (id);


--
-- Name: RevisionActivityAttachment RevisionActivityAttachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RevisionActivityAttachment"
    ADD CONSTRAINT "RevisionActivityAttachment_pkey" PRIMARY KEY (id);


--
-- Name: RevisionActivity RevisionActivity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RevisionActivity"
    ADD CONSTRAINT "RevisionActivity_pkey" PRIMARY KEY (id);


--
-- Name: Revision Revision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionConsultantAdjustment"
    ADD CONSTRAINT "SalesCommissionConsultantAdjustment_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionEntry SalesCommissionEntry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionManagerTier SalesCommissionManagerTier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionManagerTier"
    ADD CONSTRAINT "SalesCommissionManagerTier_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_saleYearMonth_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_saleYearMonth_key" UNIQUE ("saleYearMonth");


--
-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_sale_installment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_sale_installment_key" UNIQUE ("salesCommissionSaleId", "installmentNumber");


--
-- Name: SalesCommissionSale SalesCommissionSale_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_pkey" PRIMARY KEY (id);


--
-- Name: SalesCommissionTier SalesCommissionTier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionTier"
    ADD CONSTRAINT "SalesCommissionTier_pkey" PRIMARY KEY (id);


--
-- Name: SalesMonthlyTarget SalesMonthlyTarget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesMonthlyTarget"
    ADD CONSTRAINT "SalesMonthlyTarget_pkey" PRIMARY KEY (id);


--
-- Name: SalesMonthlyTarget SalesMonthlyTarget_yearMonth_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesMonthlyTarget"
    ADD CONSTRAINT "SalesMonthlyTarget_yearMonth_key" UNIQUE ("yearMonth");


--
-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_order_installment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_order_installment_key" UNIQUE ("salesOrderId", "installmentNumber");


--
-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_pkey" PRIMARY KEY (id);


--
-- Name: SystemSettings SystemSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("settingsKey");


--
-- Name: ThirdPartyProjectStatusHistory ThirdPartyProjectStatusHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProjectStatusHistory"
    ADD CONSTRAINT "ThirdPartyProjectStatusHistory_pkey" PRIMARY KEY (id);


--
-- Name: ThirdPartyProject ThirdPartyProject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_pkey" PRIMARY KEY (id);


--
-- Name: ThirdPartySubtype ThirdPartySubtype_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartySubtype"
    ADD CONSTRAINT "ThirdPartySubtype_pkey" PRIMARY KEY (id);


--
-- Name: WoodworkQualityChecklistItem WoodworkQualityChecklistItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklistItem"
    ADD CONSTRAINT "WoodworkQualityChecklistItem_pkey" PRIMARY KEY (id);


--
-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_checklistId_sortOrder_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_checklistId_sortOrder_key" UNIQUE ("checklistId", "sortOrder");


--
-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_pkey" PRIMARY KEY (id);


--
-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_orderProjectId_versionNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_orderProjectId_versionNumber_key" UNIQUE ("orderProjectId", "versionNumber");


--
-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_pkey" PRIMARY KEY (id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_pkey" PRIMARY KEY (id);


--
-- Name: WpsItemType WpsItemType_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_name_key" UNIQUE (name);


--
-- Name: WpsItemType WpsItemType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_pkey" PRIMARY KEY (id);


--
-- Name: addr addr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT addr_pkey PRIMARY KEY (id);


--
-- Name: addrlabel addrlabel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addrlabel
    ADD CONSTRAINT addrlabel_pkey PRIMARY KEY (id);


--
-- Name: appUsers appUsers_authId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_authId_key" UNIQUE ("authId");


--
-- Name: appUsers appUsers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_email_key" UNIQUE (email);


--
-- Name: appUsers appUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_pkey" PRIMARY KEY (id);


--
-- Name: designers designers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designers
    ADD CONSTRAINT designers_pkey PRIMARY KEY (id);


--
-- Name: importConsultorWPS importConsultorWPS_ConsultorWPS_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importConsultorWPS"
    ADD CONSTRAINT "importConsultorWPS_ConsultorWPS_key" UNIQUE ("consultantWps");


--
-- Name: importConsultorWPS importConsultorWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importConsultorWPS"
    ADD CONSTRAINT "importConsultorWPS_pkey" PRIMARY KEY (id);


--
-- Name: importMarceneiroWPS importMarceneiroWPS_MarceneiroWPS_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importMarceneiroWPS"
    ADD CONSTRAINT "importMarceneiroWPS_MarceneiroWPS_key" UNIQUE ("cabinetMakerWps");


--
-- Name: importMarceneiroWPS importMarceneiroWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importMarceneiroWPS"
    ADD CONSTRAINT "importMarceneiroWPS_pkey" PRIMARY KEY (id);


--
-- Name: importStatusWPS importStatusWPS_StatusWPS_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importStatusWPS"
    ADD CONSTRAINT "importStatusWPS_StatusWPS_key" UNIQUE ("statusWps");


--
-- Name: importStatusWPS importStatusWPS_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."importStatusWPS"
    ADD CONSTRAINT "importStatusWPS_pkey" PRIMARY KEY (id);


--
-- Name: OrderRequest orderConversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "orderConversations_pkey" PRIMARY KEY (id);


--
-- Name: salesOrders salesOrders_orderCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_orderCode_key" UNIQUE ("orderCode");


--
-- Name: salesOrders salesOrders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_pkey" PRIMARY KEY (id);


--
-- Name: ActivityLog_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_action_idx" ON public."ActivityLog" USING btree (action);


--
-- Name: ActivityLog_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_changedAt_idx" ON public."ActivityLog" USING btree ("changedAt" DESC);


--
-- Name: ActivityLog_changedById_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_changedById_changedAt_idx" ON public."ActivityLog" USING btree ("changedById", "changedAt" DESC);


--
-- Name: ActivityLog_orderId_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_orderId_changedAt_idx" ON public."ActivityLog" USING btree ("orderId", "changedAt" DESC);


--
-- Name: ActivityLog_orderProjectId_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityLog_orderProjectId_changedAt_idx" ON public."ActivityLog" USING btree ("orderProjectId", "changedAt" DESC);


--
-- Name: AppError_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AppError_createdAt_idx" ON public."AppError" USING btree ("createdAt" DESC);


--
-- Name: AppError_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AppError_source_idx" ON public."AppError" USING btree (source);


--
-- Name: Architect_isActive_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Architect_isActive_name_idx" ON public."Architect" USING btree ("isActive", name);


--
-- Name: Architect_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Architect_name_unique_ci_idx" ON public."Architect" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: AssemblySchedule_addrId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssemblySchedule_addrId_idx" ON public."AssemblySchedule" USING btree ("addrId");


--
-- Name: AssistanceRequestStatusHistory_assistanceRequestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssistanceRequestStatusHistory_assistanceRequestId_idx" ON public."AssistanceRequestStatusHistory" USING btree ("assistanceRequestId");


--
-- Name: AssistanceRequestStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssistanceRequestStatusHistory_changedAt_idx" ON public."AssistanceRequestStatusHistory" USING btree ("changedAt");


--
-- Name: AssistanceRequest_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssistanceRequest_clientId_idx" ON public."AssistanceRequest" USING btree ("clientId");


--
-- Name: AssistanceRequest_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssistanceRequest_orderId_idx" ON public."AssistanceRequest" USING btree ("orderId");


--
-- Name: AssistanceRequest_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssistanceRequest_status_idx" ON public."AssistanceRequest" USING btree (status);


--
-- Name: CabinetMaker_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CabinetMaker_sortOrder_idx" ON public."CabinetMaker" USING btree ("sortOrder", id);


--
-- Name: CalendarEventType_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEventType_isActive_sortOrder_idx" ON public."CalendarEventType" USING btree ("isActive", "sortOrder", id);


--
-- Name: CalendarEventType_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CalendarEventType_name_unique_ci_idx" ON public."CalendarEventType" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: CalendarEvent_addrId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_addrId_idx" ON public."CalendarEvent" USING btree ("addrId");


--
-- Name: CalendarEvent_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_clientId_idx" ON public."CalendarEvent" USING btree ("clientId");


--
-- Name: CalendarEvent_eventDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_eventDate_idx" ON public."CalendarEvent" USING btree ("eventDate");


--
-- Name: CalendarEvent_eventTypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_eventTypeId_idx" ON public."CalendarEvent" USING btree ("eventTypeId");


--
-- Name: CalendarEvent_googleCalendarEventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_googleCalendarEventId_idx" ON public."CalendarEvent" USING btree ("googleCalendarEventId") WHERE ("googleCalendarEventId" IS NOT NULL);


--
-- Name: CalendarEvent_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_orderId_idx" ON public."CalendarEvent" USING btree ("orderId");


--
-- Name: CalendarEvent_responsibleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CalendarEvent_responsibleId_idx" ON public."CalendarEvent" USING btree ("responsibleId");


--
-- Name: Client_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Client_isActive_idx" ON public."Client" USING btree ("isActive");


--
-- Name: Client_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Client_name_unique_ci_idx" ON public."Client" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: Client_pipedriveOrgId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Client_pipedriveOrgId_uidx" ON public."Client" USING btree ("pipedriveOrgId") WHERE ("pipedriveOrgId" IS NOT NULL);


--
-- Name: Contact_one_primary_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Contact_one_primary_uidx" ON public."Contact" USING btree ("ownerType", "ownerId") WHERE ("isPrimary" IS TRUE);


--
-- Name: Contact_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contact_owner_idx" ON public."Contact" USING btree ("ownerType", "ownerId", "isPrimary" DESC, id);


--
-- Name: DealActivity_dealId_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DealActivity_dealId_dueDate_idx" ON public."DealActivity" USING btree ("dealId", "isDone", "dueDate");


--
-- Name: DealActivity_owner_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DealActivity_owner_dueDate_idx" ON public."DealActivity" USING btree ("ownerUserId", "isDone", "dueDate");


--
-- Name: DealActivity_pipedriveActivityId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DealActivity_pipedriveActivityId_uidx" ON public."DealActivity" USING btree ("pipedriveActivityId") WHERE ("pipedriveActivityId" IS NOT NULL);


--
-- Name: DealLostReason_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DealLostReason_isActive_sortOrder_idx" ON public."DealLostReason" USING btree ("isActive", "sortOrder", id);


--
-- Name: DealLostReason_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DealLostReason_name_unique_ci_idx" ON public."DealLostReason" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: DealNote_dealId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DealNote_dealId_createdAt_idx" ON public."DealNote" USING btree ("dealId", "createdAt" DESC);


--
-- Name: DealNote_pipedriveNoteId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DealNote_pipedriveNoteId_uidx" ON public."DealNote" USING btree ("pipedriveNoteId") WHERE ("pipedriveNoteId" IS NOT NULL);


--
-- Name: DealStage_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DealStage_isActive_sortOrder_idx" ON public."DealStage" USING btree ("isActive", "sortOrder", id);


--
-- Name: DealStage_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DealStage_name_unique_ci_idx" ON public."DealStage" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: DealStage_pipedriveStageId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DealStage_pipedriveStageId_uidx" ON public."DealStage" USING btree ("pipedriveStageId") WHERE ("pipedriveStageId" IS NOT NULL);


--
-- Name: Deal_architectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deal_architectId_idx" ON public."Deal" USING btree ("architectId");


--
-- Name: Deal_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deal_clientId_idx" ON public."Deal" USING btree ("clientId");


--
-- Name: Deal_orderId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Deal_orderId_uidx" ON public."Deal" USING btree ("orderId") WHERE ("orderId" IS NOT NULL);


--
-- Name: Deal_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deal_owner_status_idx" ON public."Deal" USING btree ("ownerUserId", status);


--
-- Name: Deal_pipedriveDealId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Deal_pipedriveDealId_uidx" ON public."Deal" USING btree ("pipedriveDealId") WHERE ("pipedriveDealId" IS NOT NULL);


--
-- Name: Deal_stageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deal_stageId_idx" ON public."Deal" USING btree ("stageId");


--
-- Name: Deal_wpsQuoteCode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Deal_wpsQuoteCode_idx" ON public."Deal" USING btree ("wpsQuoteCode") WHERE ("wpsQuoteCode" IS NOT NULL);


--
-- Name: Detailing_designerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Detailing_designerId_idx" ON public."Detailing" USING btree ("designerId");


--
-- Name: Detailing_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Detailing_orderProjectId_idx" ON public."Detailing" USING btree ("orderProjectId");


--
-- Name: Detailing_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Detailing_status_idx" ON public."Detailing" USING btree (status);


--
-- Name: DriveFile_assistance_quote_entity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DriveFile_assistance_quote_entity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'assistanceQuote'::text) AND ("entityType" = 'AssistanceRequest'::text));


--
-- Name: DriveFile_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DriveFile_entity_idx" ON public."DriveFile" USING btree ("entityType", "entityId");


--
-- Name: DriveFile_folderKind_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DriveFile_folderKind_entity_idx" ON public."DriveFile" USING btree ("folderKind", "entityType", "entityId");


--
-- Name: DriveFile_implementation_list_entity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DriveFile_implementation_list_entity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'implementationList'::text) AND ("entityType" = 'ImplementationPurchaseItem'::text));


--
-- Name: DriveFile_orderProject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DriveFile_orderProject_idx" ON public."DriveFile" USING btree ("orderProjectId");


--
-- Name: DriveFile_request_activity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DriveFile_request_activity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'request'::text) AND ("entityType" = 'OrderRequestActivity'::text));


--
-- Name: DriveFile_revision_activity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DriveFile_revision_activity_uidx" ON public."DriveFile" USING btree ("entityId") WHERE (("folderKind" = 'revision'::text) AND ("entityType" = 'RevisionActivity'::text));


--
-- Name: DriveFile_storagePath_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DriveFile_storagePath_uidx" ON public."DriveFile" USING btree ("storagePath") WHERE ("storagePath" IS NOT NULL);


--
-- Name: ExpeditionRouteStopItem_pickup_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRouteStopItem_pickup_pending_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId", "entityType", "pickupUnloadedAt") WHERE ("entityType" = 'Pickup'::text);


--
-- Name: ExpeditionRouteStopItem_routeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRouteStopItem_routeId_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId");


--
-- Name: ExpeditionRouteStopItem_route_entity_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ExpeditionRouteStopItem_route_entity_unique_idx" ON public."ExpeditionRouteStopItem" USING btree ("routeId", "entityType", "entityId");


--
-- Name: ExpeditionRouteStopItem_stopId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRouteStopItem_stopId_idx" ON public."ExpeditionRouteStopItem" USING btree ("stopId", id);


--
-- Name: ExpeditionRouteStop_routeId_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRouteStop_routeId_sort_idx" ON public."ExpeditionRouteStop" USING btree ("routeId", "sortOrder", id);


--
-- Name: ExpeditionRoute_responsibleUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRoute_responsibleUserId_idx" ON public."ExpeditionRoute" USING btree ("responsibleUserId");


--
-- Name: ExpeditionRoute_routeDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionRoute_routeDate_idx" ON public."ExpeditionRoute" USING btree ("routeDate" DESC, id DESC);


--
-- Name: ExpeditionVolume_routeId_boardedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionVolume_routeId_boardedAt_idx" ON public."ExpeditionVolume" USING btree ("routeId", "boardedAt");


--
-- Name: ExpeditionVolume_routeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExpeditionVolume_routeId_idx" ON public."ExpeditionVolume" USING btree ("routeId", "volumeIndex");


--
-- Name: ExternalAssemblyInspectionActivity_inspectionProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExternalAssemblyInspectionActivity_inspectionProjectId_idx" ON public."ExternalAssemblyInspectionActivity" USING btree ("inspectionProjectId");


--
-- Name: ExternalAssemblyInspectionProject_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExternalAssemblyInspectionProject_orderProjectId_idx" ON public."ExternalAssemblyInspectionProject" USING btree ("orderProjectId");


--
-- Name: ExternalAssemblyInspection_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExternalAssemblyInspection_orderId_idx" ON public."ExternalAssemblyInspection" USING btree ("orderId");


--
-- Name: ExternalAssemblyInspection_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExternalAssemblyInspection_status_idx" ON public."ExternalAssemblyInspection" USING btree (status);


--
-- Name: FactoryEmployee_factoryRoleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryEmployee_factoryRoleId_idx" ON public."FactoryEmployee" USING btree ("factoryRoleId");


--
-- Name: FactoryEmployee_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryEmployee_isActive_idx" ON public."FactoryEmployee" USING btree ("isActive");


--
-- Name: FactoryEmployee_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryEmployee_name_idx" ON public."FactoryEmployee" USING btree (name);


--
-- Name: FactoryEmployee_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryEmployee_sortOrder_idx" ON public."FactoryEmployee" USING btree ("sortOrder");


--
-- Name: FactoryRole_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryRole_isActive_idx" ON public."FactoryRole" USING btree ("isActive");


--
-- Name: FactoryRole_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FactoryRole_sortOrder_idx" ON public."FactoryRole" USING btree ("sortOrder");


--
-- Name: Implantacao_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Implantacao_orderProjectId_idx" ON public."Implementation" USING btree ("orderProjectId");


--
-- Name: ImplementationPurchaseItem_implementationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImplementationPurchaseItem_implementationId_idx" ON public."ImplementationPurchaseItem" USING btree ("implementationId");


--
-- Name: ImplementationPurchaseItem_implementation_standard_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImplementationPurchaseItem_implementation_standard_uidx" ON public."ImplementationPurchaseItem" USING btree ("implementationId", "purchaseType") WHERE ("purchaseType" = ANY (ARRAY['Material'::text, 'Ferragem'::text, 'Tinta'::text]));


--
-- Name: ImplementationPurchaseItem_implementation_terceiro_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImplementationPurchaseItem_implementation_terceiro_uidx" ON public."ImplementationPurchaseItem" USING btree ("implementationId", "thirdPartySubtypeId") WHERE ("purchaseType" = 'Terceiro'::text);


--
-- Name: ImplementationPurchaseItem_thirdPartySubtypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImplementationPurchaseItem_thirdPartySubtypeId_idx" ON public."ImplementationPurchaseItem" USING btree ("thirdPartySubtypeId");


--
-- Name: Implementation_designerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Implementation_designerId_idx" ON public."Implementation" USING btree ("designerId");


--
-- Name: Implementation_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Implementation_status_idx" ON public."Implementation" USING btree (status);


--
-- Name: Installer_name_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Installer_name_unique_idx" ON public."Installer" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: Marceneiro_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Marceneiro_name_unique_ci_idx" ON public."CabinetMaker" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: MeasurementProject_measurementId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MeasurementProject_measurementId_idx" ON public."MeasurementProject" USING btree ("measurementId");


--
-- Name: MeasurementProject_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MeasurementProject_orderProjectId_idx" ON public."MeasurementProject" USING btree ("orderProjectId");


--
-- Name: Measurement_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Measurement_orderId_idx" ON public."Measurement" USING btree ("orderId");


--
-- Name: MontagemProgramacaoMarceneiro_marceneiroId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacaoMarceneiro_marceneiroId_idx" ON public."AssemblyScheduleCabinetMaker" USING btree ("cabinetMakerId");


--
-- Name: MontagemProgramacaoMarceneiro_programacaoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacaoMarceneiro_programacaoId_idx" ON public."AssemblyScheduleCabinetMaker" USING btree ("assemblyScheduleId");


--
-- Name: MontagemProgramacaoMontador_montadorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacaoMontador_montadorId_idx" ON public."AssemblyScheduleInstaller" USING btree ("installerId");


--
-- Name: MontagemProgramacaoMontador_programacaoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacaoMontador_programacaoId_idx" ON public."AssemblyScheduleInstaller" USING btree ("assemblyScheduleId");


--
-- Name: MontagemProgramacao_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacao_endDate_idx" ON public."AssemblySchedule" USING btree ("endDate");


--
-- Name: MontagemProgramacao_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MontagemProgramacao_startDate_idx" ON public."AssemblySchedule" USING btree ("startDate");


--
-- Name: OrderDeliveryPhase_orderCode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderDeliveryPhase_orderCode_idx" ON public."OrderDeliveryPhase" USING btree ("orderCode");


--
-- Name: OrderDeliveryPhase_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderDeliveryPhase_orderId_idx" ON public."OrderDeliveryPhase" USING btree ("orderId");


--
-- Name: OrderProjectCharacteristic_characteristicId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectCharacteristic_characteristicId_idx" ON public."OrderProjectCharacteristic" USING btree ("characteristicId");


--
-- Name: OrderProjectCharacteristic_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectCharacteristic_orderProjectId_idx" ON public."OrderProjectCharacteristic" USING btree ("orderProjectId");


--
-- Name: OrderProjectDesignerHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectDesignerHistory_changedAt_idx" ON public."OrderProjectDesignerHistory" USING btree ("changedAt" DESC);


--
-- Name: OrderProjectDesignerHistory_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectDesignerHistory_orderProjectId_idx" ON public."OrderProjectDesignerHistory" USING btree ("orderProjectId");


--
-- Name: OrderProjectDesignerHistory_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectDesignerHistory_source_idx" ON public."OrderProjectDesignerHistory" USING btree ("orderProjectId", "sourceType", "sourceId");


--
-- Name: OrderProjectStatusForecast_cabinetMakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusForecast_cabinetMakerId_idx" ON public."OrderProjectStatusForecast" USING btree ("cabinetMakerId");


--
-- Name: OrderProjectStatusForecast_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusForecast_orderProjectId_idx" ON public."OrderProjectStatusForecast" USING btree ("orderProjectId");


--
-- Name: OrderProjectStatusForecast_project_status_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrderProjectStatusForecast_project_status_uidx" ON public."OrderProjectStatusForecast" USING btree ("orderProjectId", "statusId");


--
-- Name: OrderProjectStatusForecast_statusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusForecast_statusId_idx" ON public."OrderProjectStatusForecast" USING btree ("statusId");


--
-- Name: OrderProjectStatusForecast_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusForecast_userId_idx" ON public."OrderProjectStatusForecast" USING btree ("userId");


--
-- Name: OrderProjectStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusHistory_changedAt_idx" ON public."OrderProjectStatusHistory" USING btree ("changedAt" DESC);


--
-- Name: OrderProjectStatusHistory_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectStatusHistory_orderProjectId_idx" ON public."OrderProjectStatusHistory" USING btree ("orderProjectId");


--
-- Name: OrderProjectSubstatus_kind_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectSubstatus_kind_open_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId", kind) WHERE ("endedAt" IS NULL);


--
-- Name: OrderProjectSubstatus_one_open_awaiting_request_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrderProjectSubstatus_one_open_awaiting_request_uidx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId") WHERE ((kind = 'AwaitingRequest'::text) AND ("endedAt" IS NULL));


--
-- Name: OrderProjectSubstatus_one_open_per_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrderProjectSubstatus_one_open_per_kind_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId", kind) WHERE ("endedAt" IS NULL);


--
-- Name: OrderProjectSubstatus_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProjectSubstatus_orderProjectId_idx" ON public."OrderProjectSubstatus" USING btree ("orderProjectId");


--
-- Name: OrderProject_aggregatorOrderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_aggregatorOrderProjectId_idx" ON public."OrderProject" USING btree ("aggregatorOrderProjectId") WHERE ("aggregatorOrderProjectId" IS NOT NULL);


--
-- Name: OrderProject_conclusaoProjetoTecnico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_conclusaoProjetoTecnico_idx" ON public."OrderProject" USING btree ("technicalProjectCompletedDate");


--
-- Name: OrderProject_deliveryPhaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_deliveryPhaseId_idx" ON public."OrderProject" USING btree ("deliveryPhaseId");


--
-- Name: OrderProject_designerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_designerId_idx" ON public."OrderProject" USING btree ("designerId");


--
-- Name: OrderProject_isAggregator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_isAggregator_idx" ON public."OrderProject" USING btree ("isAggregator") WHERE ("isAggregator" = true);


--
-- Name: OrderProject_marceneiroId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_marceneiroId_idx" ON public."OrderProject" USING btree ("cabinetMakerId");


--
-- Name: OrderProject_parentProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_parentProjectId_idx" ON public."OrderProject" USING btree ("parentProjectId") WHERE ("parentProjectId" IS NOT NULL);


--
-- Name: OrderProject_previsaoConclusaoProjetoTecnico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_previsaoConclusaoProjetoTecnico_idx" ON public."OrderProject" USING btree ("technicalProjectForecastEndDate");


--
-- Name: OrderProject_productionMonth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_productionMonth_idx" ON public."OrderProject" USING btree ("productionMonth");


--
-- Name: OrderProject_reviewerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_reviewerId_idx" ON public."OrderProject" USING btree ("reviewerId");


--
-- Name: OrderProject_statusId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_statusId_idx" ON public."OrderProject" USING btree ("statusId");


--
-- Name: OrderProject_substituiProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_substituiProjectId_idx" ON public."OrderProject" USING btree ("replacesProjectId") WHERE ("replacesProjectId" IS NOT NULL);


--
-- Name: OrderProject_substituidoPorProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderProject_substituidoPorProjectId_idx" ON public."OrderProject" USING btree ("replacedByProjectId") WHERE ("replacedByProjectId" IS NOT NULL);


--
-- Name: OrderRequestActivity_orderRequestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderRequestActivity_orderRequestId_idx" ON public."OrderRequestActivity" USING btree ("orderRequestId");


--
-- Name: OrderRequestAttachment_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderRequestAttachment_createdAt_idx" ON public."OrderRequestAttachment" USING btree ("createdAt");


--
-- Name: OrderRequestAttachment_orderRequestActivityId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrderRequestAttachment_orderRequestActivityId_uidx" ON public."OrderRequestAttachment" USING btree ("orderRequestActivityId") WHERE ("orderRequestActivityId" IS NOT NULL);


--
-- Name: OrderRequestAttachment_orderRequestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrderRequestAttachment_orderRequestId_idx" ON public."OrderRequestAttachment" USING btree ("orderRequestId");


--
-- Name: PartRequestStatusHistory_partRequestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequestStatusHistory_partRequestId_idx" ON public."PartRequestStatusHistory" USING btree ("partRequestId", "changedAt");


--
-- Name: PartRequest_cabinetMakerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_cabinetMakerId_idx" ON public."PartRequest" USING btree ("cabinetMakerId");


--
-- Name: PartRequest_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_createdAt_idx" ON public."PartRequest" USING btree ("createdAt" DESC);


--
-- Name: PartRequest_deliveryDueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_deliveryDueDate_idx" ON public."PartRequest" USING btree ("deliveryDueDate");


--
-- Name: PartRequest_factoryEmployeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_factoryEmployeeId_idx" ON public."PartRequest" USING btree ("factoryEmployeeId");


--
-- Name: PartRequest_montadorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_montadorId_idx" ON public."PartRequest" USING btree ("montadorId");


--
-- Name: PartRequest_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_orderId_idx" ON public."PartRequest" USING btree ("orderId");


--
-- Name: PartRequest_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_orderProjectId_idx" ON public."PartRequest" USING btree ("orderProjectId");


--
-- Name: PartRequest_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartRequest_status_idx" ON public."PartRequest" USING btree (status);


--
-- Name: PreliminaryDesignConferenceHistory_conferenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignConferenceHistory_conferenceId_idx" ON public."PreliminaryDesignConferenceHistory" USING btree ("conferenceId");


--
-- Name: PreliminaryDesignConferenceHistory_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignConferenceHistory_createdAt_idx" ON public."PreliminaryDesignConferenceHistory" USING btree ("createdAt" DESC);


--
-- Name: PreliminaryDesignConferenceProject_conferenceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignConferenceProject_conferenceId_idx" ON public."PreliminaryDesignConferenceProject" USING btree ("conferenceId");


--
-- Name: PreliminaryDesignConference_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignConference_orderId_idx" ON public."PreliminaryDesignConference" USING btree ("orderId");


--
-- Name: PreliminaryDesignModuleObservation_moduleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignModuleObservation_moduleId_idx" ON public."PreliminaryDesignModuleObservation" USING btree ("moduleId");


--
-- Name: PreliminaryDesignModule_conferenceProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PreliminaryDesignModule_conferenceProjectId_idx" ON public."PreliminaryDesignModule" USING btree ("conferenceProjectId");


--
-- Name: ProjectCharacteristic_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ProjectCharacteristic_name_unique_ci_idx" ON public."ProjectCharacteristic" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: ProjectCharacteristic_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProjectCharacteristic_sortOrder_idx" ON public."ProjectCharacteristic" USING btree ("sortOrder", id);


--
-- Name: ProjectProductionQueue_sequence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ProjectProductionQueue_sequence_idx" ON public."ProjectProductionQueue" USING btree (sequence, id);


--
-- Name: PurchaseStatus_name_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PurchaseStatus_name_unique_idx" ON public."PurchaseStatus" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: PurchaseStatus_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PurchaseStatus_sortOrder_idx" ON public."PurchaseStatus" USING btree ("sortOrder");


--
-- Name: Purchase_assistanceRequestId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Purchase_assistanceRequestId_idx" ON public."Purchase" USING btree ("assistanceRequestId");


--
-- Name: Purchase_externalAssemblyInspectionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Purchase_externalAssemblyInspectionId_idx" ON public."Purchase" USING btree ("externalAssemblyInspectionId");


--
-- Name: Purchase_implementationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Purchase_implementationId_idx" ON public."Purchase" USING btree ("implementationId");


--
-- Name: Purchase_implementationPurchaseItemId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Purchase_implementationPurchaseItemId_uidx" ON public."Purchase" USING btree ("implementationPurchaseItemId") WHERE ("implementationPurchaseItemId" IS NOT NULL);


--
-- Name: Purchase_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Purchase_orderProjectId_idx" ON public."Purchase" USING btree ("orderProjectId");


--
-- Name: Purchase_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Purchase_status_idx" ON public."Purchase" USING btree (status);


--
-- Name: RevisionActivityAttachment_activity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RevisionActivityAttachment_activity_uidx" ON public."RevisionActivityAttachment" USING btree ("revisionActivityId");


--
-- Name: RevisionActivityAttachment_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RevisionActivityAttachment_createdAt_idx" ON public."RevisionActivityAttachment" USING btree ("createdAt");


--
-- Name: RevisionActivity_revisionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RevisionActivity_revisionId_idx" ON public."RevisionActivity" USING btree ("revisionId");


--
-- Name: Revision_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Revision_createdAt_idx" ON public."Revision" USING btree ("createdAt" DESC);


--
-- Name: Revision_one_open_per_subject_type_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Revision_one_open_per_subject_type_uidx" ON public."Revision" USING btree (COALESCE("orderProjectId", (0)::bigint), COALESCE("thirdPartyProjectId", (0)::bigint), "revisionType") WHERE (status = 'open'::public."RevisionRecordStatus");


--
-- Name: Revision_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Revision_orderProjectId_idx" ON public."Revision" USING btree ("orderProjectId");


--
-- Name: Revision_revisionType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Revision_revisionType_idx" ON public."Revision" USING btree ("revisionType");


--
-- Name: Revision_thirdPartyProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Revision_thirdPartyProjectId_idx" ON public."Revision" USING btree ("thirdPartyProjectId");


--
-- Name: SalesCommissionConsultantAdjustment_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionConsultantAdjustment_consultantUserId_idx" ON public."SalesCommissionConsultantAdjustment" USING btree ("consultantUserId");


--
-- Name: SalesCommissionConsultantAdjustment_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionConsultantAdjustment_saleYearMonth_idx" ON public."SalesCommissionConsultantAdjustment" USING btree ("saleYearMonth");


--
-- Name: SalesCommissionEntry_close_order_installment_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SalesCommissionEntry_close_order_installment_type_key" ON public."SalesCommissionEntry" USING btree ("monthCloseId", "orderCode", "installmentNumber", "entryType") WHERE ("monthCloseId" IS NOT NULL);


--
-- Name: SalesCommissionEntry_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionEntry_consultantUserId_idx" ON public."SalesCommissionEntry" USING btree ("consultantUserId");


--
-- Name: SalesCommissionEntry_delivery_bonus_order_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SalesCommissionEntry_delivery_bonus_order_key" ON public."SalesCommissionEntry" USING btree ("salesOrderId", "entryType") WHERE (("entryType" = 'manager_delivery_bonus'::text) AND ("salesOrderId" IS NOT NULL));


--
-- Name: SalesCommissionEntry_entryType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionEntry_entryType_idx" ON public."SalesCommissionEntry" USING btree ("entryType");


--
-- Name: SalesCommissionEntry_monthCloseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionEntry_monthCloseId_idx" ON public."SalesCommissionEntry" USING btree ("monthCloseId");


--
-- Name: SalesCommissionEntry_referenceYearMonth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionEntry_referenceYearMonth_idx" ON public."SalesCommissionEntry" USING btree ("referenceYearMonth");


--
-- Name: SalesCommissionEntry_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionEntry_saleYearMonth_idx" ON public."SalesCommissionEntry" USING btree ("saleYearMonth");


--
-- Name: SalesCommissionManagerTier_salesMonthlyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionManagerTier_salesMonthlyTargetId_idx" ON public."SalesCommissionManagerTier" USING btree ("salesMonthlyTargetId");


--
-- Name: SalesCommissionSaleInstallment_saleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionSaleInstallment_saleId_idx" ON public."SalesCommissionSaleInstallment" USING btree ("salesCommissionSaleId");


--
-- Name: SalesCommissionSale_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionSale_consultantUserId_idx" ON public."SalesCommissionSale" USING btree ("consultantUserId");


--
-- Name: SalesCommissionSale_isImported_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionSale_isImported_idx" ON public."SalesCommissionSale" USING btree ("isImported");


--
-- Name: SalesCommissionSale_saleYearMonth_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionSale_saleYearMonth_idx" ON public."SalesCommissionSale" USING btree ("saleYearMonth");


--
-- Name: SalesCommissionSale_salesOrderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SalesCommissionSale_salesOrderId_key" ON public."SalesCommissionSale" USING btree ("salesOrderId") WHERE ("salesOrderId" IS NOT NULL);


--
-- Name: SalesCommissionTier_salesMonthlyTargetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesCommissionTier_salesMonthlyTargetId_idx" ON public."SalesCommissionTier" USING btree ("salesMonthlyTargetId");


--
-- Name: SalesOrderClientInstallment_salesOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesOrderClientInstallment_salesOrderId_idx" ON public."SalesOrderClientInstallment" USING btree ("salesOrderId");


--
-- Name: ThirdPartyProjectStatusHistory_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProjectStatusHistory_changedAt_idx" ON public."ThirdPartyProjectStatusHistory" USING btree ("changedAt" DESC);


--
-- Name: ThirdPartyProjectStatusHistory_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProjectStatusHistory_projectId_idx" ON public."ThirdPartyProjectStatusHistory" USING btree ("thirdPartyProjectId");


--
-- Name: ThirdPartyProject_designerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProject_designerId_idx" ON public."ThirdPartyProject" USING btree ("designerId");


--
-- Name: ThirdPartyProject_orderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProject_orderId_idx" ON public."ThirdPartyProject" USING btree ("orderId");


--
-- Name: ThirdPartyProject_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProject_orderProjectId_idx" ON public."ThirdPartyProject" USING btree ("orderProjectId");


--
-- Name: ThirdPartyProject_orderProject_subtype_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ThirdPartyProject_orderProject_subtype_uidx" ON public."ThirdPartyProject" USING btree ("orderProjectId", "thirdPartySubtypeId");


--
-- Name: ThirdPartyProject_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartyProject_status_idx" ON public."ThirdPartyProject" USING btree (status);


--
-- Name: ThirdPartySubtype_name_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ThirdPartySubtype_name_unique_idx" ON public."ThirdPartySubtype" USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: ThirdPartySubtype_projectCharacteristicId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartySubtype_projectCharacteristicId_idx" ON public."ThirdPartySubtype" USING btree ("projectCharacteristicId");


--
-- Name: ThirdPartySubtype_projectCharacteristicId_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ThirdPartySubtype_projectCharacteristicId_uidx" ON public."ThirdPartySubtype" USING btree ("projectCharacteristicId") WHERE ("projectCharacteristicId" IS NOT NULL);


--
-- Name: ThirdPartySubtype_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ThirdPartySubtype_sortOrder_idx" ON public."ThirdPartySubtype" USING btree ("sortOrder");


--
-- Name: WoodworkQualityChecklistItem_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WoodworkQualityChecklistItem_sortOrder_idx" ON public."WoodworkQualityChecklistItem" USING btree ("sortOrder", id);


--
-- Name: WoodworkQualityChecklistLine_checklistId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WoodworkQualityChecklistLine_checklistId_idx" ON public."WoodworkQualityChecklistLine" USING btree ("checklistId", "sortOrder");


--
-- Name: WoodworkQualityChecklist_orderProjectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WoodworkQualityChecklist_orderProjectId_idx" ON public."WoodworkQualityChecklist" USING btree ("orderProjectId", "versionNumber" DESC);


--
-- Name: WpsItemRegistrationRequest_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WpsItemRegistrationRequest_createdAt_idx" ON public."WpsItemRegistrationRequest" USING btree ("createdAt" DESC);


--
-- Name: WpsItemRegistrationRequest_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WpsItemRegistrationRequest_status_idx" ON public."WpsItemRegistrationRequest" USING btree (status);


--
-- Name: WpsItemRegistrationRequest_wpsItemTypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WpsItemRegistrationRequest_wpsItemTypeId_idx" ON public."WpsItemRegistrationRequest" USING btree ("wpsItemTypeId");


--
-- Name: addr_labelid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addr_labelid_idx ON public.addr USING btree ("labelId");


--
-- Name: addr_one_primary_per_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX addr_one_primary_per_owner_idx ON public.addr USING btree ("ownerType", "ownerId") WHERE ("isPrimary" AND "isActive");


--
-- Name: addr_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addr_owner_idx ON public.addr USING btree ("ownerType", "ownerId");


--
-- Name: addr_postalcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addr_postalcode_idx ON public.addr USING btree ("postalCode");


--
-- Name: addrlabel_isactive_sortorder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addrlabel_isactive_sortorder_idx ON public.addrlabel USING btree ("isActive", "sortOrder", id);


--
-- Name: addrlabel_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX addrlabel_name_unique_ci_idx ON public.addrlabel USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: appUsers_authId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "appUsers_authId_idx" ON public."appUsers" USING btree ("authId");


--
-- Name: salesOrders_addrId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "salesOrders_addrId_idx" ON public."salesOrders" USING btree ("addrId");


--
-- Name: salesOrders_architectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "salesOrders_architectId_idx" ON public."salesOrders" USING btree ("architectId");


--
-- Name: salesOrders_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "salesOrders_clientId_idx" ON public."salesOrders" USING btree ("clientId");


--
-- Name: salesOrders_consultantUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "salesOrders_consultantUserId_idx" ON public."salesOrders" USING btree ("consultantUserId");


--
-- Name: Detailing Detailing_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Detailing_log_designer_change_insert" AFTER INSERT ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('detailing');


--
-- Name: Detailing Detailing_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Detailing_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('detailing');


--
-- Name: Implementation Implementation_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Implementation_log_designer_change_insert" AFTER INSERT ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('implementation');


--
-- Name: Implementation Implementation_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Implementation_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('implementation');


--
-- Name: OrderProject OrderProject_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "OrderProject_log_designer_change_insert" AFTER INSERT ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_designer_change();


--
-- Name: OrderProject OrderProject_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "OrderProject_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_designer_change();


--
-- Name: OrderProject OrderProject_log_status_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "OrderProject_log_status_change_insert" AFTER INSERT ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_status_change();


--
-- Name: OrderProject OrderProject_log_status_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "OrderProject_log_status_change_update" AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.log_order_project_status_change();


--
-- Name: OrderProject OrderProject_sync_designer_open_records; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "OrderProject_sync_designer_open_records" AFTER UPDATE OF "designerId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_order_project_designer_open_records();


--
-- Name: ThirdPartyProject ThirdPartyProject_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ThirdPartyProject_log_designer_change_insert" AFTER INSERT ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('thirdParty');


--
-- Name: ThirdPartyProject ThirdPartyProject_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ThirdPartyProject_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('thirdParty');


--
-- Name: ThirdPartyProject ThirdPartyProject_log_status_change_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ThirdPartyProject_log_status_change_insert" AFTER INSERT ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_third_party_project_status_change();


--
-- Name: ThirdPartyProject ThirdPartyProject_log_status_change_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "ThirdPartyProject_log_status_change_update" AFTER UPDATE OF status ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_third_party_project_status_change();


--
-- Name: Architect architect_cleanup_contacts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER architect_cleanup_contacts BEFORE DELETE ON public."Architect" FOR EACH ROW EXECUTE FUNCTION public.cleanup_owner_contacts('architect');


--
-- Name: AssistanceRequest assistance_request_status_history_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assistance_request_status_history_after_insert AFTER INSERT ON public."AssistanceRequest" FOR EACH ROW EXECUTE FUNCTION public.append_assistance_request_status_history();


--
-- Name: AssistanceRequest assistance_request_status_history_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assistance_request_status_history_after_update AFTER UPDATE OF status ON public."AssistanceRequest" FOR EACH ROW EXECUTE FUNCTION public.append_assistance_request_status_history();


--
-- Name: Client client_cleanup_contacts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER client_cleanup_contacts BEFORE DELETE ON public."Client" FOR EACH ROW EXECUTE FUNCTION public.cleanup_owner_contacts('client');


--
-- Name: Detailing detailing_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER detailing_activity_log_trg AFTER INSERT OR UPDATE ON public."Detailing" FOR EACH ROW EXECUTE FUNCTION public.trg_detailing_activity_log();


--
-- Name: Implementation implementation_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER implementation_activity_log_trg AFTER INSERT OR UPDATE ON public."Implementation" FOR EACH ROW EXECUTE FUNCTION public.trg_implementation_activity_log();


--
-- Name: Measurement measurement_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER measurement_activity_log_trg AFTER INSERT ON public."Measurement" FOR EACH ROW EXECUTE FUNCTION public.trg_measurement_activity_log();


--
-- Name: OrderDeliveryPhase order_delivery_phase_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER order_delivery_phase_activity_log_trg AFTER INSERT OR UPDATE ON public."OrderDeliveryPhase" FOR EACH ROW EXECUTE FUNCTION public.trg_order_delivery_phase_activity_log();


--
-- Name: OrderProject order_project_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER order_project_activity_log_trg AFTER UPDATE ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.trg_order_project_activity_log();


--
-- Name: OrderProjectSubstatus order_project_substatus_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER order_project_substatus_activity_log_trg AFTER INSERT OR UPDATE ON public."OrderProjectSubstatus" FOR EACH ROW EXECUTE FUNCTION public.trg_order_project_substatus_activity_log();


--
-- Name: OrderRequest order_request_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER order_request_activity_log_trg AFTER UPDATE ON public."OrderRequest" FOR EACH ROW EXECUTE FUNCTION public.trg_order_request_activity_log();


--
-- Name: PartRequest part_request_status_history_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER part_request_status_history_trg AFTER INSERT OR UPDATE OF status ON public."PartRequest" FOR EACH ROW EXECUTE FUNCTION public.trg_part_request_status_history();


--
-- Name: PreliminaryDesignConference preliminary_design_conference_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER preliminary_design_conference_activity_log_trg AFTER UPDATE ON public."PreliminaryDesignConference" FOR EACH ROW EXECUTE FUNCTION public.trg_preliminary_design_conference_activity_log();


--
-- Name: Revision revision_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER revision_activity_log_trg AFTER UPDATE ON public."Revision" FOR EACH ROW EXECUTE FUNCTION public.trg_revision_activity_log();


--
-- Name: salesOrders sales_order_client_delivery_activity_log_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sales_order_client_delivery_activity_log_trg AFTER UPDATE ON public."salesOrders" FOR EACH ROW EXECUTE FUNCTION public.trg_sales_order_client_delivery_activity_log();


--
-- Name: OrderProject trg_sync_aggregator_child_order_project_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_aggregator_child_order_project_status AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_aggregator_child_order_project_status();


--
-- Name: OrderProject trg_sync_complementar_order_project_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_complementar_order_project_status AFTER UPDATE OF "statusId" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_complementar_order_project_status();


--
-- Name: OrderProject trg_sync_project_production_queue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_project_production_queue AFTER INSERT OR UPDATE OF "statusId", "isComplementary", "isReplaced" ON public."OrderProject" FOR EACH ROW EXECUTE FUNCTION public.sync_project_production_queue();


--
-- Name: ActivityLog ActivityLog_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: PreliminaryDesignConferenceHistory AnteprojetoConferenceHistory_conferenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceHistory"
    ADD CONSTRAINT "AnteprojetoConferenceHistory_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES public."PreliminaryDesignConference"(id) ON DELETE CASCADE;


--
-- Name: PreliminaryDesignConferenceHistory AnteprojetoConferenceHistory_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceHistory"
    ADD CONSTRAINT "AnteprojetoConferenceHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_conferenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES public."PreliminaryDesignConference"(id) ON DELETE CASCADE;


--
-- Name: PreliminaryDesignConferenceProject AnteprojetoConferenceProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConferenceProject"
    ADD CONSTRAINT "AnteprojetoConferenceProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: PreliminaryDesignConference AnteprojetoConference_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignConference AnteprojetoConference_confirmedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignConference AnteprojetoConference_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignConference AnteprojetoConference_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignConference AnteprojetoConference_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: PreliminaryDesignConference AnteprojetoConference_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignConference"
    ADD CONSTRAINT "AnteprojetoConference_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: PreliminaryDesignModuleObservation AnteprojetoModuleObservation_moduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignModuleObservation"
    ADD CONSTRAINT "AnteprojetoModuleObservation_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES public."PreliminaryDesignModule"(id) ON DELETE CASCADE;


--
-- Name: PreliminaryDesignModuleObservation AnteprojetoModuleObservation_observationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignModuleObservation"
    ADD CONSTRAINT "AnteprojetoModuleObservation_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES public."PreliminaryDesignObservation"(id);


--
-- Name: PreliminaryDesignModule AnteprojetoModule_conferenceProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignModule"
    ADD CONSTRAINT "AnteprojetoModule_conferenceProjectId_fkey" FOREIGN KEY ("conferenceProjectId") REFERENCES public."PreliminaryDesignConferenceProject"(id) ON DELETE CASCADE;


--
-- Name: PreliminaryDesignObservation AnteprojetoObservation_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PreliminaryDesignObservation"
    ADD CONSTRAINT "AnteprojetoObservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Architect Architect_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Architect"
    ADD CONSTRAINT "Architect_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Architect Architect_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Architect"
    ADD CONSTRAINT "Architect_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: AssemblySchedule AssemblySchedule_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "AssemblySchedule_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;


--
-- Name: AssemblySchedule AssemblySchedule_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "AssemblySchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);


--
-- Name: AssistanceRequestStatusHistory AssistanceRequestStatusHistory_assistanceRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequestStatusHistory"
    ADD CONSTRAINT "AssistanceRequestStatusHistory_assistanceRequestId_fkey" FOREIGN KEY ("assistanceRequestId") REFERENCES public."AssistanceRequest"(id) ON DELETE CASCADE;


--
-- Name: AssistanceRequestStatusHistory AssistanceRequestStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequestStatusHistory"
    ADD CONSTRAINT "AssistanceRequestStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: AssistanceRequest AssistanceRequest_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;


--
-- Name: AssistanceRequest AssistanceRequest_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE SET NULL;


--
-- Name: AssistanceRequest AssistanceRequest_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);


--
-- Name: AssistanceRequest AssistanceRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: AssistanceRequest AssistanceRequest_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_montadorId_fkey" FOREIGN KEY ("montadorId") REFERENCES public."Installer"(id) ON DELETE SET NULL;


--
-- Name: AssistanceRequest AssistanceRequest_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;


--
-- Name: AssistanceRequest AssistanceRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssistanceRequest"
    ADD CONSTRAINT "AssistanceRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: CalendarEvent CalendarEvent_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;


--
-- Name: CalendarEvent CalendarEvent_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);


--
-- Name: CalendarEvent CalendarEvent_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: CalendarEvent CalendarEvent_eventTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES public."CalendarEventType"(id);


--
-- Name: CalendarEvent CalendarEvent_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;


--
-- Name: CalendarEvent CalendarEvent_responsibleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES public."appUsers"(id);


--
-- Name: CalendarEvent CalendarEvent_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalendarEvent"
    ADD CONSTRAINT "CalendarEvent_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Purchase Compras_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Purchase Compras_implantacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_implantacaoId_fkey" FOREIGN KEY ("implementationId") REFERENCES public."Implementation"(id) ON DELETE CASCADE;


--
-- Name: Purchase Compras_implantacaoPurchaseItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_implantacaoPurchaseItemId_fkey" FOREIGN KEY ("implementationPurchaseItemId") REFERENCES public."ImplementationPurchaseItem"(id);


--
-- Name: Purchase Compras_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: Purchase Compras_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Compras_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Contact Contact_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Contact Contact_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: DealActivity DealActivity_calendarEventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES public."CalendarEvent"(id) ON DELETE SET NULL;


--
-- Name: DealActivity DealActivity_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: DealActivity DealActivity_dealId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES public."Deal"(id) ON DELETE CASCADE;


--
-- Name: DealActivity DealActivity_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: DealActivity DealActivity_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealActivity"
    ADD CONSTRAINT "DealActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: DealLostReason DealLostReason_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealLostReason"
    ADD CONSTRAINT "DealLostReason_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: DealLostReason DealLostReason_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealLostReason"
    ADD CONSTRAINT "DealLostReason_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: DealNote DealNote_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealNote"
    ADD CONSTRAINT "DealNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: DealNote DealNote_dealId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealNote"
    ADD CONSTRAINT "DealNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES public."Deal"(id) ON DELETE CASCADE;


--
-- Name: DealStage DealStage_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealStage"
    ADD CONSTRAINT "DealStage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: DealStage DealStage_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DealStage"
    ADD CONSTRAINT "DealStage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Deal Deal_architectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_architectId_fkey" FOREIGN KEY ("architectId") REFERENCES public."Architect"(id) ON DELETE SET NULL;


--
-- Name: Deal Deal_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON DELETE SET NULL;


--
-- Name: Deal Deal_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Deal Deal_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;


--
-- Name: Deal Deal_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: Deal Deal_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."DealStage"(id);


--
-- Name: Deal Deal_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Deal"
    ADD CONSTRAINT "Deal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Detailing Detailing_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Detailing Detailing_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);


--
-- Name: Detailing Detailing_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: Detailing Detailing_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Detailing"
    ADD CONSTRAINT "Detailing_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_pickupUnloadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_pickupUnloadedById_fkey" FOREIGN KEY ("pickupUnloadedById") REFERENCES public."appUsers"(id);


--
-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;


--
-- Name: ExpeditionRouteStopItem ExpeditionRouteStopItem_stopId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStopItem"
    ADD CONSTRAINT "ExpeditionRouteStopItem_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES public."ExpeditionRouteStop"(id) ON DELETE CASCADE;


--
-- Name: ExpeditionRouteStop ExpeditionRouteStop_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStop"
    ADD CONSTRAINT "ExpeditionRouteStop_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id);


--
-- Name: ExpeditionRouteStop ExpeditionRouteStop_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRouteStop"
    ADD CONSTRAINT "ExpeditionRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;


--
-- Name: ExpeditionRoute ExpeditionRoute_confirmedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES public."appUsers"(id);


--
-- Name: ExpeditionRoute ExpeditionRoute_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: ExpeditionRoute ExpeditionRoute_responsibleUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionRoute"
    ADD CONSTRAINT "ExpeditionRoute_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: ExpeditionVolume ExpeditionVolume_boardedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_boardedById_fkey" FOREIGN KEY ("boardedById") REFERENCES public."appUsers"(id);


--
-- Name: ExpeditionVolume ExpeditionVolume_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."ExpeditionRoute"(id) ON DELETE CASCADE;


--
-- Name: ExpeditionVolume ExpeditionVolume_stopItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_stopItemId_fkey" FOREIGN KEY ("stopItemId") REFERENCES public."ExpeditionRouteStopItem"(id) ON DELETE CASCADE;


--
-- Name: ExpeditionVolume ExpeditionVolume_unloadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExpeditionVolume"
    ADD CONSTRAINT "ExpeditionVolume_unloadedById_fkey" FOREIGN KEY ("unloadedById") REFERENCES public."appUsers"(id);


--
-- Name: ExternalAssemblyInspectionActivity ExternalAssemblyInspectionActivity_doneById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity"
    ADD CONSTRAINT "ExternalAssemblyInspectionActivity_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: ExternalAssemblyInspectionActivity ExternalAssemblyInspectionActivity_inspectionProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionActivity"
    ADD CONSTRAINT "ExternalAssemblyInspectionActivity_inspectionProjectId_fkey" FOREIGN KEY ("inspectionProjectId") REFERENCES public."ExternalAssemblyInspectionProject"(id) ON DELETE CASCADE;


--
-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_inspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES public."ExternalAssemblyInspection"(id) ON DELETE CASCADE;


--
-- Name: ExternalAssemblyInspectionProject ExternalAssemblyInspectionProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject"
    ADD CONSTRAINT "ExternalAssemblyInspectionProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: ExternalAssemblyInspection ExternalAssemblyInspection_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExternalAssemblyInspection"
    ADD CONSTRAINT "ExternalAssemblyInspection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: FactoryEmployee FactoryEmployee_factoryRoleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_factoryRoleId_fkey" FOREIGN KEY ("factoryRoleId") REFERENCES public."FactoryRole"(id) ON DELETE RESTRICT;


--
-- Name: FactoryEmployee FactoryEmployee_legacyCabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FactoryEmployee"
    ADD CONSTRAINT "FactoryEmployee_legacyCabinetMakerId_fkey" FOREIGN KEY ("legacyCabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE SET NULL;


--
-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_implantacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_implantacaoId_fkey" FOREIGN KEY ("implementationId") REFERENCES public."Implementation"(id) ON DELETE CASCADE;


--
-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);


--
-- Name: ImplementationPurchaseItem ImplantacaoPurchaseItem_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImplementationPurchaseItem"
    ADD CONSTRAINT "ImplantacaoPurchaseItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Implementation Implantacao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Implementation Implantacao_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: Implementation Implantacao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implantacao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Implementation Implementation_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Implementation"
    ADD CONSTRAINT "Implementation_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: MeasurementProject MedicaoProject_medicaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MedicaoProject_medicaoId_fkey" FOREIGN KEY ("measurementId") REFERENCES public."Measurement"(id) ON DELETE CASCADE;


--
-- Name: MeasurementProject MedicaoProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MeasurementProject"
    ADD CONSTRAINT "MedicaoProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: Measurement Medicao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Measurement Medicao_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: Measurement Medicao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Measurement"
    ADD CONSTRAINT "Medicao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_marceneiroId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_marceneiroId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id) ON DELETE RESTRICT;


--
-- Name: AssemblyScheduleCabinetMaker MontagemProgramacaoMarceneiro_programacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleCabinetMaker"
    ADD CONSTRAINT "MontagemProgramacaoMarceneiro_programacaoId_fkey" FOREIGN KEY ("assemblyScheduleId") REFERENCES public."AssemblySchedule"(id) ON DELETE CASCADE;


--
-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_montadorId_fkey" FOREIGN KEY ("installerId") REFERENCES public."Installer"(id) ON DELETE RESTRICT;


--
-- Name: AssemblyScheduleInstaller MontagemProgramacaoMontador_programacaoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblyScheduleInstaller"
    ADD CONSTRAINT "MontagemProgramacaoMontador_programacaoId_fkey" FOREIGN KEY ("assemblyScheduleId") REFERENCES public."AssemblySchedule"(id) ON DELETE CASCADE;


--
-- Name: AssemblySchedule MontagemProgramacao_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: AssemblySchedule MontagemProgramacao_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;


--
-- Name: AssemblySchedule MontagemProgramacao_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssemblySchedule"
    ADD CONSTRAINT "MontagemProgramacao_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: OrderDeliveryPhase OrderDeliveryPhase_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderDeliveryPhase"
    ADD CONSTRAINT "OrderDeliveryPhase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_characteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES public."ProjectCharacteristic"(id) ON DELETE RESTRICT;


--
-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectCharacteristic OrderProjectCharacteristic_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectCharacteristic"
    ADD CONSTRAINT "OrderProjectCharacteristic_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_newDesignerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_newDesignerId_fkey" FOREIGN KEY ("newDesignerId") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectDesignerHistory OrderProjectDesignerHistory_previousDesignerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectDesignerHistory"
    ADD CONSTRAINT "OrderProjectDesignerHistory_previousDesignerId_fkey" FOREIGN KEY ("previousDesignerId") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_statusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES public."OrderProjectStatus"(id) ON DELETE RESTRICT;


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectStatusForecast OrderProjectStatusForecast_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusForecast"
    ADD CONSTRAINT "OrderProjectStatusForecast_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_newStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_newStatusId_fkey" FOREIGN KEY ("newStatusId") REFERENCES public."OrderProjectStatus"(id);


--
-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectStatusHistory OrderProjectStatusHistory_previousStatusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectStatusHistory"
    ADD CONSTRAINT "OrderProjectStatusHistory_previousStatusId_fkey" FOREIGN KEY ("previousStatusId") REFERENCES public."OrderProjectStatus"(id);


--
-- Name: OrderProjectSubstatus OrderProjectSubstatus_endedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: OrderProjectSubstatus OrderProjectSubstatus_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: OrderProjectSubstatus OrderProjectSubstatus_startedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProjectSubstatus"
    ADD CONSTRAINT "OrderProjectSubstatus_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: OrderProject OrderProject_aggregatorOrderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_aggregatorOrderProjectId_fkey" FOREIGN KEY ("aggregatorOrderProjectId") REFERENCES public."OrderProject"(id) ON DELETE RESTRICT;


--
-- Name: OrderProject OrderProject_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: OrderProject OrderProject_deliveryPhaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_deliveryPhaseId_fkey" FOREIGN KEY ("deliveryPhaseId") REFERENCES public."OrderDeliveryPhase"(id) ON DELETE SET NULL;


--
-- Name: OrderProject OrderProject_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);


--
-- Name: OrderProject OrderProject_environmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_environmentTypeId_fkey" FOREIGN KEY ("environmentTypeId") REFERENCES public."EnvironmentType"(id);


--
-- Name: OrderProject OrderProject_marceneiroId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_marceneiroId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);


--
-- Name: OrderProject OrderProject_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id);


--
-- Name: OrderProject OrderProject_parentProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: OrderProject OrderProject_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public."appUsers"(id) ON DELETE SET NULL;


--
-- Name: OrderProject OrderProject_statusId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES public."OrderProjectStatus"(id);


--
-- Name: OrderProject OrderProject_substituiProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_substituiProjectId_fkey" FOREIGN KEY ("replacesProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: OrderProject OrderProject_substituidoPorProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_substituidoPorProjectId_fkey" FOREIGN KEY ("replacedByProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: OrderProject OrderProject_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderProject"
    ADD CONSTRAINT "OrderProject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: OrderRequestActivity OrderRequestActivity_orderRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestActivity"
    ADD CONSTRAINT "OrderRequestActivity_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES public."OrderRequest"(id) ON DELETE CASCADE;


--
-- Name: OrderRequestAttachment OrderRequestAttachment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: OrderRequestAttachment OrderRequestAttachment_orderRequestActivityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_orderRequestActivityId_fkey" FOREIGN KEY ("orderRequestActivityId") REFERENCES public."OrderRequestActivity"(id) ON DELETE CASCADE;


--
-- Name: OrderRequestAttachment OrderRequestAttachment_orderRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequestAttachment"
    ADD CONSTRAINT "OrderRequestAttachment_orderRequestId_fkey" FOREIGN KEY ("orderRequestId") REFERENCES public."OrderRequest"(id) ON DELETE CASCADE;


--
-- Name: OrderRequest OrderRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: OrderRequest OrderRequest_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);


--
-- Name: OrderRequest OrderRequest_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id);


--
-- Name: OrderRequest OrderRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "OrderRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: PartRequestStatusHistory PartRequestStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequestStatusHistory"
    ADD CONSTRAINT "PartRequestStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);


--
-- Name: PartRequestStatusHistory PartRequestStatusHistory_partRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequestStatusHistory"
    ADD CONSTRAINT "PartRequestStatusHistory_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES public."PartRequest"(id) ON DELETE CASCADE;


--
-- Name: PartRequest PartRequest_cabinetMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_cabinetMakerId_fkey" FOREIGN KEY ("cabinetMakerId") REFERENCES public."CabinetMaker"(id);


--
-- Name: PartRequest PartRequest_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);


--
-- Name: PartRequest PartRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: PartRequest PartRequest_factoryEmployeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_factoryEmployeeId_fkey" FOREIGN KEY ("factoryEmployeeId") REFERENCES public."FactoryEmployee"(id) ON DELETE SET NULL;


--
-- Name: PartRequest PartRequest_montadorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_montadorId_fkey" FOREIGN KEY ("montadorId") REFERENCES public."Installer"(id) ON DELETE SET NULL;


--
-- Name: PartRequest PartRequest_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id);


--
-- Name: PartRequest PartRequest_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE SET NULL;


--
-- Name: PartRequest PartRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartRequest"
    ADD CONSTRAINT "PartRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: ProjectProductionQueue ProjectProductionQueue_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: ProjectProductionQueue ProjectProductionQueue_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProjectProductionQueue"
    ADD CONSTRAINT "ProjectProductionQueue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: Purchase Purchase_assistanceRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_assistanceRequestId_fkey" FOREIGN KEY ("assistanceRequestId") REFERENCES public."AssistanceRequest"(id) ON DELETE SET NULL;


--
-- Name: Purchase Purchase_externalAssemblyInspectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_externalAssemblyInspectionId_fkey" FOREIGN KEY ("externalAssemblyInspectionId") REFERENCES public."ExternalAssemblyInspection"(id) ON DELETE SET NULL;


--
-- Name: Purchase Purchase_purchaseReasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_purchaseReasonId_fkey" FOREIGN KEY ("purchaseReasonId") REFERENCES public."PurchaseReason"(id);


--
-- Name: Purchase Purchase_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);


--
-- Name: RevisionActivityAttachment RevisionActivityAttachment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RevisionActivityAttachment"
    ADD CONSTRAINT "RevisionActivityAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: RevisionActivityAttachment RevisionActivityAttachment_revisionActivityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RevisionActivityAttachment"
    ADD CONSTRAINT "RevisionActivityAttachment_revisionActivityId_fkey" FOREIGN KEY ("revisionActivityId") REFERENCES public."RevisionActivity"(id) ON DELETE CASCADE;


--
-- Name: RevisionActivity RevisionActivity_revisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RevisionActivity"
    ADD CONSTRAINT "RevisionActivity_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."Revision"(id) ON DELETE CASCADE;


--
-- Name: Revision Revision_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: Revision Revision_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: Revision Revision_thirdPartyProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_thirdPartyProjectId_fkey" FOREIGN KEY ("thirdPartyProjectId") REFERENCES public."ThirdPartyProject"(id) ON DELETE CASCADE;


--
-- Name: Revision Revision_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Revision"
    ADD CONSTRAINT "Revision_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionConsultantAdjustment"
    ADD CONSTRAINT "SalesCommissionConsultantAdjustment_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionConsultantAdjustment"
    ADD CONSTRAINT "SalesCommissionConsultantAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionEntry SalesCommissionEntry_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionEntry SalesCommissionEntry_monthCloseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_monthCloseId_fkey" FOREIGN KEY ("monthCloseId") REFERENCES public."SalesCommissionMonthClose"(id) ON DELETE CASCADE;


--
-- Name: SalesCommissionEntry SalesCommissionEntry_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionEntry"
    ADD CONSTRAINT "SalesCommissionEntry_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id);


--
-- Name: SalesCommissionManagerTier SalesCommissionManagerTier_salesMonthlyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionManagerTier"
    ADD CONSTRAINT "SalesCommissionManagerTier_salesMonthlyTargetId_fkey" FOREIGN KEY ("salesMonthlyTargetId") REFERENCES public."SalesMonthlyTarget"(id) ON DELETE CASCADE;


--
-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_closedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionMonthClose"
    ADD CONSTRAINT "SalesCommissionMonthClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_salesCommissionSaleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSaleInstallment"
    ADD CONSTRAINT "SalesCommissionSaleInstallment_salesCommissionSaleId_fkey" FOREIGN KEY ("salesCommissionSaleId") REFERENCES public."SalesCommissionSale"(id) ON DELETE CASCADE;


--
-- Name: SalesCommissionSale SalesCommissionSale_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionSale SalesCommissionSale_importedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES public."appUsers"(id);


--
-- Name: SalesCommissionSale SalesCommissionSale_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionSale"
    ADD CONSTRAINT "SalesCommissionSale_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id) ON DELETE SET NULL;


--
-- Name: SalesCommissionTier SalesCommissionTier_salesMonthlyTargetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesCommissionTier"
    ADD CONSTRAINT "SalesCommissionTier_salesMonthlyTargetId_fkey" FOREIGN KEY ("salesMonthlyTargetId") REFERENCES public."SalesMonthlyTarget"(id) ON DELETE CASCADE;


--
-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_salesOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesOrderClientInstallment"
    ADD CONSTRAINT "SalesOrderClientInstallment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: SystemSettings SystemSettings_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SystemSettings"
    ADD CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: ThirdPartyProjectStatusHistory ThirdPartyProjectStatusHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProjectStatusHistory"
    ADD CONSTRAINT "ThirdPartyProjectStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."appUsers"(id);


--
-- Name: ThirdPartyProjectStatusHistory ThirdPartyProjectStatusHistory_thirdPartyProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProjectStatusHistory"
    ADD CONSTRAINT "ThirdPartyProjectStatusHistory_thirdPartyProjectId_fkey" FOREIGN KEY ("thirdPartyProjectId") REFERENCES public."ThirdPartyProject"(id) ON DELETE CASCADE;


--
-- Name: ThirdPartyProject ThirdPartyProject_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: ThirdPartyProject ThirdPartyProject_designerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES public."appUsers"(id);


--
-- Name: ThirdPartyProject ThirdPartyProject_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: ThirdPartyProject ThirdPartyProject_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: ThirdPartyProject ThirdPartyProject_projectCharacteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_projectCharacteristicId_fkey" FOREIGN KEY ("projectCharacteristicId") REFERENCES public."ProjectCharacteristic"(id);


--
-- Name: ThirdPartyProject ThirdPartyProject_thirdPartySubtypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_thirdPartySubtypeId_fkey" FOREIGN KEY ("thirdPartySubtypeId") REFERENCES public."ThirdPartySubtype"(id);


--
-- Name: ThirdPartyProject ThirdPartyProject_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartyProject"
    ADD CONSTRAINT "ThirdPartyProject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: ThirdPartySubtype ThirdPartySubtype_projectCharacteristicId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ThirdPartySubtype"
    ADD CONSTRAINT "ThirdPartySubtype_projectCharacteristicId_fkey" FOREIGN KEY ("projectCharacteristicId") REFERENCES public."ProjectCharacteristic"(id);


--
-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_catalogItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES public."WoodworkQualityChecklistItem"(id) ON DELETE SET NULL;


--
-- Name: WoodworkQualityChecklistLine WoodworkQualityChecklistLine_checklistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklistLine"
    ADD CONSTRAINT "WoodworkQualityChecklistLine_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES public."WoodworkQualityChecklist"(id) ON DELETE CASCADE;


--
-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_completedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES public."appUsers"(id);


--
-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: WoodworkQualityChecklist WoodworkQualityChecklist_orderProjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WoodworkQualityChecklist"
    ADD CONSTRAINT "WoodworkQualityChecklist_orderProjectId_fkey" FOREIGN KEY ("orderProjectId") REFERENCES public."OrderProject"(id) ON DELETE CASCADE;


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_budgetInProgressById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_budgetInProgressById_fkey" FOREIGN KEY ("budgetInProgressById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_registeredById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_sentById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemRegistrationRequest WpsItemRegistrationRequest_wpsItemTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemRegistrationRequest"
    ADD CONSTRAINT "WpsItemRegistrationRequest_wpsItemTypeId_fkey" FOREIGN KEY ("wpsItemTypeId") REFERENCES public."WpsItemType"(id);


--
-- Name: WpsItemType WpsItemType_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: WpsItemType WpsItemType_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WpsItemType"
    ADD CONSTRAINT "WpsItemType_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: addr addr_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: addr addr_labelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES public.addrlabel(id);


--
-- Name: addr addr_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addr
    ADD CONSTRAINT "addr_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: addrlabel addrlabel_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addrlabel
    ADD CONSTRAINT "addrlabel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: addrlabel addrlabel_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addrlabel
    ADD CONSTRAINT "addrlabel_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: appUsers appUsers_authId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_authId_fkey" FOREIGN KEY ("authId") REFERENCES auth.users(id);


--
-- Name: OrderRequest orderConversations_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrderRequest"
    ADD CONSTRAINT "orderConversations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."salesOrders"(id) ON DELETE CASCADE;


--
-- Name: salesOrders salesOrders_addrId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_addrId_fkey" FOREIGN KEY ("addrId") REFERENCES public.addr(id) ON DELETE SET NULL;


--
-- Name: salesOrders salesOrders_architectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_architectId_fkey" FOREIGN KEY ("architectId") REFERENCES public."Architect"(id) ON DELETE SET NULL;


--
-- Name: salesOrders salesOrders_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id);


--
-- Name: salesOrders salesOrders_consultantUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_consultantUserId_fkey" FOREIGN KEY ("consultantUserId") REFERENCES public."appUsers"(id);


--
-- Name: salesOrders salesOrders_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."appUsers"(id);


--
-- Name: salesOrders salesOrders_updatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."salesOrders"
    ADD CONSTRAINT "salesOrders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES public."appUsers"(id);


--
-- Name: ActivityLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ActivityLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: ActivityLog ActivityLog_insert_definer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ActivityLog_insert_definer" ON public."ActivityLog" FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: ActivityLog ActivityLog_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ActivityLog_select_admin" ON public."ActivityLog" FOR SELECT TO authenticated USING (public.is_app_admin());


--
-- Name: AppError; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AppError" ENABLE ROW LEVEL SECURITY;

--
-- Name: AppError AppError_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "AppError_insert_authenticated" ON public."AppError" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: AppError AppError_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "AppError_select_admin" ON public."AppError" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u.role = 'Admin'::text)))));


--
-- Name: Architect; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Architect" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssemblySchedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssemblySchedule" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssemblyScheduleCabinetMaker; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssemblyScheduleCabinetMaker" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssemblyScheduleInstaller; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssemblyScheduleInstaller" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssistanceRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssistanceRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssistanceRequestStatusHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssistanceRequestStatusHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: CabinetMaker; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CabinetMaker" ENABLE ROW LEVEL SECURITY;

--
-- Name: CalendarEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CalendarEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: CalendarEventType; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CalendarEventType" ENABLE ROW LEVEL SECURITY;

--
-- Name: Client; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Client" ENABLE ROW LEVEL SECURITY;

--
-- Name: Contact; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Contact" ENABLE ROW LEVEL SECURITY;

--
-- Name: Deal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Deal" ENABLE ROW LEVEL SECURITY;

--
-- Name: DealActivity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DealActivity" ENABLE ROW LEVEL SECURITY;

--
-- Name: DealLostReason; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DealLostReason" ENABLE ROW LEVEL SECURITY;

--
-- Name: DealNote; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DealNote" ENABLE ROW LEVEL SECURITY;

--
-- Name: DealStage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DealStage" ENABLE ROW LEVEL SECURITY;

--
-- Name: Detailing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Detailing" ENABLE ROW LEVEL SECURITY;

--
-- Name: DriveFile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DriveFile" ENABLE ROW LEVEL SECURITY;

--
-- Name: DriveFile DriveFile_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "DriveFile_select_authenticated" ON public."DriveFile" FOR SELECT TO authenticated USING (true);


--
-- Name: DriveFile DriveFile_write_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "DriveFile_write_authenticated" ON public."DriveFile" TO authenticated USING (true) WITH CHECK (true);


--
-- Name: EnvironmentType; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EnvironmentType" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExpeditionRoute; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRoute" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExpeditionRouteStop; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRouteStop" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExpeditionRouteStopItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionRouteStopItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExpeditionVolume; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExpeditionVolume" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExternalAssemblyInspection; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExternalAssemblyInspection" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExternalAssemblyInspectionActivity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExternalAssemblyInspectionActivity" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExternalAssemblyInspectionProject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExternalAssemblyInspectionProject" ENABLE ROW LEVEL SECURITY;

--
-- Name: FactoryEmployee; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FactoryEmployee" ENABLE ROW LEVEL SECURITY;

--
-- Name: FactoryRole; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FactoryRole" ENABLE ROW LEVEL SECURITY;

--
-- Name: Implementation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Implementation" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImplementationPurchaseItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImplementationPurchaseItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: Installer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Installer" ENABLE ROW LEVEL SECURITY;

--
-- Name: Measurement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Measurement" ENABLE ROW LEVEL SECURITY;

--
-- Name: MeasurementProject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."MeasurementProject" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderDeliveryPhase; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderDeliveryPhase" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProject" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectCharacteristic; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectCharacteristic" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectDesignerHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectDesignerHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectStatus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatus" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectStatusForecast; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatusForecast" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectStatusHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectStatusHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectSubstatus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderProjectSubstatus" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderRequestActivity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequestActivity" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderRequestAttachment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OrderRequestAttachment" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartRequestStatusHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartRequestStatusHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignConference; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConference" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignConferenceHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConferenceHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignConferenceProject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignConferenceProject" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignModule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignModule" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignModuleObservation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignModuleObservation" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignObservation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PreliminaryDesignObservation" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProjectCharacteristic; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProjectCharacteristic" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProjectProductionQueue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProjectProductionQueue" ENABLE ROW LEVEL SECURITY;

--
-- Name: Purchase; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Purchase" ENABLE ROW LEVEL SECURITY;

--
-- Name: PurchaseReason; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PurchaseReason" ENABLE ROW LEVEL SECURITY;

--
-- Name: PurchaseStatus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PurchaseStatus" ENABLE ROW LEVEL SECURITY;

--
-- Name: Revision; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Revision" ENABLE ROW LEVEL SECURITY;

--
-- Name: RevisionActivity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RevisionActivity" ENABLE ROW LEVEL SECURITY;

--
-- Name: RevisionActivityAttachment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RevisionActivityAttachment" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionConsultantAdjustment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionConsultantAdjustment" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_manager_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionConsultantAdjustment_manager_all" ON public."SalesCommissionConsultantAdjustment" USING ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u."isActive" = true) AND ((u.role = 'Admin'::text) OR ((u.role = 'Consultor'::text) AND (u."isCommercialManager" = true))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u."isActive" = true) AND ((u.role = 'Admin'::text) OR ((u.role = 'Consultor'::text) AND (u."isCommercialManager" = true)))))));


--
-- Name: SalesCommissionEntry; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionEntry" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionEntry SalesCommissionEntry_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionEntry_admin_all" ON public."SalesCommissionEntry" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesCommissionManagerTier; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionManagerTier" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionManagerTier SalesCommissionManagerTier_manager_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionManagerTier_manager_all" ON public."SalesCommissionManagerTier" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesCommissionMonthClose; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionMonthClose" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionMonthClose SalesCommissionMonthClose_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionMonthClose_admin_all" ON public."SalesCommissionMonthClose" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesCommissionSale; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionSale" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionSaleInstallment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionSaleInstallment" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionSaleInstallment SalesCommissionSaleInstallment_manager_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionSaleInstallment_manager_all" ON public."SalesCommissionSaleInstallment" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesCommissionSale SalesCommissionSale_manager_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionSale_manager_all" ON public."SalesCommissionSale" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesCommissionTier; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesCommissionTier" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesCommissionTier SalesCommissionTier_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesCommissionTier_admin_all" ON public."SalesCommissionTier" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesMonthlyTarget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesMonthlyTarget" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesMonthlyTarget SalesMonthlyTarget_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesMonthlyTarget_admin_all" ON public."SalesMonthlyTarget" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SalesOrderClientInstallment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesOrderClientInstallment" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesOrderClientInstallment SalesOrderClientInstallment_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "SalesOrderClientInstallment_admin_all" ON public."SalesOrderClientInstallment" USING (public.can_manage_commercial_finance()) WITH CHECK (public.can_manage_commercial_finance());


--
-- Name: SystemSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SystemSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ThirdPartyProject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartyProject" ENABLE ROW LEVEL SECURITY;

--
-- Name: ThirdPartyProjectStatusHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartyProjectStatusHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: ThirdPartySubtype; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ThirdPartySubtype" ENABLE ROW LEVEL SECURITY;

--
-- Name: WoodworkQualityChecklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklist" ENABLE ROW LEVEL SECURITY;

--
-- Name: WoodworkQualityChecklistItem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklistItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: WoodworkQualityChecklistLine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WoodworkQualityChecklistLine" ENABLE ROW LEVEL SECURITY;

--
-- Name: WpsItemRegistrationRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WpsItemRegistrationRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: WpsItemType; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WpsItemType" ENABLE ROW LEVEL SECURITY;

--
-- Name: addr; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addr ENABLE ROW LEVEL SECURITY;

--
-- Name: addrlabel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addrlabel ENABLE ROW LEVEL SECURITY;

--
-- Name: SystemSettings admin_insert_SystemSettings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_insert_SystemSettings" ON public."SystemSettings" FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());


--
-- Name: SystemSettings admin_update_SystemSettings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_update_SystemSettings" ON public."SystemSettings" FOR UPDATE TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());


--
-- Name: appUsers admin_update_appUsers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_update_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public."appUsers" admin_user
  WHERE ((admin_user."authId" = auth.uid()) AND (admin_user.role = 'Admin'::text))))) WITH CHECK (true);


--
-- Name: appUsers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."appUsers" ENABLE ROW LEVEL SECURITY;

--
-- Name: PreliminaryDesignConference authenticated_delete_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignConferenceProject authenticated_delete_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModule authenticated_delete_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModuleObservation authenticated_delete_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: AssistanceRequest authenticated_delete_AssistanceRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_AssistanceRequest" ON public."AssistanceRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: CalendarEvent authenticated_delete_CalendarEvent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_CalendarEvent" ON public."CalendarEvent" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: CalendarEventType authenticated_delete_CalendarEventType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_CalendarEventType" ON public."CalendarEventType" FOR DELETE TO authenticated USING (true);


--
-- Name: Client authenticated_delete_Cliente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Cliente" ON public."Client" FOR DELETE TO authenticated USING (true);


--
-- Name: PurchaseStatus authenticated_delete_CompraStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_CompraStatus" ON public."PurchaseStatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: Purchase authenticated_delete_Compras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Compras" ON public."Purchase" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: Detailing authenticated_delete_Detailing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Detailing" ON public."Detailing" FOR DELETE TO authenticated USING (true);


--
-- Name: EnvironmentType authenticated_delete_EnvironmentType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_EnvironmentType" ON public."EnvironmentType" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRoute authenticated_delete_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExpeditionRoute" ON public."ExpeditionRoute" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStop authenticated_delete_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStopItem authenticated_delete_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionVolume authenticated_delete_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExpeditionVolume" ON public."ExpeditionVolume" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspection authenticated_delete_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionActivity authenticated_delete_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionProject authenticated_delete_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: FactoryEmployee authenticated_delete_FactoryEmployee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_FactoryEmployee" ON public."FactoryEmployee" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: FactoryRole authenticated_delete_FactoryRole; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_FactoryRole" ON public."FactoryRole" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: Implementation authenticated_delete_Implantacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Implantacao" ON public."Implementation" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ImplementationPurchaseItem authenticated_delete_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR DELETE TO authenticated USING (true);


--
-- Name: CabinetMaker authenticated_delete_Marceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Marceneiro" ON public."CabinetMaker" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: Measurement authenticated_delete_Medicao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Medicao" ON public."Measurement" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: MeasurementProject authenticated_delete_MedicaoProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_MedicaoProject" ON public."MeasurementProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: Installer authenticated_delete_Montador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_Montador" ON public."Installer" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: AssemblySchedule authenticated_delete_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_MontagemProgramacao" ON public."AssemblySchedule" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleCabinetMaker authenticated_delete_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleInstaller authenticated_delete_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderDeliveryPhase authenticated_delete_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR DELETE TO authenticated USING (true);


--
-- Name: OrderProject authenticated_delete_OrderProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderProject" ON public."OrderProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectCharacteristic authenticated_delete_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR DELETE TO authenticated USING (true);


--
-- Name: OrderProjectStatus authenticated_delete_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderProjectStatus" ON public."OrderProjectStatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectStatusHistory authenticated_delete_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectSubstatus authenticated_delete_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderRequestActivity authenticated_delete_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderRequestActivity" ON public."OrderRequestActivity" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderRequestAttachment authenticated_delete_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: PartRequest authenticated_delete_PartRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_PartRequest" ON public."PartRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ProjectCharacteristic authenticated_delete_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR DELETE TO authenticated USING (true);


--
-- Name: PurchaseReason authenticated_delete_PurchaseReason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_PurchaseReason" ON public."PurchaseReason" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartyProject authenticated_delete_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ThirdPartyProject" ON public."ThirdPartyProject" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartySubtype authenticated_delete_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: WoodworkQualityChecklist authenticated_delete_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR DELETE TO authenticated USING (true);


--
-- Name: WoodworkQualityChecklistItem authenticated_delete_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR DELETE TO authenticated USING (true);


--
-- Name: WoodworkQualityChecklistLine authenticated_delete_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR DELETE TO authenticated USING (true);


--
-- Name: WpsItemRegistrationRequest authenticated_delete_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: WpsItemType authenticated_delete_WpsItemType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_WpsItemType" ON public."WpsItemType" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: addr authenticated_delete_addr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_addr ON public.addr FOR DELETE TO authenticated USING (true);


--
-- Name: addrlabel authenticated_delete_addrlabel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_addrlabel ON public.addrlabel FOR DELETE TO authenticated USING (true);


--
-- Name: Architect authenticated_delete_architect; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_architect ON public."Architect" FOR DELETE TO authenticated USING (true);


--
-- Name: Contact authenticated_delete_contact; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_contact ON public."Contact" FOR DELETE TO authenticated USING (true);


--
-- Name: Deal authenticated_delete_deal; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_deal ON public."Deal" FOR DELETE TO authenticated USING (true);


--
-- Name: DealActivity authenticated_delete_dealactivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_dealactivity ON public."DealActivity" FOR DELETE TO authenticated USING (true);


--
-- Name: DealLostReason authenticated_delete_deallostreason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_deallostreason ON public."DealLostReason" FOR DELETE TO authenticated USING (true);


--
-- Name: DealNote authenticated_delete_dealnote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_dealnote ON public."DealNote" FOR DELETE TO authenticated USING (true);


--
-- Name: DealStage authenticated_delete_dealstage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_dealstage ON public."DealStage" FOR DELETE TO authenticated USING (true);


--
-- Name: importConsultorWPS authenticated_delete_importConsultorWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_importConsultorWPS" ON public."importConsultorWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: importMarceneiroWPS authenticated_delete_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: importStatusWPS authenticated_delete_importStatusWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_delete_importStatusWPS" ON public."importStatusWPS" FOR DELETE TO authenticated USING (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectDesignerHistory authenticated_delete_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_delete_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR DELETE TO authenticated USING (true);


--
-- Name: PreliminaryDesignConference authenticated_insert_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignConferenceHistory authenticated_insert_AnteprojetoConferenceHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoConferenceHistory" ON public."PreliminaryDesignConferenceHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignConferenceProject authenticated_insert_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModule authenticated_insert_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModuleObservation authenticated_insert_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignObservation authenticated_insert_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssistanceRequest authenticated_insert_AssistanceRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_AssistanceRequest" ON public."AssistanceRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: CalendarEvent authenticated_insert_CalendarEvent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_CalendarEvent" ON public."CalendarEvent" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: CalendarEventType authenticated_insert_CalendarEventType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_CalendarEventType" ON public."CalendarEventType" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: Client authenticated_insert_Cliente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Cliente" ON public."Client" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: PurchaseStatus authenticated_insert_CompraStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_CompraStatus" ON public."PurchaseStatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Purchase authenticated_insert_Compras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Compras" ON public."Purchase" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Detailing authenticated_insert_Detailing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Detailing" ON public."Detailing" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: EnvironmentType authenticated_insert_EnvironmentType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_EnvironmentType" ON public."EnvironmentType" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRoute authenticated_insert_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExpeditionRoute" ON public."ExpeditionRoute" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStop authenticated_insert_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStopItem authenticated_insert_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionVolume authenticated_insert_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExpeditionVolume" ON public."ExpeditionVolume" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspection authenticated_insert_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionActivity authenticated_insert_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionProject authenticated_insert_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: FactoryEmployee authenticated_insert_FactoryEmployee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_FactoryEmployee" ON public."FactoryEmployee" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: FactoryRole authenticated_insert_FactoryRole; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_FactoryRole" ON public."FactoryRole" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Implementation authenticated_insert_Implantacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Implantacao" ON public."Implementation" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ImplementationPurchaseItem authenticated_insert_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: CabinetMaker authenticated_insert_Marceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Marceneiro" ON public."CabinetMaker" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Measurement authenticated_insert_Medicao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Medicao" ON public."Measurement" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: MeasurementProject authenticated_insert_MedicaoProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_MedicaoProject" ON public."MeasurementProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Installer authenticated_insert_Montador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_Montador" ON public."Installer" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblySchedule authenticated_insert_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_MontagemProgramacao" ON public."AssemblySchedule" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleCabinetMaker authenticated_insert_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleInstaller authenticated_insert_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderDeliveryPhase authenticated_insert_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: OrderProject authenticated_insert_OrderProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderProject" ON public."OrderProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectCharacteristic authenticated_insert_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: OrderProjectStatus authenticated_insert_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderProjectStatus" ON public."OrderProjectStatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectStatusHistory authenticated_insert_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectSubstatus authenticated_insert_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderRequestActivity authenticated_insert_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderRequestActivity" ON public."OrderRequestActivity" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderRequestAttachment authenticated_insert_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PartRequest authenticated_insert_PartRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_PartRequest" ON public."PartRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PartRequestStatusHistory authenticated_insert_PartRequestStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_PartRequestStatusHistory" ON public."PartRequestStatusHistory" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ProjectCharacteristic authenticated_insert_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: PurchaseReason authenticated_insert_PurchaseReason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_PurchaseReason" ON public."PurchaseReason" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartyProject authenticated_insert_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ThirdPartyProject" ON public."ThirdPartyProject" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartyProjectStatusHistory authenticated_insert_ThirdPartyProjectStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ThirdPartyProjectStatusHistory" ON public."ThirdPartyProjectStatusHistory" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: ThirdPartySubtype authenticated_insert_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: WoodworkQualityChecklist authenticated_insert_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: WoodworkQualityChecklistItem authenticated_insert_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: WoodworkQualityChecklistLine authenticated_insert_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: WpsItemRegistrationRequest authenticated_insert_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: WpsItemType authenticated_insert_WpsItemType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_WpsItemType" ON public."WpsItemType" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: addr authenticated_insert_addr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_addr ON public.addr FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: addrlabel authenticated_insert_addrlabel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_addrlabel ON public.addrlabel FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: Architect authenticated_insert_architect; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_architect ON public."Architect" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: Contact authenticated_insert_contact; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_contact ON public."Contact" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: Deal authenticated_insert_deal; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_deal ON public."Deal" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: DealActivity authenticated_insert_dealactivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_dealactivity ON public."DealActivity" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: DealLostReason authenticated_insert_deallostreason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_deallostreason ON public."DealLostReason" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: DealNote authenticated_insert_dealnote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_dealnote ON public."DealNote" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: DealStage authenticated_insert_dealstage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_dealstage ON public."DealStage" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: importConsultorWPS authenticated_insert_importConsultorWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_importConsultorWPS" ON public."importConsultorWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: importMarceneiroWPS authenticated_insert_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: importStatusWPS authenticated_insert_importStatusWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_importStatusWPS" ON public."importStatusWPS" FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderRequest authenticated_insert_orderConversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_orderConversations" ON public."OrderRequest" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: OrderProjectDesignerHistory authenticated_insert_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_insert_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: appUsers authenticated_insert_own_appUsers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_own_appUsers" ON public."appUsers" FOR INSERT TO authenticated WITH CHECK ((("authId" = auth.uid()) OR public.is_app_admin()));


--
-- Name: salesOrders authenticated_insert_salesOrders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_insert_salesOrders" ON public."salesOrders" FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: PreliminaryDesignConference authenticated_select_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignConferenceHistory authenticated_select_AnteprojetoConferenceHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoConferenceHistory" ON public."PreliminaryDesignConferenceHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignConferenceProject authenticated_select_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignModule authenticated_select_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignModuleObservation authenticated_select_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignObservation authenticated_select_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR SELECT TO authenticated USING (true);


--
-- Name: AssistanceRequest authenticated_select_AssistanceRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AssistanceRequest" ON public."AssistanceRequest" FOR SELECT TO authenticated USING (true);


--
-- Name: AssistanceRequestStatusHistory authenticated_select_AssistanceRequestStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_AssistanceRequestStatusHistory" ON public."AssistanceRequestStatusHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: CalendarEvent authenticated_select_CalendarEvent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_CalendarEvent" ON public."CalendarEvent" FOR SELECT TO authenticated USING (true);


--
-- Name: CalendarEventType authenticated_select_CalendarEventType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_CalendarEventType" ON public."CalendarEventType" FOR SELECT TO authenticated USING (true);


--
-- Name: Client authenticated_select_Cliente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Cliente" ON public."Client" FOR SELECT TO authenticated USING (true);


--
-- Name: PurchaseStatus authenticated_select_CompraStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_CompraStatus" ON public."PurchaseStatus" FOR SELECT TO authenticated USING (true);


--
-- Name: Purchase authenticated_select_Compras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Compras" ON public."Purchase" FOR SELECT TO authenticated USING (true);


--
-- Name: Detailing authenticated_select_Detailing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Detailing" ON public."Detailing" FOR SELECT TO authenticated USING (true);


--
-- Name: EnvironmentType authenticated_select_EnvironmentType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_EnvironmentType" ON public."EnvironmentType" FOR SELECT TO authenticated USING (true);


--
-- Name: ExpeditionRoute authenticated_select_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExpeditionRoute" ON public."ExpeditionRoute" FOR SELECT TO authenticated USING (true);


--
-- Name: ExpeditionRouteStop authenticated_select_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR SELECT TO authenticated USING (true);


--
-- Name: ExpeditionRouteStopItem authenticated_select_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR SELECT TO authenticated USING (true);


--
-- Name: ExpeditionVolume authenticated_select_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExpeditionVolume" ON public."ExpeditionVolume" FOR SELECT TO authenticated USING (true);


--
-- Name: ExternalAssemblyInspection authenticated_select_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR SELECT TO authenticated USING (true);


--
-- Name: ExternalAssemblyInspectionActivity authenticated_select_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR SELECT TO authenticated USING (true);


--
-- Name: ExternalAssemblyInspectionProject authenticated_select_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR SELECT TO authenticated USING (true);


--
-- Name: FactoryEmployee authenticated_select_FactoryEmployee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_FactoryEmployee" ON public."FactoryEmployee" FOR SELECT TO authenticated USING (true);


--
-- Name: FactoryRole authenticated_select_FactoryRole; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_FactoryRole" ON public."FactoryRole" FOR SELECT TO authenticated USING (true);


--
-- Name: Implementation authenticated_select_Implantacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Implantacao" ON public."Implementation" FOR SELECT TO authenticated USING (true);


--
-- Name: ImplementationPurchaseItem authenticated_select_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR SELECT TO authenticated USING (true);


--
-- Name: CabinetMaker authenticated_select_Marceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Marceneiro" ON public."CabinetMaker" FOR SELECT TO authenticated USING (true);


--
-- Name: Measurement authenticated_select_Medicao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Medicao" ON public."Measurement" FOR SELECT TO authenticated USING (true);


--
-- Name: MeasurementProject authenticated_select_MedicaoProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_MedicaoProject" ON public."MeasurementProject" FOR SELECT TO authenticated USING (true);


--
-- Name: Installer authenticated_select_Montador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_Montador" ON public."Installer" FOR SELECT TO authenticated USING (true);


--
-- Name: AssemblySchedule authenticated_select_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_MontagemProgramacao" ON public."AssemblySchedule" FOR SELECT TO authenticated USING (true);


--
-- Name: AssemblyScheduleCabinetMaker authenticated_select_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR SELECT TO authenticated USING (true);


--
-- Name: AssemblyScheduleInstaller authenticated_select_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderDeliveryPhase authenticated_select_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProject authenticated_select_OrderProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderProject" ON public."OrderProject" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProjectCharacteristic authenticated_select_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProjectStatus authenticated_select_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderProjectStatus" ON public."OrderProjectStatus" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProjectStatusHistory authenticated_select_OrderProjectStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderProjectStatusHistory" ON public."OrderProjectStatusHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProjectSubstatus authenticated_select_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderRequestActivity authenticated_select_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderRequestActivity" ON public."OrderRequestActivity" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderRequestAttachment authenticated_select_OrderRequestAttachment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_OrderRequestAttachment" ON public."OrderRequestAttachment" FOR SELECT TO authenticated USING (true);


--
-- Name: PartRequest authenticated_select_PartRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_PartRequest" ON public."PartRequest" FOR SELECT TO authenticated USING (true);


--
-- Name: PartRequestStatusHistory authenticated_select_PartRequestStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_PartRequestStatusHistory" ON public."PartRequestStatusHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: ProjectCharacteristic authenticated_select_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR SELECT TO authenticated USING (true);


--
-- Name: PurchaseReason authenticated_select_PurchaseReason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_PurchaseReason" ON public."PurchaseReason" FOR SELECT TO authenticated USING (true);


--
-- Name: SystemSettings authenticated_select_SystemSettings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_SystemSettings" ON public."SystemSettings" FOR SELECT TO authenticated USING (true);


--
-- Name: ThirdPartyProject authenticated_select_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ThirdPartyProject" ON public."ThirdPartyProject" FOR SELECT TO authenticated USING (true);


--
-- Name: ThirdPartyProjectStatusHistory authenticated_select_ThirdPartyProjectStatusHistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ThirdPartyProjectStatusHistory" ON public."ThirdPartyProjectStatusHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: ThirdPartySubtype authenticated_select_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR SELECT TO authenticated USING (true);


--
-- Name: WoodworkQualityChecklist authenticated_select_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR SELECT TO authenticated USING (true);


--
-- Name: WoodworkQualityChecklistItem authenticated_select_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR SELECT TO authenticated USING (true);


--
-- Name: WoodworkQualityChecklistLine authenticated_select_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR SELECT TO authenticated USING (true);


--
-- Name: WpsItemRegistrationRequest authenticated_select_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR SELECT TO authenticated USING (true);


--
-- Name: WpsItemType authenticated_select_WpsItemType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_WpsItemType" ON public."WpsItemType" FOR SELECT TO authenticated USING (true);


--
-- Name: addr authenticated_select_addr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_addr ON public.addr FOR SELECT TO authenticated USING (true);


--
-- Name: addrlabel authenticated_select_addrlabel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_addrlabel ON public.addrlabel FOR SELECT TO authenticated USING (true);


--
-- Name: appUsers authenticated_select_appUsers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_appUsers" ON public."appUsers" FOR SELECT TO authenticated USING (true);


--
-- Name: Architect authenticated_select_architect; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_architect ON public."Architect" FOR SELECT TO authenticated USING (true);


--
-- Name: Contact authenticated_select_contact; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_contact ON public."Contact" FOR SELECT TO authenticated USING (true);


--
-- Name: Deal authenticated_select_deal; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_deal ON public."Deal" FOR SELECT TO authenticated USING (true);


--
-- Name: DealActivity authenticated_select_dealactivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_dealactivity ON public."DealActivity" FOR SELECT TO authenticated USING (true);


--
-- Name: DealLostReason authenticated_select_deallostreason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_deallostreason ON public."DealLostReason" FOR SELECT TO authenticated USING (true);


--
-- Name: DealNote authenticated_select_dealnote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_dealnote ON public."DealNote" FOR SELECT TO authenticated USING (true);


--
-- Name: DealStage authenticated_select_dealstage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_dealstage ON public."DealStage" FOR SELECT TO authenticated USING (true);


--
-- Name: designers authenticated_select_designers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_designers ON public.designers FOR SELECT TO authenticated USING (true);


--
-- Name: importConsultorWPS authenticated_select_importConsultorWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_importConsultorWPS" ON public."importConsultorWPS" FOR SELECT TO authenticated USING (true);


--
-- Name: importMarceneiroWPS authenticated_select_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR SELECT TO authenticated USING (true);


--
-- Name: importStatusWPS authenticated_select_importStatusWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_importStatusWPS" ON public."importStatusWPS" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderRequest authenticated_select_orderConversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_orderConversations" ON public."OrderRequest" FOR SELECT TO authenticated USING (true);


--
-- Name: OrderProjectDesignerHistory authenticated_select_orderprojectdesignerhistory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_orderprojectdesignerhistory ON public."OrderProjectDesignerHistory" FOR SELECT TO authenticated USING (true);


--
-- Name: ProjectProductionQueue authenticated_select_projectproductionqueue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_select_projectproductionqueue ON public."ProjectProductionQueue" FOR SELECT TO authenticated USING (true);


--
-- Name: salesOrders authenticated_select_salesOrders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_select_salesOrders" ON public."salesOrders" FOR SELECT TO authenticated USING (true);


--
-- Name: PreliminaryDesignConference authenticated_update_AnteprojetoConference; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AnteprojetoConference" ON public."PreliminaryDesignConference" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignConferenceProject authenticated_update_AnteprojetoConferenceProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AnteprojetoConferenceProject" ON public."PreliminaryDesignConferenceProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModule authenticated_update_AnteprojetoModule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AnteprojetoModule" ON public."PreliminaryDesignModule" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignModuleObservation authenticated_update_AnteprojetoModuleObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AnteprojetoModuleObservation" ON public."PreliminaryDesignModuleObservation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PreliminaryDesignObservation authenticated_update_AnteprojetoObservation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AnteprojetoObservation" ON public."PreliminaryDesignObservation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssistanceRequest authenticated_update_AssistanceRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_AssistanceRequest" ON public."AssistanceRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: CalendarEvent authenticated_update_CalendarEvent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_CalendarEvent" ON public."CalendarEvent" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: CalendarEventType authenticated_update_CalendarEventType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_CalendarEventType" ON public."CalendarEventType" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: Client authenticated_update_Cliente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Cliente" ON public."Client" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: PurchaseStatus authenticated_update_CompraStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_CompraStatus" ON public."PurchaseStatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Purchase authenticated_update_Compras; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Compras" ON public."Purchase" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Detailing authenticated_update_Detailing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Detailing" ON public."Detailing" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: EnvironmentType authenticated_update_EnvironmentType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_EnvironmentType" ON public."EnvironmentType" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRoute authenticated_update_ExpeditionRoute; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExpeditionRoute" ON public."ExpeditionRoute" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStop authenticated_update_ExpeditionRouteStop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExpeditionRouteStop" ON public."ExpeditionRouteStop" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionRouteStopItem authenticated_update_ExpeditionRouteStopItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExpeditionRouteStopItem" ON public."ExpeditionRouteStopItem" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExpeditionVolume authenticated_update_ExpeditionVolume; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExpeditionVolume" ON public."ExpeditionVolume" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspection authenticated_update_ExternalAssemblyInspection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExternalAssemblyInspection" ON public."ExternalAssemblyInspection" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionActivity authenticated_update_ExternalAssemblyInspectionActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExternalAssemblyInspectionActivity" ON public."ExternalAssemblyInspectionActivity" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ExternalAssemblyInspectionProject authenticated_update_ExternalAssemblyInspectionProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ExternalAssemblyInspectionProject" ON public."ExternalAssemblyInspectionProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: FactoryEmployee authenticated_update_FactoryEmployee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_FactoryEmployee" ON public."FactoryEmployee" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: FactoryRole authenticated_update_FactoryRole; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_FactoryRole" ON public."FactoryRole" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Implementation authenticated_update_Implantacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Implantacao" ON public."Implementation" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ImplementationPurchaseItem authenticated_update_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: CabinetMaker authenticated_update_Marceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Marceneiro" ON public."CabinetMaker" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Measurement authenticated_update_Medicao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Medicao" ON public."Measurement" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: MeasurementProject authenticated_update_MedicaoProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_MedicaoProject" ON public."MeasurementProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: Installer authenticated_update_Montador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_Montador" ON public."Installer" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblySchedule authenticated_update_MontagemProgramacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_MontagemProgramacao" ON public."AssemblySchedule" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleCabinetMaker authenticated_update_MontagemProgramacaoMarceneiro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_MontagemProgramacaoMarceneiro" ON public."AssemblyScheduleCabinetMaker" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: AssemblyScheduleInstaller authenticated_update_MontagemProgramacaoMontador; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_MontagemProgramacaoMontador" ON public."AssemblyScheduleInstaller" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderDeliveryPhase authenticated_update_OrderDeliveryPhase; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderDeliveryPhase" ON public."OrderDeliveryPhase" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: OrderProject authenticated_update_OrderProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderProject" ON public."OrderProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectCharacteristic authenticated_update_OrderProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderProjectCharacteristic" ON public."OrderProjectCharacteristic" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: OrderProjectStatus authenticated_update_OrderProjectStatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderProjectStatus" ON public."OrderProjectStatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderProjectSubstatus authenticated_update_OrderProjectSubstatus; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderProjectSubstatus" ON public."OrderProjectSubstatus" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderRequestActivity authenticated_update_OrderRequestActivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_OrderRequestActivity" ON public."OrderRequestActivity" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: PartRequest authenticated_update_PartRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_PartRequest" ON public."PartRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ProjectCharacteristic authenticated_update_ProjectCharacteristic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ProjectCharacteristic" ON public."ProjectCharacteristic" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: PurchaseReason authenticated_update_PurchaseReason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_PurchaseReason" ON public."PurchaseReason" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartyProject authenticated_update_ThirdPartyProject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ThirdPartyProject" ON public."ThirdPartyProject" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: ThirdPartySubtype authenticated_update_ThirdPartySubtype; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_ThirdPartySubtype" ON public."ThirdPartySubtype" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: WoodworkQualityChecklist authenticated_update_WoodworkQualityChecklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_WoodworkQualityChecklist" ON public."WoodworkQualityChecklist" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: WoodworkQualityChecklistItem authenticated_update_WoodworkQualityChecklistItem; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_WoodworkQualityChecklistItem" ON public."WoodworkQualityChecklistItem" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: WoodworkQualityChecklistLine authenticated_update_WoodworkQualityChecklistLine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_WoodworkQualityChecklistLine" ON public."WoodworkQualityChecklistLine" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: WpsItemRegistrationRequest authenticated_update_WpsItemRegistrationRequest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_WpsItemRegistrationRequest" ON public."WpsItemRegistrationRequest" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: WpsItemType authenticated_update_WpsItemType; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_WpsItemType" ON public."WpsItemType" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: addr authenticated_update_addr; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_addr ON public.addr FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: addrlabel authenticated_update_addrlabel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_addrlabel ON public.addrlabel FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: appUsers authenticated_update_appUsers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((("authId" = auth.uid()) OR public.is_app_admin())) WITH CHECK ((("authId" = auth.uid()) OR public.is_app_admin()));


--
-- Name: Architect authenticated_update_architect; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_architect ON public."Architect" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: Contact authenticated_update_contact; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_contact ON public."Contact" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: Deal authenticated_update_deal; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_deal ON public."Deal" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: DealActivity authenticated_update_dealactivity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_dealactivity ON public."DealActivity" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: DealLostReason authenticated_update_deallostreason; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_deallostreason ON public."DealLostReason" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: DealNote authenticated_update_dealnote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_dealnote ON public."DealNote" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: DealStage authenticated_update_dealstage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_update_dealstage ON public."DealStage" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: importConsultorWPS authenticated_update_importConsultorWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_importConsultorWPS" ON public."importConsultorWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: importMarceneiroWPS authenticated_update_importMarceneiroWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_importMarceneiroWPS" ON public."importMarceneiroWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: importStatusWPS authenticated_update_importStatusWPS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_importStatusWPS" ON public."importStatusWPS" FOR UPDATE TO authenticated USING (public.is_authenticated_active_app_user()) WITH CHECK (public.is_authenticated_active_app_user());


--
-- Name: OrderRequest authenticated_update_orderConversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_orderConversations" ON public."OrderRequest" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: appUsers authenticated_update_own_appUsers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated_update_own_appUsers" ON public."appUsers" FOR UPDATE TO authenticated USING ((auth.uid() = "authId")) WITH CHECK ((auth.uid() = "authId"));


--
-- Name: SalesCommissionEntry commercial_read_own_sales_commission_entry; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commercial_read_own_sales_commission_entry ON public."SalesCommissionEntry" FOR SELECT TO authenticated USING ((public."canReadCommercialCommissions"() AND ("consultantUserId" = public."currentAppUserId"())));


--
-- Name: SalesCommissionManagerTier commercial_read_sales_commission_manager_tier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commercial_read_sales_commission_manager_tier ON public."SalesCommissionManagerTier" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());


--
-- Name: SalesCommissionTier commercial_read_sales_commission_tier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commercial_read_sales_commission_tier ON public."SalesCommissionTier" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());


--
-- Name: SalesMonthlyTarget commercial_read_sales_monthly_target; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY commercial_read_sales_monthly_target ON public."SalesMonthlyTarget" FOR SELECT TO authenticated USING (public."canReadCommercialCommissions"());


--
-- Name: designers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.designers ENABLE ROW LEVEL SECURITY;

--
-- Name: importConsultorWPS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."importConsultorWPS" ENABLE ROW LEVEL SECURITY;

--
-- Name: importMarceneiroWPS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."importMarceneiroWPS" ENABLE ROW LEVEL SECURITY;

--
-- Name: importStatusWPS; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."importStatusWPS" ENABLE ROW LEVEL SECURITY;

--
-- Name: OrderProjectStatusForecast order_project_status_forecast_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_project_status_forecast_authenticated_all ON public."OrderProjectStatusForecast" TO authenticated USING (true) WITH CHECK (true);


--
-- Name: RevisionActivityAttachment revision_activity_attachment_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revision_activity_attachment_authenticated_all ON public."RevisionActivityAttachment" TO authenticated USING (true) WITH CHECK (true);


--
-- Name: RevisionActivity revision_activity_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revision_activity_authenticated_all ON public."RevisionActivity" TO authenticated USING (true) WITH CHECK (true);


--
-- Name: Revision revision_authenticated_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY revision_authenticated_all ON public."Revision" TO authenticated USING (true) WITH CHECK (true);


--
-- Name: salesOrders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."salesOrders" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict ZgxE1i14htj14mwVyURupAK6Tqn55MH387PqeGAguLeEbdAfzvVtiTTe8aHgoFf


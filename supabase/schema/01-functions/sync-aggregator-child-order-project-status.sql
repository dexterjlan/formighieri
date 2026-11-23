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

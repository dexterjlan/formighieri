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

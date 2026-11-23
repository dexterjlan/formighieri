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

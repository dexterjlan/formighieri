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

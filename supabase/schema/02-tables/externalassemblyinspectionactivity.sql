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

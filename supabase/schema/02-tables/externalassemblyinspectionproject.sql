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

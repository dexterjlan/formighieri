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

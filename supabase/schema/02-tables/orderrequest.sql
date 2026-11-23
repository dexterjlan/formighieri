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

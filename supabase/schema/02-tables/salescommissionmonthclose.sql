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

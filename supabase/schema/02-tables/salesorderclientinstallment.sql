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

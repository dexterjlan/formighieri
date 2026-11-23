-- Name: SalesMonthlyTarget; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SalesMonthlyTarget" (
    id bigint NOT NULL,
    "yearMonth" text NOT NULL,
    "targetAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "managerTeamSalePercent" numeric(8,4),
    "managerTargetBonusPercent" numeric(8,4),
    CONSTRAINT "SalesMonthlyTarget_yearMonth_format" CHECK (("yearMonth" ~ '^\d{4}-\d{2}$'::text))
);

-- Name: COLUMN "SalesMonthlyTarget"."managerTeamSalePercent"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesMonthlyTarget"."managerTeamSalePercent" IS 'Percentual sobre o valor total de cada venda de outros consultores (mês seguinte à venda).';

-- Name: COLUMN "SalesMonthlyTarget"."managerTargetBonusPercent"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesMonthlyTarget"."managerTargetBonusPercent" IS 'Percentual bônus quando a meta do mês é atingida (mês seguinte à entrega do pedido).';

-- Name: SalesMonthlyTarget_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."SalesMonthlyTarget" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesMonthlyTarget_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

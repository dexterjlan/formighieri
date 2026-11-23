-- Name: designers; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public.designers (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);

-- Name: designers_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public.designers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.designers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: appUsers; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."appUsers" (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    role text,
    "authId" uuid,
    "isActive" boolean DEFAULT true NOT NULL,
    "isConferenceReviewer" boolean DEFAULT false NOT NULL,
    "isCommercialManager" boolean DEFAULT false NOT NULL,
    "isProjectsManager" boolean DEFAULT false NOT NULL,
    "isPpcp" boolean DEFAULT false NOT NULL,
    "isFactoryManager" boolean DEFAULT false NOT NULL,
    "isDetailing" boolean DEFAULT false NOT NULL,
    "isReviewer" boolean DEFAULT false NOT NULL,
    "isThirdParty" boolean DEFAULT false NOT NULL,
    "calendarColor" text,
    "isFactoryAdministrative" boolean DEFAULT false NOT NULL,
    "isInstaller" boolean DEFAULT false NOT NULL,
    "receiveEmailCopy" boolean DEFAULT false NOT NULL,
    "matrixUserId" text,
    "isBudgetEstimator" boolean DEFAULT false NOT NULL,
    "isPicker" boolean DEFAULT false NOT NULL,
    "isCoordination" boolean DEFAULT false NOT NULL,
    "isBuyer" boolean DEFAULT false NOT NULL
);

-- Name: COLUMN "appUsers"."isReviewer"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isReviewer" IS 'Projetista revisor: vê e age em todos os projetos nos status do revisor, sem vínculo por projeto.';

-- Name: COLUMN "appUsers"."isThirdParty"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isThirdParty" IS 'Usuário terceiro (não funcionário). Acesso restrito à tela de Pendências.';

-- Name: COLUMN "appUsers"."calendarColor"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."calendarColor" IS 'Cor do calendário no FGP e no Google Agenda (hex da paleta Google Calendar).';

-- Name: COLUMN "appUsers"."isFactoryAdministrative"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isFactoryAdministrative" IS 'Fabrica administrativo: pendências da fábrica e edição da programação de montagem.';

-- Name: COLUMN "appUsers"."isInstaller"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isInstaller" IS 'When true with role Fábrica: FGP navigation limited to 3D viewer.';

-- Name: COLUMN "appUsers"."receiveEmailCopy"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."receiveEmailCopy" IS 'When true, user receives CC on emails triggered by their own actions in the app.';

-- Name: COLUMN "appUsers"."matrixUserId"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."matrixUserId" IS 'Matrix user ID (MXID) for Element notifications and DMs.';

-- Name: COLUMN "appUsers"."isBudgetEstimator"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isBudgetEstimator" IS 'When true with role Projetista: budget estimator (orçamentista) attribute.';

-- Name: COLUMN "appUsers"."isPicker"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isPicker" IS 'Separador: pode ser responsável por embarque/desembarque na expedição.';

-- Name: COLUMN "appUsers"."isCoordination"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isCoordination" IS 'Fábrica: coordenação operacional (mesmo escopo de permissões do gestor de projetos).';

-- Name: COLUMN "appUsers"."isBuyer"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."appUsers"."isBuyer" IS 'Fábrica: equipe de compras (ex-perfil Compras).';

-- Name: appUsers_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."appUsers" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."appUsers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

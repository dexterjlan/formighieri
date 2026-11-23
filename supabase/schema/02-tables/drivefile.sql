-- Name: DriveFile; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."DriveFile" (
    id bigint NOT NULL,
    "driveFileId" text,
    "driveFolderId" text,
    "fileName" text NOT NULL,
    "mimeType" text,
    "fileSizeBytes" bigint,
    url text,
    "folderKind" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" bigint NOT NULL,
    "orderId" bigint,
    "orderProjectId" bigint,
    "folderPath" text,
    "createdById" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "storagePath" text,
    "ingestStatus" text DEFAULT 'pending'::text NOT NULL,
    "ingestError" text,
    "viewerStoragePath" text,
    CONSTRAINT "DriveFile_entityType_check" CHECK (("entityType" = ANY (ARRAY['Detailing'::text, 'RevisionActivity'::text, 'OrderRequest'::text, 'OrderRequestActivity'::text, 'SalesOrder'::text, 'ThirdPartyProject'::text, 'OrderProject'::text, 'ImplementationPurchaseItem'::text, 'AssistanceRequest'::text, 'ExternalAssemblyInspectionActivity'::text, 'ExpeditionRouteStopItem'::text]))),
    CONSTRAINT "DriveFile_folderKind_check" CHECK (("folderKind" = ANY (ARRAY['detailing'::text, 'revision'::text, 'request'::text, 'descriptive'::text, 'thirdParty'::text, 'model3d'::text, 'implementationList'::text, 'assistanceQuote'::text, 'externalAssemblyInspection'::text, 'externalAssemblyInspectionResponse'::text, 'expeditionPickup'::text]))),
    CONSTRAINT "DriveFile_ingestStatus_check" CHECK (("ingestStatus" = ANY (ARRAY['pending'::text, 'ready'::text, 'error'::text])))
);

-- Name: COLUMN "DriveFile"."folderKind"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."DriveFile"."folderKind" IS 'Pasta lógica no Drive: detailing, revision, request, descriptive, thirdParty, model3d, implementationList, assistanceQuote.';

-- Name: COLUMN "DriveFile"."entityType"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."DriveFile"."entityType" IS 'Origem: Detailing, RevisionActivity, OrderRequest, OrderRequestActivity, SalesOrder, ThirdPartyProject, OrderProject, ImplementationPurchaseItem, AssistanceRequest.';

-- Name: COLUMN "DriveFile"."storagePath"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."DriveFile"."storagePath" IS 'Caminho no bucket drive-files (fonte do download no FGP).';

-- Name: COLUMN "DriveFile"."ingestStatus"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."DriveFile"."ingestStatus" IS 'pending/ready/error da cópia Storage → Google Drive.';

-- Name: COLUMN "DriveFile"."viewerStoragePath"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."DriveFile"."viewerStoragePath" IS 'Path no bucket order-project-model3d para visualização no app (GLB/GLTF).';

-- Name: DriveFile_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."DriveFile" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."DriveFile_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: ExternalAssemblyInspectionProject id; Type: DEFAULT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspectionProject" ALTER COLUMN id SET DEFAULT nextval('public."ExternalAssemblyInspectionProject_id_seq"'::regclass);

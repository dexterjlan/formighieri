-- Name: Client client_cleanup_contacts; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER client_cleanup_contacts BEFORE DELETE ON public."Client" FOR EACH ROW EXECUTE FUNCTION public.cleanup_owner_contacts('client');

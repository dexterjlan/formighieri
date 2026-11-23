-- Name: Architect architect_cleanup_contacts; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER architect_cleanup_contacts BEFORE DELETE ON public."Architect" FOR EACH ROW EXECUTE FUNCTION public.cleanup_owner_contacts('architect');

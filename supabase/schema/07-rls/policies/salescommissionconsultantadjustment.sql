-- Name: SalesCommissionConsultantAdjustment SalesCommissionConsultantAdjustment_manager_all; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "SalesCommissionConsultantAdjustment_manager_all" ON public."SalesCommissionConsultantAdjustment" USING ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u."isActive" = true) AND ((u.role = 'Admin'::text) OR ((u.role = 'Consultor'::text) AND (u."isCommercialManager" = true))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public."appUsers" u
  WHERE ((u."authId" = auth.uid()) AND (u."isActive" = true) AND ((u.role = 'Admin'::text) OR ((u.role = 'Consultor'::text) AND (u."isCommercialManager" = true)))))));

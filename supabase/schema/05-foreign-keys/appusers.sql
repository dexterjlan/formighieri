-- Name: appUsers appUsers_authId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."appUsers"
    ADD CONSTRAINT "appUsers_authId_fkey" FOREIGN KEY ("authId") REFERENCES auth.users(id);

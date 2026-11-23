-- Name: CalendarEvent_addrId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_addrId_idx" ON public."CalendarEvent" USING btree ("addrId");

-- Name: CalendarEvent_clientId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_clientId_idx" ON public."CalendarEvent" USING btree ("clientId");

-- Name: CalendarEvent_eventDate_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_eventDate_idx" ON public."CalendarEvent" USING btree ("eventDate");

-- Name: CalendarEvent_eventTypeId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_eventTypeId_idx" ON public."CalendarEvent" USING btree ("eventTypeId");

-- Name: CalendarEvent_googleCalendarEventId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_googleCalendarEventId_idx" ON public."CalendarEvent" USING btree ("googleCalendarEventId") WHERE ("googleCalendarEventId" IS NOT NULL);

-- Name: CalendarEvent_orderId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_orderId_idx" ON public."CalendarEvent" USING btree ("orderId");

-- Name: CalendarEvent_responsibleId_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEvent_responsibleId_idx" ON public."CalendarEvent" USING btree ("responsibleId");

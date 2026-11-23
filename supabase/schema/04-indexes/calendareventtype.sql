-- Name: CalendarEventType_isActive_sortOrder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "CalendarEventType_isActive_sortOrder_idx" ON public."CalendarEventType" USING btree ("isActive", "sortOrder", id);

-- Name: CalendarEventType_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "CalendarEventType_name_unique_ci_idx" ON public."CalendarEventType" USING btree (lower(TRIM(BOTH FROM name)));

--
-- PostgreSQL database dump
--

\restrict r6MIIogHzYWItxRF0HxiETbo2HmASooSJSWiaSmgVQ7SJkL96oJL1AbdN9Vxodd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Ubuntu 17.9-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    full_name text,
    email text NOT NULL,
    company_name text,
    website text,
    interest_type text NOT NULL,
    source text DEFAULT 'sample_form'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    last_contact_at timestamp with time zone,
    notes text
);


--
-- Name: outreach_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid NOT NULL,
    event_type text NOT NULL,
    event_value text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    period_start date,
    period_end date,
    body_markdown text,
    body_html text,
    pdf_url text,
    status text DEFAULT 'draft'::text NOT NULL
);


--
-- Name: sample_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_id uuid NOT NULL,
    topic text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    sample_publication_id uuid,
    sent_at timestamp with time zone
);


--
-- Name: source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text NOT NULL,
    source_url text NOT NULL,
    published_at timestamp with time zone,
    topic text NOT NULL,
    summary text,
    why_it_matters text,
    confidence text DEFAULT 'medium'::text NOT NULL,
    relevance_score integer DEFAULT 50 NOT NULL,
    duplicate_hash text
);


--
-- Name: subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    full_name text,
    company_name text,
    plan text NOT NULL,
    status text DEFAULT 'payment_pending'::text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_start timestamp with time zone,
    renewal_date timestamp with time zone
);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: outreach_events outreach_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_pkey PRIMARY KEY (id);


--
-- Name: publications publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_pkey PRIMARY KEY (id);


--
-- Name: sample_requests sample_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_pkey PRIMARY KEY (id);


--
-- Name: source_items source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_items
    ADD CONSTRAINT source_items_pkey PRIMARY KEY (id);


--
-- Name: subscribers subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_email_key UNIQUE (email);


--
-- Name: subscribers subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscribers
    ADD CONSTRAINT subscribers_pkey PRIMARY KEY (id);


--
-- Name: outreach_events outreach_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_events
    ADD CONSTRAINT outreach_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: sample_requests sample_requests_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: sample_requests sample_requests_sample_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_sample_publication_id_fkey FOREIGN KEY (sample_publication_id) REFERENCES public.publications(id) ON DELETE SET NULL;


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;

--
-- Name: publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

--
-- Name: sample_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sample_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: source_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;

--
-- Name: subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict r6MIIogHzYWItxRF0HxiETbo2HmASooSJSWiaSmgVQ7SJkL96oJL1AbdN9Vxodd


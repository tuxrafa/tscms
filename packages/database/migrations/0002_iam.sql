ALTER TABLE "users" ADD COLUMN "login" text;
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "users" ADD COLUMN "kind" text DEFAULT 'human' NOT NULL;
ALTER TABLE "users" ADD COLUMN "auth_method" text DEFAULT 'local' NOT NULL;
ALTER TABLE "users" ADD COLUMN "platform_admin" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "description" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN "owner_id" uuid;
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;
CREATE UNIQUE INDEX "users_login_unique" ON "users" USING btree ("login");

CREATE TABLE "iam_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "user_agent" text,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "iam_sessions" ADD CONSTRAINT "iam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "iam_sessions_user_idx" ON "iam_sessions" USING btree ("user_id");

CREATE TABLE "iam_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "role_id" uuid,
  "site_id" uuid,
  "scope_type" text NOT NULL,
  "scope_id" uuid,
  "include_descendants" boolean DEFAULT true NOT NULL,
  "permissions" jsonb NOT NULL,
  "delegable" boolean DEFAULT false NOT NULL,
  "label" text DEFAULT '' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "iam_access_grants_subject" CHECK ("user_id" IS NOT NULL OR "role_id" IS NOT NULL),
  CONSTRAINT "iam_access_grants_scope" CHECK ("scope_type" IN ('platform', 'organization', 'site', 'page_folder', 'asset_folder', 'resource'))
);
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "iam_access_grants" ADD CONSTRAINT "iam_access_grants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "iam_access_grants_user_idx" ON "iam_access_grants" USING btree ("user_id");
CREATE INDEX "iam_access_grants_role_idx" ON "iam_access_grants" USING btree ("role_id");
CREATE INDEX "iam_access_grants_org_idx" ON "iam_access_grants" USING btree ("organization_id", "site_id");

CREATE TABLE "iam_group_members" (
  "role_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "iam_group_members_role_id_user_id_pk" PRIMARY KEY("role_id","user_id")
);
ALTER TABLE "iam_group_members" ADD CONSTRAINT "iam_group_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "iam_group_members" ADD CONSTRAINT "iam_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "iam_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "iam_credentials_kind" CHECK ("kind" IN ('invite', 'reset', 'service'))
);
ALTER TABLE "iam_credentials" ADD CONSTRAINT "iam_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "iam_credentials_hash_unique" ON "iam_credentials" USING btree ("token_hash");
CREATE INDEX "iam_credentials_user_idx" ON "iam_credentials" USING btree ("user_id");

CREATE TABLE "iam_external_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "provider_tenant" text,
  "link_state" text DEFAULT 'pending' NOT NULL,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "iam_external_identities" ADD CONSTRAINT "iam_external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "iam_external_identities_subject_unique" ON "iam_external_identities" USING btree ("provider","issuer","subject");

ALTER TABLE "audit_events" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "audit_events" ADD COLUMN "actor_type" text DEFAULT 'human' NOT NULL;
ALTER TABLE "audit_events" ADD COLUMN "result" text DEFAULT 'success' NOT NULL;
ALTER TABLE "audit_events" ADD COLUMN "resource_path" text;
ALTER TABLE "audit_events" ADD COLUMN "request_id" text;
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id","created_at");
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id","created_at");

CREATE TABLE "asset_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"checksum" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_collection_items" (
	"collection_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "asset_collection_items_collection_id_asset_id_pk" PRIMARY KEY("collection_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "media_type" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD COLUMN "preset" text;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD COLUMN "height" integer;--> statement-breakpoint
UPDATE "assets" SET "status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "asset_folders_site_path_unique" ON "asset_folders" USING btree ("site_id","path");--> statement-breakpoint
CREATE INDEX "assets_site_checksum_idx" ON "assets" USING btree ("site_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_asset_version_unique" ON "asset_versions" USING btree ("asset_id","version");--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_folder_id_asset_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."asset_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_collections" ADD CONSTRAINT "asset_collections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_collection_items" ADD CONSTRAINT "asset_collection_items_collection_id_asset_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."asset_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_collection_items" ADD CONSTRAINT "asset_collection_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;

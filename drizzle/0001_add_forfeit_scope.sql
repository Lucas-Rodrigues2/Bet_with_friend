CREATE TYPE "public"."forfeit_scope" AS ENUM('all_losers', 'last_one');--> statement-breakpoint
CREATE TABLE "analytics_events_test" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"distinct_id" text NOT NULL,
	"event" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "forfeit_scope" "forfeit_scope";--> statement-breakpoint
ALTER TABLE "group_invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "can_invite" boolean DEFAULT false NOT NULL;
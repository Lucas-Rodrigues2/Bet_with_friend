CREATE TYPE "public"."notif_channel" AS ENUM('in_app', 'email', 'push');--> statement-breakpoint
CREATE TABLE "bet_jurors" (
	"bet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "bet_jurors_bet_id_user_id_pk" PRIMARY KEY("bet_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "jury_vote_losers" (
	"vote_id" uuid NOT NULL,
	"loser_user_id" uuid NOT NULL,
	CONSTRAINT "jury_vote_losers_vote_id_loser_user_id_pk" PRIMARY KEY("vote_id","loser_user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel" "notif_channel" NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_channel_pk" PRIMARY KEY("user_id","type","channel")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "forfeits" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "yesno_bets" ADD COLUMN "open_stake_creator" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "yesno_bets" ADD COLUMN "open_stake_opponent" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "yesno_bets" ADD COLUMN "open_forfeit_creator" text;--> statement-breakpoint
ALTER TABLE "yesno_bets" ADD COLUMN "open_forfeit_opponent" text;--> statement-breakpoint
ALTER TABLE "bet_jurors" ADD CONSTRAINT "bet_jurors_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_jurors" ADD CONSTRAINT "bet_jurors_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jury_vote_losers" ADD CONSTRAINT "jury_vote_losers_vote_id_jury_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."jury_votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jury_vote_losers" ADD CONSTRAINT "jury_vote_losers_loser_user_id_profiles_id_fk" FOREIGN KEY ("loser_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_offers" DROP COLUMN "forfeit_description";--> statement-breakpoint
ALTER TABLE "propositions" DROP COLUMN "forfeit_description";
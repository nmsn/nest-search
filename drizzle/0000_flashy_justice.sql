CREATE TYPE "public"."cas_ticket_type" AS ENUM('TGT', 'ST');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'submitted', 'approved');--> statement-breakpoint
CREATE TYPE "public"."scheme_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "cas_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" varchar(100) NOT NULL,
	"service_url" varchar(500) NOT NULL,
	"name" varchar(100),
	"enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cas_services_service_id_unique" UNIQUE("service_id")
);
--> statement-breakpoint
CREATE TABLE "cas_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket" varchar(255) NOT NULL,
	"type" "cas_ticket_type" NOT NULL,
	"user_id" integer NOT NULL,
	"service" varchar(500),
	"expires_at" timestamp NOT NULL,
	"consumed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "cas_tickets_ticket_unique" UNIQUE("ticket")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"email" varchar(100),
	"role" "user_role" DEFAULT 'user',
	"status" "user_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "business_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"table_prefix" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "business_lines_code_unique" UNIQUE("code"),
	CONSTRAINT "business_lines_table_prefix_unique" UNIQUE("table_prefix")
);
--> statement-breakpoint
ALTER TABLE "cas_tickets" ADD CONSTRAINT "cas_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
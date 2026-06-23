CREATE TABLE `cas_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_id` varchar(100) NOT NULL,
	`service_url` varchar(500) NOT NULL,
	`name` varchar(100),
	`enabled` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `cas_services_id` PRIMARY KEY(`id`),
	CONSTRAINT `cas_services_service_id_unique` UNIQUE(`service_id`)
);
--> statement-breakpoint
CREATE TABLE `cas_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticket` varchar(255) NOT NULL,
	`type` enum('TGT','ST') NOT NULL,
	`user_id` int NOT NULL,
	`service` varchar(500),
	`expires_at` timestamp NOT NULL,
	`consumed` boolean DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `cas_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `cas_tickets_ticket_unique` UNIQUE(`ticket`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`email` varchar(100),
	`role` enum('admin','user') DEFAULT 'user',
	`status` enum('active','disabled') DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `business_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`table_prefix` varchar(20) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `business_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_lines_code_unique` UNIQUE(`code`),
	CONSTRAINT `business_lines_table_prefix_unique` UNIQUE(`table_prefix`)
);
--> statement-breakpoint
ALTER TABLE `cas_tickets` ADD CONSTRAINT `cas_tickets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
CREATE DATABASE IF NOT EXISTS edumind
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE edumind;

CREATE TABLE IF NOT EXISTS profile_results (
  account_id VARCHAR(191) NOT NULL PRIMARY KEY,
  profile_json JSON NOT NULL,
  saved_at DATETIME(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_collaboration (
  day_of_week TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  day_name VARCHAR(32) NOT NULL,
  date_string DATE NULL,
  total_agents INT NOT NULL DEFAULT 0,
  total_events INT NOT NULL DEFAULT 0,
  total_chains INT NOT NULL DEFAULT 0,
  chains_json JSON NOT NULL,
  agents_json JSON NOT NULL,
  events_json JSON NOT NULL,
  modules_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

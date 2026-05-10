CREATE DATABASE IF NOT EXISTS `wimifarma_wp`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `wimifarma_app`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `wimifarma_wp`.* TO 'wimifarma_user'@'%';
GRANT ALL PRIVILEGES ON `wimifarma_app`.* TO 'wimifarma_user'@'%';

FLUSH PRIVILEGES;

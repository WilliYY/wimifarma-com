FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        default-mysql-client \
        libfreetype6-dev \
        libjpeg-dev \
        libpng-dev \
        libzip-dev \
        unzip \
        zip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd mysqli pdo_mysql zip \
    && a2enmod rewrite headers expires \
    && echo 'ServerName localhost' > /etc/apache2/conf-available/wimifarma-servername.conf \
    && { \
        echo '<Directory /var/www/html>'; \
        echo '    AllowOverride All'; \
        echo '    Require all granted'; \
        echo '</Directory>'; \
    } > /etc/apache2/conf-available/wimifarma-override.conf \
    && a2enconf wimifarma-servername \
    && a2enconf wimifarma-override \
    && rm -rf /var/lib/apt/lists/*

RUN { \
        echo 'upload_max_filesize=64M'; \
        echo 'post_max_size=64M'; \
        echo 'memory_limit=512M'; \
        echo 'max_execution_time=180'; \
        echo 'max_input_vars=5000'; \
    } > /usr/local/etc/php/conf.d/wimifarma.ini

WORKDIR /var/www/html

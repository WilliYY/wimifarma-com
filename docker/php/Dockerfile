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
    && a2enmod rewrite headers expires proxy proxy_http proxy_wstunnel \
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
        echo 'LogFormat "%h %l %u %t \"%m %U %H\" %>s %O \"%{Referer}i\" \"%{User-Agent}i\"" combined'; \
    } > /etc/apache2/conf-available/wimifarma-privacy-log.conf \
    && a2enconf wimifarma-privacy-log

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/miauw/agent/" "http://wimifarma-miauw-agent:3100/miauw/agent/"'; \
        echo 'ProxyPassReverse "/miauw/agent/" "http://wimifarma-miauw-agent:3100/miauw/agent/"'; \
        echo 'ProxyPass "/miauw/agent" "http://wimifarma-miauw-agent:3100/miauw/agent"'; \
        echo 'ProxyPassReverse "/miauw/agent" "http://wimifarma-miauw-agent:3100/miauw/agent"'; \
    } > /etc/apache2/conf-available/wimifarma-miauw-agent-proxy.conf \
    && a2enconf wimifarma-miauw-agent-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/miauw/whatsapp/" "http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp/"'; \
        echo 'ProxyPassReverse "/miauw/whatsapp/" "http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp/"'; \
        echo 'ProxyPass "/miauw/whatsapp" "http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp"'; \
        echo 'ProxyPassReverse "/miauw/whatsapp" "http://wimifarma-miauw-whatsapp:3400/miauw/whatsapp"'; \
    } > /etc/apache2/conf-available/wimifarma-miauw-whatsapp-proxy.conf \
    && a2enconf wimifarma-miauw-whatsapp-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/gestao/" "http://wimifarma-gestao-app:3200/gestao/"'; \
        echo 'ProxyPassReverse "/gestao/" "http://wimifarma-gestao-app:3200/gestao/"'; \
        echo 'ProxyPass "/gestao" "http://wimifarma-gestao-app:3200/gestao"'; \
        echo 'ProxyPassReverse "/gestao" "http://wimifarma-gestao-app:3200/gestao"'; \
    } > /etc/apache2/conf-available/wimifarma-gestao-proxy.conf \
    && a2enconf wimifarma-gestao-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/pedidos/" "http://wimifarma-pedidos-app:3300/pedidos/"'; \
        echo 'ProxyPassReverse "/pedidos/" "http://wimifarma-pedidos-app:3300/pedidos/"'; \
        echo 'ProxyPass "/pedidos" "http://wimifarma-pedidos-app:3300/pedidos"'; \
        echo 'ProxyPassReverse "/pedidos" "http://wimifarma-pedidos-app:3300/pedidos"'; \
    } > /etc/apache2/conf-available/wimifarma-pedidos-proxy.conf \
    && a2enconf wimifarma-pedidos-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/tarefa/" "http://wimifarma-tarefa-app:3500/tarefa/"'; \
        echo 'ProxyPassReverse "/tarefa/" "http://wimifarma-tarefa-app:3500/tarefa/"'; \
        echo 'ProxyPass "/tarefa" "http://wimifarma-tarefa-app:3500/tarefa"'; \
        echo 'ProxyPassReverse "/tarefa" "http://wimifarma-tarefa-app:3500/tarefa"'; \
    } > /etc/apache2/conf-available/wimifarma-tarefa-proxy.conf \
    && a2enconf wimifarma-tarefa-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/xp/" "http://wimifarma-xp-app:3600/xp/"'; \
        echo 'ProxyPassReverse "/xp/" "http://wimifarma-xp-app:3600/xp/"'; \
        echo 'ProxyPass "/xp" "http://wimifarma-xp-app:3600/xp"'; \
        echo 'ProxyPassReverse "/xp" "http://wimifarma-xp-app:3600/xp"'; \
    } > /etc/apache2/conf-available/wimifarma-xp-proxy.conf \
    && a2enconf wimifarma-xp-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/codigos/" "http://wimifarma-codigos-app:3700/codigos/"'; \
        echo 'ProxyPassReverse "/codigos/" "http://wimifarma-codigos-app:3700/codigos/"'; \
        echo 'ProxyPass "/codigos" "http://wimifarma-codigos-app:3700/codigos"'; \
        echo 'ProxyPassReverse "/codigos" "http://wimifarma-codigos-app:3700/codigos"'; \
    } > /etc/apache2/conf-available/wimifarma-codigos-proxy.conf \
    && a2enconf wimifarma-codigos-proxy

RUN { \
        echo 'ProxyPreserveHost On'; \
        echo 'ProxyPass "/cotacao/socket.io/" "ws://wimifarma-cotacao-app:3000/cotacao/socket.io/"'; \
        echo 'ProxyPassReverse "/cotacao/socket.io/" "ws://wimifarma-cotacao-app:3000/cotacao/socket.io/"'; \
        echo 'ProxyPass "/cotacao/" "http://wimifarma-cotacao-app:3000/cotacao/"'; \
        echo 'ProxyPassReverse "/cotacao/" "http://wimifarma-cotacao-app:3000/cotacao/"'; \
        echo 'ProxyPass "/cotacao" "http://wimifarma-cotacao-app:3000/cotacao"'; \
        echo 'ProxyPassReverse "/cotacao" "http://wimifarma-cotacao-app:3000/cotacao"'; \
    } > /etc/apache2/conf-available/wimifarma-cotacao-proxy.conf \
    && a2enconf wimifarma-cotacao-proxy

RUN { \
        echo 'upload_max_filesize=64M'; \
        echo 'post_max_size=64M'; \
        echo 'memory_limit=512M'; \
        echo 'max_execution_time=180'; \
        echo 'max_input_vars=5000'; \
    } > /usr/local/etc/php/conf.d/wimifarma.ini

WORKDIR /var/www/html

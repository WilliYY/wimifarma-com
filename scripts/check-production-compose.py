#!/usr/bin/env python3
"""Validate the effective Compose config for a production rollout."""

import json
import re
import sys


WORDPRESS_KEYS = (
    "WP_AUTH_KEY", "WP_SECURE_AUTH_KEY", "WP_LOGGED_IN_KEY", "WP_NONCE_KEY",
    "WP_AUTH_SALT", "WP_SECURE_AUTH_SALT", "WP_LOGGED_IN_SALT", "WP_NONCE_SALT",
)
DEFAULT_PATTERN = re.compile(r"(^dev[-_]|_dev_(pass|root)|change[-_]me|replace[-_]me)", re.I)


def validate(config):
    services = config.get("services", {})

    def value(service, variable):
        return services.get(service, {}).get("environment", {}).get(variable) or ""

    required = {
        "wimifarma-com-db": {"MYSQL_ROOT_PASSWORD": 24, "MYSQL_PASSWORD": 24},
        "wimifarma-com-web": {
            "WIMIFARMA_DB_PASSWORD": 24,
            **dict.fromkeys(WORDPRESS_KEYS, 32),
        },
        "wimifarma-comissao-db": {"POSTGRES_PASSWORD": 24},
        "wimifarma-comissao-app": {"POSTGRES_PASSWORD": 24, "COMISSAO_SESSION_SECRET": 32},
    }
    errors = []
    for service, variables in required.items():
        for variable, min_length in variables.items():
            secret = str(value(service, variable))
            if len(secret.strip()) < min_length or DEFAULT_PATTERN.search(secret):
                errors.append(f"{service}.{variable}: ausente, curto ou padrao")

    pairs = (
        ("wimifarma-com-db", "MYSQL_PASSWORD", "wimifarma-com-web", "WIMIFARMA_DB_PASSWORD"),
        ("wimifarma-comissao-db", "POSTGRES_PASSWORD", "wimifarma-comissao-app", "POSTGRES_PASSWORD"),
    )
    for left, left_key, right, right_key in pairs:
        if value(left, left_key) != value(right, right_key):
            errors.append(f"{left}.{left_key} difere de {right}.{right_key}")
    if value("wimifarma-com-db", "MYSQL_ROOT_PASSWORD") == value("wimifarma-com-db", "MYSQL_PASSWORD"):
        errors.append("MySQL: use credenciais diferentes para root e aplicacao")
    keys = [value("wimifarma-com-web", key) for key in WORDPRESS_KEYS]
    if len(set(keys)) != len(keys):
        errors.append("WordPress: cada chave e salt deve ter um valor independente")
    return errors


def main():
    try:
        config = json.load(sys.stdin)
        errors = validate(config)
    except (ValueError, AttributeError, TypeError):
        print("Nao foi possivel ler o JSON do Docker Compose", file=sys.stderr)
        return 2
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    print("Configuracao de producao: credenciais auditadas validas")
    return 0


if __name__ == "__main__":
    sys.exit(main())

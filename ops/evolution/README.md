# Evolution API - Wimifarma

Template operacional para subir a Evolution API como transporte externo do Miauby WhatsApp.

Regras:

- nao versionar `.env`;
- nao publicar a API diretamente no Nginx Proxy Manager sem decisao explicita;
- manter `wimifarma-evolution-api` ligado na rede `wimifarma-com-network` para o bridge chamar `http://wimifarma-evolution-api:8080`;
- manter Postgres, Redis e instancias em volumes/pastas desta stack, fora do projeto principal.

Fluxo no VPS:

```bash
cd /home/ubuntu/projetos/wimifarma-evolution-api
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/docker-compose.yml .
cp /home/ubuntu/projetos/wimifarma-com/ops/evolution/.env.example .env
# editar .env com segredos reais
docker compose up -d
curl -sS http://127.0.0.1:8080
```

Depois, no `.env` do Wimifarma principal, apontar:

```text
EVOLUTION_API_BASE_URL=http://wimifarma-evolution-api:8080
EVOLUTION_API_KEY=<AUTHENTICATION_API_KEY>
EVOLUTION_API_INSTANCE=wimifarma-cashback-test
```

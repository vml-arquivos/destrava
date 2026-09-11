# Serviço de Previsão de Faturamento

Microsserviço Python/FastAPI separado do app Node principal.

## Para rodar localmente

```bash
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

## Para subir no servidor (o Desenvolvedor Chefe executa)

```bash
docker build -t destrava-predicao .
docker run -d -p 8001:8001 --name destrava-predicao --restart unless-stopped destrava-predicao
```

## Variável de ambiente necessária no app Node

```env
PREDICAO_SERVICE_URL=http://localhost:8001
```

## Endpoints

- `POST /predict` — Recebe histórico de faturamento e retorna previsão (Prophet ou ARIMA)
- `GET /health` — Verificação de saúde do serviço

## Requisitos mínimos

- Mínimo de 12 meses de histórico para gerar previsão
- `horizonte_meses` deve ser 12 ou 24

## Lógica de fallback

O serviço tenta usar **Prophet** primeiro. Caso falhe por qualquer motivo (dados insuficientes, erro de convergência), cai automaticamente para **ARIMA(2,1,2)**.

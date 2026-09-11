from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from forecast_service import ForecastService

app = FastAPI(
    title="Destrava Crédito — Serviço de Previsão de Faturamento",
    version="1.0.0"
)

class PontoHistorico(BaseModel):
    ds: str   # formato "YYYY-MM-DD"
    y: float

class PredicaoRequest(BaseModel):
    historico: List[PontoHistorico]
    horizonte_meses: int = 12

class PontoPrevisao(BaseModel):
    ds: str
    yhat: float
    yhat_lower: float
    yhat_upper: float
    is_historico: bool

class PredicaoResponse(BaseModel):
    modelo_usado: str
    horizonte_meses: int
    capacidade_pgto_min: float
    capacidade_pgto_max: float
    pontos: List[PontoPrevisao]

@app.post("/predict", response_model=PredicaoResponse)
async def predict(request: PredicaoRequest):
    if len(request.historico) < 12:
        raise HTTPException(
            status_code=422,
            detail=f"Mínimo de 12 meses de histórico obrigatório. Recebido: {len(request.historico)}"
        )
    if request.horizonte_meses not in [12, 24]:
        raise HTTPException(
            status_code=422,
            detail="horizonte_meses deve ser 12 ou 24"
        )

    service = ForecastService()
    return service.prever(
        historico=[{"ds": p.ds, "y": p.y} for p in request.historico],
        horizonte_meses=request.horizonte_meses
    )

@app.get("/health")
async def health():
    return {"status": "ok", "service": "predicao-faturamento"}

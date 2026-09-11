import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class ForecastService:
    def prever(self, historico: list, horizonte_meses: int) -> dict:
        """
        Tenta Prophet primeiro. Em caso de qualquer falha, usa ARIMA.
        Retorna sempre o mesmo schema.
        """
        try:
            return self._prever_prophet(historico, horizonte_meses)
        except Exception as e:
            logger.warning(f"Prophet falhou ({e}), usando ARIMA como fallback")
            return self._prever_arima(historico, horizonte_meses)

    def _prever_prophet(self, historico: list, horizonte_meses: int) -> dict:
        from prophet import Prophet

        df = pd.DataFrame(historico)
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = df["y"].astype(float)

        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            interval_width=0.8,
        )
        model.fit(df)

        future = model.make_future_dataframe(periods=horizonte_meses, freq="MS")
        forecast = model.predict(future)

        return self._montar_resposta(df, forecast, horizonte_meses, "prophet")

    def _prever_arima(self, historico: list, horizonte_meses: int) -> dict:
        from statsmodels.tsa.arima.model import ARIMA

        df = pd.DataFrame(historico)
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = df["y"].astype(float)
        df = df.sort_values("ds")

        series = df["y"].values
        model = ARIMA(series, order=(2, 1, 2))
        result = model.fit()

        forecast_values = result.forecast(steps=horizonte_meses)
        conf_int = result.get_forecast(steps=horizonte_meses).conf_int(alpha=0.2)

        last_date = df["ds"].max()
        future_dates = [
            (last_date + pd.DateOffset(months=i+1)).strftime("%Y-%m-%d")
            for i in range(horizonte_meses)
        ]

        forecast_df = pd.DataFrame({
            "ds": future_dates,
            "yhat": forecast_values,
            "yhat_lower": conf_int.iloc[:, 0].values,
            "yhat_upper": conf_int.iloc[:, 1].values,
        })

        # Montar dataframe no formato esperado pelo _montar_resposta
        full_forecast = pd.concat([
            df.rename(columns={"y": "yhat"}).assign(
                yhat_lower=lambda x: x["yhat"] * 0.85,
                yhat_upper=lambda x: x["yhat"] * 1.15,
                ds=lambda x: x["ds"].dt.strftime("%Y-%m-%d")
            )[["ds", "yhat", "yhat_lower", "yhat_upper"]],
            forecast_df
        ], ignore_index=True)

        full_forecast_obj = full_forecast.copy()
        full_forecast_obj["ds"] = pd.to_datetime(full_forecast_obj["ds"])

        return self._montar_resposta(df, full_forecast_obj, horizonte_meses, "arima")

    def _montar_resposta(self, df_historico: pd.DataFrame, forecast: pd.DataFrame, horizonte_meses: int, modelo: str) -> dict:
        datas_historico = set(df_historico["ds"].dt.strftime("%Y-%m-%d").tolist())

        pontos = []
        for _, row in forecast.iterrows():
            ds_str = row["ds"].strftime("%Y-%m-%d") if hasattr(row["ds"], "strftime") else str(row["ds"])[:10]
            pontos.append({
                "ds": ds_str,
                "yhat": max(0, float(row["yhat"])),
                "yhat_lower": max(0, float(row.get("yhat_lower", row["yhat"] * 0.85))),
                "yhat_upper": max(0, float(row.get("yhat_upper", row["yhat"] * 1.15))),
                "is_historico": ds_str in datas_historico,
            })

        # Calcular capacidade de pagamento com base na média da previsão futura
        futuros = [p["yhat"] for p in pontos if not p["is_historico"]]
        media_futura = float(np.mean(futuros)) if futuros else 0

        return {
            "modelo_usado": modelo,
            "horizonte_meses": horizonte_meses,
            "capacidade_pgto_min": round(media_futura * 0.15, 2),
            "capacidade_pgto_max": round(media_futura * 0.25, 2),
            "pontos": pontos,
        }

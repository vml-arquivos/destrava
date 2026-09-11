import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FEATURE_CATALOG } from "@/config/featureCatalog";
import { useAuth } from "@/hooks/useAuth";

type FeatureValueMap = Record<string, boolean>;

interface FeatureConfigMe {
  global?: FeatureValueMap;
  userOverride?: FeatureValueMap;
  updatedAt?: string;
}

let cachedConfig: FeatureConfigMe | null = null;
let loadingPromise: Promise<FeatureConfigMe> | null = null;

async function fetchFeatureConfig(): Promise<FeatureConfigMe> {
  if (cachedConfig) return cachedConfig;
  if (!loadingPromise) {
    loadingPromise = apiFetch("/api/configuracao-funcoes/me")
      .then(data => {
        const resolved: FeatureConfigMe = data || {
          global: {},
          userOverride: {},
        };
        cachedConfig = resolved;
        return resolved;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  return loadingPromise;
}

export function invalidateFeatureAccessCache() {
  cachedConfig = null;
  loadingPromise = null;
}

export function useFeatureAccess() {
  const { colaborador } = useAuth();
  const [config, setConfig] = useState<FeatureConfigMe | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    let alive = true;
    setLoading(!cachedConfig);
    fetchFeatureConfig()
      .then(data => {
        if (alive) setConfig(data);
      })
      .catch(() => {
        if (alive) setConfig({ global: {}, userOverride: {} });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [colaborador?.id]);

  const isAdministrador = ["administrador", "admin"].includes(
    (colaborador?.cargo || "").toLowerCase()
  );

  const enabledMap = useMemo(() => {
    const global = config?.global || {};
    const userOverride = config?.userOverride || {};
    const map: FeatureValueMap = {};
    for (const item of FEATURE_CATALOG) {
      if (item.key === "configuracao-funcoes" && isAdministrador) {
        map[item.key] = true;
        continue;
      }
      if (typeof userOverride[item.key] === "boolean")
        map[item.key] = userOverride[item.key];
      else if (typeof global[item.key] === "boolean")
        map[item.key] = global[item.key];
      else map[item.key] = true;
    }
    return map;
  }, [config, isAdministrador]);

  function isFeatureEnabled(featureKey?: string | null): boolean {
    if (!featureKey) return true;
    if (featureKey === "configuracao-funcoes" && isAdministrador) return true;
    if (enabledMap[featureKey] === undefined) return true;
    return enabledMap[featureKey];
  }

  return { loading, config, enabledMap, isFeatureEnabled };
}

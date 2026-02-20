const ML_API_BASE = (import.meta.env.VITE_ML_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

async function postJson(path, payload) {
  const response = await fetch(`${ML_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.detail ? `: ${body.detail}` : ''
    } catch {
      detail = ''
    }
    throw new Error(`Prediction API error (${response.status})${detail}`)
  }

  return response.json()
}

export async function getPrediction(features) {
  return postJson('/predict', { features })
}

export async function getBatchPredictions(samples) {
  return postJson('/predict/batch', { samples })
}

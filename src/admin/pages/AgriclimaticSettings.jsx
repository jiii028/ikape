import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloudRain, Save, Thermometer, Droplets, Waves, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const FLOOD_RISK_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'severe', label: 'Severe' },
]

const EMPTY_FORM = {
  monthlyTemperature: '',
  rainfall: '',
  humidity: '',
  soilPh: '',
  floodRiskLevel: 'none',
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function AgriclimaticSettings() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [historyRows, setHistoryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const latestRecordDate = useMemo(() => {
    if (!historyRows.length) return 'No records yet'
    return new Date(historyRows[0].created_at).toLocaleString()
  }, [historyRows])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('agriclimatic_admin')
      .select('id, monthly_temperature, rainfall, humidity, soil_ph, flood_risk_level, created_at')
      .order('created_at', { ascending: false })
      .limit(12)

    if (fetchError) {
      setError(fetchError.message || 'Unable to load agriclimatic inputs.')
      setLoading(false)
      return
    }

    const rows = data || []
    setHistoryRows(rows)

    const latest = rows[0]
    if (latest) {
      setForm({
        monthlyTemperature: latest.monthly_temperature ?? '',
        rainfall: latest.rainfall ?? '',
        humidity: latest.humidity ?? '',
        soilPh: latest.soil_ph ?? '',
        floodRiskLevel: latest.flood_risk_level || 'none',
      })
    } else {
      setForm(EMPTY_FORM)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData()
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [fetchData])

  const handleChange = (event) => {
    const { name, value } = event.target
    setError('')
    setSuccess('')
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const validate = () => {
    const temp = normalizeNumber(form.monthlyTemperature)
    const rain = normalizeNumber(form.rainfall)
    const humidity = normalizeNumber(form.humidity)
    const ph = normalizeNumber(form.soilPh)

    if (temp === null || rain === null || humidity === null || ph === null) {
      return 'Temperature, rainfall, humidity, and soil pH are required.'
    }
    if (humidity < 0 || humidity > 100) return 'Humidity must be between 0 and 100.'
    if (ph < 0 || ph > 14) return 'Soil pH must be between 0 and 14.'
    if (rain < 0) return 'Rainfall must be non-negative.'
    if (temp < -10 || temp > 60) return 'Temperature is out of expected range.'
    return ''
  }

  const handleSave = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const payload = {
      monthly_temperature: normalizeNumber(form.monthlyTemperature),
      rainfall: normalizeNumber(form.rainfall),
      humidity: normalizeNumber(form.humidity),
      soil_ph: normalizeNumber(form.soilPh),
      flood_risk_level: String(form.floodRiskLevel || 'none').trim().toLowerCase(),
    }

    const { error: insertError } = await supabase.from('agriclimatic_admin').insert(payload)
    if (insertError) {
      setError(insertError.message || 'Unable to save agriclimatic inputs.')
      setSaving(false)
      return
    }

    setSuccess('Agriclimatic inputs saved as a new snapshot.')
    await fetchData()
    setSaving(false)
  }

  return (
    <div className="agri-page">
      <header className="agri-header">
        <div>
          <h1>Agriclimatic Inputs</h1>
          <p>Admin-managed weather and soil context used in farmer cluster records.</p>
        </div>
        <div className="agri-meta">
          <CloudRain size={16} />
          <span>Latest snapshot: {latestRecordDate}</span>
        </div>
      </header>

      <section className="agri-card">
        <h2>New Snapshot</h2>
        <p className="agri-subtitle">
          Saving creates a new row (append-only) so historical climate context is preserved.
        </p>

        <form className="agri-form" onSubmit={handleSave}>
          {error && <div className="agri-error">{error}</div>}
          {success && <div className="agri-success">{success}</div>}

          <div className="agri-grid">
            <label className="agri-field">
              <span><Thermometer size={14} /> Avg Monthly Temperature (C)</span>
              <input
                name="monthlyTemperature"
                type="number"
                step="0.1"
                value={form.monthlyTemperature}
                onChange={handleChange}
                required
              />
            </label>

            <label className="agri-field">
              <span><CloudRain size={14} /> Avg Monthly Rainfall (mm)</span>
              <input
                name="rainfall"
                type="number"
                step="0.1"
                min="0"
                value={form.rainfall}
                onChange={handleChange}
                required
              />
            </label>

            <label className="agri-field">
              <span><Droplets size={14} /> Avg Monthly Humidity (%)</span>
              <input
                name="humidity"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.humidity}
                onChange={handleChange}
                required
              />
            </label>

            <label className="agri-field">
              <span><Waves size={14} /> Soil pH</span>
              <input
                name="soilPh"
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={form.soilPh}
                onChange={handleChange}
                required
              />
            </label>

            <label className="agri-field">
              <span><ShieldAlert size={14} /> Flood Risk Baseline</span>
              <select name="floodRiskLevel" value={form.floodRiskLevel} onChange={handleChange}>
                {FLOOD_RISK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="agri-actions">
            <button type="submit" className="agri-save-btn" disabled={saving || loading}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Snapshot'}
            </button>
          </div>
        </form>
      </section>

      <section className="agri-card">
        <h2>Recent Snapshots</h2>
        <div className="agri-table-wrap">
          <table className="agri-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Temp (C)</th>
                <th>Rainfall (mm)</th>
                <th>Humidity (%)</th>
                <th>Soil pH</th>
                <th>Flood Risk</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 && (
                <tr>
                  <td colSpan={6}>No agriclimatic snapshots yet.</td>
                </tr>
              )}
              {historyRows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.monthly_temperature ?? '-'}</td>
                  <td>{row.rainfall ?? '-'}</td>
                  <td>{row.humidity ?? '-'}</td>
                  <td>{row.soil_ph ?? '-'}</td>
                  <td>{row.flood_risk_level || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

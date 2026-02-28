import { useEffect, useState } from 'react'
import { Save, CloudSun } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './AgriclimaticInputs.css'

const DEFAULT_FORM = {
  monthly_temperature: '',
  rainfall: '',
  humidity: '',
  soil_ph: '',
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatTimestamp(value) {
  if (!value) return 'Not yet saved'
  return new Date(value).toLocaleString()
}

export default function AgriclimaticInputs() {
  const [rowId, setRowId] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    const loadInputs = async () => {
      setLoading(true)
      setError('')
      setSuccess('')

      const { data, error: fetchError } = await supabase
        .from('admin_climate_reference')
        .select('id, monthly_temperature, rainfall, humidity, soil_ph, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) return

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      if (data) {
        setRowId(data.id)
        setForm({
          monthly_temperature: data.monthly_temperature ?? '',
          rainfall: data.rainfall ?? '',
          humidity: data.humidity ?? '',
          soil_ph: data.soil_ph ?? '',
        })
        setUpdatedAt(data.updated_at ?? null)
      } else {
        setRowId(null)
        setForm(DEFAULT_FORM)
        setUpdatedAt(null)
      }

      setLoading(false)
    }

    loadInputs()

    return () => {
      active = false
    }
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const payload = {
      monthly_temperature: toNullableNumber(form.monthly_temperature),
      rainfall: toNullableNumber(form.rainfall),
      humidity: toNullableNumber(form.humidity),
      soil_ph: toNullableNumber(form.soil_ph),
    }

    let saveError = null
    let savedData = null

    if (rowId) {
      const response = await supabase
        .from('admin_climate_reference')
        .update(payload)
        .eq('id', rowId)
        .select('id, updated_at')
        .single()
      saveError = response.error
      savedData = response.data
    } else {
      const response = await supabase
        .from('admin_climate_reference')
        .insert(payload)
        .select('id, updated_at')
        .single()
      saveError = response.error
      savedData = response.data
    }

    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }

    setRowId(savedData?.id || rowId)
    setUpdatedAt(savedData?.updated_at || new Date().toISOString())
    setSuccess('Agriclimatic inputs updated successfully.')
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-spinner"></div>
        <p>Loading agriclimatic inputs...</p>
      </div>
    )
  }

  return (
    <div className="agriclimatic-page">
      <div className="agriclimatic-header">
        <div>
          <h1><CloudSun size={22} /> Agriclimatic Inputs</h1>
          <p>Update baseline climate and soil inputs used across clusters.</p>
        </div>
        <span className="agriclimatic-updated-at">Last updated: {formatTimestamp(updatedAt)}</span>
      </div>

      <form className="agriclimatic-form-card" onSubmit={handleSubmit}>
        {error && <div className="agriclimatic-message agriclimatic-message--error">{error}</div>}
        {success && <div className="agriclimatic-message agriclimatic-message--success">{success}</div>}

        <div className="agriclimatic-form-grid">
          <label className="agriclimatic-field">
            <span>Monthly Temperature (C)</span>
            <input
              type="number"
              step="0.01"
              name="monthly_temperature"
              value={form.monthly_temperature}
              onChange={handleChange}
              placeholder="e.g. 24.50"
            />
          </label>

          <label className="agriclimatic-field">
            <span>Rainfall (mm)</span>
            <input
              type="number"
              step="0.01"
              name="rainfall"
              value={form.rainfall}
              onChange={handleChange}
              placeholder="e.g. 180.00"
            />
          </label>

          <label className="agriclimatic-field">
            <span>Humidity (%)</span>
            <input
              type="number"
              step="0.01"
              name="humidity"
              value={form.humidity}
              onChange={handleChange}
              placeholder="e.g. 65.00"
            />
          </label>

          <label className="agriclimatic-field">
            <span>Soil pH</span>
            <input
              type="number"
              step="0.01"
              name="soil_ph"
              value={form.soil_ph}
              onChange={handleChange}
              placeholder="e.g. 6.20"
            />
          </label>
        </div>

        <div className="agriclimatic-actions">
          <button type="submit" className="agriclimatic-save-btn" disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Inputs'}
          </button>
        </div>
      </form>
    </div>
  )
}

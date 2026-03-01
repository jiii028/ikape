const API_BASE = (import.meta.env.VITE_ML_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

const EMPTY_OVERVIEW = {
  total_farmers: 0,
  total_clusters: 0,
  total_yield_kg: 0,
  charts: {
    grade_mix: {
      Fine: 0,
      Premium: 0,
      Commercial: 0,
    },
  },
}

export async function fetchOverview() {
  try {
    const response = await fetch(`${API_BASE}/analytics/overview`)
    if (!response.ok) {
      return EMPTY_OVERVIEW
    }
    const data = await response.json()
    return {
      ...EMPTY_OVERVIEW,
      ...(data || {}),
      charts: {
        ...EMPTY_OVERVIEW.charts,
        ...(data?.charts || {}),
      },
    }
  } catch (error) {
    console.warn('Analytics overview unavailable, using fallback values:', error)
    return EMPTY_OVERVIEW
  }
}

export async function fetchAdminData() {
  try {
    const response = await fetch(`${API_BASE}/analytics/admin-data`)
    if (!response.ok) {
      return {
        available: false,
        source: 'none',
        data: {
          users: [],
          farms: [],
          clusters: [],
          harvest_records: [],
        },
      }
    }
    const payload = await response.json()
    return {
      available: !!payload?.available,
      source: payload?.source || 'none',
      data: payload?.data || {
        users: [],
        farms: [],
        clusters: [],
        harvest_records: [],
      },
    }
  } catch (error) {
    console.warn('Admin analytics dataset unavailable:', error)
    return {
      available: false,
      source: 'none',
      data: {
        users: [],
        farms: [],
        clusters: [],
        harvest_records: [],
      },
    }
  }
}

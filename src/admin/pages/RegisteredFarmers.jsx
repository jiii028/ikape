import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    ChevronLeft,
    ChevronRight,
    X,
    User,
    Save,
    AlertTriangle,
} from 'lucide-react'
import './RegisteredFarmers.css'

const PAGE_SIZE = 10

export default function RegisteredFarmers() {
    const [farmers, setFarmers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [editFarmer, setEditFarmer] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [formData, setFormData] = useState({
        username: '', email: '', first_name: '', last_name: '', middle_initial: '',
        contact_number: '', age: '', municipality: '', province: '', password: '',
    })
    const [formError, setFormError] = useState('')

    useEffect(() => {
        fetchFarmers()
    }, [])

    const fetchFarmers = async () => {
        setLoading(true)
        try {
            // Fetch users with their farms and clusters
            const { data: users, error } = await supabase
                .from('users')
                .select('*, farms(id, farm_name, farm_area, clusters(id))')
                .eq('role', 'farmer')
                .order('created_at', { ascending: false })

            if (error) throw error

            const enriched = users?.map((u) => {
                const farm = u.farms?.[0]
                const clusterCount = farm?.clusters?.length || 0
                // Determine status based on available data
                let status = 'Healthy'
                if (clusterCount === 0) status = 'No Clusters'
                return {
                    ...u,
                    farmName: farm?.farm_name || 'No Farm',
                    farmArea: farm?.farm_area || 0,
                    clusterCount,
                    status,
                }
            }) || []

            setFarmers(enriched)
        } catch (err) {
            console.error('Error fetching farmers:', err)
        }
        setLoading(false)
    }

    const filteredFarmers = useMemo(() => {
        if (!searchQuery) return farmers
        const q = searchQuery.toLowerCase()
        return farmers.filter((f) =>
            `${f.first_name} ${f.last_name}`.toLowerCase().includes(q) ||
            f.municipality?.toLowerCase().includes(q) ||
            f.province?.toLowerCase().includes(q) ||
            f.farmName?.toLowerCase().includes(q) ||
            f.username?.toLowerCase().includes(q)
        )
    }, [farmers, searchQuery])

    const totalPages = Math.ceil(filteredFarmers.length / PAGE_SIZE)
    const paginatedFarmers = filteredFarmers.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    )

    const openAddModal = () => {
        setEditFarmer(null)
        setFormData({
            username: '', email: '', first_name: '', last_name: '', middle_initial: '',
            contact_number: '', age: '', municipality: '', province: '', password: '',
        })
        setFormError('')
        setShowModal(true)
    }

    const openEditModal = (farmer) => {
        setEditFarmer(farmer)
        setFormData({
            username: farmer.username,
            email: farmer.email,
            first_name: farmer.first_name,
            last_name: farmer.last_name,
            middle_initial: farmer.middle_initial || '',
            contact_number: farmer.contact_number,
            age: farmer.age?.toString() || '',
            municipality: farmer.municipality,
            province: farmer.province,
            password: '',
        })
        setFormError('')
        setShowModal(true)
    }

    const handleFormChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
        setFormError('')
    }

    const handleSave = async (e) => {
        e.preventDefault()
        // Validate
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.username) {
            setFormError('Please fill in all required fields.')
            return
        }
        if (!editFarmer && !formData.password) {
            setFormError('Password is required for new farmers.')
            return
        }
        const age = parseInt(formData.age)
        if (isNaN(age) || age < 18 || age > 120) {
            setFormError('Age must be between 18 and 120.')
            return
        }

        try {
            if (editFarmer) {
                // Update existing
                const { error } = await supabase.from('users').update({
                    first_name: formData.first_name,
                    last_name: formData.last_name,
                    middle_initial: formData.middle_initial || null,
                    email: formData.email,
                    contact_number: formData.contact_number,
                    age,
                    municipality: formData.municipality,
                    province: formData.province,
                }).eq('id', editFarmer.id)

                if (error) throw error
            } else {
                // Create via Supabase Auth + profile
                const { data: authData, error: authErr } = await supabase.auth.signUp({
                    email: formData.email,
                    password: formData.password,
                })
                if (authErr) throw authErr

                const userId = authData.user?.id
                if (!userId) throw new Error('Failed to create auth user')

                const { error: profileErr } = await supabase.from('users').upsert({
                    id: userId,
                    username: formData.username,
                    email: formData.email,
                    password_hash: 'supabase-auth-managed',
                    first_name: formData.first_name,
                    last_name: formData.last_name,
                    middle_initial: formData.middle_initial || null,
                    contact_number: formData.contact_number,
                    age,
                    municipality: formData.municipality,
                    province: formData.province,
                    role: 'farmer',
                }, { onConflict: 'id' })

                if (profileErr) throw profileErr
            }

            setShowModal(false)
            fetchFarmers()
        } catch (err) {
            setFormError(err.message)
        }
    }

    const handleDelete = async (farmer) => {
        try {
            const { error } = await supabase.from('users').delete().eq('id', farmer.id)
            if (error) throw error
            setDeleteConfirm(null)
            fetchFarmers()
        } catch (err) {
            console.error('Delete error:', err)
            alert('Failed to delete farmer: ' + err.message)
        }
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A'
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        })
    }

    const statusColors = {
        Healthy: '#22c55e',
        Moderate: '#f59e0b',
        Risk: '#f97316',
        'High Risk': '#ef4444',
        'No Clusters': '#94a3b8',
    }

    if (loading) {
        return (
            <div className="admin-loading">
                <div className="admin-loading-spinner"></div>
                <p>Loading farmers...</p>
            </div>
        )
    }

    return (
        <div className="farmers-page">
            <div className="farmers-header">
                <div>
                    <h1>Registered Farmers</h1>
                    <p>{filteredFarmers.length} farmer(s) total</p>
                </div>
                <div className="farmers-header-actions">
                    <div className="farmers-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search by name, municipality, farm..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                        />
                    </div>
                    <button className="farmers-add-btn" onClick={openAddModal}>
                        <Plus size={16} /> Add Farmer
                    </button>
                </div>
            </div>

            <div className="farmers-table-wrapper">
                <table className="farmers-table">
                    <thead>
                        <tr>
                            <th>Farmer Name</th>
                            <th>Age</th>
                            <th>Municipality/City</th>
                            <th>Province</th>
                            <th>Farm Name</th>
                            <th>Farm Area (ha)</th>
                            <th>Clusters</th>
                            <th>Status</th>
                            <th>Registered</th>
                            <th>Last Updated</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedFarmers.length > 0 ? (
                            paginatedFarmers.map((f) => (
                                <tr key={f.id}>
                                    <td className="farmer-name-cell">
                                        <div className="farmer-avatar-sm">
                                            <User size={14} />
                                        </div>
                                        {f.first_name} {f.last_name}
                                    </td>
                                    <td>{f.age}</td>
                                    <td>{f.municipality}</td>
                                    <td>{f.province}</td>
                                    <td>{f.farmName}</td>
                                    <td>{f.farmArea}</td>
                                    <td>{f.clusterCount}</td>
                                    <td>
                                        <span
                                            className="status-badge"
                                            style={{
                                                background: (statusColors[f.status] || '#94a3b8') + '18',
                                                color: statusColors[f.status] || '#94a3b8',
                                            }}
                                        >
                                            {f.status}
                                        </span>
                                    </td>
                                    <td>{formatDate(f.created_at)}</td>
                                    <td>{formatDate(f.updated_at)}</td>
                                    <td className="farmer-actions">
                                        <button className="farmer-action-btn" onClick={() => openEditModal(f)}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            className="farmer-action-btn farmer-action-btn--delete"
                                            onClick={() => setDeleteConfirm(f)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="11" className="farmers-empty">
                                    No farmers found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="farmers-pagination">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(currentPage - 1)}
                    >
                        <ChevronLeft size={16} /> Previous
                    </button>
                    <span>
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(currentPage + 1)}
                    >
                        Next <ChevronRight size={16} />
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h2>{editFarmer ? 'Edit Farmer' : 'Add New Farmer'}</h2>
                            <button className="admin-modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form className="farmer-form" onSubmit={handleSave}>
                            {formError && <div className="farmer-form-error">{formError}</div>}
                            <div className="farmer-form-grid">
                                <div className="farmer-form-field">
                                    <label>First Name *</label>
                                    <input name="first_name" value={formData.first_name} onChange={handleFormChange} placeholder="First Name" />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Last Name *</label>
                                    <input name="last_name" value={formData.last_name} onChange={handleFormChange} placeholder="Last Name" />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Middle Initial</label>
                                    <input name="middle_initial" value={formData.middle_initial} onChange={handleFormChange} placeholder="M.I." maxLength={2} />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Age *</label>
                                    <input name="age" type="number" value={formData.age} onChange={handleFormChange} placeholder="Age" min={18} max={120} />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Username *</label>
                                    <input name="username" value={formData.username} onChange={handleFormChange} placeholder="Username" disabled={!!editFarmer} />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Email *</label>
                                    <input name="email" type="email" value={formData.email} onChange={handleFormChange} placeholder="Email" />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Contact Number</label>
                                    <input name="contact_number" value={formData.contact_number} onChange={handleFormChange} placeholder="Contact Number" />
                                </div>
                                {!editFarmer && (
                                    <div className="farmer-form-field">
                                        <label>Password *</label>
                                        <input name="password" type="password" value={formData.password} onChange={handleFormChange} placeholder="Password" />
                                    </div>
                                )}
                                <div className="farmer-form-field">
                                    <label>Municipality/City</label>
                                    <input name="municipality" value={formData.municipality} onChange={handleFormChange} placeholder="Municipality" />
                                </div>
                                <div className="farmer-form-field">
                                    <label>Province</label>
                                    <input name="province" value={formData.province} onChange={handleFormChange} placeholder="Province" />
                                </div>
                            </div>
                            <div className="farmer-form-actions">
                                <button type="button" className="farmer-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="farmer-save-btn">
                                    <Save size={16} /> {editFarmer ? 'Update' : 'Create'} Farmer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="admin-modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#ef4444" />
                        <h3>Delete Farmer</h3>
                        <p>Are you sure you want to delete <strong>{deleteConfirm.first_name} {deleteConfirm.last_name}</strong>? This will also delete their farm and all cluster data. This action cannot be undone.</p>
                        <div className="delete-confirm-actions">
                            <button className="farmer-cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            <button className="farmer-delete-confirm-btn" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
